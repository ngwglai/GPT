"""Existing multi-round LocalTable plus the unified Web server entry point.

Rule authority remains GameEngine / TableService. LAN transport is in lan_server.
"""
from __future__ import annotations

import argparse
import secrets
import threading
from pathlib import Path
from collections import deque
from dataclasses import dataclass
from decimal import Decimal

from mahjong import GameEngine, RuleConfig, ScoreConfig, ScoreEngine, Seat, IllegalAction, __version__
from mahjong.game.service import TableService
from mahjong.game.controllers import CONTROLLERS, Decision
from mahjong.game.visibility import ting_presentation

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
PLAYER_IDS = {seat: f"local-seat-{int(seat)}" for seat in Seat}


def default_score_engine() -> ScoreEngine:
    """Default reference scoring used by the interactive web/LAN frontends.

    These values are the example defaults documented by the project.  More
    specific local rules can still replace this ScoreEngine later without
    changing GameEngine or the clients.
    """
    return ScoreEngine(ScoreConfig(
        base_ping_hu=1,
        shelf_bonus=1,
        dealer_multiplier=2,
        discard_multiplier=1,
        self_draw_multiplier=1,
        dealer_scope="EITHER_PARTY",
        self_draw_payment="EACH_OPPONENT",
    ))


@dataclass(frozen=True)
class AITicket:
    seat: Seat
    mode: str
    generation: int
    view: dict
    quad_pairs: bool


class LocalTable:
    """Owns one local match and exposes only TableService views/intents.

    The engine still owns each individual round.  This lightweight wrapper only
    carries the few values that must survive between rounds: round number,
    dealer continuity, previous result, per-round seed history, and a future
    scoring-total slot.
    """

    def __init__(self, seed: int | None = None, dealer: Seat = Seat.EAST):
        self._lock = threading.RLock()
        self.engine: GameEngine | None = None
        self.service: TableService | None = None
        self.seed: int | None = None
        self.dealer: Seat = dealer
        self.match_id = secrets.token_hex(6)
        self.round_no = 0
        self.previous_result: dict | None = None
        self.history: list[dict] = []
        self.total_scores = {seat: Decimal(0) for seat in Seat}
        self.score_pending = False
        self.control_generation = {seat: 0 for seat in Seat}
        self.control = {}
        self.decisions = {}
        self.new_round(seed=seed, dealer=dealer)

    def _choose_seed(self, seed: int | None = None) -> int:
        if seed is not None:
            return seed
        chosen = secrets.randbits(64)
        while self.seed is not None and chosen == self.seed:
            chosen = secrets.randbits(64)
        return chosen

    def new_round(self, *, seed: int | None = None, dealer: Seat = Seat.EAST) -> dict:
        """Start a fresh local match.  This is the explicit debug reset path."""
        with self._lock:
            chosen_seed = self._choose_seed(seed)
            engine = GameEngine(RuleConfig(), score_engine=default_score_engine())
            engine.start_round(PLAYER_IDS, dealer=dealer, seed=chosen_seed, manual_dice_roll=True)
            self.engine = engine
            self.service = TableService(engine)
            self.seed = chosen_seed
            self.dealer = dealer
            self.match_id = secrets.token_hex(6)
            self.round_no = 1
            self.previous_result = None
            self.history = []
            self.total_scores = {seat: Decimal(0) for seat in Seat}
            self.score_pending = False
            self.control = {seat: "human" for seat in Seat}
            self.decisions = {seat: deque(maxlen=8) for seat in Seat}
            return self.snapshot()

    def next_round(self, *, seed: int | None = None) -> dict:
        """Advance after a completed round using RoundResult.next_dealer.

        Dealer rules therefore remain authoritative in the rules layer:
        dealer win/draw repeats; any non-dealer win advances one seat.
        """
        with self._lock:
            assert self.engine is not None and self.service is not None
            state = self.engine.state
            if state is None or state.phase.name != "ROUND_END" or state.result is None:
                raise IllegalAction("current round has not ended")

            public_result = self.engine.player_view(Seat.EAST)["result"]
            record = {
                "round_no": self.round_no,
                "seed": str(self.seed),
                "dealer": int(self.dealer),
                "result": public_result,
            }
            settlement = state.result.settlement
            next_dealer = state.result.next_dealer
            chosen_seed = self._choose_seed(seed)
            self.engine.start_round(PLAYER_IDS, dealer=next_dealer, seed=chosen_seed, manual_dice_roll=True)

            self.history.append(record)
            self.previous_result = record
            if settlement.status == "CALCULATED":
                for seat, delta in settlement.transfers.items():
                    self.total_scores[seat] += delta
            else:
                self.score_pending = True
            self.seed = chosen_seed
            self.dealer = next_dealer
            self.round_no += 1
            for history in self.decisions.values():
                history.clear()
            return self.snapshot()

    def scoring_view(self) -> dict:
        """Include the current result until it enters the completed-round ledger."""
        with self._lock:
            state = self.engine.state
            settlement = state.result.settlement if state and state.result else None
            transfers = settlement.transfers if settlement and settlement.status == "CALCULATED" else {}
            pending = self.score_pending or (settlement is not None and settlement.status != "CALCULATED")
            configured = all(getattr(self.engine.scoring.config, name) is not None
                             for name in ("base_ping_hu", "shelf_bonus", "dealer_multiplier"))
            return {
                "status": "PENDING_CONFIGURATION" if pending or not configured else "READY",
                "totals": {str(int(seat)): str(value + transfers.get(seat, 0))
                           for seat, value in self.total_scores.items()},
            }

    def set_control(self, *, seat: Seat | None, round_id: str, mode: str) -> None:
        with self._lock:
            if round_id != self.engine.state.round_id:
                raise IllegalAction("牌局已更新")
            if not isinstance(mode, str) or mode not in CONTROLLERS:
                raise IllegalAction("无效托管难度")
            for target in Seat if seat is None else (seat,):
                if self.control[target] != mode:
                    self.control[target] = mode
                    self.control_generation[target] += 1

    def view_for(self, seat: Seat) -> dict:
        with self._lock:
            view = self.service.view_for(PLAYER_IDS[seat])
            state = self.engine.state
            view["players"][int(seat)].update(ting_presentation(
                view, int(seat), state.players[seat], self.engine.solver))
            for position in Seat:
                mode = self.control[position]
                player = view["players"][int(position)]
                player["controller"] = mode
                # A hidden response option can reveal the hand or private pickup intent.
                public_turn = state.current_player == position and state.phase.name in {"TURN_ACTION", "ROLLING_DICE"}
                player["ai_thinking"] = mode != "human" and (public_turn or (
                    position == seat and bool(view["legal_actions"])
                ))
                if position == seat:
                    player["ai_decisions"] = list(self.decisions[position])
            return view

    def ai_ticket(self) -> AITicket | None:
        with self._lock:
            for seat, mode in self.control.items():
                if mode != "human" and self.engine.legal_actions(seat):
                    view = self.service.view_for(PLAYER_IDS[seat])
                    return AITicket(seat, mode, self.control_generation[seat], view, self.engine.rules.quad_as_two_pairs)
        return None

    def apply_ai(self, ticket: AITicket, decision: Decision | None) -> bool:
        with self._lock:
            state = self.engine.state
            seat = ticket.seat
            if (self.control[seat] != ticket.mode or self.control_generation[seat] != ticket.generation
                    or state.round_id != ticket.view["round_id"] or state.revision != ticket.view["revision"]):
                return False
            if decision is None or decision.action not in ticket.view["legal_actions"]:
                raise ValueError("AI controller must select an offered action")
            intent = {"round_id": state.round_id, "revision": state.revision, **decision.action}
            self.service.handle_intent(PLAYER_IDS[seat], intent)
            self.decisions[seat].append({
                "seat": int(seat), "difficulty": ticket.mode, "revision": ticket.view["revision"],
                "hand": [tile["type"] for tile in ticket.view["players"][int(seat)]["concealed_tiles"]],
                "options": ticket.view["legal_actions"], "chosen": decision.action, "reason": decision.reason,
            })
            return True

    def human_act(self, *, seat: Seat, payload: dict) -> None:
        with self._lock:
            if self.control[seat] != "human":
                raise IllegalAction("请先接管该席位")
            self.service.handle_intent(PLAYER_IDS[seat], payload)

    def snapshot(self) -> dict:
        """Merge four legitimate player views for the explicit all-open test mode."""
        with self._lock:
            assert self.service is not None
            views = {seat: self.view_for(seat) for seat in Seat}
            base = views[Seat.EAST]
            players = {}
            legal_actions = {}
            for seat in Seat:
                own = views[seat]
                players[str(int(seat))] = own["players"][int(seat)]
                legal_actions[str(int(seat))] = own["legal_actions"]
            return {
                "round_id": base["round_id"],
                "revision": base["revision"],
                "phase": base["phase"],
                "dealer": base["dealer"],
                "current_player": base["current_player"],
                "players": players,
                "legal_actions": legal_actions,
                "dice": base["dice"],
                "break_wall": base["break_wall"],
                "break_column": base["break_column"],
                "gold_tile_type": base["gold_tile_type"],
                "gold_indicator": base["gold_indicator"],
                "normal_tiles_remaining": base["normal_tiles_remaining"],
                "reserved_columns": base["reserved_columns"],
                "gang_count": base["gang_count"],
                "wall_view": base["wall_view"],
                "presentation_events": base["presentation_events"],
                "pending_claim": base["pending_claim"],
                "discards": base["discards"],
                "result": base["result"],
                "match": {
                    "match_id": self.match_id,
                    "round_no": self.round_no,
                    "previous_result": self.previous_result,
                    "history": list(self.history),
                    "scoring": {
                        **self.scoring_view(),
                        "note": "已启用示例默认计分；流局附加结算等未定义地方规则仍会标记为待配置。",
                    },
                },
                "test_mode": {"all_hands_open": True, "seed": str(self.seed)},
            }

    def act(self, *, seat: Seat, payload: dict) -> dict:
        with self._lock:
            assert self.service is not None
            self.human_act(seat=seat, payload=payload)
            return self.snapshot()

    def update_orphan_pickup(self, *, seat: Seat, round_id: str, enabled: bool) -> None:
        with self._lock:
            assert self.service is not None
            self.service.set_orphan_pickup(PLAYER_IDS[seat], round_id, enabled)
            self.control_generation[seat] += 1

    def set_orphan_pickup(self, *, seat: Seat, round_id: str, enabled: bool) -> dict:
        with self._lock:
            self.update_orphan_pickup(seat=seat, round_id=round_id, enabled=enabled)
            return self.snapshot()

    def timeout_responses(self, *, round_id: str, revision: int) -> dict:
        with self._lock:
            assert self.service is not None
            self.service.timeout_responses(round_id, revision)
            return self.snapshot()

def main():
    parser = argparse.ArgumentParser(description=f"麻将 v{__version__}：单机测试与局域网四人联机")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--seed", type=int, default=None, help="固定开局随机种子，便于复现")
    parser.add_argument("--dealer", type=int, choices=range(4), default=0, metavar="0-3")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()

    # Imported lazily: engine and LocalTable unit tests remain dependency-free.
    try:
        from lan_server import run
    except ModuleNotFoundError as exc:
        if exc.name != "aiohttp":
            raise
        parser.error("请先安装联机依赖：python -m pip install -r requirements.txt")
    run(args)


if __name__ == "__main__":
    main()
