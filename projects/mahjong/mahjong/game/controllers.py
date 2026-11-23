"""Controller policies receive only one seat's projected hand and legal intents."""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from random import Random

from ..core.action import ActionType as A
from ..solver.thirteen_orphans import ORPHANS
from .visibility import visible_remaining


@lru_cache(maxsize=24_000)
def _groups(counts: tuple[int, ...], suited: bool) -> frozenset[tuple[int, int, int]]:
    """Enumerate the local complete sets, incomplete sets and candidate pair."""
    i = next((i for i, count in enumerate(counts) if count), None)
    if i is None:
        return frozenset({(0, 0, 0)})
    options = [((i,), (0, 0, 0))]
    if counts[i] >= 2:
        options += [((i, i), (0, 1, 0)), ((i, i), (0, 0, 1))]
    if counts[i] >= 3:
        options.append(((i, i, i), (1, 0, 0)))
    if suited:
        for gap in (1, 2):
            if i + gap < len(counts) and counts[i + gap]:
                options.append(((i, i + gap), (0, 1, 0)))
        if i <= 6 and counts[i + 1] and counts[i + 2]:
            options.append(((i, i + 1, i + 2), (1, 0, 0)))
    states = set()
    for tiles, (sets, incomplete, pair) in options:
        rest = list(counts)
        for tile in tiles:
            rest[tile] -= 1
        for m, t, p in _groups(tuple(rest), suited):
            if p + pair <= 1:
                states.add((m + sets, t + incomplete, p + pair))
    return frozenset(states)


@lru_cache(maxsize=60_000)
def _distance(counts: tuple[int, ...], melds: int, gold: int | None, locked: bool, quad_pairs: bool) -> int:
    """Standard shanten plus seven pairs and thirteen orphans. Gold reduces the estimate."""
    tiles = list(counts)
    wild = tiles[gold] if gold is not None else 0
    if gold is not None:
        tiles[gold] = 0
    orphans = 13 - sum(tiles[kind] > 0 for kind in ORPHANS) - any(tiles[kind] >= 2 for kind in ORPHANS)
    if locked:
        return max(-1, orphans - wild)
    states = {(melds, 0, 0)}
    for begin, end in ((0, 9), (9, 18), (18, 27), (27, 34)):
        options = _groups(tuple(tiles[begin:end]), begin != 27)
        states = {(m + m2, t + t2, p + p2) for m, t, p in states for m2, t2, p2 in options
                  if p + p2 <= 1 and m + m2 <= 4}
    result = min(8 - 2 * m - min(4 - m, t) - p for m, t, p in states)
    if not melds:
        pairs = sum(n // 2 if quad_pairs else n >= 2 for n in tiles)
        # When quads can be two pairs, a triple is also a possible new pair.
        singles = sum(n % 2 and (quad_pairs or n == 1) for n in tiles)
        result = min(result, 6 - pairs + max(0, 7 - pairs - singles), orphans)
    return max(-1, result - wild)


@dataclass(frozen=True)
class Decision:
    action: dict
    reason: str


class PlayerController(ABC):
    @abstractmethod
    def choose(self, view: dict, seat: int, *, quad_pairs: bool = True) -> Decision | None:
        """Choose from the provided legal actions, or leave the choice to the player."""


class HumanController(PlayerController):
    def choose(self, view: dict, seat: int, *, quad_pairs: bool = True) -> None:
        return None


class EasyAI(PlayerController):
    def choose(self, view: dict, seat: int, *, quad_pairs: bool = True) -> Decision | None:
        actions = view["legal_actions"]
        if not actions:
            return None
        win = next((action for action in actions if action["type"] == A.HU.name), None)
        if win:
            return Decision(win, "执行合法胡牌")
        # Deterministic for a given authorized view, with no dependency on hidden seed.
        key = repr((seat, view["revision"], view["players"][seat]["concealed_tiles"]))
        return Decision(Random(key).choice(actions), "从合法操作中随机选择")


class NormalAI(PlayerController):
    advanced = False

    def choose(self, view: dict, seat: int, *, quad_pairs: bool = True) -> Decision | None:
        actions = view["legal_actions"]
        if not actions:
            return None
        for action in actions:
            if action["type"] in (A.HU.name, A.ROLL_DICE.name):
                return Decision(action, "执行合法胡牌" if action["type"] == A.HU.name else "庄家掷骰")
        own = view["players"][seat]
        hand = {tile["id"]: tile["type"] for tile in own["concealed_tiles"]}
        gold = view["gold_tile_type"]
        locked = bool(own["picked_orphans"])
        melds = len(own["melds"])
        counts = Counter((*hand.values(), *own["picked_orphans"]))
        remaining = visible_remaining(view, seat) if self.advanced else ()
        threat = [other for other, player in view["players"].items() if other != seat and player["declared_ting"]]
        safe = {(d["seat"], d["type"]) for d in view["discards"]}
        claim = view["pending_claim"]

        def evaluate(cards, open_sets, route):
            numbers = tuple(cards[kind] for kind in range(34))
            dist = _distance(numbers, open_sets, gold, route, quad_pairs)
            eff = 0
            if self.advanced:
                for kind, copies in enumerate(remaining):
                    if copies and numbers[kind] < 4:
                        after = numbers[:kind] + (numbers[kind] + 1,) + numbers[kind + 1:]
                        if _distance(after, open_sets, gold, route, quad_pairs) < dist:
                            eff += copies
            return dist, eff

        def options(action):
            kind = A[action["type"]]
            ids = action["tile_ids"]
            cards = counts.copy()
            cards.subtract(hand[i] for i in ids)
            sets = melds + (kind in (A.CHI, A.PENG, A.AN_GANG, A.MING_GANG))
            route = locked or kind == A.PICK_ORPHAN
            if kind == A.PICK_ORPHAN:
                cards[claim["tile_type"]] += 1
            if kind in (A.CHI, A.PENG, A.PICK_ORPHAN):
                # A claim without a replacement must leave a legal non-gold discard.
                candidates = {hand[tile_id] for tile_id in hand.keys() - set(ids)} - {gold}
                if not candidates:
                    return ((100, 0, 0, 0), "保留合法出牌空间")
                variants = []
                for discard in candidates:
                    after = cards.copy()
                    after[discard] -= 1
                    variants.append(evaluate(after, sets, route))
                dist, eff = min(variants, key=lambda item: (item[0], -item[1]))
            else:
                dist, eff = evaluate(cards, sets, route)
            bias = 0
            if kind == A.SHELVE_GOLD:
                bias = -4 if not own["has_completed_first_gold_shelf"] else 2
                if not own["has_completed_first_gold_shelf"] and own["declared_ting"]:
                    bias = -20
            elif kind == A.DECLARE_TING:
                bias = -8
            elif kind == A.PASS:
                bias = -1
            elif kind in (A.AN_GANG, A.BU_GANG, A.MING_GANG):
                bias = -2
            elif kind == A.PICK_ORPHAN:
                bias = 1

            danger = 0
            if self.advanced and ids and kind in (A.DISCARD, A.DECLARE_TING):
                discarded = hand[ids[0]]
                danger = sum((other, discarded) not in safe for other in threat)
                danger *= 1 + (discarded < 27 and 1 < discarded % 9 < 7)
            rationale = f"向听估计 {dist}"
            if self.advanced:
                rationale += f"，可见有效牌 {eff}，威胁权重 {danger}"
            if kind == A.SHELVE_GOLD and not own["has_completed_first_gold_shelf"]:
                rationale += "，满足首次上金门槛"
            return ((dist, danger * 5 - eff + bias, bias, tuple(ids)), rationale)

        action, (_, reason) = min(((action, options(action)) for action in actions), key=lambda item: item[1][0])
        return Decision(action, reason)


class AdvancedAI(NormalAI):
    advanced = True


CONTROLLERS = {"human": HumanController(), "easy": EasyAI(), "normal": NormalAI(), "advanced": AdvancedAI()}
