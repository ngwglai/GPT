import unittest
from mahjong import *
from mahjong.core.player import MeldType
from mahjong.core.event import EventType
from mahjong.game.debug import inspect_gang
from .helpers import *


class GangTests(unittest.TestCase):
    def test_ting_an_gang_keeps_nonempty_waits(self):
        e = engine()
        hand = [0]*4+[9,10,11,18,19,20,27,27,27,31]
        build_fixture(e,{E:PlayerFixture(hand,declared=True,last_draw_type=0)},gold=33)
        action = choose(e,E,ActionType.AN_GANG)
        sim = inspect_gang(e,action)
        self.assertEqual(sim.after_waits,{31,33})
        set_next(e,31,tail=True)
        play(e,action)
        self.assertEqual(e.state.total_gang_count,1)
        self.assertEqual(e.state.players[E].melds[0].type,MeldType.AN_GANG)
        self.assertEqual(e.state.players[E].last_draw_source,"GANG")
        self.assertEqual(len(e.state.players[E].concealed_tiles),11)
        self.assertTrue(has(e,E,ActionType.HU))

    def test_ting_an_gang_with_changed_waits_is_allowed_and_logged(self):
        e = engine()
        hand = [0]*4+[1]*3+[2]+[3]*3+[4]*3
        build_fixture(e,{E:PlayerFixture(hand,declared=True,last_draw_type=0,declared_waits={0,1,2,3,4,33})},gold=33)
        a=choose(e,E,ActionType.AN_GANG)
        sim=inspect_gang(e,a)
        self.assertTrue(sim.after_waits)
        self.assertNotEqual(sim.before_waits,sim.after_waits)
        self.assertTrue(sim.after_waits <= sim.before_waits)
        play(e,a)
        self.assertTrue(any(x.event_type == EventType.WAITS_CHANGED for x in e.state.event_log))
        self.assertEqual(e.state.players[E].declared_waits,{0,1,2,3,4,33})

    def test_ting_illegal_an_gang(self):
        # Closed seven-pairs hand; after declaring a gang, the remaining
        # tiles cannot form standard hu, even with a wildcard winning tile.
        e=engine()
        hand=[0]*4+[1]*4+[2]*2+[4]*4
        build_fixture(e,{E:PlayerFixture(hand,declared=True,last_draw_type=4)},gold=33)
        ids=tuple(t.instance_id for t in e.state.players[E].concealed_tiles if t.type_id==0)
        self.assertNotIn(Action(ActionType.AN_GANG,E,ids),e.legal_actions(E))
        with self.assertRaises(IllegalAction):
            play(e,Action(ActionType.AN_GANG,E,ids))

    def test_ting_ming_gang(self):
        e=engine()
        hand=[0]*3+[9,10,11,18,19,20,27,27,27,31]
        build_fixture(e,{S:PlayerFixture(hand,declared=True)},gold=33,discard=(E,0))
        self.assertTrue(has(e,S,ActionType.MING_GANG))
        play(e,choose(e,S,ActionType.MING_GANG))
        self.assertEqual(e.state.current_player,S)
        self.assertEqual(e.state.total_gang_count,1)
        self.assertTrue(e.state.discards[-1].claimed)

    def test_ting_bu_gang(self):
        e=engine()
        f=PlayerFixture([0,9,10,11,18,19,20,27,27,27,31],
                        melds=[(MeldType.PENG,[0]*3,S)],declared=True,last_draw_type=0)
        build_fixture(e,{E:f},gold=33)
        play(e,choose(e,E,ActionType.BU_GANG))
        self.assertEqual(e.state.players[E].melds[0].type,MeldType.BU_GANG)
        self.assertEqual(e.state.total_gang_count,1)

    def test_gang_shang_kai_hua_effect(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture([0]*4+[9,10,11,18,19,20,27,27,27,31],declared=True,last_draw_type=0)},gold=33)
        set_next(e,31,tail=True)
        play(e,choose(e,E,ActionType.AN_GANG))
        play(e,choose(e,E,ActionType.HU))
        self.assertEqual([x.name for x in e.state.result.effects],["GANG_SHANG_KAI_HUA"])

    def test_gold_from_gang_is_optional_shelf(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture([0]*4+[9,10,11,18,19,20,27,27,27,31],declared=True,last_draw_type=0)},gold=33)
        set_next(e,33,tail=True)
        play(e,choose(e,E,ActionType.AN_GANG))
        p=e.state.players[E]
        self.assertEqual(p.shelf_count,0)
        self.assertEqual(p.last_drawn_tile.type_id,33)
        self.assertEqual(e.state.phase,GamePhase.TURN_ACTION)
        self.assertTrue(has(e,E,ActionType.SHELVE_GOLD))
        self.assertFalse(has(e,E,ActionType.HU))
        self.assertEqual(e.state.total_gang_count,1)
        e.assert_invariants()

    def test_rob_bu_gang_does_not_commit_or_draw(self):
        e=engine()
        f=PlayerFixture([0,1,2,3,4,5,6,7,8,9,9],melds=[(MeldType.PENG,[0]*3,W)],last_draw_type=0)
        other=PlayerFixture([10,11,12,13,14,15,18,19,20,27,27,27,33],declared=True,shelves=1)
        build_fixture(e,{E:f,S:other},gold=33)
        tail=e.state.wall.tail
        play(e,choose(e,E,ActionType.BU_GANG))
        self.assertEqual(e.state.phase,GamePhase.WAITING_FOR_RESPONSES)
        self.assertEqual(e.player_view(S)["pending_claim"],{"kind":"ROB_BU_GANG","source":0,"tile_type":0})
        self.assertTrue(has(e,S,ActionType.HU))
        play(e,choose(e,S,ActionType.HU))
        self.assertEqual(e.state.total_gang_count,0)
        self.assertEqual(e.state.wall.tail,tail)
        self.assertEqual(e.state.players[E].melds[0].type,MeldType.PENG)
        self.assertEqual([x.name for x in e.state.result.effects],["QIANG_GANG_HU"])
        e.assert_invariants()

    def test_rob_window_pass_commits_gang(self):
        e=engine()
        f=PlayerFixture([0,1,2,3,4,5,6,7,8,9,9],melds=[(MeldType.PENG,[0]*3,W)],last_draw_type=0)
        other=PlayerFixture([10,11,12,13,14,15,18,19,20,27,27,27,33],declared=True,shelves=1)
        build_fixture(e,{E:f,S:other},gold=33)
        play(e,choose(e,E,ActionType.BU_GANG))
        play(e,choose(e,S,ActionType.PASS))
        self.assertEqual(e.state.total_gang_count,1)
        self.assertEqual(e.state.players[E].melds[0].type,MeldType.BU_GANG)

    def test_rob_bu_gang_penalty_depends_on_source_ting(self):
        for declared in (False, True):
            with self.subTest(declared=declared):
                e=engine()
                f=PlayerFixture([0,1,2,3,4,5,6,7,8,9,9],melds=[(MeldType.PENG,[0]*3,W)],last_draw_type=0,declared=declared)
                other=PlayerFixture([10,11,12,13,14,15,18,19,20,27,27,27,33],declared=True,shelves=1)
                build_fixture(e,{E:f,S:other},gold=33)
                tail=e.state.wall.tail
                play(e,choose(e,E,ActionType.BU_GANG))
                play(e,choose(e,S,ActionType.HU))
                self.assertEqual(e.state.result.method,"ROB_GANG")
                payment=next(p for p in e.state.result.settlement.items["payments"] if p["payer"]==E and p["receiver"]==S)
                self.assertEqual((payment["base"],payment["gold"],payment["discard"]),(2,5,0 if declared else 5))
                self.assertEqual(e.state.total_gang_count,0)
                self.assertEqual(e.state.wall.tail,tail)
