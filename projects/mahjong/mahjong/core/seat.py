from enum import IntEnum


class Seat(IntEnum):
    EAST = 0
    SOUTH = 1
    WEST = 2
    NORTH = 3


def advance_seat(seat: Seat, steps: int = 1) -> Seat:
    return Seat((int(seat) + steps) % 4)


def next_seat(seat: Seat) -> Seat:
    return advance_seat(seat)


def previous_seat(seat: Seat) -> Seat:
    return advance_seat(seat, -1)


def opposite_seat(seat: Seat) -> Seat:
    return advance_seat(seat, 2)


def turn_order(start: Seat, include_start: bool = True) -> tuple[Seat, ...]:
    return tuple(advance_seat(start, i) for i in range(0 if include_start else 1, 4))
