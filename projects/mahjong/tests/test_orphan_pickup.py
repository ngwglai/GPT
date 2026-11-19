import unittest

from mahjong import Action, ActionType as A, GamePhase, IllegalAction, Seat, tiles_from_types
from mahjong.core.player import MeldType
from mahjong.game.round import start_next_round
from mahjong.rules.response import ResponseResolver
from mahjong.solver.thirteen_orphans import ORPHANS
from .helpers import E, S, W, N, PlayerFixture, build_fixture, choose, engine, has, play, set_next
from .test_gold import WAIT


def action_for_tile(game, seat, kind, tile_type):
    tile = next(t for t in game.state.players[seat].concealed_tiles if t.type_id == tile_type)
    return Action(kind, seat, (tile.instance_id,))


def finish_responses(game):
    if game.state.phase == GamePhase.WAITING_FOR_RESPONSES:
        game.timeout_responses(expected_revision=game.state.revision)


def set_pickup(game, seat, enabled):
    state = game.state
    game.set_orphan_pickup(seat, enabled, expected_round_id=state.round_id, actor_id=state.players[seat].player_id)


def pickup(game, seat):
    play(game, choose(game, seat, A.PICK_ORPHAN))
    finish_responses(game)


class OrphanPickupTests(unittest.TestCase):
    def test_private_intent_is_reversible_and_does_not_touch_live_turn_or_lap(self):
        game = engine()
        state = game.start_round({seat: str(seat) for seat in Seat}, seed=42, manual_dice_roll=True)
        before = game.player_view(E)
        self.assertTrue(all(not p.orphan_pickup_enabled for p in state.players.values()))
        set_pickup(game, S, True)
        self.assertEqual(game.player_view(E), before)
        self.assertTrue(game.player_view(S)["players"][int(S)]["orphan_pickup_enabled"])
        play(game, choose(game, E, A.ROLL_DICE))
        player = state.players[S]
        player.last_orphan_pick_cycle = state.pickup_cycle - 1
        hand = list(player.concealed_tiles)
        wall = (state.wall.head, state.wall.tail)
        history = list(state.event_log)
        legal = game.legal_actions(E)
        for enabled in (False, True, True, False):
            set_pickup(game, S, enabled)
            self.assertIs(player.orphan_pickup_enabled, enabled)
            self.assertEqual((state.phase, state.current_player, state.revision), (GamePhase.TURN_ACTION, E, 1))
            self.assertEqual((state.wall.head, state.wall.tail), wall)
            self.assertEqual(state.event_log, history)
            self.assertEqual(player.concealed_tiles, hand)
            self.assertFalse(player.picked_orphans)
            self.assertEqual(game.legal_actions(E), legal)
            self.assertEqual(player.last_orphan_pick_cycle, state.pickup_cycle - 1)

    def test_intent_keeps_ordinary_hu_with_gold(self):
        game = engine()
        build_fixture(game, {E: PlayerFixture(WAIT + [33], declared=True, shelves=1, last_draw_type=33)}, gold=33)
        before = game.legal_actions(E)
        self.assertTrue(has(game, E, A.HU))
        set_pickup(game, E, True)
        self.assertEqual(game.legal_actions(E), before)
        play(game, choose(game, E, A.HU))
        self.assertEqual(game.state.result.patterns, ("standard",))

    def test_unarmed_orphan_discards_continue_without_pickup_only_windows(self):
        game = engine()
        build_fixture(game, {E: PlayerFixture([0]), S: PlayerFixture([3]), W: PlayerFixture([5])}, gold=4)
        for source, tile, next_seat, draw in ((E, 0, S, 8), (S, 8, W, 9), (W, 9, N, 10)):
            next_tile = set_next(game, draw)
            play(game, action_for_tile(game, source, A.DISCARD, tile))
            self.assertEqual(game.state.phase, GamePhase.TURN_ACTION)
            self.assertEqual(game.state.current_player, next_seat)
            self.assertEqual(game.state.players[next_seat].last_drawn_tile, next_tile)
            self.assertFalse(game.state.response_options)
        self.assertTrue(all(not player.picked_orphans for player in game.state.players.values()))

    def test_live_toggle_reuses_existing_normal_options_and_never_reopens_a_pass(self):
        game = engine()
        build_fixture(game, {
            S: PlayerFixture([0, 0, 1, 2]), W: PlayerFixture([6], orphan_pickup_enabled=True),
        }, gold=4, discard=(E, 0))
        state = game.state
        normal = game.legal_actions(S)
        self.assertEqual({action.type for action in normal}, {A.CHI, A.PENG, A.PASS})
        with self.assertRaises(IllegalAction):
            play(game, Action(A.PICK_ORPHAN, S))

        revision = state.revision
        other_view = game.player_view(W)
        set_pickup(game, S, True)
        self.assertTrue(has(game, S, A.PICK_ORPHAN))
        self.assertEqual(game.player_view(W), other_view)
        self.assertEqual(state.revision, revision)
        set_pickup(game, S, False)
        self.assertEqual(game.legal_actions(S), normal)
        play(game, choose(game, S, A.PASS))
        set_pickup(game, S, True)
        self.assertFalse(game.legal_actions(S))
        with self.assertRaises(IllegalAction):
            play(game, Action(A.PICK_ORPHAN, S))
        finish_responses(game)
        self.assertEqual(state.current_player, S)
        self.assertFalse(state.players[S].picked_orphans)

    def test_closing_the_only_unanswered_pickup_releases_the_existing_draw(self):
        game = engine()
        build_fixture(game, {W: PlayerFixture([3], orphan_pickup_enabled=True)}, gold=4, discard=(E, 0))
        state = game.state
        next_tile = set_next(game, 6)
        self.assertEqual(state.phase, GamePhase.WAITING_FOR_RESPONSES)
        set_pickup(game, W, False)
        self.assertEqual((state.phase, state.current_player, state.revision), (GamePhase.TURN_ACTION, S, 1))
        self.assertEqual(state.players[S].last_drawn_tile, next_tile)
        self.assertFalse(state.players[W].picked_orphans)
        set_pickup(game, W, True)
        self.assertFalse(has(game, W, A.PICK_ORPHAN))

    def test_unawarded_pickup_can_be_withdrawn_without_consuming_or_duplicating_the_tile(self):
        game = engine()
        build_fixture(game, {
            S: PlayerFixture([1], orphan_pickup_enabled=True), W: PlayerFixture([3], orphan_pickup_enabled=True),
        }, gold=4, discard=(E, 0))
        state = game.state
        tile = state.current_discard
        play(game, choose(game, S, A.PICK_ORPHAN))
        self.assertFalse(state.players[S].picked_orphans)
        set_pickup(game, S, False)
        set_pickup(game, S, True)
        self.assertFalse(game.legal_actions(S))
        self.assertEqual(state.revision, 1)
        play(game, choose(game, W, A.PICK_ORPHAN))
        self.assertEqual(state.players[W].picked_orphans, [tile])
        self.assertFalse(state.players[S].picked_orphans)
        self.assertIsNone(state.players[S].last_orphan_pick_cycle)
        self.assertFalse(state.discards)

    def test_legacy_player_fields_default_to_off_and_public_pickups_keep_lock(self):
        game = engine()
        build_fixture(game, {S: PlayerFixture([1]), W: PlayerFixture([3], picked_orphans=[8])},
                      gold=4, discard=(E, 0))
        for player in game.state.players.values():
            del player.orphan_pickup_enabled
        self.assertFalse(game.player_view(S)["players"][int(S)]["orphan_pickup_enabled"])
        self.assertFalse(has(game, S, A.PICK_ORPHAN))
        self.assertTrue(has(game, W, A.PICK_ORPHAN))
        with self.assertRaisesRegex(IllegalAction, "已锁定"):
            set_pickup(game, W, True)

    def test_public_ownership_and_hand_sizes_with_a_real_deal(self):
        game = engine()
        state = game.start_round({seat: str(seat) for seat in Seat}, seed=42)
        set_pickup(game, S, True)
        orphan_types = ORPHANS - {state.gold_tile_type}
        tile = next(t for t in state.players[E].concealed_tiles if t.type_id in orphan_types)
        play(game, Action(A.DISCARD, E, (tile.instance_id,)))
        self.assertIn(tile, [d.tile for d in state.discards])
        wall_cursors = (state.wall.head, state.wall.tail)
        hand_before = list(state.players[S].concealed_tiles)
        pickup(game, S)

        player = state.players[S]
        self.assertEqual(state.current_player, S)
        self.assertEqual(state.phase, GamePhase.TURN_ACTION)
        self.assertEqual((state.wall.head, state.wall.tail), wall_cursors)
        self.assertEqual(player.concealed_tiles, hand_before)
        self.assertEqual(len(player.concealed_tiles) + len(player.picked_orphans), 14)
        self.assertEqual(player.picked_orphans, [tile])
        self.assertFalse(player.orphan_pickup_enabled)
        with self.assertRaisesRegex(IllegalAction, "已锁定"):
            set_pickup(game, S, False)
        self.assertFalse(player.melds)
        self.assertIsNone(player.last_drawn_tile)
        self.assertIsNone(state.current_discard)
        self.assertNotIn(tile, [d.tile for d in state.discards])
        self.assertNotIn(tile.instance_id, {i for a in game.legal_actions(S) for i in a.tile_ids})
        self.assertFalse(has(game, S, A.HU))
        before = game.player_view(S)
        with self.assertRaises(IllegalAction):
            play(game, Action(A.DISCARD, S, (tile.instance_id,)))
        self.assertEqual(game.player_view(S), before)

        for viewer in Seat:
            view = game.player_view(viewer)
            self.assertEqual(view["players"][int(S)]["picked_orphans"], [tile.type_id])
            self.assertEqual(view["players"][int(S)]["concealed_count"], 13)
            self.assertEqual("concealed_tiles" in view["players"][int(S)], viewer == S)
            events = [e for e in view["presentation_events"] if e["type"] == "ORPHAN_PICKED"]
            self.assertEqual(events[-1]["payload"], {"tile_type": tile.type_id, "source": int(E)})

        out = choose(game, S, A.DISCARD)
        play(game, out)
        self.assertEqual(len(player.concealed_tiles) + len(player.picked_orphans), 13)
        game.assert_invariants()

    def test_pickup_is_limited_per_player_per_lap_and_restored_next_lap(self):
        game = engine()
        build_fixture(game, {
            S: PlayerFixture([8, 9, 1], orphan_pickup_enabled=True),
            W: PlayerFixture([17, 18, 2], orphan_pickup_enabled=True),
            N: PlayerFixture([3], orphan_pickup_enabled=True),
        },
                      gold=4, discard=(E, 0))
        state = game.state
        pickup(game, S)
        play(game, action_for_tile(game, S, A.DISCARD, 8))
        pickup(game, W)
        self.assertEqual(state.pickup_cycle, 1)
        self.assertEqual(state.players[S].last_orphan_pick_cycle, 1)
        self.assertEqual(state.players[W].last_orphan_pick_cycle, 1)

        set_next(game, 26)
        play(game, action_for_tile(game, W, A.DISCARD, 17))
        self.assertEqual(state.phase, GamePhase.WAITING_FOR_RESPONSES)
        self.assertTrue(has(game, N, A.PICK_ORPHAN))
        self.assertFalse(has(game, S, A.PICK_ORPHAN))
        with self.assertRaises(IllegalAction):
            play(game, Action(A.PICK_ORPHAN, S))
        finish_responses(game)
        self.assertEqual(state.current_player, N)
        set_next(game, 27)
        play(game, action_for_tile(game, N, A.DISCARD, 26))
        self.assertEqual(state.current_player, E)
        self.assertEqual(state.pickup_cycle, 2)
        play(game, action_for_tile(game, E, A.DISCARD, 27))
        pickup(game, S)
        self.assertEqual([t.type_id for t in state.players[S].picked_orphans], [0, 27])
        self.assertEqual(state.players[S].last_orphan_pick_cycle, 2)
        game.assert_invariants()

    def test_round_boundary_follows_dealer_after_out_of_order_claim(self):
        game = engine()
        build_fixture(game, {N: PlayerFixture([1], orphan_pickup_enabled=True), W: PlayerFixture([2], orphan_pickup_enabled=True)},
                      dealer=W, current=S, gold=4, discard=(S, 0))
        pickup(game, N)
        self.assertEqual(game.state.current_player, N)
        self.assertEqual(game.state.pickup_cycle, 2)
        self.assertEqual(game.state.players[N].last_orphan_pick_cycle, 1)

    def test_pickup_cannot_take_a_middle_tile_gold_own_discard_or_locked_open_hand(self):
        for discarded_type, gold in [(1, 4), (0, 0), (0, 4)]:
            with self.subTest(discarded_type=discarded_type, gold=gold):
                game = engine()
                build_fixture(game, {
                    E: PlayerFixture([2], orphan_pickup_enabled=True),
                    S: PlayerFixture([3], declared=True, orphan_pickup_enabled=True),
                    W: PlayerFixture([5], melds=[(MeldType.PENG, [6] * 3, E)], orphan_pickup_enabled=True),
                    N: PlayerFixture([7], orphan_pickup_enabled=True),
                }, gold=gold, discard=(E, discarded_type))
                for seat in (E, S, W):
                    self.assertFalse(has(game, seat, A.PICK_ORPHAN))
                self.assertEqual(has(game, N, A.PICK_ORPHAN), discarded_type == 0 and gold != 0)

    def test_public_zone_cannot_gain_a_third_copy_or_second_pair(self):
        for kind, expected in [(0, False), (8, False), (9, True)]:
            with self.subTest(tile_type=kind):
                game = engine()
                build_fixture(game, {S: PlayerFixture([1], picked_orphans=[0, 0, 8])},
                              gold=4, discard=(E, kind))
                self.assertEqual(has(game, S, A.PICK_ORPHAN), expected)

    def test_normal_response_priority_and_nearest_pickup_tiebreak(self):
        resolver = ResponseResolver()
        near = Action(A.PICK_ORPHAN, S)
        far = Action(A.PICK_ORPHAN, W)
        self.assertEqual(resolver.resolve(E, {W: far, S: near}), near)
        for kind in (A.HU, A.PENG, A.MING_GANG, A.CHI):
            normal = Action(kind, W)
            self.assertEqual(resolver.resolve(E, {S: near, W: normal}), normal)
        game = engine()
        build_fixture(game, {S: PlayerFixture([1], orphan_pickup_enabled=True), W: PlayerFixture([0, 0, 2])},
                      gold=4, discard=(E, 0))
        play(game, choose(game, S, A.PICK_ORPHAN))
        play(game, choose(game, W, A.PENG))
        self.assertEqual(game.state.current_player, W)
        self.assertFalse(game.state.players[S].picked_orphans)
        self.assertIsNone(game.state.players[S].last_orphan_pick_cycle)

    def test_picking_does_not_open_chi_peng_or_gang_in_locked_route(self):
        game = engine()
        build_fixture(game, {S: PlayerFixture([0, 0, 0, 1, 2], picked_orphans=[8])},
                      gold=4, discard=(E, 0))
        actions = {a.type for a in game.legal_actions(S)}
        self.assertEqual(actions, {A.PICK_ORPHAN, A.PASS})
        game = engine()
        build_fixture(game, {E: PlayerFixture([1] * 4 + [4], picked_orphans=[0])}, gold=4)
        self.assertFalse(has(game, E, A.AN_GANG))
        self.assertTrue(has(game, E, A.SHELVE_GOLD))
        play(game, choose(game, E, A.SHELVE_GOLD))
        self.assertEqual(game.state.players[E].shelf_count, 1)
        self.assertEqual([t.type_id for t in game.state.players[E].picked_orphans], [0])
        self.assertEqual(game.state.current_player, S)
        self.assertEqual(game.state.phase, GamePhase.TURN_ACTION)

    def test_locked_route_rejects_standard_seven_pairs_and_incompatible_orphans(self):
        cases = [
            ("standard", WAIT + [31]),
            ("seven_pairs", [0, 0, 2, 2, 5, 5, 7, 7, 10, 10, 12, 12, 31, 31]),
            ("invalid_orphans", sorted(ORPHANS - {8, 9}) + [0, 27, 4]),
        ]
        for label, types in cases:
            with self.subTest(pattern=label):
                game = engine()
                self.assertEqual(label in game.solver.check_types(types, [], 4).patterns, label != "invalid_orphans")
                hand = list(types)
                hand.remove(0)
                build_fixture(game, {E: PlayerFixture(hand, declared=True, picked_orphans=[0],
                                                       shelves=1, last_draw_type=hand[-1])}, gold=4)
                self.assertFalse(has(game, E, A.HU))
                with self.assertRaises(IllegalAction):
                    play(game, Action(A.HU, E))

    def test_pickup_can_declare_and_win_by_discard(self):
        game = engine()
        hand = sorted(ORPHANS - {0, 8}) + [27, 1]
        build_fixture(game, {S: PlayerFixture(hand, orphan_pickup_enabled=True), W: PlayerFixture([8])}, gold=4, discard=(E, 0))
        pickup(game, S)
        declaration = action_for_tile(game, S, A.DECLARE_TING, 1)
        self.assertIn(declaration, game.legal_actions(S))
        play(game, declaration)
        self.assertEqual(game.state.players[S].declared_waits, {8, 4})
        tile = action_for_tile(game, W, A.DISCARD, 8)
        play(game, tile)
        play(game, choose(game, S, A.HU))
        finish_responses(game)
        self.assertEqual(game.state.result.patterns, ("thirteen_orphans",))
        self.assertEqual(game.state.result.method, "DISCARD")
        self.assertEqual(game.state.result.winning_tile.instance_id, tile.tile_ids[0])
        game.assert_invariants()

    def test_pickup_route_can_self_draw_using_gold_and_resets_next_round(self):
        game = engine()
        hand = sorted(ORPHANS - {0, 8, 9}) + [27, 4, 1]
        build_fixture(game, {S: PlayerFixture(hand, shelves=1, orphan_pickup_enabled=True)}, gold=4, discard=(E, 0))
        pickup(game, S)
        set_next(game, 2)
        play(game, action_for_tile(game, S, A.DECLARE_TING, 1))
        self.assertEqual(game.state.players[S].declared_waits, {4, 8, 9})
        for seat, discard, draw in [(W, 2, 3), (N, 3, 5), (E, 5, 8)]:
            set_next(game, draw)
            play(game, action_for_tile(game, seat, A.DISCARD, discard))
            finish_responses(game)
        play(game, choose(game, S, A.HU))
        self.assertEqual(game.state.result.patterns, ("thirteen_orphans",))
        self.assertEqual(game.state.result.method, "SELF_DRAW")
        self.assertEqual(game.state.players[S].shelf_count, 1)
        game.assert_invariants()

        start_next_round(game, seed=82)
        self.assertEqual(game.state.pickup_cycle, 1)
        self.assertTrue(all(not p.orphan_pickup_enabled for p in game.state.players.values()))
        self.assertTrue(all(not p.picked_orphans and p.last_orphan_pick_cycle is None for p in game.state.players.values()))
        game.assert_invariants()

    def test_first_gold_shelf_gate_is_shared_with_pickup_route(self):
        game = engine()
        hand = sorted(ORPHANS - {0, 8}) + [27, 4]
        for shelves in (0, 1):
            with self.subTest(shelves=shelves):
                build_fixture(game, {E: PlayerFixture(hand, declared=True, shelves=shelves,
                                                       picked_orphans=[0], last_draw_type=4)}, gold=4)
                self.assertEqual(has(game, E, A.HU), bool(shelves))

    def test_solver_handles_gold_as_missing_orphan_or_pair_and_checks_physical_ids(self):
        game = engine()
        cases = [
            (sorted(ORPHANS - {8}) + [27, 4], 4, True),
            (sorted(ORPHANS) + [4], 4, True),
            (sorted(ORPHANS) + [8], 8, True),
            (sorted(ORPHANS - {8, 9}) + [0, 27, 4], 4, False),
            (sorted(ORPHANS - {8, 9}) + [0, 0, 4], 4, False),
            (sorted(ORPHANS - {8}) + [3, 4], 4, False),
        ]
        for types, gold, valid in cases:
            with self.subTest(types=types, gold=gold):
                result = game.solver.check_hu(tiles_from_types(types), [], gold, thirteen_orphans_only=True)
                self.assertEqual(result.patterns, ("thirteen_orphans",) if valid else ())
        tiles = tiles_from_types(sorted(ORPHANS))
        self.assertFalse(game.solver.check_hu(tiles + tiles[:1], [], 4, thirteen_orphans_only=True))
