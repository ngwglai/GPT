from .engine import GameEngine
from ..core.action import IllegalAction
from ..core.state import GamePhase


def start_next_round(engine: GameEngine, **debug_options):
    s = engine.state
    if s is None or s.phase != GamePhase.ROUND_END:
        raise IllegalAction("round has not ended")
    return engine.start_round({seat: p.player_id for seat, p in s.players.items()},
                              s.result.next_dealer, **debug_options)
