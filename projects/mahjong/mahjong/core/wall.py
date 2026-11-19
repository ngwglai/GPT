from dataclasses import dataclass
from enum import IntEnum

from .seat import Seat, advance_seat, opposite_seat, previous_seat
from .tile import Tile


class Layer(IntEnum):
    TOP = 0
    BOTTOM = 1


@dataclass(frozen=True)
class WallPosition:
    side: Seat
    column: int
    layer: Layer

    def __post_init__(self):
        if not isinstance(self.side, Seat) or not isinstance(self.layer, Layer):
            raise ValueError("use Seat and Layer enums")
        if type(self.column) is not int or not 0 <= self.column < 17:
            raise ValueError("column must be 0..16")


@dataclass
class WallSlot:
    tile: Tile
    position: WallPosition
    revealed: bool = False
    drawn: bool = False
    is_gold_indicator: bool = False


class WallExhausted(Exception):
    pass


def determine_break_wall(dealer: Seat, dice_sum: int) -> Seat:
    if type(dice_sum) is not int or not 2 <= dice_sum <= 12:
        raise ValueError("dice_sum must be 2..12")
    result = advance_seat(dealer, dice_sum - 1)
    return opposite_seat(dealer) if result == dealer else result


def validate_dice(dice: tuple[int, int]) -> None:
    if len(dice) != 2 or any(type(d) is not int or not 1 <= d <= 6 for d in dice):
        raise ValueError("two dice in 1..6 required")


class WallState:
    """Coordinates: each owner's left=0, right=16; side order follows Seat.

    Normal consumption: TOP then BOTTOM, then the next column.
    Tail consumption: exact reverse, BOTTOM then TOP. Both cursors index the
    same rotated list of physical slots. The reserve boundary never moves
    its origin when either cursor consumes tiles.
    """

    def __init__(self, tiles: list[Tile], dealer: Seat, dice: tuple[int, int]):
        validate_dice(dice)
        if len(tiles) != 136 or {t.instance_id for t in tiles} != set(range(136)):
            raise ValueError("wall must contain each of the 136 physical tiles exactly once")
        self.break_wall = determine_break_wall(dealer, sum(dice))
        self.break_column = min(dice)
        self.slots = [WallSlot(tile, self.position_from_index(i)) for i, tile in enumerate(tiles)]
        self.original_break_position = WallPosition(self.break_wall, self.break_column, Layer.TOP)
        start = self.index_from_position(self.original_break_position)
        self._order = [(start + i) % 136 for i in range(136)]
        self.head = 0
        self.tail = 135
        self.gold_indicator_position = WallPosition(previous_seat(self.break_wall), 17 - max(dice), Layer.TOP)
        indicator = self.get_slot(self.gold_indicator_position)
        indicator.revealed = indicator.is_gold_indicator = True

    @staticmethod
    def position_from_index(index: int) -> WallPosition:
        index %= 136
        return WallPosition(Seat(index // 34), (index % 34) // 2, Layer(index % 2))

    @staticmethod
    def index_from_position(position: WallPosition) -> int:
        return int(position.side) * 34 + position.column * 2 + int(position.layer)

    def get_slot(self, position: WallPosition) -> WallSlot:
        return self.slots[self.index_from_position(position)]

    def next_normal_position(self, position: WallPosition) -> WallPosition:
        return self.position_from_index(self.index_from_position(position) + 1)

    def previous_tail_position(self, position: WallPosition) -> WallPosition:
        return self.position_from_index(self.index_from_position(position) - 1)

    @property
    def normal_draw_cursor(self) -> WallPosition | None:
        return self.slots[self._order[self.head]].position if self.head <= self.tail else None

    @property
    def gang_draw_cursor(self) -> WallPosition | None:
        return self.slots[self._order[self.tail]].position if self.head <= self.tail else None

    @staticmethod
    def get_reserved_columns(gang_count: int) -> int:
        if type(gang_count) is not int or gang_count < 0:
            raise ValueError("gang_count must be nonnegative")
        return max(7, gang_count + 6)

    def normal_limit(self, gang_count: int) -> int:
        return max(0, 136 - 2 * self.get_reserved_columns(gang_count))

    def _next_available(self) -> int:
        i = self.head
        while i <= self.tail and self.slots[self._order[i]].drawn:
            i += 1
        return i

    def is_normal_draw_exhausted(self, gang_count: int) -> bool:
        i = self._next_available()
        return i > self.tail or i >= self.normal_limit(gang_count)

    def draw_normal(self, gang_count: int = 0) -> Tile:
        if self.is_normal_draw_exhausted(gang_count):
            raise WallExhausted("normal draw reached the reserve boundary")
        self.head = self._next_available()
        slot = self.slots[self._order[self.head]]
        self.head += 1
        slot.drawn = True
        return slot.tile

    def can_draw_tail(self) -> bool:
        return any(not self.slots[self._order[i]].drawn for i in range(self.head, self.tail + 1))

    def draw_gang_replacement(self) -> Tile:
        while self.tail >= self.head and self.slots[self._order[self.tail]].drawn:
            self.tail -= 1
        if self.tail < self.head:
            raise WallExhausted("wall has no tail replacement")
        slot = self.slots[self._order[self.tail]]
        self.tail -= 1
        slot.drawn = True
        return slot.tile

    def remaining_normal_count(self, gang_count: int) -> int:
        end = min(self.tail + 1, self.normal_limit(gang_count))
        return sum(not self.slots[self._order[i]].drawn for i in range(self.head, end))

    def set_cursors(self, head: int, tail: int) -> None:
        """Debug only. Coordinates are offsets from the original break."""
        if not 0 <= head <= 136 or not -1 <= tail <= 135 or head > tail + 1:
            raise ValueError("invalid wall cursor offsets")
        self.head, self.tail = head, tail
