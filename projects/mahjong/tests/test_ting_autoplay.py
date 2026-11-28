import asyncio
import unittest
from unittest.mock import patch

from mahjong import Seat
from mahjong.game.autoplay import AutoRunner
from tests.helpers import build_fixture, PlayerFixture, E, S
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
