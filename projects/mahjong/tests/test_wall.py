import unittest
from collections import Counter

from mahjong import Seat, Tile, make_deck
from mahjong.core.seat import next_seat, opposite_seat, previous_seat, turn_order
from mahjong.core.wall import Layer, WallExhausted, WallPosition, WallState, determine_break_wall
from mahjong.rules.gold import get_opposite_tile


PLAYERS = (Seat.EAST, Seat.SOUTH, Seat.WEST, Seat.NORTH)
WALLS = (Seat.EAST, Seat.NORTH, Seat.WEST, Seat.SOUTH)
PHYSICAL_PATH = [
    WallPosition(side, column, layer)
    for side in WALLS
    for column in range(16, -1, -1)
    for layer in (Layer.TOP, Layer.BOTTOM)
]


class WallTests(unittest.TestCase):
    def wall(self, dice=(1, 2), dealer=Seat.EAST):
        return WallState(make_deck(), dealer, dice)

    def assert_draw_at(self, wall, position, *, replacement=False, gangs=0):
        if replacement:
            self.assertEqual(wall.gang_draw_cursor, position)
            tile = wall.draw_gang_replacement()
        else:
            self.assertEqual(wall.normal_draw_cursor, position)
            tile = wall.draw_normal(gangs)
        self.assertEqual(tile, wall.get_slot(position).tile)
        self.assertTrue(wall.get_slot(position).drawn)
        return tile.instance_id

    def test_deck_conservation(self):
        deck = make_deck()
        self.assertEqual(len({t.instance_id for t in deck}), 136)
        self.assertEqual(Counter(t.type_id for t in deck), Counter({i: 4 for i in range(34)}))

    def test_seat_cycle(self):
        for i, seat in enumerate(PLAYERS):
            expected = PLAYERS[i:] + PLAYERS[:i]
            self.assertEqual(turn_order(seat), expected)
            self.assertEqual(next_seat(seat), expected[1])
            self.assertEqual(opposite_seat(seat), expected[2])
            self.assertEqual(previous_seat(seat), expected[3])

    def test_break_all_dice_and_dealers(self):
        offsets_by_sum = {2: 1, 3: 2, 4: 3, 5: 2, 6: 1, 7: 2, 8: 3, 9: 2, 10: 1, 11: 2, 12: 3}
        for dealer in WALLS:
            for d1 in range(1, 7):
                for d2 in range(1, 7):
                    with self.subTest(dealer=dealer, dice=(d1, d2)):
                        expected_side = PLAYERS[(PLAYERS.index(dealer) + offsets_by_sum[d1 + d2]) % 4]
                        self.assertEqual(determine_break_wall(dealer, d1 + d2), expected_side)
                        wall = self.wall((d1, d2), dealer)
                        self.assertEqual(wall.break_wall, expected_side)
                        start = WallPosition(expected_side, 16 - min(d1, d2), Layer.TOP)
                        self.assertEqual(wall.original_break_position, start)
                        self.assertEqual(wall.normal_draw_cursor, start)

    def test_gold_position_all_walls_and_large_dice(self):
        cases = set()
        for dealer in WALLS:
            for large in range(1, 7):
                wall = self.wall((1, large), dealer)
                cases.add((wall.break_wall, large))
                side = PLAYERS[(PLAYERS.index(wall.break_wall) - 1) % 4]
                expected = WallPosition(side, large - 1, Layer.TOP)
                self.assertEqual(wall.gold_indicator_position, expected)
                indicator = wall.get_slot(expected)
                self.assertTrue(indicator.is_gold_indicator)
                self.assertTrue(indicator.revealed)
                self.assertFalse(indicator.drawn)
                self.assertEqual(wall.normal_draw_cursor, wall.original_break_position)
                self.assertEqual(wall.remaining_normal_count(0), 122)
                self.assertEqual(sum(not slot.drawn for slot in wall.slots), 136)
        self.assertEqual(len(cases), 24)

    def test_bad_wall(self):
        with self.assertRaises(ValueError):
            WallState(make_deck()[:-1] + [Tile(0)], Seat.EAST, (1, 2))

    def test_invalid_dice(self):
        for dice in ((0, 1), (6, 7), (True, 2)):
            with self.assertRaises(ValueError):
                self.wall(dice)

    def test_full_physical_mapping_and_four_corners(self):
        wall = self.wall()
        visited = set()
        for position, successor in zip(PHYSICAL_PATH, PHYSICAL_PATH[1:] + PHYSICAL_PATH[:1]):
            index = wall.index_from_position(position)
            self.assertEqual(index, int(position.side) * 34 + position.column * 2 + int(position.layer))
            self.assertEqual(wall.position_from_index(index), position)
            self.assertEqual(wall.next_normal_position(position), successor)
            visited.add(wall.get_slot(position).tile.instance_id)
        self.assertEqual(visited, set(range(136)))

    def test_normal_draw_path_from_all_walls(self):
        for dealer in WALLS:
            wall = self.wall(dealer=dealer)
            start = PHYSICAL_PATH.index(wall.original_break_position)
            order = PHYSICAL_PATH[start:] + PHYSICAL_PATH[:start]
            drawn = [self.assert_draw_at(wall, position) for position in order[:122]]
            self.assertEqual(len(set(drawn)), 122)
            self.assertEqual(wall.reserved_positions(0), set(order[122:]))
            self.assertEqual(wall.remaining_normal_count(0), 0)
            with self.assertRaises(WallExhausted):
                wall.draw_normal()

    def test_tail_all_stacks_keep_top_then_bottom(self):
        wall = self.wall()
        start = PHYSICAL_PATH.index(wall.original_break_position)
        order = PHYSICAL_PATH[start:] + PHYSICAL_PATH[:start]
        tail_order = [order[i + layer] for i in range(134, -1, -2) for layer in (0, 1)]
        self.assertEqual(tail_order[:4], [
            WallPosition(Seat.WEST, 16, Layer.TOP),
            WallPosition(Seat.WEST, 16, Layer.BOTTOM),
            WallPosition(Seat.NORTH, 0, Layer.TOP),
            WallPosition(Seat.NORTH, 0, Layer.BOTTOM),
        ])
        ids = []
        for position, successor in zip(tail_order, tail_order[1:] + tail_order[:1]):
            ids.append(self.assert_draw_at(wall, position, replacement=True))
            self.assertEqual(wall.previous_tail_position(position), successor)
        self.assertEqual(set(ids), set(range(136)))
        self.assertFalse(wall.can_draw_tail())
        self.assertIsNone(wall.normal_draw_cursor)
        with self.assertRaises(WallExhausted):
            wall.draw_gang_replacement()

    def test_reserved_columns_and_boundary_change(self):
        wall = self.wall()
        for gangs, expected in ((0, 7), (1, 7), (2, 8), (3, 9), (4, 10)):
            self.assertEqual(wall.get_reserved_columns(gangs), expected)
            self.assertEqual(wall.normal_limit(gangs), 136 - 2 * expected)
        for _ in range(120):
            wall.draw_normal()
        self.assertFalse(wall.is_normal_draw_exhausted(0))
        self.assertTrue(wall.is_normal_draw_exhausted(2))

    def test_mixed_draws_and_reserve(self):
        wall = self.wall((3, 5), Seat.NORTH)
        start = PHYSICAL_PATH.index(WallPosition(Seat.WEST, 13, Layer.TOP))
        order = PHYSICAL_PATH[start:] + PHYSICAL_PATH[:start]
        draws = [(order[i], False, 0, 121 - i) for i in range(2)]
        draws.append((WallPosition(Seat.WEST, 14, Layer.TOP), True, 1, 120))
        draws.extend((order[i], False, 1, 121 - i) for i in range(2, 5))
        draws.append((WallPosition(Seat.WEST, 14, Layer.BOTTOM), True, 2, 115))
        draws.extend((order[i], False, 2, 119 - i) for i in range(5, 120))
        drawn = set()
        for step, (position, replacement, gangs, remaining) in enumerate(draws, start=1):
            tile = self.assert_draw_at(wall, position, replacement=replacement, gangs=gangs)
            self.assertNotIn(tile, drawn)
            drawn.add(tile)
            self.assertEqual(sum(not slot.drawn for slot in wall.slots), 136 - step)
            self.assertEqual(wall.remaining_normal_count(gangs), remaining)
        self.assertEqual(wall.reserved_positions(2), set(order[120:]))
        self.assertEqual({slot.position for slot in wall.slots if not slot.drawn}, set(order[120:134]))
        with self.assertRaises(WallExhausted):
            wall.draw_normal(2)

    def test_cursors_meet_at_partly_drawn_stack(self):
        for normal_first in (True, False):
            with self.subTest(normal_first=normal_first):
                wall = self.wall()
                wall.set_cursors(0, 1)
                top = wall.original_break_position
                bottom = WallPosition(top.side, top.column, Layer.BOTTOM)
                self.assert_draw_at(wall, top, replacement=not normal_first)
                self.assert_draw_at(wall, bottom, replacement=normal_first)
                self.assertEqual(wall.remaining_normal_count(1), 0)
                self.assertIsNone(wall.normal_draw_cursor)
                self.assertIsNone(wall.gang_draw_cursor)
                with self.assertRaises(WallExhausted):
                    wall.draw_normal(1)
                with self.assertRaises(WallExhausted):
                    wall.draw_gang_replacement()

    def test_tail_consumption_can_reach_normal_range(self):
        wall = self.wall()
        tail_ids = {wall.draw_gang_replacement().instance_id for _ in range(16)}
        self.assertEqual(wall.remaining_normal_count(0), 120)
        normal_ids = {wall.draw_normal().instance_id for _ in range(120)}
        self.assertFalse(normal_ids & tail_ids)
        self.assertEqual(normal_ids | tail_ids, set(range(136)))
        self.assertFalse(wall.can_draw_tail())

    def test_indicator_can_be_drawn_from_both_ends(self):
        for replacement, dice in ((False, (6, 6)), (True, (1, 1))):
            with self.subTest(replacement=replacement):
                wall = self.wall(dice)
                indicator = wall.get_slot(wall.gold_indicator_position)
                gold = get_opposite_tile(indicator.tile.type_id)
                draw = wall.draw_gang_replacement if replacement else wall.draw_normal
                # Verify the indicator can be reached within the legal range.
                cursor = "gang_draw_cursor" if replacement else "normal_draw_cursor"
                while getattr(wall, cursor) != indicator.position:
                    self.assertNotEqual(draw(), indicator.tile)
                before = sum(not slot.drawn for slot in wall.slots)
                self.assertFalse(indicator.drawn)
                self.assert_draw_at(wall, indicator.position, replacement=replacement)
                self.assertEqual(sum(not slot.drawn for slot in wall.slots), before - 1)
                self.assertTrue(indicator.revealed)
                self.assertEqual(get_opposite_tile(indicator.tile.type_id), gold)

    def test_all_gold_mappings(self):
        expected = list(range(8, -1, -1)) + list(range(17, 8, -1)) + list(range(26, 17, -1))
        expected += [29, 30, 27, 28, 33, 32, 31]
        self.assertEqual([get_opposite_tile(i) for i in range(34)], expected)
        for i in range(34):
            self.assertEqual(get_opposite_tile(get_opposite_tile(i)), i)
