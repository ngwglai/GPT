from ..core.player import PlayerState
from .thirteen_orphans import find_player_waits
from .win import WinSolver


def effective_waits(player: PlayerState, solver: WinSolver, gold: int) -> set[int]:
    """Structural waits are shared with the solver; first gold cannot win."""
    waits = find_player_waits(solver, player, player.concealed_tiles, gold)
    return waits if player.has_completed_first_gold_shelf else waits - {gold}
