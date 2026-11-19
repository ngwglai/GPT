"""SERVER/DEVELOPMENT ONLY. Never register these helpers as network routes."""
from copy import deepcopy
from dataclasses import dataclass, field

from ..core.action import Action
from ..core.player import PlayerState, Meld, MeldType
from ..core.seat import Seat
from ..core.state import GameState, GamePhase, Discard
from ..core.tile import Tile, make_deck, tiles_from_types
from ..core.wall import WallState, WallPosition
from ..rules.gang import simulate_gang
from ..rules.gold import get_opposite_tile
from ..rules.thirteen_orphans import check_player_hu, find_player_waits
from .engine import GameEngine


@dataclass
class PlayerFixture:
    hand: list[int] = field(default_factory=list)
    # (MeldType, tile type IDs, source Seat or None)
    melds: list[tuple[MeldType, list[int], Seat | None]] = field(default_factory=list)
    shelves: int = 0
    first_shelf_completed: bool = False
    declared: bool = False
    declared_waits: set[int] | None = None
    last_draw_type: int | None = None
    last_draw_source: str = "NORMAL"
    picked_orphans: list[int] = field(default_factory=list)


def build_fixture(engine: GameEngine, players: dict[Seat, PlayerFixture], *,
                  dealer: Seat = Seat.EAST, current: Seat = Seat.EAST,
                  dice: tuple[int, int] = (1, 2), gold: int | None = None,
                  wall_tiles: list[Tile] | None = None,
                  indicator_position: WallPosition | None = None,
                  indicator_type: int | None = None,
                  gang_count: int | None = None, head: int = 0, tail: int = 135,
                  discard: tuple[Seat, int] | None = None) -> GameState:
    """Allocate globally unique physical tiles, mark them removed from the wall.

    Unspecified hands are empty; this is a focused synthetic fixture, not an
    assertion that all four hand sizes form a reachable full game. Full wall
    order uses physical Tiles. Override gold intentionally need not match the
    indicator. Normal code must use start_round().
    """
    wall = WallState(list(wall_tiles) if wall_tiles is not None else make_deck(), dealer, dice)
    if indicator_position is not None:
        old = wall.get_slot(wall.gold_indicator_position)
        old.revealed = old.is_gold_indicator = False
        wall.gold_indicator_position = indicator_position
        slot = wall.get_slot(indicator_position)
        slot.revealed = slot.is_gold_indicator = True
    if indicator_type is not None:
        slot = wall.get_slot(wall.gold_indicator_position)
        other = next(slot for slot in wall.slots if slot.tile.type_id == indicator_type)
        slot.tile, other.tile = other.tile, slot.tile
    gold = get_opposite_tile(wall.get_slot(wall.gold_indicator_position).tile.type_id) if gold is None else gold
    if type(gold) is not int or not 0 <= gold < 34:
        raise ValueError("invalid gold type")
    used = set()
    states = {}
    for seat in Seat:
        f = players.get(seat, PlayerFixture())
        if not 0 <= f.shelves <= 4:
            raise ValueError("invalid shelf count")
        p = PlayerState(str(int(seat)), seat, tiles_from_types(f.hand, used))
        p.melds = [Meld(kind, tiles_from_types(types, used), source) for kind, types, source in f.melds]
        p.picked_orphans = tiles_from_types(f.picked_orphans, used)
        p.shelf_tiles = tiles_from_types([gold] * f.shelves, used)
        p.has_completed_first_gold_shelf = f.first_shelf_completed or bool(f.shelves)
        p.is_declared_ting = f.declared
        if f.declared_waits is not None:
            p.declared_waits = set(f.declared_waits)
        elif f.declared:
            p.declared_waits = find_player_waits(engine.solver, p, p.concealed_tiles, gold)
        p.current_waits = set(p.declared_waits)
        if f.last_draw_type is not None:
            p.last_drawn_tile = next(t for t in reversed(p.concealed_tiles) if t.type_id == f.last_draw_type)
            p.last_draw_source = f.last_draw_source
        states[seat] = p
    s = GameState("debug", states, dealer, current, GamePhase.TURN_ACTION, wall, *dice, gold, 0)
    s.strict_hand_sizes = False
    s.total_gang_count = gang_count if gang_count is not None else sum(m.type in {MeldType.AN_GANG, MeldType.BU_GANG, MeldType.MING_GANG} for p in states.values() for m in p.melds)
    wall.get_reserved_columns(s.total_gang_count)
    if discard is not None:
        source, typ = discard
        tile = tiles_from_types([typ], used)[0]
        s.discards.append(Discard(tile, source))
        s.current_discard, s.current_discarder = tile, source
    for slot in wall.slots:
        slot.drawn = slot.tile.instance_id in used
    wall.set_cursors(head, tail)
    engine.state = s
    engine.assert_invariants()
    if discard is not None:
        engine._open_responses()
    return engine.state


def simulate_action(engine: GameEngine, action: Action) -> GameState:
    """Return an isolated post-action snapshot; original table is untouched."""
    clone = deepcopy(engine)
    clone.submit(action, expected_revision=clone.state.revision,
                 actor_id=clone.state.players[action.seat].player_id,
                 expected_round_id=clone.state.round_id)
    return clone.state


def inspect_hand(engine: GameEngine, seat: Seat) -> dict:
    p, gold = engine.state.players[seat], engine.state.gold_tile_type
    return {"hu": check_player_hu(engine.solver, p, p.concealed_tiles, gold),
            "waits": find_player_waits(engine.solver, p, p.concealed_tiles, gold),
            "actions": engine.legal_actions(seat)}


def inspect_gang(engine: GameEngine, action: Action):
    s = engine.state
    return simulate_gang(s.players[action.seat], action, engine.solver, s.gold_tile_type,
                         s.current_discard, s.current_discarder)
