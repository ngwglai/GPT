"""Existing multi-round LocalTable plus the unified v0.5.0 server entry point.

Rule authority remains GameEngine / TableService. LAN transport is in lan_server.
"""
from __future__ import annotations

import argparse
import secrets
import threading
from pathlib import Path
from decimal import Decimal

from mahjong import GameEngine, RuleConfig, ScoreConfig, ScoreEngine, Seat, IllegalAction
from mahjong.game.service import TableService

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
            self.history.append(record)
            self.previous_result = record

            settlement = state.result.settlement
            if settlement.status == "CALCULATED":
                for seat, delta in settlement.transfers.items():
                    self.total_scores[seat] += delta
            else:
                self.score_pending = True

            next_dealer = state.result.next_dealer
            chosen_seed = self._choose_seed(seed)
            self.engine.start_round(PLAYER_IDS, dealer=next_dealer, seed=chosen_seed, manual_dice_roll=True)
            self.seed = chosen_seed
            self.dealer = next_dealer
            self.round_no += 1
            return self.snapshot()

    def snapshot(self) -> dict:
        """Merge four legitimate player views for the explicit all-open test mode."""
        with self._lock:
            assert self.service is not None
            views = {seat: self.service.view_for(PLAYER_IDS[seat]) for seat in Seat}
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
                        "status": "PENDING_CONFIGURATION" if self.score_pending or any(getattr(self.engine.scoring.config, name) is None for name in ("base_ping_hu", "shelf_bonus", "dealer_multiplier")) else "READY",
                        "totals": {str(int(seat)): str(value) for seat, value in self.total_scores.items()},
                        "note": "已启用示例默认计分；流局附加结算等未定义地方规则仍会标记为待配置。",
                    },
                },
                "test_mode": {"all_hands_open": True, "seed": str(self.seed)},
            }

    def act(self, *, seat: Seat, payload: dict) -> dict:
        with self._lock:
            assert self.service is not None
            self.service.handle_intent(PLAYER_IDS[seat], payload)
            return self.snapshot()

    def timeout_responses(self, *, round_id: str, revision: int) -> dict:
        with self._lock:
            assert self.service is not None
            self.service.timeout_responses(round_id, revision)
            return self.snapshot()

def main():
    parser = argparse.ArgumentParser(description="麻将 v0.5.0：单机测试与局域网四人联机")
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
