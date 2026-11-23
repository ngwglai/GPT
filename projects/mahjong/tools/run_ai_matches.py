"""Exercise the real controller adapter and rules over seeded, consecutive rounds."""
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from decimal import Decimal
import json
from pathlib import Path
import time

from mahjong import Seat
from mahjong.game.autoplay import decide
from web_server import LocalTable

MODES = ("easy", "normal", "advanced")


def run_group(job):
    first_seed, length, mode = job
    records = []
    table = LocalTable(seed=first_seed)
    for offset in range(length):
        seed = first_seed + offset
        if offset:
            old = table.engine.state
            dealer = old.result.next_dealer
            table.next_round(seed=seed)
            if table.engine.state.dealer != dealer:
                raise AssertionError("next dealer disagrees with the result")
            if any(table.decisions.values()) or any(
                p.picked_orphans or p.orphan_pickup_enabled for p in table.engine.state.players.values()
            ):
                raise AssertionError("round-private state survived reset")
        state = table.engine.state
        table.set_control(seat=None, round_id=state.round_id, mode=mode)
        for seat in Seat:
            # Exercise the opted-in orphan route in a reproducible subset of games.
            if seed % 3 == 0 and int(seat) % 2 == seed % 2:
                table.update_orphan_pickup(seat=seat, round_id=state.round_id, enabled=True)
        actions = Counter()
        for _ in range(500):
            if state.result:
                break
            ticket = table.ai_ticket()
            if ticket is None:
                raise AssertionError(f"stalled {mode} seed {seed}, revision {state.revision}")
            decision = decide(ticket)
            if not table.apply_ai(ticket, decision):
                raise AssertionError(f"discarded a current action in seed {seed}")
            actions[decision.action["type"]] += 1
        if not state.result:
            raise AssertionError(f"action budget exhausted for {mode} seed {seed}")
        table.engine.assert_invariants()
        scoring = table.scoring_view()
        if sum(map(Decimal, scoring["totals"].values())) != 0:
            raise AssertionError(f"unbalanced scoring in seed {seed}")
        records.append({"seed": seed, "mode": mode, "round": table.round_no,
                        "result": state.result.type, "patterns": list(state.result.patterns),
                        "actions": dict(actions), "score_status": scoring["status"],
                        "gameplay_actions": state.revision})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--groups", type=int, default=34)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    jobs = [(1000 + index * 3, 3, MODES[index % 3]) for index in range(args.groups)]
    began = time.monotonic()
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        records = [record for batch in pool.map(run_group, jobs) for record in batch]
    summary = {"rounds": len(records), "elapsed_seconds": round(time.monotonic() - began, 2),
               "by_mode": {mode: dict(Counter(row["result"] for row in records if row["mode"] == mode)) for mode in MODES},
               "actions": dict(sum((Counter(row["actions"]) for row in records), Counter())),
               "max_actions": max(row["gameplay_actions"] for row in records), "rounds_detail": records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print({key: val for key, val in summary.items() if key != "rounds_detail"})


if __name__ == "__main__":
    main()
