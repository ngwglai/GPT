"""Run from project directory: python docs/benchmark.py > benchmark.json"""

import json
from constraintlab.benchmarks import experiment
from constraintlab.problems import builtin

print(
    json.dumps(
        experiment(
            [builtin("queens", size=n).json() for n in (4, 8, 10)],
            [
                {"algorithm": a, "trace_limit": 0, "timeout": 5}
                for a in ("BT", "FC", "MAC")
            ],
            repeats=3,
            seed=42,
        ),
        indent=2,
    )
)
