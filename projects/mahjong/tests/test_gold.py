import unittest
from mahjong import *
from mahjong.core.event import EventType
from .helpers import *


WAIT = [0,1,2,9,10,11,18,19,20,27,27,27,31]


class GoldTests(unittest.TestCase):
    def setup_draw(self, declared=False, shelves=0):
        e = engine()
        build_fixture(e, {E: PlayerFixture(WAIT, declared=declared, shelves=shelves)}, gold=33)
        set_next(e, 33)
        return e

    def test_first_gold_is_optional_and_cannot_be_normal_discard(self):
        e = self.setup_draw()
        e._draw_for(E)
        p = e.state.players[E]
        gold = p.last_drawn_tile
        self.assertEqual(gold.type_id, 33)
        self.assertEqual(p.shelf_count, 0)
        self.assertFalse(p.has_completed_first_gold_shelf)
        self.assertEqual(e.state.phase, GamePhase.TURN_ACTION)
        self.assertIn(Action(ActionType.SHELVE_GOLD, E, (gold.instance_id,)), e.legal_actions(E))
        self.assertNotIn(Action(ActionType.DISCARD, E, (gold.instance_id,)), e.legal_actions(E))
        self.assertFalse(has(e, E, ActionType.HU))

    def test_keep_gold_by_discarding_another_tile(self):
        e = self.setup_draw()
        e._draw_for(E)
        gold_id = e.state.players[E].last_drawn_tile.instance_id
        discard = next(a for a in e.legal_actions(E) if a.type == ActionType.DISCARD)
        play(e, discard)
        self.assertTrue(any(t.instance_id == gold_id for t in e.state.players[E].concealed_tiles))
        self.assertEqual(e.state.players[E].shelf_count, 0)

    def test_shelve_ends_turn_without_replacement_or_response(self):
        e = self.setup_draw()
        e._draw_for(E)
        before_head = e.state.wall.head
        play(e, choose(e, E, ActionType.SHELVE_GOLD))
        p = e.state.players[E]
        self.assertEqual(p.shelf_count, 1)
        self.assertTrue(p.has_completed_first_gold_shelf)
        self.assertEqual(len(p.concealed_tiles), 13)
        self.assertEqual(e.state.current_player, S)
        self.assertEqual(e.state.phase, GamePhase.TURN_ACTION)
        # Exactly one normal draw occurred: the next player's draw. No shelf replacement.
        self.assertEqual(e.state.wall.head, before_head + 1)
        self.assertIsNone(e.state.current_discard)
        self.assertFalse(e.state.response_options)
        self.assertTrue(any(ev.event_type == EventType.GOLD_SHELVED for ev in e.state.event_log))

    def test_completed_first_shelf_allows_hu_with_later_gold(self):
        e = self.setup_draw(True, 1)
        e._draw_for(E)
        self.assertEqual(e.state.players[E].last_drawn_tile.type_id, 33)
        self.assertTrue(has(e, E, ActionType.HU))
        self.assertTrue(has(e, E, ActionType.SHELVE_GOLD))
        self.assertFalse(any(a.type == ActionType.DISCARD and a.tile_ids == (e.state.players[E].last_drawn_tile.instance_id,)
                             for a in e.legal_actions(E)))

    def test_first_shelf_required_when_gold_is_in_a_meld(self):
        from mahjong.core.player import MeldType

        hand = [9, 10, 11, 18, 19, 20, 27, 27, 27, 31, 31]
        for meld in ((MeldType.CHI, [0, 1, 2], E), (MeldType.AN_GANG, [2] * 4, None)):
            for completed in (False, True):
                with self.subTest(meld=meld[0], first_shelf_completed=completed):
                    e = engine()
                    build_fixture(e, {S: PlayerFixture(hand, melds=[meld], declared=True,
                                                      first_shelf_completed=completed,
                                                      last_draw_type=31)}, current=S, gold=2)
                    self.assertEqual(has(e, S, ActionType.HU), completed)

    def test_cannot_shelve_old_gold_after_ting(self):
        e = engine()
        build_fixture(e,{E:PlayerFixture(WAIT[:-1]+[33,31],declared=True,shelves=1,last_draw_type=31)},gold=33)
        self.assertFalse(has(e,E,ActionType.SHELVE_GOLD))

    def test_ting_drawn_gold_can_be_shelved_but_not_discarded(self):
        e = self.setup_draw(True)
        e._draw_for(E)
        gold = e.state.players[E].last_drawn_tile
        self.assertTrue(has(e,E,ActionType.SHELVE_GOLD))
        self.assertNotIn(Action(ActionType.DISCARD,E,(gold.instance_id,)), e.legal_actions(E))
        self.assertFalse(has(e,E,ActionType.HU))

    def test_synthetic_gold_discard_cannot_be_claimed(self):
        e = engine()
        build_fixture(e,{S:PlayerFixture([0,1,2,2,2])},gold=2,discard=(E,2))
        self.assertFalse(has(e,S,ActionType.CHI))
        self.assertFalse(has(e,S,ActionType.PENG))
        self.assertFalse(has(e,S,ActionType.MING_GANG))
        self.assertFalse(has(e,S,ActionType.HU))

    def test_initial_gold_is_not_auto_resolved(self):
        found = False
        for seed in range(100):
            e = engine()
            e.start_round({s:str(int(s)) for s in Seat},seed=seed)
            if any(t.type_id == e.state.gold_tile_type for p in e.state.players.values() for t in p.concealed_tiles):
                found = True
                self.assertEqual(e.state.phase, GamePhase.TURN_ACTION)
                self.assertTrue(all(p.shelf_count == 0 for p in e.state.players.values()))
                self.assertTrue(all(not p.has_completed_first_gold_shelf for p in e.state.players.values()))
                break
        self.assertTrue(found)
