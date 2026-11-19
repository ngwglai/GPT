import argparse
import json
import random

from . import GameEngine, RuleConfig, Seat, GamePhase, ActionType, WinSolver, tiles_from_types
from .notation import parse_types, format_type


def run_demo(seed: int = 42, rounds: int = 1):
    """Legal random bots, not a Mahjong AI. No random draws inside the engine."""
    bot=random.Random(seed)
    engine=GameEngine(RuleConfig())
    dealer=Seat.EAST
    summaries=[]
    for i in range(rounds):
        engine.start_round({seat:f"bot-{int(seat)}" for seat in Seat},dealer,seed=seed+i)
        commands=0
        while engine.state.phase!=GamePhase.ROUND_END:
            available=[(seat,engine.legal_actions(seat)) for seat in Seat]
            available=[(seat,actions) for seat,actions in available if actions]
            if not available:
                raise RuntimeError("nonterminal state has no legal action")
            seat,actions=bot.choice(available)
            priorities=[ActionType.HU,ActionType.DECLARE_TING,ActionType.MING_GANG,ActionType.AN_GANG,ActionType.BU_GANG]
            action=None
            for kind in priorities:
                choices=[a for a in actions if a.type==kind]
                if choices:
                    action=bot.choice(choices)
                    break
            if action is None:
                action=bot.choice(actions)
            engine.submit(action,expected_revision=engine.state.revision,expected_round_id=engine.state.round_id,
                          actor_id=engine.state.players[seat].player_id)
            commands+=1
            if commands>1000:
                raise RuntimeError("demo action limit exceeded")
        summaries.append({"round":i+1,"seed":seed+i,"commands":commands,"events":len(engine.state.event_log),
                          "gangs":engine.state.total_gang_count,"result":engine.player_view(Seat.EAST)["result"]})
        dealer=engine.state.result.next_dealer
    return summaries


def main():
    parser=argparse.ArgumentParser(description="本地麻将规则引擎：自测对局与听口检查")
    sub=parser.add_subparsers(dest="command",required=True)
    demo=sub.add_parser("demo",help="运行四个随机合法操作玩家")
    demo.add_argument("--seed",type=int,default=42)
    demo.add_argument("--rounds",type=int,default=1)
    waits=sub.add_parser("waits",help="检查13张闭门手牌的结构听口")
    waits.add_argument("--tiles",required=True)
    waits.add_argument("--gold",required=True)
    args=parser.parse_args()
    if args.command=="demo":
        if not 1<=args.rounds<=10000:
            parser.error("rounds must be 1..10000")
        print(json.dumps(run_demo(args.seed,args.rounds),ensure_ascii=False,indent=2))
    else:
        try:
            types=parse_types(args.tiles)
            gold=parse_types(args.gold)
            if len(gold)!=1 or len(types)!=13:
                raise ValueError("provide exactly 13 concealed tiles and one gold type")
        except ValueError as exc:
            parser.error(str(exc))
        result=WinSolver().find_waits(tiles_from_types(types),[],gold[0])
        print(json.dumps({"structural_waits":[format_type(t) for t in sorted(result)],
                          "note":"结构听口含金；首次获得金仍须上金，不能据此直接胡。"},ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
