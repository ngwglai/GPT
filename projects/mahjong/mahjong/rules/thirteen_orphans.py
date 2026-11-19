"""The public pickup route and its integration with the shared win solver."""
from collections import Counter

from ..core.action import Action, ActionType, IllegalAction
from ..core.player import PlayerState
from ..core.seat import Seat
from ..core.state import GamePhase, GameState
from ..core.tile import Tile
from ..solver.thirteen_orphans import ORPHANS
from .win import HuResult, WinSolver


def orphans_locked(player: PlayerState) -> bool:
    return bool(player.picked_orphans)


def advance_pickup_cycle(state: GameState, seat: Seat) -> None:
    """Count clockwise laps from the dealer, including turns skipped by claims."""
    source_offset = (state.current_player - state.dealer) % len(Seat)
    target_offset = (seat - state.dealer) % len(Seat)
    if target_offset < source_offset:
        state.pickup_cycle += 1


def pickup_action(state: GameState, seat: Seat) -> Action | None:
    """Offer the latest discard to an eligible responder once per discard lap."""
    tile = state.current_discard
    if (state.phase != GamePhase.WAITING_FOR_RESPONSES
            or state.response_kind != "DISCARD" or seat == state.current_discarder
            or tile is None or tile.type_id not in ORPHANS or tile.type_id == state.gold_tile_type):
        return None
    player = state.players[seat]
    if (not (player.orphan_pickup_enabled or orphans_locked(player))
            or player.is_declared_ting or player.melds or not player.concealed_tiles
            or player.last_orphan_pick_cycle == state.pickup_cycle):
        return None

    # A pickup is permanent. Its public tiles must fit at least one final
    # structure, regardless of which tiles the player keeps in the dark hand.
    counts = Counter(t.type_id for t in player.picked_orphans)
    counts[tile.type_id] += 1
    if max(counts.values()) > 2 or sum(count == 2 for count in counts.values()) > 1:
        return None
    return Action(ActionType.PICK_ORPHAN, seat)


def claim_pickup(state: GameState, action: Action) -> Tile:
    """Transfer the river tile and hand the turn to the claimant without a draw."""
    if action != pickup_action(state, action.seat):
        raise IllegalAction("当前不能拾取这张幺牌")
    if not state.discards:
        raise IllegalAction("十三幺拾牌对应的弃牌已失效")
    discard = state.discards[-1]
    if discard.claimed or discard.tile != state.current_discard or discard.seat != state.current_discarder:
        raise IllegalAction("十三幺拾牌对应的弃牌已失效")
    state.discards.pop()
    player = state.players[action.seat]
    player.picked_orphans.append(discard.tile)
    player.orphan_pickup_enabled = False
    player.last_orphan_pick_cycle = state.pickup_cycle
    player.last_drawn_tile = player.last_draw_source = None
    advance_pickup_cycle(state, action.seat)
    state.current_player, state.phase = action.seat, GamePhase.TURN_ACTION
    state.current_discard = state.current_discarder = None
    return discard.tile


def check_player_hu(solver: WinSolver, player: PlayerState, tiles: list[Tile], gold: int) -> HuResult:
    if orphans_locked(player):
        return solver.check_hu(tiles + player.picked_orphans, player.melds, gold, thirteen_orphans_only=True)
    return solver.check_hu(tiles, player.melds, gold)


def find_player_waits(solver: WinSolver, player: PlayerState, tiles: list[Tile], gold: int) -> set[int]:
    if orphans_locked(player):
        return solver.find_waits(tiles + player.picked_orphans, player.melds, gold, thirteen_orphans_only=True)
    return solver.find_waits(tiles, player.melds, gold)
