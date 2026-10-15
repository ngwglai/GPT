"""Serial, reproducible experiments. Solver timing excludes serialization and UI."""

import csv
import hashlib
import io
import json
import platform
from dataclasses import asdict
from .model import parse
from .solver import Config, solve


def experiment(problems, configs, repeats=3, seed=0, cancelled=lambda: False):
    if (
        type(repeats) != int
        or not 1 <= repeats <= 10
        or not 1 <= len(problems) <= 8
        or not 1 <= len(configs) <= 12
    ):
        raise ValueError("Experiment limits: 8 instances, 12 configs, 10 repeats")
    parsed = [parse(p) for p in problems]
    validated = [Config(**c) for c in configs]
    for c in validated:
        c.validate()
    if type(seed) != int or not 0 <= seed <= 2**32 - 11:
        raise ValueError("Invalid experiment seed")
    rows = []
    problem_index = {}
    for p in parsed:
        document = p.json()
        digest = hashlib.sha256(
            json.dumps(document, sort_keys=True).encode()
        ).hexdigest()
        problem_index[digest] = document
        for c in validated:
            for rep in range(repeats):
                if cancelled():
                    return {"problems": problem_index, "rows": rows, "cancelled": True}
                cfg = Config(**{**asdict(c), "seed": seed + rep, "trace_limit": 0})
                result = solve(p, cfg, cancelled)
                rows.append(
                    dict(
                        problem_id=digest,
                        config=asdict(cfg),
                        repeat=rep,
                        status=result["status"],
                        reason=result["reason"],
                        complete=result["complete"],
                        solutions=len(result["solutions"]),
                        stats=result["stats"],
                        environment={
                            "python": platform.python_version(),
                            "system": platform.system(),
                            "machine": platform.machine(),
                            "constraintlab": "0.1.0",
                        },
                    )
                )
    return {"problems": problem_index, "rows": rows, "cancelled": False}


def to_csv(report):
    output = io.StringIO()
    fields = [
        "problem_id",
        "problem",
        "config",
        "repeat",
        "status",
        "reason",
        "complete",
        "solutions",
        "environment",
        "seconds",
        "nodes",
        "backtracks",
        "constraint_checks",
        "propagations",
        "max_depth",
        "deleted_values",
        "peak_memory_bytes",
    ]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    seen = set()
    for row in report["rows"]:
        flat = {**{k: v for k, v in row.items() if k != "stats"}, **row["stats"]}
        problem_id = row["problem_id"]
        # Include each full problem only once even in the flat CSV export.
        flat["problem"] = (
            json.dumps(report["problems"][problem_id], ensure_ascii=True, sort_keys=True)
            if problem_id not in seen
            else ""
        )
        seen.add(problem_id)
        for k in ("config", "environment"):
            flat[k] = json.dumps(flat[k], ensure_ascii=True, sort_keys=True)
        writer.writerow(flat)
    return output.getvalue()
