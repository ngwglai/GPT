from copy import deepcopy
from dataclasses import dataclass

from ..core.action import Action, ActionType, IllegalAction
from ..core.player import PlayerState, Meld, MeldType
from ..core.tile import Tile
from ..core.seat import Seat
from .thirteen_orphans import orphans_locked
from .win import WinSolver


@dataclass
class GangSimulation:
    player: PlayerState
    before_waits: set[int]
    after_waits: set[int]


def simulate_gang(player: PlayerState, action: Action, solver: WinSolver, gold: int,
                  discard: Tile | None = None, source: Seat | None = None) -> GangSimulation:
    """No replacement tile is included in the post-gang waiting hand."""
    if orphans_locked(player):
        raise IllegalAction("十三幺路线不能杠牌")
    p = deepcopy(player)
    by_id = {t.instance_id: t for t in p.concealed_tiles}
    if len(set(action.tile_ids)) != len(action.tile_ids) or any(i not in by_id for i in action.tile_ids):
        raise IllegalAction("gang tiles are not unique owned tiles")
    tiles = [by_id[i] for i in action.tile_ids]
    required = {ActionType.MING_GANG: 3, ActionType.AN_GANG: 4, ActionType.BU_GANG: 1}.get(action.type)
    if required is None or len(tiles) != required or len({t.type_id for t in tiles}) != 1:
        raise IllegalAction("invalid gang tile selection")
    before_hand = list(p.concealed_tiles)
    if action.type != ActionType.MING_GANG and p.last_drawn_tile in before_hand:
        before_hand.remove(p.last_drawn_tile)
    before = solver.find_waits(before_hand, p.melds, gold)
    if action.type == ActionType.MING_GANG:
        if discard is None or source is None or discard.type_id != tiles[0].type_id:
            raise IllegalAction("ming gang needs matching discard")
        p.melds.append(Meld(MeldType.MING_GANG, tiles + [discard], source))
    elif action.type == ActionType.AN_GANG:
        p.melds.append(Meld(MeldType.AN_GANG, tiles))
    else:
        meld = next((m for m in p.melds if m.type == MeldType.PENG and m.tiles[0].type_id == tiles[0].type_id), None)
        if meld is None:
            raise IllegalAction("bu gang needs an existing peng")
        meld.type = MeldType.BU_GANG
        meld.tiles += tiles
    p.concealed_tiles = [t for t in p.concealed_tiles if t.instance_id not in action.tile_ids]
    after = solver.find_waits(p.concealed_tiles, p.melds, gold)
    if p.is_declared_ting and not after:
        raise IllegalAction("gang destroys ting")
    if p.is_declared_ting:
        p.current_waits = set(after)
    p.last_drawn_tile = None
    p.last_draw_source = None
    return GangSimulation(p, before, after)
