"""In-process JSON boundary; attach your HTTP/WebSocket transport separately."""
from threading import RLock

from ..core.action import Action, ActionType, IllegalAction
from .engine import GameEngine


class TableService:
    def __init__(self, engine: GameEngine):
        self.engine = engine
        self._lock = RLock()

    def _seat(self, authenticated_player_id: str):
        s = self.engine.state
        if s is None:
            raise IllegalAction("no active round")
        for seat,p in s.players.items():
            if p.player_id == authenticated_player_id:
                return seat
        raise IllegalAction("authenticated player is not at this table")

    def view_for(self, authenticated_player_id: str) -> dict:
        with self._lock:
            return self.engine.player_view(self._seat(authenticated_player_id))

    def handle_intent(self, authenticated_player_id: str, payload: dict) -> dict:
        """Never accept player identity/seat from client payload."""
        with self._lock:
            if not isinstance(payload, dict) or set(payload) != {"round_id", "revision", "type", "tile_ids"}:
                raise IllegalAction("expected round_id, revision, type, tile_ids only")
            if not isinstance(payload["round_id"],str) or type(payload["revision"]) is not int:
                raise IllegalAction("invalid round or revision")
            ids = payload["tile_ids"]
            if not isinstance(ids,list) or len(ids)>4 or any(type(i) is not int or not 0<=i<136 for i in ids):
                raise IllegalAction("invalid tile IDs")
            if not isinstance(payload["type"],str) or payload["type"] not in ActionType.__members__:
                raise IllegalAction("invalid action type")
            seat=self._seat(authenticated_player_id)
            action=Action(ActionType[payload["type"]],seat,tuple(ids))
            return self.engine.submit(action, expected_revision=payload["revision"],
                                      expected_round_id=payload["round_id"],actor_id=authenticated_player_id)

    def set_orphan_pickup(self, authenticated_player_id: str, round_id: str, enabled: bool) -> None:
        with self._lock:
            seat = self._seat(authenticated_player_id)
            self.engine.set_orphan_pickup(seat, enabled, expected_round_id=round_id, actor_id=authenticated_player_id)

    def timeout_responses(self, round_id: str, revision: int):
        """Trusted timer; use current window revision, not an arbitrary client call."""
        with self._lock:
            if self.engine.state is None or self.engine.state.round_id != round_id:
                raise IllegalAction("stale round ID")
            self.engine.timeout_responses(expected_revision=revision)
