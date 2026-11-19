"""Run: python -m examples.service_usage"""
import json
from mahjong import GameEngine, RuleConfig, Seat
from mahjong.game.service import TableService


engine=GameEngine(RuleConfig())
engine.start_round({seat:f"player-{int(seat)}" for seat in Seat},seed=42)
service=TableService(engine)

# Real transport obtains this ID from authenticated session middleware.
# The example picks whichever seat currently has an offered action.
for seat in Seat:
    actor_id=engine.state.players[seat].player_id
    view=service.view_for(actor_id)
    if view["legal_actions"]:
        chosen=view["legal_actions"][0]
        payload={"round_id":view["round_id"],"revision":view["revision"],**chosen}
        updated=service.handle_intent(actor_id,payload)
        print(json.dumps({"submitted":payload,"revision":updated["revision"],"phase":updated["phase"]},ensure_ascii=False,indent=2))
        break
