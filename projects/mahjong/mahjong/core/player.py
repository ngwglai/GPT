from dataclasses import dataclass, field
from enum import Enum, auto
from .seat import Seat
from .tile import Tile


class MeldType(Enum):
    CHI = auto()
    PENG = auto()
    MING_GANG = auto()
    AN_GANG = auto()
    BU_GANG = auto()


@dataclass
class Meld:
    type: MeldType
    tiles: list[Tile]
    source_seat: Seat | None = None


@dataclass
class PlayerState:
    player_id: str
    seat: Seat
    concealed_tiles: list[Tile] = field(default_factory=list)
    melds: list[Meld] = field(default_factory=list)
    shelf_tiles: list[Tile] = field(default_factory=list)
    # The tile used to declare ting is no longer part of the structural hand or river.
    # It remains server-owned private state: visible to its owner, hidden from opponents.
    ting_tile: Tile | None = None
    is_declared_ting: bool = False
    declared_waits: set[int] = field(default_factory=set)
    current_waits: set[int] = field(default_factory=set)
    has_completed_first_gold_shelf: bool = False
    connected: bool = True
    last_drawn_tile: Tile | None = None
    last_draw_source: str | None = None
    picked_orphans: list[Tile] = field(default_factory=list)
    last_orphan_pick_cycle: int | None = None

    @property
    def shelf_count(self) -> int:
        return len(self.shelf_tiles)
