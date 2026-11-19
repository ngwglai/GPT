import unittest
from mahjong import *
from .helpers import *
from .test_gold import WAIT


class TingTests(unittest.TestCase):
    def test_unreported_hu_rejected(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[31],last_draw_type=31)},gold=33)
        self.assertTrue(e.solver.check_hu(e.state.players[E].concealed_tiles,[],33))
        self.assertFalse(has(e,E,ActionType.HU))
        with self.assertRaises(IllegalAction):
            play(e,Action(ActionType.HU,E))

    def test_declare_ting_moves_tile_to_private_ting_slot(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[7],last_draw_type=7)},gold=33)
        tile = e.state.players[E].last_drawn_tile
        play(e,Action(ActionType.DECLARE_TING,E,(tile.instance_id,)))
        p = e.state.players[E]
        self.assertTrue(p.is_declared_ting)
        self.assertEqual(p.declared_waits,{31,33})
        self.assertEqual(len(p.concealed_tiles),13)
        self.assertIs(p.ting_tile, tile)
        self.assertNotIn(tile, p.concealed_tiles)
        self.assertEqual(e.state.discards, [])
        self.assertFalse(p.has_completed_first_gold_shelf)

    def test_declare_ting_skips_all_response_windows(self):
        e = engine()
        build_fixture(e,{
            E:PlayerFixture(WAIT+[7],last_draw_type=7),
            S:PlayerFixture([7,7,0,1,2,3,4,5,9,10,11,18,19]),
        },gold=33)
        tile = e.state.players[E].last_drawn_tile
        play(e,Action(ActionType.DECLARE_TING,E,(tile.instance_id,)))
        self.assertEqual(e.state.phase, GamePhase.TURN_ACTION)
        self.assertEqual(e.state.current_player, S)
        self.assertIsNone(e.state.current_discard)
        self.assertIsNone(e.state.current_discarder)
        self.assertFalse(has(e,S,ActionType.PENG))
        self.assertFalse(has(e,S,ActionType.MING_GANG))
        self.assertFalse(has(e,S,ActionType.HU))

    def test_ting_tile_is_owner_visible_and_hidden_from_opponents(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[7],last_draw_type=7)},gold=33)
        tile = e.state.players[E].last_drawn_tile
        play(e,Action(ActionType.DECLARE_TING,E,(tile.instance_id,)))
        own = e.player_view(E)["players"][int(E)]["ting_tile"]
        other = e.player_view(S)["players"][int(E)]["ting_tile"]
        self.assertEqual(own, {"id": tile.instance_id, "type": tile.type_id})
        self.assertEqual(other, {"hidden": True})
        self.assertNotIn("id", other)
        self.assertNotIn("type", other)

    def test_ting_tile_does_not_participate_in_waits_or_hu_structure(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[7],last_draw_type=7)},gold=33)
        tile = e.state.players[E].last_drawn_tile
        play(e,Action(ActionType.DECLARE_TING,E,(tile.instance_id,)))
        p = e.state.players[E]
        self.assertEqual(e.solver.find_waits(p.concealed_tiles,p.melds,e.state.gold_tile_type), {31,33})
        self.assertFalse(e.solver.check_hu(p.concealed_tiles + [p.ting_tile],p.melds,e.state.gold_tile_type))

    def test_ting_event_records_private_tile_without_discard_event(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[7],last_draw_type=7)},gold=33)
        tile = e.state.players[E].last_drawn_tile
        play(e,Action(ActionType.DECLARE_TING,E,(tile.instance_id,)))
        kinds = [event.event_type.name for event in e.state.event_log]
        self.assertIn("TING_DECLARED", kinds)
        self.assertNotIn("TILE_DISCARDED", kinds)
        event = next(event for event in e.state.event_log if event.event_type.name == "TING_DECLARED")
        self.assertEqual(event.payload["tile"], tile.instance_id)
        self.assertNotIn("discard", event.payload)

    def test_false_ting_rejected_without_mutation(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture([0,1,3,5,7,9,11,13,15,17,19,21,23,25])},gold=33)
        before = e.player_view(E)
        with self.assertRaises(IllegalAction):
            play(e,Action(ActionType.DECLARE_TING,E,(e.state.players[E].concealed_tiles[-1].instance_id,)))
        self.assertEqual(before,e.player_view(E))

    def test_ting_only_actual_drawn_instance_can_discard(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31)},gold=33)
        p = e.state.players[E]
        discards = [a for a in e.legal_actions(E) if a.type == ActionType.DISCARD]
        self.assertEqual(discards,[Action(ActionType.DISCARD,E,(p.last_drawn_tile.instance_id,))])
        old_same = next(t for t in p.concealed_tiles if t.type_id == 31 and t != p.last_drawn_tile)
        with self.assertRaises(IllegalAction):
            play(e,Action(ActionType.DISCARD,E,(old_same.instance_id,)))

    def test_ting_cannot_chi_peng(self):
        e = engine()
        build_fixture(e,{S:PlayerFixture([0,1,2,2],declared=True)},gold=33,discard=(E,2))
        self.assertFalse(has(e,S,ActionType.CHI))
        self.assertFalse(has(e,S,ActionType.PENG))

    def test_wrong_turn_discard(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[7]),S:PlayerFixture([8])},gold=33)
        with self.assertRaises(IllegalAction):
            play(e,Action(ActionType.DISCARD,S,(e.state.players[S].concealed_tiles[0].instance_id,)))
