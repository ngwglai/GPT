from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum, auto
from typing import Callable

from ..core.seat import Seat


class HuEffect(Enum):
    GANG_SHANG_KAI_HUA = auto()
    QIANG_GANG_HU = auto()
    HAI_DI = auto()


class SettlementMode(Enum):
    NORMAL = auto()
    MINIMUM_PING_HU = auto()


@dataclass
class ScoreConfig:
    # None means unconfirmed, NOT zero and NOT a silently chosen house rule.
    base_ping_hu: Decimal | None = None
    shelf_bonus: Decimal | None = None
    dealer_multiplier: Decimal | None = None
    discard_multiplier: Decimal | None = None
    self_draw_multiplier: Decimal | None = None
    dealer_scope: str | None = None  # WINNER_ONLY or EITHER_PARTY
    self_draw_payment: str | None = None  # EACH_OPPONENT
    effect_bonus: dict[HuEffect, Decimal] = field(default_factory=dict)

    def __post_init__(self):
        for name in ("base_ping_hu", "shelf_bonus", "dealer_multiplier", "discard_multiplier", "self_draw_multiplier"):
            value = getattr(self, name)
            if value is not None:
                value = Decimal(str(value))
                if not value.is_finite() or value < 0:
                    raise ValueError("score amounts must be finite and nonnegative")
                setattr(self, name, value)
        self.effect_bonus = {k: Decimal(str(v)) for k, v in self.effect_bonus.items()}
        if any(not v.is_finite() or v < 0 for v in self.effect_bonus.values()):
            raise ValueError("effect bonus must be finite and nonnegative")
        if self.dealer_scope not in {None, "WINNER_ONLY", "EITHER_PARTY"}:
            raise ValueError("invalid dealer scope")
        if self.self_draw_payment not in {None, "EACH_OPPONENT"}:
            raise ValueError("unsupported self-draw payment; install a custom ScoreEngine")


@dataclass
class Settlement:
    mode: SettlementMode
    status: str  # CALCULATED or PENDING_CONFIGURATION
    transfers: dict[Seat, Decimal] = field(default_factory=dict)
    missing: tuple[str, ...] = ()
    items: dict = field(default_factory=dict)


class ScoreEngine:
    """Reference policy: winner's shelf bonus, additives then multipliers.

    An unconfigured table still completes the round, with a pending quote.
    Override settle for independent shelf payments, gang fees or other rules.
    """

    def __init__(self, config: ScoreConfig | None = None):
        self.config = config or ScoreConfig()
        self.additive_hooks: list[Callable] = []
        self.multiplier_hooks: list[Callable] = []

    def settle(self, state, winner: Seat | None, source: Seat | None, effects: tuple[HuEffect, ...]) -> Settlement:
        minimum = source is not None and state.players[source].is_declared_ting and HuEffect.QIANG_GANG_HU not in effects
        mode = SettlementMode.MINIMUM_PING_HU if minimum else SettlementMode.NORMAL
        if winner is None:
            # Draw-time shelf/gang payments have not been specified either.
            return Settlement(mode, "PENDING_CONFIGURATION", missing=("draw_settlement_policy",))
        c = self.config
        required = ["base_ping_hu"]
        if not minimum:
            required += ["shelf_bonus", "dealer_multiplier", "dealer_scope"]
            required += ["discard_multiplier"] if source is not None else ["self_draw_multiplier", "self_draw_payment"]
        missing = tuple(name for name in required if getattr(c, name) is None)
        if missing:
            return Settlement(mode, "PENDING_CONFIGURATION", missing=missing)
        payers = [source] if source is not None else [seat for seat in Seat if seat != winner]
        transfers = {seat: Decimal(0) for seat in Seat}
        subtotal = c.base_ping_hu
        if not minimum:
            subtotal += c.shelf_bonus * state.players[winner].shelf_count
            subtotal += sum((c.effect_bonus.get(e, Decimal(0)) for e in effects), Decimal(0))
            subtotal += sum((Decimal(str(h(state, winner, source, effects))) for h in self.additive_hooks), Decimal(0))
        for payer in payers:
            amount = subtotal
            if not minimum:
                amount *= c.discard_multiplier if source is not None else c.self_draw_multiplier
                if winner == state.dealer or (c.dealer_scope == "EITHER_PARTY" and payer == state.dealer):
                    amount *= c.dealer_multiplier
                for hook in self.multiplier_hooks:
                    amount *= Decimal(str(hook(state, winner, payer, effects)))
            if not amount.is_finite() or amount < 0:
                raise ValueError("invalid score hook result")
            transfers[payer] -= amount
            transfers[winner] += amount
        return Settlement(mode, "CALCULATED", transfers, items={"subtotal": str(subtotal), "override": minimum})
