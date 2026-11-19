import random
import unittest
from collections import Counter

from mahjong import *
from mahjong.core.seat import next_seat, previous_seat, opposite_seat, turn_order
from mahjong.core.wall import *
from mahjong.rules.gold import get_opposite_tile


class WallTests(unittest.TestCase):
    def wall(self, dice=(1, 2), dealer=Seat.EAST):
        return WallState(make_deck(), dealer, dice)

    def test_deck_conservation(self):
        deck = make_deck()
        self.assertEqual(len({t.instance_id for t in deck}), 136)
        self.assertEqual(Counter(t.type_id for t in deck), Counter({i: 4 for i in range(34)}))

    def test_seat_cycle(self):
        for s in Seat:
            self.assertEqual(previous_seat(next_seat(s)), s)
            self.assertEqual(opposite_seat(opposite_seat(s)), s)
            self.assertEqual(len(set(turn_order(s))), 4)

    def test_break_all_dice_and_dealers(self):
        for dealer in Seat:
            order = turn_order(dealer)
            for d1 in range(1, 7):
                for d2 in range(1, 7):
                    with self.subTest(dealer=dealer, dice=(d1, d2)):
                        expected = order[(d1 + d2 - 1) % 4]
                        if expected == dealer:
                            expected = opposite_seat(dealer)
                        w = self.wall((d1, d2), dealer)
                        self.assertEqual(w.break_wall, expected)
                        self.assertEqual(w.original_break_position, WallPosition(expected, min(d1, d2), Layer.TOP))
                        self.assertEqual(w.gold_indicator_position, WallPosition(previous_seat(expected), 17-max(d1,d2), Layer.TOP))

    def test_special_five_and_nine(self):
        for seat in Seat:
            for total in (5, 9):
                self.assertEqual(determine_break_wall(seat, total), opposite_seat(seat))

    def test_bad_wall(self):
        with self.assertRaises(ValueError):
            WallState(make_deck()[:-1]+[Tile(0)], Seat.EAST, (1, 2))

    def test_invalid_dice(self):
        for dice in ((0, 1), (6, 7), (True, 2)):
            with self.assertRaises(ValueError):
                self.wall(dice)

    def test_coordinate_roundtrip(self):
        for i in range(136):
            p = WallState.position_from_index(i)
            self.assertEqual(WallState.index_from_position(p), i)

    def test_normal_top_then_bottom(self):
        w = self.wall()
        first = w.get_slot(w.normal_draw_cursor)
        self.assertEqual(w.draw_normal(), first.tile)
        self.assertEqual(w.normal_draw_cursor.layer, Layer.BOTTOM)
        w.draw_normal()
        self.assertEqual(w.normal_draw_cursor.column, w.break_column+1)

    def test_cross_side(self):
        w = self.wall()
        p = WallPosition(Seat.NORTH, 16, Layer.BOTTOM)
        self.assertEqual(w.next_normal_position(p), WallPosition(Seat.EAST, 0, Layer.TOP))

    def test_tail_reverse_and_shared_state(self):
        w = self.wall()
        p = w.gang_draw_cursor
        self.assertEqual(p.layer, Layer.BOTTOM)
        t = w.draw_gang_replacement()
        self.assertEqual(t, w.get_slot(p).tile)
        self.assertTrue(w.get_slot(p).drawn)
        self.assertEqual(w.gang_draw_cursor.layer, Layer.TOP)
        normal = [w.draw_normal() for _ in range(122)]
        self.assertNotIn(t, normal)

    def test_reserved_columns(self):
        for gangs, expected in ((0,7),(1,7),(2,8),(3,9),(4,10)):
            self.assertEqual(self.wall().get_reserved_columns(gangs), expected)

    def test_boundary_uses_original_origin(self):
        w = self.wall()
        w.draw_gang_replacement()
        w.draw_gang_replacement()
        drawn = [w.draw_normal(2) for _ in range(120)]
        self.assertEqual(len(drawn), 120)
        self.assertTrue(w.is_normal_draw_exhausted(2))
        self.assertEqual(sum(not s.drawn for s in w.slots), 14)

    def test_boundary_moves_immediately(self):
        w = self.wall()
        for _ in range(120):
            w.draw_normal()
        self.assertFalse(w.is_normal_draw_exhausted(0))
        self.assertTrue(w.is_normal_draw_exhausted(2))

    def test_normal_exhaustion_raises(self):
        w = self.wall()
        for _ in range(122):
            w.draw_normal()
        with self.assertRaises(WallExhausted):
            w.draw_normal()

    def test_tail_exhaustion_no_duplicates(self):
        w = self.wall()
        self.assertEqual(len({w.draw_gang_replacement().instance_id for _ in range(136)}), 136)
        with self.assertRaises(WallExhausted):
            w.draw_gang_replacement()

    def test_six_six_indicator_is_drawable(self):
        w = self.wall((6,6))
        slot = w.get_slot(w.gold_indicator_position)
        gold = get_opposite_tile(slot.tile.type_id)
        self.assertFalse(slot.drawn)
        draws = [w.draw_normal() for _ in range(122)]
        self.assertIn(slot.tile, draws)
        self.assertTrue(slot.drawn)
        self.assertEqual(get_opposite_tile(slot.tile.type_id), gold)

    def test_all_gold_mappings(self):
        expected = list(range(8,-1,-1))+list(range(17,8,-1))+list(range(26,17,-1))+[29,30,27,28,33,32,31]
        self.assertEqual([get_opposite_tile(i) for i in range(34)], expected)
        for i in range(34):
            self.assertEqual(get_opposite_tile(get_opposite_tile(i)), i)
