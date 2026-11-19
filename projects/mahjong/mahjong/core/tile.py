from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class Tile:
    """Physical identity is fixed: instance_id = type_id * 4 + copy_index."""

    instance_id: int

    def __post_init__(self):
        if type(self.instance_id) is not int or not 0 <= self.instance_id < 136:
            raise ValueError("instance_id must be an integer in 0..135")

    @property
    def type_id(self) -> int:
        return self.instance_id // 4

    @property
    def name(self) -> str:
        t = self.type_id
        return f"{t % 9 + 1}{'万筒条'[t // 9]}" if t < 27 else "东南西北中发白"[t - 27]


def make_deck() -> list[Tile]:
    return [Tile(i) for i in range(136)]


def tiles_from_types(types: list[int], used: set[int] | None = None) -> list[Tile]:
    """Debug helper; pass a shared used set to allocate multiple hands/melds."""
    used = used if used is not None else set()
    result = []
    for t in types:
        if type(t) is not int or not 0 <= t < 34:
            raise ValueError("tile type must be 0..33")
        candidate = next((t * 4 + i for i in range(4) if t * 4 + i not in used), None)
        if candidate is None:
            raise ValueError(f"more than four physical copies of type {t}")
        used.add(candidate)
        result.append(Tile(candidate))
    return result


def type_counts(tiles: list[Tile]) -> Counter:
    return Counter(t.type_id for t in tiles)
