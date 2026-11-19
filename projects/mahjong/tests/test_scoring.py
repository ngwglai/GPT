from decimal import Decimal
import unittest
from mahjong import *
from mahjong.rules.scoring import HuEffect, SettlementMode
from .helpers import *
from .test_gold import WAIT


def sample_config(**overrides):
    d=dict(base_ping_hu=2,shelf_bonus=3,dealer_multiplier=2,discard_multiplier=1,
           self_draw_multiplier=2,dealer_scope="EITHER_PARTY",self_draw_payment="EACH_OPPONENT")
    d.update(overrides)
    return ScoreConfig(**d)


class ScoringTests(unittest.TestCase):
    def fixture(self):
        e=engine()
        build_fixture(e,{S:PlayerFixture(shelves=2),E:PlayerFixture()},gold=33)
        return e.state

    def test_unconfirmed_scores_pending(self):
        s=self.fixture()
        quote=ScoreEngine().settle(s,S,E,())
        self.assertEqual(quote.status,"PENDING_CONFIGURATION")
        self.assertEqual(quote.transfers,{})

    def test_normal_discard_add_before_multiply(self):
        s=self.fixture()
        q=ScoreEngine(sample_config()).settle(s,S,E,())
        self.assertEqual(q.transfers[S],Decimal(16))
        self.assertEqual(q.transfers[E],Decimal(-16))
        self.assertEqual(sum(q.transfers.values()),0)

    def test_ting_discard_override_ignores_every_bonus(self):
        s=self.fixture()
        s.players[E].is_declared_ting=True
        score=ScoreEngine(sample_config(effect_bonus={HuEffect.GANG_SHANG_KAI_HUA:100}))
        score.additive_hooks.append(lambda *args: 500)
        score.multiplier_hooks.append(lambda *args: 100)
        q=score.settle(s,S,E,(HuEffect.GANG_SHANG_KAI_HUA,))
        self.assertEqual(q.mode,SettlementMode.MINIMUM_PING_HU)
        self.assertEqual(q.transfers[S],Decimal(2))

    def test_minimum_only_needs_base_config(self):
        s=self.fixture()
        s.players[E].is_declared_ting=True
        q=ScoreEngine(ScoreConfig(base_ping_hu=1)).settle(s,S,E,())
        self.assertEqual(q.status,"CALCULATED")

    def test_self_draw_each_opponent(self):
        s=self.fixture()
        q=ScoreEngine(sample_config()).settle(s,S,None,())
        self.assertEqual(q.transfers[E],Decimal(-32))
        self.assertEqual(q.transfers[W],Decimal(-16))
        self.assertEqual(q.transfers[N],Decimal(-16))
        self.assertEqual(q.transfers[S],Decimal(64))

    def test_special_effects_zero_by_default(self):
        s=self.fixture()
        score=ScoreEngine(sample_config())
        a=score.settle(s,S,E,())
        b=score.settle(s,S,E,tuple(HuEffect))
        self.assertEqual(a.transfers,b.transfers)

    def test_seven_pairs_and_orphans_not_scored_as_bonus(self):
        self.assertNotIn("pattern",ScoreConfig.__dataclass_fields__)
        # Score interface receives no pattern parameter: legal shape cannot
        # accidentally carry a hard-coded multiplier.
        s=self.fixture()
        self.assertEqual(ScoreEngine(sample_config()).settle(s,S,E,()).transfers[S],16)

    def test_decimal_not_binary_float(self):
        s=self.fixture()
        q=ScoreEngine(sample_config(base_ping_hu="0.1",shelf_bonus="0.2",dealer_multiplier=1)).settle(s,S,E,())
        self.assertEqual(q.transfers[S],Decimal("0.5"))

    def test_invalid_config_rejected(self):
        for amount in (-1,"NaN","Infinity"):
            with self.assertRaises(ValueError):
                ScoreConfig(base_ping_hu=amount)

    def test_reported_source_still_can_be_hu_in_full_engine(self):
        e=engine()
        e.scoring=ScoreEngine(sample_config())
        build_fixture(e,{S:PlayerFixture(WAIT,declared=True),E:PlayerFixture(declared=True)},gold=33,discard=(E,31))
        play(e,choose(e,S,ActionType.HU))
        self.assertEqual(e.state.result.winner,S)
        self.assertEqual(e.state.result.settlement.mode,SettlementMode.MINIMUM_PING_HU)
        self.assertEqual(e.state.result.settlement.transfers[S],2)

    def test_rob_gang_is_not_a_discard_for_minimum_override(self):
        s=self.fixture()
        s.players[E].is_declared_ting=True
        q=ScoreEngine(sample_config()).settle(s,S,E,(HuEffect.QIANG_GANG_HU,))
        self.assertEqual(q.mode,SettlementMode.NORMAL)
