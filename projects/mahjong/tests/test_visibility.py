import unittest

from mahjong.core.player import MeldType
from mahjong.game.debug import PlayerFixture, build_fixture
from mahjong.game.visibility import ting_presentation, visible_remaining
from mahjong.solver.thirteen_orphans import ORPHANS
from tests.helpers import E, S, W, engine, choose, play
from tests.test_gold import WAIT
from mahjong import ActionType


class VisibilityTests(unittest.TestCase):
    def test_waits_follow_solver_and_decrease_after_public_discard(self):
        game = engine()
        build_fixture(game, {E: PlayerFixture(WAIT, declared=True), S: PlayerFixture([31])},
                      gold=33, indicator_type=19, current=S)
        before = game.player_view(E)
        hint = before["players"][int(E)]["wait_hint"]
        self.assertEqual(hint, [{"type": 31, "remaining": 3, "requires_shelf": False},
                                {"type": 33, "remaining": 4, "requires_shelf": True}])
        self.assertEqual([p["type"] for p in hint], before["players"][int(E)]["current_waits"])
        self.assertNotIn("wait_hint", game.player_view(S)["players"][int(E)])
        presentation = ting_presentation(before, int(E), game.state.players[E], game.solver)
        self.assertEqual(presentation["wait_patterns"][31], ("standard",))
        play(game, choose(game, S, ActionType.DISCARD))
        self.assertEqual(game.player_view(E)["players"][int(E)]["wait_hint"][0]["remaining"], 2)

    def test_ting_preview_uses_only_visible_tiles_and_is_private(self):
        game = engine()
        build_fixture(game, {E: PlayerFixture(WAIT + [8], last_draw_type=8),
                             S: PlayerFixture([31, 31])}, gold=33, indicator_type=19)
        view = game.player_view(E)
        presentation = ting_presentation(view, int(E), game.state.players[E], game.solver)
        options = presentation["ting_previews"][8]
        self.assertEqual(options[0], {"type": 31, "remaining": 3,
                                      "patterns": ("standard",), "requires_shelf": False})
        self.assertTrue(any(a["type"] == "DECLARE_TING" and a["tile_ids"][0] // 4 == 8
                            for a in view["legal_actions"]))
        self.assertNotIn("ting_previews", game.player_view(S)["players"][int(E)])

    def test_zero_waits_remain_visible_and_hidden_copies_do_not_count(self):
        game = engine(hide_an_gang=True)
        build_fixture(game, {
            E: PlayerFixture(WAIT, declared=True),
            S: PlayerFixture([32], melds=[(MeldType.PENG, [31] * 3, W)]),
            W: PlayerFixture(melds=[(MeldType.AN_GANG, [26] * 4, None)]),
        }, gold=33, indicator_type=19, current=S)
        view = game.player_view(E)
        self.assertEqual(view["players"][int(E)]["wait_hint"][0]["remaining"], 0)
        remaining = visible_remaining(view, int(E))
        self.assertEqual(remaining[32], 4)
        self.assertEqual(remaining[26], 4)
        self.assertEqual(remaining[19], 3)  # the drawn indicator is the copy in the viewer's hand

    def test_claimed_river_tile_counted_only_in_its_destination(self):
        game = engine()
        build_fixture(game, {S: PlayerFixture([31, 31, 32]), E: PlayerFixture(WAIT, declared=True)},
                      gold=33, indicator_type=19, discard=(W, 31))
        play(game, choose(game, E, ActionType.PASS))
        play(game, choose(game, S, ActionType.PENG))
        view = game.player_view(E)
        self.assertTrue(view["discards"][0]["claimed"])
        self.assertEqual(view["players"][int(E)]["wait_hint"][0]["remaining"], 0)

    def test_locked_orphan_wait_includes_gold_without_revealing_hidden_copies(self):
        game = engine()
        hand = sorted(ORPHANS - {0, 30}) + [31]
        build_fixture(game, {E: PlayerFixture(hand, picked_orphans=[0], declared=True),
                             S: PlayerFixture([30, 30], shelves=1)}, gold=4, indicator_type=19)
        hint = game.player_view(E)["players"][int(E)]["wait_hint"]
        self.assertEqual(hint, [{"type": 4, "remaining": 3, "requires_shelf": True},
                                {"type": 30, "remaining": 4, "requires_shelf": False}])
