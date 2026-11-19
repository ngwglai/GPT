from dataclasses import dataclass
from enum import Enum, auto
from .seat import Seat


class ActionType(Enum):
    ROLL_DICE = auto()
    DRAW = auto()
    DISCARD = auto()
    CHI = auto()
    PENG = auto()
    MING_GANG = auto()
    AN_GANG = auto()
    BU_GANG = auto()
    SHELVE_GOLD = auto()
    DECLARE_TING = auto()
    HU = auto()
    PASS = auto()
    PICK_ORPHAN = auto()


@dataclass(frozen=True)
class Action:
    type: ActionType
    seat: Seat
    tile_ids: tuple[int, ...] = ()


class IllegalAction(ValueError):
    pass
