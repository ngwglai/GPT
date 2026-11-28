import asyncio
import unittest
from unittest.mock import patch

from mahjong import Seat
from mahjong.game.autoplay import AutoRunner
from tests.helpers import build_fixture, PlayerFixture, E, S, W
from mahjong import IllegalAction
from tests.test_gold import WAIT
from web_server import LocalTable, PLAYER_IDS


def fixture(tile):
    table = LocalTable(seed=42)
    build_fixture(table.engine, {E: PlayerFixture(WAIT + [tile], declared=True,
                  last_draw_type=tile)}, gold=33)
    for seat, player in table.engine.state.players.items():
        player.player_id = PLAYER_IDS[seat]
    return table


class TingAutoplayTests(unittest.TestCase):
    def test_only_forced_discard_and_stale_ticket(self):
        table = fixture(8)
        ticket = table.ting_ticket()
        self.assertIsNotNone(ticket)
        self.assertEqual(ticket.tile_ids[0] // 4, 8)
        table.set_auto_ting(seat=E, round_id=ticket.round_id, enabled=False)
        self.assertFalse(table.apply_ting(ticket))
        table.set_auto_ting(seat=E, round_id=ticket.round_id, enabled=True)
        self.assertFalse(table.apply_ting(ticket))
        self.assertTrue(table.apply_ting(table.ting_ticket()))
        self.assertEqual(table.control[E], "human")
        self.assertFalse(table.decisions[E])

    def test_hu_and_gold_require_manual_action(self):
        for tile, kind in ((31, "HU"), (33, "SHELVE_GOLD")):
            with self.subTest(tile=tile):
                table = fixture(tile)
                self.assertIn(kind, [a.type.name for a in table.engine.legal_actions(E)])
                self.assertIsNone(table.ting_ticket())

    def test_round_end_reveals_all_hands_not_private_waits(self):
        table = fixture(8)
        self.assertNotIn("concealed_tiles", table.view_for(S)["players"][int(E)])
        table.engine._end_draw("TEST")
        for viewer in Seat:
            view = table.view_for(viewer)
            for seat in Seat:
                player = view["players"][int(seat)]
                self.assertEqual(len(player["concealed_tiles"]), player["concealed_count"])
                self.assertEqual("declared_waits" in player, seat == viewer)
        table.next_round(seed=43)
        self.assertNotIn("concealed_tiles", table.view_for(S)["players"][int(E)])


class TingRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_human_ting_uses_no_ai_policy(self):
        table = fixture(8)
        worker = AutoRunner(table, asyncio.Lock())
        with patch("mahjong.game.autoplay.decide", side_effect=AssertionError("AI must not run")):
            worker.kick()
            await asyncio.wait_for(worker.task, 3)
        self.assertTrue(any(event.event_type.name == "TILE_DISCARDED" and event.player == E and event.payload["tile"] // 4 == 8 for event in table.engine.state.event_log))
        self.assertEqual(table.control[E], "human")


def multi_hu_fixture():
    table = LocalTable(seed=42)
    build_fixture(table.engine, {
        E: PlayerFixture(WAIT + [32], declared=True, last_draw_type=32),
        S: PlayerFixture([3,4,5,12,13,14,21,22,23,28,28,28,32], declared=True),
        W: PlayerFixture([6,7,8,15,16,17,24,25,26,29,29,29,32], declared=True),
    }, gold=33)
    for seat, player in table.engine.state.players.items():
        player.player_id = PLAYER_IDS[seat]
    return table


class TingPointCannonTests(unittest.IsolatedAsyncioTestCase):
    async def test_auto_discard_waits_for_both_humans_then_settles(self):
        table = multi_hu_fixture()
        lock = asyncio.Lock()
        worker = AutoRunner(table, lock)
        def intent(seat, kind):
            view = table.view_for(seat)
            action = next(a for a in view["legal_actions"] if a["type"] == kind)
            table.human_act(seat=seat, payload={"round_id": view["round_id"], "revision": view["revision"], **action})

        stale_ticket = table.ting_ticket()
        self.assertIsNotNone(stale_ticket)
        worker.kick()
        await asyncio.wait_for(worker.task, 3)
        state = table.engine.state
        self.assertEqual(state.phase.name, "WAITING_FOR_RESPONSES")
        self.assertEqual(set(state.response_options), {S, W})
        self.assertFalse(table.apply_ting(stale_ticket))
        self.assertIsNone(table.ting_ticket())
        revision = state.revision
        remaining = table.view_for(E)["normal_tiles_remaining"]
        for seat in (S, W):
            self.assertEqual({a["type"] for a in table.view_for(seat)["legal_actions"]}, {"HU", "PASS"})
        with self.assertRaises(IllegalAction):
            table.engine._resolve_responses()
        with self.assertRaises(IllegalAction):
            table.engine._draw_for(S)
        worker.kick()
        await asyncio.wait_for(worker.task, 3)
        await asyncio.sleep(0.6)
        self.assertEqual(state.revision, revision)
        self.assertEqual(table.view_for(E)["normal_tiles_remaining"], remaining)
        self.assertEqual(len(state.discards), 1)
        intent(S, "PASS")
        worker.kick()
        await asyncio.wait_for(worker.task, 3)
        self.assertEqual(state.phase.name, "WAITING_FOR_RESPONSES")
        self.assertIn("HU", [a["type"] for a in table.view_for(W)["legal_actions"]])
        intent(W, "HU")
        self.assertEqual(state.phase.name, "ROUND_END")
        self.assertEqual(state.result.winner, W)
        self.assertEqual(state.result.source, E)
        revision = state.revision
        worker.kick()
        await asyncio.wait_for(worker.task, 3)
        await asyncio.sleep(0.6)
        self.assertEqual(state.revision, revision)
        self.assertEqual(len(state.discards), 1)
        for viewer in Seat:
            view = table.view_for(viewer)
            self.assertTrue(all("concealed_tiles" in p for p in view["players"].values()))
            self.assertFalse(view["legal_actions"])

    async def test_pass_all_resumes_normal_turn(self):
        table = multi_hu_fixture()
        self.assertTrue(table.apply_ting(table.ting_ticket()))
        for seat in (S, W):
            view = table.view_for(seat)
            action = next(a for a in view["legal_actions"] if a["type"] == "PASS")
            table.human_act(seat=seat, payload={"round_id":view["round_id"],"revision":view["revision"],**action})
        self.assertEqual(table.engine.state.phase.name, "TURN_ACTION")
        self.assertEqual(table.engine.state.current_player, S)
        self.assertIsNone(table.engine.state.current_discard)
