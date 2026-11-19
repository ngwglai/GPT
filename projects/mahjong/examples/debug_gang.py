"""Run from project root: python -m examples.debug_gang"""
from mahjong import GameEngine, RuleConfig, Seat, ActionType
from mahjong.game.debug import PlayerFixture, build_fixture, inspect_gang, simulate_action
from mahjong.notation import parse_types, format_type


engine = GameEngine(RuleConfig())
build_fixture(
    engine,
    {Seat.EAST: PlayerFixture(
        hand=parse_types("11112223444555m"),
        declared=True,
        declared_waits={0,1,2,3,4,33},
        last_draw_type=0,
    )},
    gold=33,
)
gang = next(a for a in engine.legal_actions(Seat.EAST) if a.type == ActionType.AN_GANG)
simulation = inspect_gang(engine, gang)
print("杠前听口:", [format_type(t) for t in sorted(simulation.before_waits)])
print("杠后听口:", [format_type(t) for t in sorted(simulation.after_waits)])
print("允许杠:", bool(simulation.after_waits))
snapshot = simulate_action(engine, gang)
print("模拟后的杠数:", snapshot.total_gang_count)
print("原局杠数未变:", engine.state.total_gang_count)
