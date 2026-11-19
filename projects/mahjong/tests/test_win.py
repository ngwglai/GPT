from functools import lru_cache
from itertools import combinations_with_replacement
import unittest

from mahjong import *
from mahjong.core.player import Meld, MeldType
from mahjong.solver.thirteen_orphans import ORPHANS


class WinTests(unittest.TestCase):
    def setUp(self):
        self.solver = WinSolver()

    def hu(self, types, gold=33):
        return self.solver.check_hu(tiles_from_types(types), [], gold)

    def test_standard_zero_to_four_wildcards(self):
        base = [0,1,2, 9,10,11, 18,19,20, 27,27,27, 31,31]
        for count in range(5):
            with self.subTest(count=count):
                self.assertIn("standard", self.hu([33]*count+base[count:]).patterns)

    def test_wildcard_below_first_real_tile(self):
        self.assertTrue(self.hu([7,8,33, 9,10,11, 18,19,20, 27,27,27, 31,31]))

    def test_gold_pair(self):
        self.assertTrue(self.hu([0,1,2,9,10,11,18,19,20,27,27,27,33,33]))

    def test_seven_pairs_zero_to_four_wildcards(self):
        base = [0,0,3,3,7,7,9,9,14,14,22,22,27,27]
        for count in range(5):
            self.assertIn("seven_pairs", self.hu([33]*count+base[count:]).patterns)

    def test_seven_pairs_quad_policy(self):
        types = [0]*4+[3]*2+[7]*2+[12]*2+[18]*2+[27]*2
        self.assertIn("seven_pairs", self.hu(types).patterns)
        self.assertNotIn("seven_pairs", WinSolver(False).check_types(types, [], 33).patterns)

    def test_thirteen_orphans_zero_to_four_wildcards(self):
        # gold is 5wan, a non-orphan, so the zero-gold case is truly zero.
        base = sorted(ORPHANS)+[0]
        for count in range(5):
            self.assertIn("thirteen_orphans", self.hu([4]*count+base[count:], 4).patterns)

    def test_orphan_gold_is_itself_an_orphan(self):
        self.assertIn("thirteen_orphans", self.hu(sorted(ORPHANS)+[0], 33).patterns)

    def test_invalid_hand(self):
        self.assertFalse(self.hu([0,1,3,5,7,9,11,13,15,17,19,21,23,25]))

    def test_no_fifth_copy(self):
        self.assertFalse(self.solver.check_types([0]*5+[1]*3+[2]*3+[3]*3, [], 33))

    def test_duplicate_instance_rejected(self):
        tiles = tiles_from_types([0,1,2,9,10,11,18,19,20,27,27,27,31,31])
        tiles[-1] = tiles[-2]
        self.assertFalse(self.solver.check_hu(tiles, [], 33))

    def test_open_hand_and_gang_count_as_one_meld(self):
        meld = Meld(MeldType.AN_GANG, tiles_from_types([27]*4))
        hand = tiles_from_types([0,1,2,9,10,11,18,19,20,31,31])
        self.assertTrue(self.solver.check_hu(hand, [meld], 33))
        self.assertFalse(self.solver.check_hu(hand+[Tile(0)], [meld], 33))

    def test_bad_meld_rejected(self):
        meld = Meld(MeldType.CHI, tiles_from_types([7,8,9]))
        self.assertFalse(self.solver.check_types([0,1,2,12,13,14,18,19,20,31,31], [meld], 33))

    def test_special_hands_require_closed_hand(self):
        meld = Meld(MeldType.PENG, tiles_from_types([27]*3))
        result = self.solver.check_types([0,0,3,3,6,6,9,9,12,12,33], [meld], 33)
        self.assertNotIn("seven_pairs", result.patterns)
        self.assertNotIn("thirteen_orphans", result.patterns)

    def test_find_waits_matches_same_solver(self):
        types = [0,0,0,1,1,1,2,3,3,3,4,4,4]
        waits = self.solver.find_waits(tiles_from_types(types), [], 33)
        self.assertEqual(waits, {0,1,2,3,4,33})
        self.assertEqual(waits, {t for t in range(34) if self.solver.check_types(types+[t], [], 33)})

    def test_find_waits_wrong_count(self):
        self.assertEqual(self.solver.find_waits([], [], 33), set())

    def test_extension_validator(self):
        self.solver.register("fixture_pattern", lambda counts, gold, melds: counts[25] == 1)
        result = self.solver.check_types([0,1,3,5,7,9,11,13,15,17,19,21,23,25], [], 33)
        self.assertEqual(result.patterns, ("fixture_pattern",))

    def test_exhaustive_small_hands_against_independent_template_oracle(self):
        # Independently enumerate all 9-rank pair+meld templates. A hand fits
        # iff each natural count fits the target and gold covers its deficit.
        # This avoids mirroring the production recursive decomposition.
        targets = set()
        melds = [(t,t,t) for t in range(9)] + [(t,t+1,t+2) for t in range(7)]
        for pair in range(9):
            for meld in melds:
                counts = [0]*9
                for t in (pair,pair)+meld:
                    counts[t] += 1
                targets.add(tuple(counts))
        fixed = [Meld(MeldType.PENG, tiles_from_types([t]*3)) for t in (27,28,29)]
        checked = 0
        for gold_count in range(5):
            for natural in combinations_with_replacement(range(9), 5-gold_count):
                counts = tuple(natural.count(i) for i in range(9))
                if max(counts) > 4:
                    continue
                expected = any(all(c <= n for c,n in zip(counts,target)) for target in targets)
                actual = bool(self.solver.check_types(list(natural)+[33]*gold_count, fixed, 33))
                self.assertEqual(actual, expected, (natural,gold_count))
                checked += 1
        self.assertGreater(checked, 1900)
