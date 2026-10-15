import random
import unittest
from constraintlab import parse, reference, solve, Config, verify
from constraintlab.problems import builtin


class EngineTests(unittest.TestCase):
    def compare(self, p):
        expected = {tuple(a.items()) for a in reference(p)}
        for alg in ("BT", "FC", "MAC"):
            r = solve(p, Config(algorithm=alg, max_solutions=10000, trace_limit=0))
            self.assertTrue(r["complete"], r)
            self.assertEqual(
                {tuple(sorted(a.items())) for a in r["solutions"]},
                {tuple(sorted(a)) for a in expected},
                alg,
            )
            self.assertEqual(r["status"], "SAT" if expected else "UNSAT")

    def test_random_differential(self):
        rng = random.Random(2026)
        for _ in range(120):
            ds = {
                str(i): rng.sample(range(-2, 4), rng.randint(0, 4))
                for i in range(rng.randint(0, 5))
            }
            cs = []
            for j in range(rng.randint(0, 7)):
                if not ds:
                    break
                vs = rng.sample(list(ds), min(len(ds), rng.randint(1, 3)))
                t = rng.choice(["sum", "all_different", "compare", "table", "or"])
                if t == "sum":
                    c = {
                        "type": t,
                        "vars": vs,
                        "op": rng.choice(["eq", "ne", "lt", "le", "gt", "ge"]),
                        "value": rng.randint(-3, 6),
                    }
                elif t == "compare":
                    vs = vs[:2]
                    c = {
                        "type": t,
                        "vars": vs,
                        "op": rng.choice(["eq", "ne", "lt", "ge"]),
                    }
                    if len(vs) == 1:
                        c["value"] = rng.randint(-2, 3)
                elif t == "table":
                    c = {
                        "type": t,
                        "vars": vs,
                        "allowed": [[rng.randint(-2, 3) for v in vs] for _ in range(5)],
                    }
                elif t == "or":
                    c = {
                        "type": "or",
                        "constraints": [
                            {
                                "type": "compare",
                                "vars": [vs[0]],
                                "op": "eq",
                                "value": 0,
                            },
                            {"type": "sum", "vars": vs, "op": "ge", "value": 2},
                        ],
                    }
                else:
                    c = {"type": t, "vars": vs}
                cs.append(c)
            self.compare(parse({"variables": ds, "constraints": cs}))

    def test_queens_counts_and_restoration(self):
        for n, count in [
            (1, 1),
            (2, 0),
            (3, 0),
            (4, 2),
            (5, 10),
            (6, 4),
            (7, 40),
            (8, 92),
        ]:
            p = builtin(size=n)
            before = p.json()
            for alg in ("BT", "FC", "MAC"):
                r = solve(
                    p,
                    Config(
                        algorithm=alg, max_solutions=1000, trace_limit=0, timeout=30
                    ),
                )
                self.assertTrue(r["complete"])
                self.assertEqual(len(r["solutions"]), count)
                self.assertEqual(p.json(), before)

    def test_builtins(self):
        for kind, size in [
            ("sudoku", 4),
            ("sudoku", 9),
            ("graph", 5),
            ("map", 7),
            ("schedule", 5),
        ]:
            p = builtin(kind, size)
            r = solve(p)
            self.assertEqual(r["status"], "SAT", r)
            self.assertTrue(verify(p, r["solutions"][0]))
        self.assertEqual(solve(builtin("graph", 3, 2))["status"], "UNSAT")

    def test_limits(self):
        p = builtin(size=8)
        for cfg, reason in [
            (Config(timeout=0), "timeout"),
            (Config(max_nodes=0), "node_limit"),
        ]:
            r = solve(p, cfg)
            self.assertEqual((r["status"], r["reason"]), ("UNKNOWN", reason))
        self.assertEqual(solve(p, cancelled=lambda: True)["reason"], "cancelled")
        r = solve(p, Config(trace_limit=2))
        self.assertTrue(r["trace_truncated"])
        self.assertEqual(len(r["events"]), 2)
        self.assertFalse(solve(p)["complete"])

    def test_heuristics(self):
        p = builtin(size=4)
        for var in ["fixed", "MRV", "Degree", "Dom/Ddeg"]:
            for val in ["natural", "LCV", "random"]:
                cfg = Config(variable=var, value=val, max_solutions=10)
                a = solve(p, cfg)
                b = solve(p, cfg)
                self.assertEqual(a["solutions"], b["solutions"])
                self.assertEqual(a["events"], b["events"])
                self.assertEqual(len(a["solutions"]), 2)

    def test_edge_cases(self):
        for ds, cs in [
            ({}, []),
            ({"x": []}, []),
            ({"x": [1, 2], "y": [1, 2]}, []),
            ({"x": [1]}, [{"type": "compare", "vars": ["x"], "op": "ne", "value": 1}]),
            ({}, [{"type": "or", "constraints": []}]),
        ]:
            self.compare(parse({"variables": ds, "constraints": cs}))

    def test_invalid(self):
        for data in [
            None,
            {},
            {"variables": {"x": [True]}, "constraints": []},
            {"variables": {}, "constraints": [{"type": "python", "code": "x"}]},
        ]:
            self.assertEqual(solve(data)["status"], "ERROR")
