import argparse
import json
from pathlib import Path
from .solver import solve, Config
from .problems import builtin


def main():
    parser = argparse.ArgumentParser(description="ConstraintLab local CSP laboratory")
    parser.add_argument("problem", nargs="?", help="JSON problem path")
    parser.add_argument("--algorithm", choices=["BT", "FC", "MAC"], default="MAC")
    parser.add_argument("--max-solutions", type=int, default=1)
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()
    if args.serve:
        import uvicorn

        uvicorn.run("constraintlab.api:app", host="127.0.0.1", port=8765)
    else:
        p = (
            json.loads(Path(args.problem).read_text(encoding="utf-8"))
            if args.problem
            else builtin().json()
        )
        print(
            json.dumps(
                solve(
                    p,
                    Config(algorithm=args.algorithm, max_solutions=args.max_solutions),
                ),
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
