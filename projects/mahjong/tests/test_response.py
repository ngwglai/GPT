import unittest
from mahjong import *
from mahjong.rules.response import ResponseResolver
from .helpers import *


class ResponseTests(unittest.TestCase):
    def fixture_two_winners(self):
        e=engine()
        first=PlayerFixture([0,1,2,9,10,11,18,19,20,27,27,27,31],declared=True)
        second=PlayerFixture([3,4,5,12,13,14,21,22,23,28,28,28,31],declared=True)
        build_fixture(e,{S:first,W:second},gold=33,discard=(E,31))
        return e

    def test_hu_precedence_and_single_winner_all_sources(self):
        resolver=ResponseResolver()
        from mahjong.core.seat import turn_order
        for source in Seat:
            order=turn_order(source,False)
            actions={seat:Action(ActionType.HU,seat) for seat in reversed(order)}
            self.assertEqual(resolver.resolve(source,actions).seat,order[0])

    def test_later_request_does_not_win_on_arrival(self):
        e=self.fixture_two_winners()
        play(e,choose(e,W,ActionType.HU))
        self.assertEqual(e.state.phase,GamePhase.WAITING_FOR_RESPONSES)
        play(e,choose(e,S,ActionType.HU))
        self.assertEqual(e.state.result.winner,S)
        self.assertEqual(e.state.result.settlement.items["other_hu"], [int(W)])
        self.assertEqual(e.state.result.settlement.transfers, {E:-7,S:8,W:0,N:-1})
        self.assertEqual(len(e.state.players[W].concealed_tiles),13)
        e.assert_invariants()

    def test_nearer_player_passes(self):
        e=self.fixture_two_winners()
        play(e,choose(e,W,ActionType.HU))
        play(e,choose(e,S,ActionType.PASS))
        self.assertEqual(e.state.result.winner,W)
        self.assertEqual(e.state.result.settlement.transfers[S], -1)

    def test_timeout_does_not_discard_submitted_hu(self):
        e=self.fixture_two_winners()
        play(e,choose(e,W,ActionType.HU))
        e.timeout_responses(expected_revision=e.state.revision)
        self.assertEqual(e.state.result.winner,W)

    def test_pass_all_next_player_draws(self):
        e=self.fixture_two_winners()
        e.timeout_responses(expected_revision=e.state.revision)
        self.assertEqual(e.state.current_player,S)
        self.assertEqual(len(e.state.players[S].concealed_tiles),14)
        e.assert_invariants()

    def test_no_duplicate_response(self):
        e=self.fixture_two_winners()
        action=choose(e,W,ActionType.HU)
        play(e,action)
        with self.assertRaises(IllegalAction):
            play(e,action)

    def test_hu_beats_peng(self):
        r=ResponseResolver()
        a=r.resolve(E,{S:Action(ActionType.PENG,S),W:Action(ActionType.HU,W)})
        self.assertEqual(a.seat,W)

    def test_peng_gang_tie_by_seat(self):
        r=ResponseResolver()
        a=r.resolve(E,{S:Action(ActionType.PENG,S),W:Action(ActionType.MING_GANG,W)})
        self.assertEqual(a.seat,S)

    def test_peng_beats_chi(self):
        r=ResponseResolver()
        a=r.resolve(E,{S:Action(ActionType.CHI,S),W:Action(ActionType.PENG,W)})
        self.assertEqual(a.seat,W)

    def test_chi_only_next_seat_and_no_draw(self):
        e=engine()
        build_fixture(e,{S:PlayerFixture([0,1]),W:PlayerFixture([0,1])},gold=33,discard=(E,2))
        self.assertTrue(has(e,S,ActionType.CHI))
        self.assertFalse(has(e,W,ActionType.CHI))
        head,tail=e.state.wall.head,e.state.wall.tail
        play(e,choose(e,S,ActionType.CHI))
        self.assertEqual((e.state.wall.head,e.state.wall.tail),(head,tail))
        self.assertEqual(e.state.current_player,S)

    def test_peng_any_seat_and_no_draw(self):
        e=engine()
        build_fixture(e,{N:PlayerFixture([5,5,7])},gold=33,discard=(E,5))
        head,tail=e.state.wall.head,e.state.wall.tail
        play(e,choose(e,N,ActionType.PENG))
        self.assertEqual((e.state.wall.head,e.state.wall.tail),(head,tail))
        self.assertEqual(e.state.current_player,N)
        self.assertEqual([a.type for a in e.legal_actions(N)],[ActionType.DISCARD])

    def test_unknown_response_is_rejected(self):
        e=self.fixture_two_winners()
        with self.assertRaises(IllegalAction):
            play(e,Action(ActionType.HU,N))
