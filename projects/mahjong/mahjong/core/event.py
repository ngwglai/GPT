from dataclasses import dataclass
from enum import Enum, auto

from .seat import Seat


class EventType(Enum):
    ROUND_STARTED = auto()
    DICE_ROLLED = auto()
    GOLD_INDICATOR_REVEALED = auto()
    DEAL_COMPLETED = auto()
    TILE_DRAWN = auto()
    TILE_DISCARDED = auto()
    CHI = auto()
    PENG = auto()
    GANG = auto()
    GANG_PROPOSED = auto()
    GOLD_SHELVED = auto()
    GOLD_KEPT = auto()
    TING_DECLARED = auto()
    WAITS_CHANGED = auto()
    RESPONSE_SUBMITTED = auto()
    HU = auto()
    ROUND_DRAW = auto()
    ROUND_SETTLED = auto()
    ORPHAN_PICKED = auto()


@dataclass
class GameEvent:
    event_id: int
    event_type: EventType
    player: Seat | None
    payload: dict
    timestamp: float
