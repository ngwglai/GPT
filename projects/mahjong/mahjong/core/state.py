from dataclasses import dataclass, field
from enum import Enum, auto

from .action import Action
from .event import GameEvent
from .player import PlayerState
from .seat import Seat
from .tile import Tile
from .wall import WallState
from ..rules.scoring import HuEffect, Settlement


class GamePhase(Enum):
    WAITING_PLAYERS = auto()
    SHUFFLING = auto()
    ROLLING_DICE = auto()
    DEALING = auto()
    TURN_ACTION = auto()
    WAITING_FOR_RESPONSES = auto()
    GANG_REPLACEMENT = auto()
    ROUND_END = auto()


@dataclass(frozen=True)
class RuleConfig:
    quad_as_two_pairs: bool = True
    allow_rob_bu_gang: bool = True
    hide_an_gang: bool = True
    enable_hai_di_tag: bool = False



@dataclass
class Discard:
    tile: Tile
    seat: Seat
    claimed: bool = False


@dataclass
class RoundResult:
    type: str
    winner: Seat | None
    source: Seat | None
    method: str | None
    winning_tile: Tile | None
    patterns: tuple[str, ...]
    effects: tuple[HuEffect, ...]
    next_dealer: Seat
    settlement: Settlement


@dataclass
class GameState:
    round_id: str
    players: dict[Seat, PlayerState]
    dealer: Seat
    current_player: Seat
    phase: GamePhase
    wall: WallState
    dice1: int
    dice2: int
    gold_tile_type: int
    shuffle_seed: int
    total_gang_count: int = 0
    current_discard: Tile | None = None
    current_discarder: Seat | None = None
    discards: list[Discard] = field(default_factory=list)
    pending_responses: dict[Seat, Action] = field(default_factory=dict)
    response_options: dict[Seat, list[Action]] = field(default_factory=dict)
    response_kind: str = "DISCARD"
    pending_gang: Action | None = None
    event_log: list[GameEvent] = field(default_factory=list)
    revision: int = 0
    result: RoundResult | None = None
    strict_hand_sizes: bool = True  # disabled only by synthetic DebugBuilder
    pickup_cycle: int = 1

    @property
    def break_wall(self):
        return self.wall.break_wall

    @property
    def break_column(self):
        return self.wall.break_column

    @property
    def gold_indicator_position(self):
        return self.wall.gold_indicator_position

    @property
    def gold_indicator_tile(self):
        return self.wall.get_slot(self.gold_indicator_position).tile
