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
    for p in parsed:
        digest = hashlib.sha256(
            json.dumps(p.json(), sort_keys=True).encode()
        ).hexdigest()
        for c in validated:
            for rep in range(repeats):
                if cancelled():
                    return {"rows": rows, "cancelled": True}
                cfg = Config(**{**asdict(c), "seed": seed + rep, "trace_limit": 0})
                result = solve(p, cfg, cancelled)
                rows.append(
                    dict(
                        problem_id=digest,
                        problem=p.json(),
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
    return {"rows": rows, "cancelled": False}


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
    for row in report["rows"]:
        flat = {**{k: v for k, v in row.items() if k != "stats"}, **row["stats"]}
        for k in ("problem", "config", "environment"):
            flat[k] = json.dumps(flat[k], ensure_ascii=True, sort_keys=True)
        writer.writerow(flat)
    return output.getvalue()
