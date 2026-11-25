from dataclasses import dataclass
from enum import IntEnum

from .seat import Seat, advance_seat, opposite_seat, previous_seat
from .tile import Tile


COLUMNS_PER_WALL = 17
# With the next player on the right, the clockwise wall neighbor is the
# previous player. Physical storage indexes still use the Seat enum.
CLOCKWISE_WALLS = (Seat.EAST, Seat.NORTH, Seat.WEST, Seat.SOUTH)
STACK_COUNT = len(CLOCKWISE_WALLS) * COLUMNS_PER_WALL
TILE_COUNT = STACK_COUNT * 2


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
        if type(self.column) is not int or not 0 <= self.column < COLUMNS_PER_WALL:
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
    # Count dice from the dealer in player order, with the local 5/9 rule.
    return opposite_seat(dealer) if dice_sum in (5, 9) else advance_seat(dealer, dice_sum - 1)


def validate_dice(dice: tuple[int, int]) -> None:
    if len(dice) != 2 or any(type(d) is not int or not 1 <= d <= 6 for d in dice):
        raise ValueError("two dice in 1..6 required")


class WallState:
    """Two traversal orders over the same physical slots, starting at the break.

    Each traversal chooses a stack first and then takes TOP before BOTTOM.
    Reserve offsets always refer to the original clockwise order.
    """

    def __init__(self, tiles: list[Tile], dealer: Seat, dice: tuple[int, int]):
        validate_dice(dice)
        if len(tiles) != TILE_COUNT or {t.instance_id for t in tiles} != set(range(TILE_COUNT)):
            raise ValueError("wall must contain each of the 136 physical tiles exactly once")
        self.break_wall = determine_break_wall(dealer, sum(dice))
        self.break_column = COLUMNS_PER_WALL - 1 - min(dice)
        self.slots = [WallSlot(tile, self.position_from_index(i)) for i, tile in enumerate(tiles)]
        self.original_break_position = WallPosition(self.break_wall, self.break_column, Layer.TOP)

        # Store by physical coordinates. Build the path in stacks so reversing
        # its direction never reverses the two layers within a stack.
        stacks = []
        position = self.original_break_position
        for _ in range(STACK_COUNT):
            top = self.get_slot(position)
            bottom = self.get_slot(self.next_normal_position(position))
            stacks.append((top, bottom))
            position = self.next_normal_position(bottom.position)
        self._stacks = tuple(stacks)
        self._normal_slots = tuple(slot for stack in self._stacks for slot in stack)
        self.set_cursors(0, TILE_COUNT - 1)

        self.gold_indicator_position = WallPosition(previous_seat(self.break_wall), max(dice) - 1, Layer.TOP)
        indicator = self.get_slot(self.gold_indicator_position)
        indicator.revealed = indicator.is_gold_indicator = True

    @staticmethod
    def position_from_index(index: int) -> WallPosition:
        stack, layer = divmod(index % TILE_COUNT, 2)
        side, column = divmod(stack, COLUMNS_PER_WALL)
        return WallPosition(Seat(side), column, Layer(layer))

    @staticmethod
    def index_from_position(position: WallPosition) -> int:
        return 2 * (int(position.side) * COLUMNS_PER_WALL + position.column) + int(position.layer)

    def get_slot(self, position: WallPosition) -> WallSlot:
        return self.slots[self.index_from_position(position)]

    @staticmethod
    def _step(position: WallPosition, direction: int) -> WallPosition:
        if position.layer == Layer.TOP:
            return WallPosition(position.side, position.column, Layer.BOTTOM)
        column = position.column - direction
        side = position.side
        if not 0 <= column < COLUMNS_PER_WALL:
            wall = (CLOCKWISE_WALLS.index(side) + direction) % len(CLOCKWISE_WALLS)
            side = CLOCKWISE_WALLS[wall]
        return WallPosition(side, column % COLUMNS_PER_WALL, Layer.TOP)

    def next_normal_position(self, position: WallPosition) -> WallPosition:
        return self._step(position, 1)

    def previous_tail_position(self, position: WallPosition) -> WallPosition:
        return self._step(position, -1)

    @property
    def normal_draw_cursor(self) -> WallPosition | None:
        index = self._next_available(self._normal_slots, self.head, self._normal_end)
        return self._normal_slots[index].position if index < self._normal_end else None

    @property
    def gang_draw_cursor(self) -> WallPosition | None:
        index = self._next_available(self._replacement_slots, self._replacement_offset, len(self._replacement_slots))
        return self._replacement_slots[index].position if index < len(self._replacement_slots) else None

    @property
    def tail(self) -> int:
        """Debug counter decreasing as the replacement cursor advances."""
        return self._normal_end - 1 - self._replacement_offset

    @staticmethod
    def get_reserved_columns(gang_count: int) -> int:
        if type(gang_count) is not int or gang_count < 0:
            raise ValueError("gang_count must be nonnegative")
        return max(7, gang_count + 6)

    def normal_limit(self, gang_count: int) -> int:
        return max(0, TILE_COUNT - 2 * self.get_reserved_columns(gang_count))

    def reserved_positions(self, gang_count: int) -> set[WallPosition]:
        return {slot.position for slot in self._normal_slots[self.normal_limit(gang_count):]}

    @staticmethod
    def _next_available(slots: tuple[WallSlot, ...], offset: int, end: int) -> int:
        while offset < end and slots[offset].drawn:
            offset += 1
        return offset

    def is_normal_draw_exhausted(self, gang_count: int) -> bool:
        end = min(self._normal_end, self.normal_limit(gang_count))
        return self._next_available(self._normal_slots, self.head, end) >= end

    def draw_normal(self, gang_count: int = 0) -> Tile:
        end = min(self._normal_end, self.normal_limit(gang_count))
        index = self._next_available(self._normal_slots, self.head, end)
        if index >= end:
            raise WallExhausted("normal draw reached the reserve boundary")
        slot = self._normal_slots[index]
        self.head = index + 1
        slot.drawn = True
        return slot.tile

    def can_draw_tail(self) -> bool:
        return self.gang_draw_cursor is not None

    def draw_gang_replacement(self) -> Tile:
        end = len(self._replacement_slots)
        index = self._next_available(self._replacement_slots, self._replacement_offset, end)
        if index == end:
            raise WallExhausted("wall has no tail replacement")
        slot = self._replacement_slots[index]
        self._replacement_offset = index + 1
        slot.drawn = True
        return slot.tile

    def remaining_normal_count(self, gang_count: int) -> int:
        end = min(self._normal_end, self.normal_limit(gang_count))
        return sum(not slot.drawn for slot in self._normal_slots[self.head:end])

    def set_cursors(self, head: int, tail: int) -> None:
        """Set a debug window using inclusive tail and clockwise break offsets."""
        if not 0 <= head <= TILE_COUNT or not -1 <= tail < TILE_COUNT or head > tail + 1:
            raise ValueError("invalid wall cursor offsets")
        self.head = head
        self._normal_end = tail + 1
        self._replacement_offset = 0
        # A debug window may start or end in the middle of a stack.
        self._replacement_slots = tuple(
            slot
            for stack_index in range(tail // 2, head // 2 - 1, -1)
            for layer, slot in enumerate(self._stacks[stack_index])
            if head <= 2 * stack_index + layer <= tail
        )
