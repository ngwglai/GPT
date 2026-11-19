from collections import Counter
from dataclasses import dataclass
from typing import Callable

from ..core.tile import Tile
from ..core.player import Meld
from ..solver.standard import check_standard
from ..solver.seven_pairs import check_seven_pairs
from ..solver.thirteen_orphans import check_thirteen_orphans
from .meld import valid_meld


@dataclass(frozen=True)
class HuResult:
    valid: bool
    patterns: tuple[str, ...] = ()

    def __bool__(self):
        return self.valid


class WinSolver:
    def __init__(self, quad_as_two_pairs: bool = True):
        self.quad_as_two_pairs = quad_as_two_pairs
        self.extra_validators: dict[str, Callable] = {}

    def register(self, name: str, validator: Callable) -> None:
        """validator(counts, wildcards, melds) -> bool; no score coupling."""
        if name in {"standard", "seven_pairs", "thirteen_orphans"}:
            raise ValueError("built-in validator name")
        self.extra_validators[name] = validator

    def check_hu(self, concealed_tiles: list[Tile], melds: list[Meld], gold_tile_type: int,
                 *, thirteen_orphans_only: bool = False) -> HuResult:
        all_tiles = list(concealed_tiles) + [t for m in melds for t in m.tiles]
        if len({t.instance_id for t in all_tiles}) != len(all_tiles) or any(not valid_meld(m) for m in melds):
            return HuResult(False)
        types = [t.type_id for t in concealed_tiles]
        if thirteen_orphans_only:
            return self.check_types(types, melds, gold_tile_type, thirteen_orphans_only=True)
        return self.check_types(types, melds, gold_tile_type)

    def check_types(self, types: list[int], melds: list[Meld], gold_tile_type: int,
                    *, thirteen_orphans_only: bool = False) -> HuResult:
        if type(gold_tile_type) is not int or not 0 <= gold_tile_type < 34:
            raise ValueError("gold tile type must be 0..33")
        if any(type(t) is not int or not 0 <= t < 34 for t in types):
            raise ValueError("tile type must be 0..33")
        if len(melds) > 4 or len(types) != 14 - 3 * len(melds) or any(not valid_meld(m) for m in melds):
            return HuResult(False)
        physical = Counter(types + [t.type_id for m in melds for t in m.tiles])
        if any(n > 4 for n in physical.values()):
            return HuResult(False)
        counts = [0] * 34
        for t in types:
            counts[t] += 1
        wildcards = counts[gold_tile_type]
        counts[gold_tile_type] = 0
        counts = tuple(counts)
        if thirteen_orphans_only:
            if not melds and check_thirteen_orphans(counts, wildcards):
                return HuResult(True, ("thirteen_orphans",))
            return HuResult(False)
        patterns = []
        if check_standard(counts, wildcards):
            patterns.append("standard")
        if not melds:
            if check_seven_pairs(counts, wildcards, self.quad_as_two_pairs):
                patterns.append("seven_pairs")
            if check_thirteen_orphans(counts, wildcards):
                patterns.append("thirteen_orphans")
        for name, validator in self.extra_validators.items():
            if validator(counts, wildcards, melds):
                patterns.append(name)
        return HuResult(bool(patterns), tuple(patterns))

    def find_waits(self, concealed_tiles: list[Tile], melds: list[Meld], gold_tile_type: int,
                   *, thirteen_orphans_only: bool = False) -> set[int]:
        if len(concealed_tiles) != 13 - 3 * len(melds):
            return set()
        physical = list(concealed_tiles) + [t for m in melds for t in m.tiles]
        if len({t.instance_id for t in physical}) != len(physical):
            return set()
        types = [t.type_id for t in concealed_tiles]
        if thirteen_orphans_only:
            return {t for t in range(34)
                    if self.check_types(types + [t], melds, gold_tile_type, thirteen_orphans_only=True)}
        return {t for t in range(34) if self.check_types(types + [t], melds, gold_tile_type)}
