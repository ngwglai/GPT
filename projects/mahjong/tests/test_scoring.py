import unittest
from mahjong import *
from mahjong.core.player import Meld, MeldType
from mahjong.rules.scoring import HuEffect, SettlementMode
from .helpers import *
from .test_gold import WAIT


def sample_config(**overrides):
    return ScoreConfig(**overrides)


class ScoringTests(unittest.TestCase):
    def fixture(self):
        e = engine()
        build_fixture(e, {S:PlayerFixture(shelves=2), E:PlayerFixture()}, gold=33)
        return e.state

    def quote(self, state, winner, source, base=1, other_hu=(), effects=()):
        q = ScoreEngine(ScoreConfig(base)).settle(state, winner, source, effects, other_hu=other_hu)
        self.assertEqual(q.status, 'CALCULATED')
        self.assertEqual(sum(q.transfers.values()), 0)
        matrix = q.items['matrix']
        for seat in Seat:
            self.assertEqual(matrix[seat][seat], 0)
            self.assertEqual(q.transfers[seat], sum(row[seat] for row in matrix)-sum(matrix[seat]))
        return q

    def test_all_dealer_winner_source_combinations_and_base_modes(self):
        for base in (1,5):
            for dealer in Seat:
                for winner in Seat:
                    for source in (None, *[s for s in Seat if s != winner]):
                        with self.subTest(base=base,dealer=dealer,winner=winner,source=source):
                            state = self.fixture()
                            state.dealer = dealer
                            q = self.quote(state,winner,source,base)
                            for payer in Seat:
                                if payer == winner: continue
                                expected = base * (2 if source is None else 1) * (2 if dealer in (payer,winner) else 1)
                                expected += 5 * state.players[winner].shelf_count + (5 if payer == source else 0)
                                self.assertEqual(q.transfers[payer], -expected)

    def test_default_one_point_and_gold_not_multiplied(self):
        q = self.quote(self.fixture(),S,None,5)
        self.assertEqual(q.transfers, {E:-30,S:70,W:-20,N:-20})

    def test_discard_everyone_pays_and_source_extra(self):
        q = self.quote(self.fixture(),S,E)
        self.assertEqual(q.transfers, {E:-17,S:39,W:-11,N:-11})

    def test_all_gangs_paid_on_draw_and_on_win(self):
        s = self.fixture()
        s.players[E].melds = [Meld(MeldType.MING_GANG, []), Meld(MeldType.BU_GANG, [])]
        s.players[W].melds = [Meld(MeldType.AN_GANG, [])]
        s.players[N].melds = [Meld(MeldType.PENG, []), Meld(MeldType.CHI, [])]
        q = self.quote(s,None,None)
        self.assertEqual(q.transfers, {E:4,S:-4,W:4,N:-4})
        q = self.quote(s,S,E)
        self.assertEqual(q.transfers, {E:-13,S:35,W:-7,N:-15})

    def test_multi_hu_exemption_only_base_and_gold(self):
        s = self.fixture()
        s.players[S].melds = [Meld(MeldType.MING_GANG, [])]
        s.players[W].melds = [Meld(MeldType.AN_GANG, [])]
        q = self.quote(s,S,E,other_hu=(W,))
        self.assertEqual(q.items['matrix'][W][S],1)
        self.assertEqual(q.items['matrix'][S][W],2)
        self.assertEqual(q.transfers, {E:-20,S:29,W:5,N:-14})
        q = self.quote(s,S,E,other_hu=(W,N))
        self.assertEqual(q.items['matrix'][N][S],1)
        self.assertEqual(q.items['other_hu'],[2,3])

    def test_special_effects_and_declared_ting_do_not_modify_score(self):
        s=self.fixture()
        s.players[E].is_declared_ting=True
        self.assertEqual(self.quote(s,S,E).transfers, self.quote(s,S,E,effects=tuple(HuEffect)).transfers)
        self.assertEqual(self.quote(s,S,E).mode, SettlementMode.NORMAL)

    def test_invalid_config_rejected(self):
        for amount in (-1,0,2,True,1.0,'5',None,'NaN','Infinity'):
            with self.assertRaises(ValueError): ScoreConfig(amount)

    def test_reported_source_still_pays_full_score_in_engine(self):
        e=engine()
        build_fixture(e,{S:PlayerFixture(WAIT,declared=True),E:PlayerFixture(declared=True)},gold=33,discard=(E,31))
        play(e,choose(e,S,ActionType.HU))
        self.assertEqual(e.state.result.winner,S)
        self.assertEqual(e.state.result.settlement.transfers,{E:-7,S:9,W:-1,N:-1})
