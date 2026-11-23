import asyncio
from threading import Event
import unittest
from unittest.mock import patch

from mahjong import IllegalAction
from mahjong.game.autoplay import AutoRunner, decide
from mahjong.game.controllers import CONTROLLERS, Decision
from tests.helpers import E, S
from web_server import LocalTable


class ControllerTests(unittest.TestCase):
    def test_three_difficulties_choose_only_from_the_authorized_view(self):
        table = LocalTable(seed=42)
        state = table.engine.state
        view = table.view_for(E)
        table.human_act(seat=E, payload={"round_id": state.round_id, "revision": view["revision"],
                                        **view["legal_actions"][0]})
        for mode in ("easy", "normal", "advanced"):
            with self.subTest(mode=mode):
                table.set_control(seat=E, round_id=state.round_id, mode=mode)
                ticket = table.ai_ticket()
                self.assertNotIn("concealed_tiles", ticket.view["players"][int(S)])
                selected = decide(ticket)
                self.assertIn(selected.action, ticket.view["legal_actions"])
                self.assertEqual(selected, decide(ticket))
                self.assertTrue(selected.reason)
                self.assertIsNone(CONTROLLERS[mode].choose(table.view_for(S), int(S)))
                if mode == "advanced":
                    self.assertIn("可见有效牌", selected.reason)
                elif mode == "normal":
                    self.assertIn("向听估计", selected.reason)

    def test_rejects_manual_and_illegal_actions_then_records_verified_choice(self):
        table = LocalTable(seed=42)
        state = table.engine.state
        table.set_control(seat=E, round_id=state.round_id, mode="easy")
        ticket = table.ai_ticket()
        decision = decide(ticket)
        with self.assertRaises(IllegalAction):
            table.human_act(seat=E, payload={"round_id": state.round_id, "revision": 0, **decision.action})
        with self.assertRaises(ValueError):
            table.apply_ai(ticket, Decision({"type": "HU", "tile_ids": []}, "test"))
        self.assertEqual(state.revision, 0)
        self.assertTrue(table.apply_ai(ticket, decision))
        self.assertFalse(table.apply_ai(ticket, decision))
        self.assertEqual(state.revision, 1)
        self.assertEqual(table.view_for(E)["players"][int(E)]["ai_decisions"][0]["chosen"], decision.action)
        self.assertNotIn("ai_decisions", table.view_for(S)["players"][int(E)])

    def test_generation_and_round_invalidate_old_work(self):
        table = LocalTable(seed=42)
        round_id = table.engine.state.round_id
        table.set_control(seat=E, round_id=round_id, mode="easy")
        ticket = table.ai_ticket()
        table.set_control(seat=E, round_id=round_id, mode="human")
        table.set_control(seat=E, round_id=round_id, mode="easy")
        self.assertFalse(table.apply_ai(ticket, decide(ticket)))
        ticket = table.ai_ticket()
        table.new_round(seed=42)
        table.set_control(seat=E, round_id=table.engine.state.round_id, mode="easy")
        self.assertFalse(table.apply_ai(ticket, decide(ticket)))


class RunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_takeover_while_policy_thread_is_working(self):
        table = LocalTable(seed=42)
        lock = asyncio.Lock()
        worker = AutoRunner(table, lock, delay=0)
        state = table.engine.state
        entered, release = Event(), Event()

        def slow_decision(ticket):
            entered.set()
            if not release.wait(5):
                raise RuntimeError("test did not release controller")
            return decide(ticket)

        table.set_control(seat=E, round_id=state.round_id, mode="advanced")
        with patch("mahjong.game.autoplay.decide", slow_decision):
            worker.kick()
            task = worker.task
            try:
                self.assertTrue(await asyncio.to_thread(entered.wait, 3))
                async with lock:
                    table.set_control(seat=E, round_id=state.round_id, mode="human")
                    player_view = table.view_for(E)
                    table.human_act(seat=E, payload={"round_id": state.round_id, "revision": 0,
                                                    **player_view["legal_actions"][0]})
                release.set()
                await asyncio.wait_for(task, 3)
            finally:
                release.set()
                await worker.close()
        self.assertEqual(table.engine.state.revision, 1)
        self.assertFalse(table.decisions[E])
