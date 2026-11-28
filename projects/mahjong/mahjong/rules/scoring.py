from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum, auto

from ..core.seat import Seat
from ..core.player import MeldType


class HuEffect(Enum):
    GANG_SHANG_KAI_HUA = auto()
    QIANG_GANG_HU = auto()
    HAI_DI = auto()


class SettlementMode(Enum):
    NORMAL = auto()


@dataclass(frozen=True)
class ScoreConfig:
    """The only selectable scoring rule is the match's base (1 or 5)."""
    base_ping_hu: int = 1

    def __post_init__(self):
        if type(self.base_ping_hu) is not int or self.base_ping_hu not in (1, 5):
            raise ValueError("基础分必须为1或5")


@dataclass
class Settlement:
    mode: SettlementMode
    status: str
    transfers: dict[Seat, Decimal] = field(default_factory=dict)
    missing: tuple[str, ...] = ()
    items: dict = field(default_factory=dict)


class ScoreEngine:
    """Settle all directed payments at round end, independently of hand shape.

    Only the first-priority accepted HU receives base/shelf/discard payments.
    Other players who actually submitted HU are exempt from base/shelf payments
    to that winner, but all completed gangs are paid by all three opponents.
    """

    def __init__(self, config: ScoreConfig | None = None):
        self.config = config or ScoreConfig()

    def settle(self, state, winner: Seat | None, source: Seat | None,
               effects: tuple[HuEffect, ...], *, other_hu: tuple[Seat, ...] = ()) -> Settlement:
        base = self.config.base_ping_hu
        exempt = set(other_hu)
        if (winner is None and (source is not None or exempt)) or (
            winner is not None and (source == winner or winner in exempt or source in exempt
                                    or (source is None and exempt))
        ) or not exempt.issubset(set(Seat)):
            raise ValueError("invalid settlement participants")
        transfers = {seat: Decimal(0) for seat in Seat}
        payments = []
        matrix = [[0 for _ in Seat] for _ in Seat]
        for receiver in Seat:
            player = state.players[receiver]
            open_gangs = sum(m.type in (MeldType.MING_GANG, MeldType.BU_GANG) for m in player.melds)
            concealed_gangs = sum(m.type == MeldType.AN_GANG for m in player.melds)
            for payer in Seat:
                if payer == receiver:
                    continue
                hu_payment = receiver == winner and payer not in exempt
                basic = base * (2 if source is None else 1) * (
                    2 if state.dealer in (payer, receiver) else 1) if hu_payment else 0
                gold = 5 * player.shelf_count if hu_payment else 0
                discard = 5 if (hu_payment and payer == source
                                and not state.players[payer].is_declared_ting) else 0
                gang_open, gang_concealed = open_gangs, 2 * concealed_gangs
                amount = basic + gold + gang_open + gang_concealed + discard
                matrix[int(payer)][int(receiver)] = amount
                if amount:
                    transfers[payer] -= amount
                    transfers[receiver] += amount
                    payments.append(dict(payer=int(payer), receiver=int(receiver), base=basic,
                                         gold=gold, open_gang=gang_open, concealed_gang=gang_concealed,
                                         discard=discard, total=amount))
        assert sum(transfers.values()) == 0
        return Settlement(SettlementMode.NORMAL, "CALCULATED", transfers, items={
            "base_score": base, "other_hu": sorted(map(int, exempt)),
            "matrix": matrix, "payments": payments,
        })
