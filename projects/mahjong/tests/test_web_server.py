import unittest

from mahjong import Seat
from web_server import LocalTable


class WebServerBoundaryTests(unittest.TestCase):
    def roll_dice(self, table):
        snap = table.snapshot()
        dealer = snap["dealer"]
        action = next(a for a in snap["legal_actions"][str(dealer)] if a["type"] == "ROLL_DICE")
        return table.act(seat=Seat(dealer), payload={
            "round_id": snap["round_id"], "revision": snap["revision"],
            "type": action["type"], "tile_ids": action["tile_ids"],
        })

    def test_current_round_totals_are_visible_and_carried_once(self):
        from mahjong.game.service import TableService
        from web_server import PLAYER_IDS
        from .helpers import build_fixture, PlayerFixture
        from .test_gold import WAIT

        table = LocalTable(seed=42)
        build_fixture(table.engine, {Seat.EAST: PlayerFixture(WAIT + [31], declared=True,
                                                             last_draw_type=31)}, gold=33)
        for seat, player in table.engine.state.players.items():
            player.player_id = PLAYER_IDS[seat]
        table.service = TableService(table.engine)
        snap = table.snapshot()
        result = table.act(seat=Seat.EAST, payload={
            "round_id": snap["round_id"], "revision": snap["revision"],
            "type": "HU", "tile_ids": [],
        })
        expected = {"0": "6", "1": "-2", "2": "-2", "3": "-2"}
        self.assertEqual(result["match"]["scoring"]["totals"], expected)
        self.assertEqual(table.scoring_view()["totals"], expected)
        self.assertEqual(table.next_round(seed=43)["match"]["scoring"]["totals"], expected)

    def test_snapshot_merges_four_player_views(self):
        table = LocalTable(seed=42)
        snap = table.snapshot()
        self.assertTrue(snap["test_mode"]["all_hands_open"])
        self.assertEqual(snap["test_mode"]["seed"], "42")
        self.assertEqual(snap["phase"], "ROLLING_DICE")
        self.assertEqual({len(snap["players"][str(i)]["concealed_tiles"]) for i in range(4)}, {0})
        snap = self.roll_dice(table)
        self.assertEqual({len(snap["players"][str(i)]["concealed_tiles"]) for i in range(4)}, {13, 14})
        self.assertEqual(len(snap["players"]["0"]["concealed_tiles"]), 14)

    def test_manual_dice_is_dealer_only_and_hides_result_before_roll(self):
        table = LocalTable(seed=42, dealer=Seat.WEST)
        snap = table.snapshot()
        self.assertEqual(snap["phase"], "ROLLING_DICE")
        self.assertEqual(snap["dice"], [None, None])
        self.assertIsNone(snap["gold_indicator"])
        self.assertIsNone(snap["gold_tile_type"])
        self.assertIsNone(snap["break_wall"])
        self.assertEqual(snap["wall_view"]["tiles_present"], 136)
        self.assertEqual([a["type"] for a in snap["legal_actions"][str(int(Seat.WEST))]], ["ROLL_DICE"])
        for seat in (Seat.EAST, Seat.SOUTH, Seat.NORTH):
            self.assertEqual(snap["legal_actions"][str(int(seat))], [])
        with self.assertRaises(Exception):
            table.act(seat=Seat.EAST, payload={
                "round_id": snap["round_id"], "revision": snap["revision"],
                "type": "ROLL_DICE", "tile_ids": [],
            })

    def test_same_seed_manual_roll_is_reproducible(self):
        first = LocalTable(seed=123, dealer=Seat.SOUTH)
        second = LocalTable(seed=123, dealer=Seat.SOUTH)
        a = self.roll_dice(first)
        b = self.roll_dice(second)
        self.assertEqual(a["dice"], b["dice"])
        self.assertEqual(a["break_wall"], b["break_wall"])
        self.assertEqual(a["break_column"], b["break_column"])
        self.assertEqual(a["gold_tile_type"], b["gold_tile_type"])
        self.assertEqual(a["wall_view"], b["wall_view"])
        self.assertEqual(
            [[t["id"] for t in a["players"][str(i)]["concealed_tiles"]] for i in range(4)],
            [[t["id"] for t in b["players"][str(i)]["concealed_tiles"]] for i in range(4)],
        )

    def test_wall_view_never_contains_hidden_tile_identity(self):
        table = LocalTable(seed=42)
        before = table.snapshot()["wall_view"]
        after = self.roll_dice(table)["wall_view"]
        import json
        for wall_view in (before, after):
            encoded = json.dumps(wall_view)
            self.assertNotIn('"type"', encoded)
            self.assertNotIn('"id"', encoded)
            self.assertNotIn("instance", encoded)
        self.assertEqual(before["tiles_present"], 136)
        self.assertEqual(after["tiles_present"], 83)

    def test_presentation_events_are_sanitized(self):
        table = LocalTable(seed=42)
        out = self.roll_dice(table)
        import json
        encoded = json.dumps(out["presentation_events"])
        self.assertNotIn("shuffle_seed", encoded)
        self.assertNotIn('"seed"', encoded)
        self.assertNotIn('"hands"', encoded)
        self.assertIn("DICE_ROLLED", encoded)
        self.assertIn("DEAL_COMPLETED", encoded)

    def test_action_round_trip_uses_service_revision(self):
        table = LocalTable(seed=42)
        snap = table.snapshot()
        seat = snap["current_player"]
        action = snap["legal_actions"][str(seat)][0]
        out = table.act(seat=Seat(seat), payload={
            "round_id": snap["round_id"], "revision": snap["revision"],
            "type": action["type"], "tile_ids": action["tile_ids"],
        })
        self.assertEqual(out["revision"], snap["revision"] + 1)

    def test_snapshot_exposes_own_ting_tile_when_present(self):
        # Local four-seat test mode intentionally merges each seat's own view.
        # The engine-level privacy test verifies opponents receive only {hidden: True}.
        table = LocalTable(seed=42)
        engine = table.engine
        from tests.test_gold import WAIT
        from tests.helpers import build_fixture, PlayerFixture, E, S
        build_fixture(engine,{E:PlayerFixture(WAIT+[7],last_draw_type=7)},gold=33)
        from web_server import PLAYER_IDS
        for seat, player in engine.state.players.items():
            player.player_id = PLAYER_IDS[seat]
        table.service = __import__('mahjong.game.service', fromlist=['TableService']).TableService(engine)
        snap = table.snapshot()
        action = next(a for a in snap["legal_actions"]["0"] if a["type"] == "DECLARE_TING")
        out = table.act(seat=Seat.EAST, payload={
            "round_id": snap["round_id"], "revision": snap["revision"],
            "type": action["type"], "tile_ids": action["tile_ids"],
        })
        self.assertIsNotNone(out["players"]["0"]["ting_tile"])
        self.assertIn("type", out["players"]["0"]["ting_tile"])
        self.assertEqual(out["discards"], [])
        self.assertEqual(out["current_player"], int(Seat.SOUTH))

    def test_seed_8_exposes_shelve_and_shelve_skips_response(self):
        table = LocalTable(seed=8)
        snap = self.roll_dice(table)
        shelf = next(a for a in snap["legal_actions"]["0"] if a["type"] == "SHELVE_GOLD")
        out = table.act(seat=Seat.EAST, payload={
            "round_id": snap["round_id"], "revision": snap["revision"],
            "type": shelf["type"], "tile_ids": shelf["tile_ids"],
        })
        self.assertEqual(out["phase"], "TURN_ACTION")
        self.assertEqual(out["current_player"], int(Seat.SOUTH))
        self.assertEqual(out["players"]["0"]["shelf_count"], 1)
        self.assertEqual(len(out["players"]["0"]["concealed_tiles"]), 13)
        self.assertEqual(len(out["players"]["1"]["concealed_tiles"]), 14)

    def test_next_round_after_draw_keeps_dealer_and_records_previous_round(self):
        table = LocalTable(seed=42, dealer=Seat.EAST)
        table.engine._end_draw("TEST")
        out = table.next_round(seed=99)
        self.assertEqual(out["match"]["round_no"], 2)
        self.assertEqual(out["dealer"], int(Seat.EAST))
        self.assertEqual(out["test_mode"]["seed"], "99")
        self.assertEqual(out["match"]["previous_result"]["round_no"], 1)
        self.assertEqual(out["match"]["previous_result"]["seed"], "42")
        self.assertEqual(out["match"]["previous_result"]["result"]["type"], "DRAW")
        self.assertEqual(len(out["match"]["history"]), 1)

    def test_next_round_after_non_dealer_win_rotates_from_current_dealer(self):
        table = LocalTable(seed=42, dealer=Seat.EAST)
        from tests.test_gold import WAIT
        from tests.helpers import build_fixture, PlayerFixture, W
        build_fixture(table.engine, {W: PlayerFixture(WAIT + [31], declared=True, last_draw_type=31)},
                      dealer=Seat.EAST, current=W, gold=33)
        from web_server import PLAYER_IDS
        for seat, player in table.engine.state.players.items():
            player.player_id = PLAYER_IDS[seat]
        table.service = __import__('mahjong.game.service', fromlist=['TableService']).TableService(table.engine)
        table.engine._end_hu(W, None, ())
        out = table.next_round(seed=100)
        self.assertEqual(out["dealer"], int(Seat.SOUTH))
        self.assertEqual(out["match"]["round_no"], 2)
        self.assertEqual(out["match"]["previous_result"]["result"]["winner"], int(W))
        self.assertEqual(out["match"]["previous_result"]["result"]["next_dealer"], int(Seat.SOUTH))

    def test_new_round_resets_match_metadata(self):
        table = LocalTable(seed=42)
        table.engine._end_draw("TEST")
        table.next_round(seed=99)
        out = table.new_round(seed=7, dealer=Seat.WEST)
        self.assertEqual(out["match"]["round_no"], 1)
        self.assertIsNone(out["match"]["previous_result"])
        self.assertEqual(out["match"]["history"], [])
        self.assertEqual(out["dealer"], int(Seat.WEST))
        self.assertEqual(out["test_mode"]["seed"], "7")

    def test_default_web_scoring_is_configured(self):
        snap = LocalTable(seed=42).snapshot()
        self.assertEqual(snap["match"]["scoring"]["status"], "READY")
        self.assertEqual(set(snap["match"]["scoring"]["totals"]), {"0", "1", "2", "3"})
        config = LocalTable(seed=42).engine.scoring.config
        self.assertEqual(str(config.base_ping_hu), "1")
        self.assertEqual(str(config.shelf_bonus), "1")
        self.assertEqual(str(config.dealer_multiplier), "2")


if __name__ == "__main__":
    unittest.main()
