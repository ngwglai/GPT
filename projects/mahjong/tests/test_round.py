from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from mahjong import *
from mahjong.__main__ import run_demo
from mahjong.core.event import EventType
from mahjong.core.player import MeldType
from mahjong.game.debug import simulate_action
from mahjong.game.round import start_next_round
from mahjong.game.service import TableService
from mahjong.rules.dealer import determine_next_dealer
from .helpers import *
from .test_gold import WAIT


class RoundTests(unittest.TestCase):
    def test_exact_initial_deal_packet_order(self):
        for dealer in (E, S, W, N):
            with self.subTest(dealer=dealer):
                # With (1, 2), the break is the opposite wall at column 15.
                break_side = (int(dealer) + 2) % 4
                physical_ids = [side * 34 + 2 * column + layer
                                for side in (0, 3, 2, 1)
                                for column in range(16, -1, -1)
                                for layer in (0, 1)]
                start = physical_ids.index(break_side * 34 + 30)
                draws = iter(physical_ids[start:] + physical_ids[:start])
                order = [Seat((int(dealer) + i) % 4) for i in range(4)]
                expected = {int(seat): [] for seat in order}
                for _ in range(3):
                    for seat in order:
                        expected[int(seat)].extend(next(draws) for _ in range(4))
                for seat in order:
                    expected[int(seat)].append(next(draws))
                expected[int(dealer)].append(next(draws))
                e = engine()
                e.start_round({s: str(int(s)) for s in Seat}, dealer=dealer, seed=1,
                              dice=(1, 2), wall_tiles=make_deck())
                event = next(ev for ev in e.state.event_log if ev.event_type == EventType.DEAL_COMPLETED)
                self.assertEqual(event.payload["hands"], expected)
                self.assertEqual([len(expected[int(seat)]) for seat in order], [14, 13, 13, 13])
                view = e.player_view(dealer)
                self.assertEqual(view["wall_view"]["tiles_present"], 83)
                self.assertEqual(view["normal_tiles_remaining"], 69)

    def test_repeatable_seed(self):
        a,b=engine(),engine()
        for e in (a,b):
            e.start_round({s:str(int(s)) for s in Seat},seed=1234,round_id="fixed")
        self.assertEqual(a.player_view(E),b.player_view(E))
        self.assertEqual([x.tile for x in a.state.wall.slots],[x.tile for x in b.state.wall.slots])

    def test_draw_round_dealer_repeats(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8],last_draw_type=8)},gold=33,head=122)
        play(e,Action(ActionType.DISCARD,E,(e.state.players[E].last_drawn_tile.instance_id,)))
        self.assertEqual(e.state.result.type,"DRAW")
        self.assertEqual(e.state.result.next_dealer,E)
        self.assertGreater(sum(not s.drawn for s in e.state.wall.slots),0)

    def test_dealer_win_repeats(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31)},gold=33)
        play(e,choose(e,E,ActionType.HU))
        self.assertEqual(e.state.result.next_dealer,E)

    def test_non_dealer_win_rotates_from_dealer(self):
        e=engine()
        build_fixture(e,{W:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31)},gold=33,current=W)
        play(e,choose(e,W,ActionType.HU))
        self.assertEqual(e.state.result.next_dealer,S)
        start_next_round(e,seed=8)
        self.assertEqual(e.state.dealer,S)

    def test_round_end_rejects_more_actions(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31)},gold=33)
        a=choose(e,E,ActionType.HU)
        play(e,a)
        with self.assertRaises(IllegalAction):
            play(e,a)

    def test_debug_simulation_does_not_mutate(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8],last_draw_type=8)},gold=33)
        before=e.player_view(E)
        sim=simulate_action(e,choose(e,E,ActionType.DISCARD))
        self.assertEqual(e.player_view(E),before)
        self.assertEqual(sim.revision,1)

    def test_player_view_no_hidden_data(self):
        e=engine()
        e.start_round({s:str(int(s)) for s in Seat},seed=7)
        for viewer in Seat:
            view=e.player_view(viewer)
            encoded=json.dumps(view)
            for forbidden in ("shuffle_seed","event_log","response_options","gold_queue","normal_draw_cursor","pending_responses"):
                self.assertNotIn(forbidden,encoded)
            for seat in Seat:
                if seat!=viewer:
                    self.assertNotIn("concealed_tiles",view["players"][int(seat)])
                    self.assertNotIn("declared_waits",view["players"][int(seat)])

    def test_concealed_gang_hidden_from_others(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(melds=[(MeldType.AN_GANG,[0]*4,None)])},gold=33)
        self.assertIsNone(e.player_view(S)["players"][0]["melds"][0]["tiles"])
        self.assertEqual(e.player_view(E)["players"][0]["melds"][0]["tiles"],[0]*4)

    def test_view_mutation_does_not_mutate_state(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8])},gold=33)
        view=e.player_view(E)
        view["players"][0]["concealed_tiles"].clear()
        self.assertEqual(len(e.state.players[E].concealed_tiles),14)

    def test_stale_revision_rejected(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8])},gold=33)
        a=choose(e,E,ActionType.DISCARD)
        with self.assertRaises(IllegalAction):
            e.submit(a,expected_revision=10,actor_id="0",expected_round_id="debug")

    def test_old_round_rejected(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8])},gold=33)
        with self.assertRaises(IllegalAction):
            e.submit(choose(e,E,ActionType.DISCARD),expected_revision=0,actor_id="0",expected_round_id="previous")

    def test_wrong_identity_rejected(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8])},gold=33)
        with self.assertRaises(IllegalAction):
            e.submit(choose(e,E,ActionType.DISCARD),expected_revision=0,actor_id="attacker",expected_round_id="debug")

    def test_service_validates_json_and_derives_seat(self):
        e=engine()
        build_fixture(e,{E:PlayerFixture(WAIT+[8])},gold=33)
        service=TableService(e)
        a=choose(e,E,ActionType.DISCARD)
        payload={"round_id":"debug","revision":0,"type":"DISCARD","tile_ids":list(a.tile_ids)}
        with self.assertRaises(IllegalAction):
            service.handle_intent("0",{**payload,"seat":1})
        with self.assertRaises(IllegalAction):
            service.handle_intent("0",{**payload,"tile_ids":[True]})
        view=service.handle_intent("0",payload)
        self.assertEqual(view["revision"],1)

    def test_failed_score_hook_rolls_back_entire_action(self):
        e=engine()
        from .test_scoring import sample_config
        e.scoring=ScoreEngine(sample_config())
        e.scoring.additive_hooks.append(lambda *args: 1/0)
        build_fixture(e,{E:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31)},gold=33)
        before=e.player_view(E)
        events=len(e.state.event_log)
        with self.assertRaises(ZeroDivisionError):
            play(e,choose(e,E,ActionType.HU))
        self.assertEqual(e.player_view(E),before)
        self.assertEqual(len(e.state.event_log),events)

    def test_complete_random_legal_rounds(self):
        summaries=run_demo(seed=42,rounds=20)
        self.assertEqual(len(summaries),20)
        self.assertTrue(all(x["commands"]<1000 for x in summaries))
        self.assertTrue(all(x["result"]["type"] in {"HU","DRAW"} for x in summaries))

    def test_complete_random_legal_rounds_second_seed(self):
        summaries=run_demo(seed=101,rounds=3)
        self.assertTrue(all(x["result"]["type"] in {"HU","DRAW"} for x in summaries))

    def test_demo_bots_keep_their_existing_pickup_option(self):
        observed = engine()
        with patch("mahjong.__main__.GameEngine", return_value=observed):
            summary = run_demo(seed=42, rounds=1)
        self.assertIn(summary[0]["result"]["type"], {"HU", "DRAW"})
        pickups = [event for event in observed.state.event_log if event.event_type == EventType.ORPHAN_PICKED]
        self.assertTrue(pickups)
        self.assertTrue(all(observed.state.players[event.player].picked_orphans for event in pickups))
