"""BT, forward checking and binary AC-3 MAC with bounded snapshot tracing."""

from collections import deque
from dataclasses import dataclass
import random
import time
from .model import parse, scope, evaluate, verify


@dataclass
class Config:
    algorithm: str = "MAC"
    variable: str = "MRV"
    value: str = "natural"
    seed: int = 0
    max_solutions: int = 1
    timeout: float = 10
    max_nodes: int = 100000
    trace_limit: int = 2000

    def validate(self):
        if (
            self.algorithm not in ("BT", "FC", "MAC")
            or self.variable not in ("fixed", "MRV", "Degree", "Dom/Ddeg")
            or self.value not in ("natural", "LCV", "random")
        ):
            raise ValueError("Unknown algorithm/heuristic")
        for k, lo, hi in [
            ("seed", 0, 2**32 - 1),
            ("max_solutions", 1, 10000),
            ("max_nodes", 0, 10000000),
            ("trace_limit", 0, 10000),
        ]:
            if type(getattr(self, k)) != int or not lo <= getattr(self, k) <= hi:
                raise ValueError("Invalid " + k)
        if type(self.timeout) not in (int, float) or not 0 <= self.timeout <= 120:
            raise ValueError("timeout must be 0..120 seconds")


class Stop(Exception):
    pass


# Bound expansion before allocating O(n^2) pairwise constraints.
MAX_EXPANDED_CONSTRAINTS = 20_000


def solve(problem, config=None, cancelled=lambda: False):
    started = time.perf_counter()
    stats = dict(
        nodes=0,
        backtracks=0,
        constraint_checks=0,
        propagations=0,
        max_depth=0,
        deleted_values=0,
    )
    events = []
    solutions = []
    truncated = False
    trace_bytes = 0
    reason = "exhausted"
    try:
        p = parse(problem.json() if hasattr(problem, "json") else problem)
        cfg = config or Config()
        cfg.validate()
        rng = random.Random(cfg.seed)

        domains = {v: list(d) for v, d in p.domains.items()}

        def emit(kind, a, d, depth, **extra):
            nonlocal truncated, trace_bytes
            if cfg.trace_limit == 0:
                return
            size = (
                100
                + sum(len(v) + len(values) * 12 for v, values in d.items())
                + len(a) * 100
            )
            if len(events) >= cfg.trace_limit or trace_bytes + size > 8_000_000:
                truncated = True
                return
            trace_bytes += size
            events.append(
                dict(
                    type=kind,
                    assignment=dict(a),
                    domains={v: list(x) for v, x in d.items()},
                    depth=depth,
                    **extra,
                )
            )

        def guard():
            if cancelled():
                raise Stop("cancelled")
            if time.perf_counter() - started >= cfg.timeout:
                raise Stop("timeout")

        def expanded_size(c):
            guard()
            if c["type"] == "and":
                return sum(expanded_size(child) for child in c["constraints"])
            if c["type"] == "all_different":
                n = len(c["vars"])
                return n * (n - 1) // 2
            return 1

        # Reject amplification before materializing any pairwise dictionaries.
        expanded = 0
        for c in p.constraints:
            expanded += expanded_size(c)
            if expanded > MAX_EXPANDED_CONSTRAINTS:
                raise ValueError(
                    f"Expanded constraint budget exceeded ({MAX_EXPANDED_CONSTRAINTS})"
                )

        constraints = []

        def expand(c):
            guard()
            if c["type"] == "and":
                for x in c["constraints"]:
                    expand(x)
            elif c["type"] == "all_different":
                for i, v in enumerate(c["vars"]):
                    guard()
                    for w in c["vars"][i + 1 :]:
                        constraints.append(
                            {"type": "compare", "vars": [v, w], "op": "ne"}
                        )
            else:
                constraints.append(c)

        for c in p.constraints:
            expand(c)
        scopes = [scope(c) for c in constraints]
        byvar = {}
        for v in p.domains:
            guard()
            byvar[v] = [i for i, s in enumerate(scopes) if v in s]
        neighbors = {
            v: set(w for i in byvar[v] for w in scopes[i] if w != v) for v in p.domains
        }

        def test(i, a):
            guard()
            stats["constraint_checks"] += 1
            return evaluate(constraints[i], a)

        def consistent(a):
            return all(
                test(i, a) for i, s in enumerate(scopes) if all(v in a for v in s)
            )

        def reduce(v, keep, a, d, depth):
            if len(keep) != len(d[v]):
                stats["deleted_values"] += len(d[v]) - len(keep)
                d[v] = keep
                emit("DOMAIN_REDUCED", a, d, depth, variable=v)
            return bool(keep)

        def forward(a, d, depth):
            stats["propagations"] += 1
            for v in d:
                if v in a:
                    continue
                relevant = [
                    i for i in byvar[v] if all(w == v or w in a for w in scopes[i])
                ]
                keep = [x for x in d[v] if all(test(i, {**a, v: x}) for i in relevant)]
                if not reduce(v, keep, a, d, depth):
                    return False
            return True

        def mac(a, d, depth):
            pairs = {}
            for i, s in enumerate(scopes):
                if len(s) == 2:
                    x, y = s
                    pairs.setdefault((x, y), []).append(i)
                    pairs.setdefault((y, x), []).append(i)
            queue = deque(pairs)
            while queue:
                guard()
                x, y = queue.popleft()
                stats["propagations"] += 1
                keep = [
                    u
                    for u in d[x]
                    if any(
                        all(test(i, {x: u, y: v}) for i in pairs[x, y]) for v in d[y]
                    )
                ]
                if len(keep) != len(d[x]):
                    if not reduce(x, keep, a, d, depth):
                        return False
                    queue.extend(
                        (z, x) for z in neighbors[x] if z != y and (z, x) in pairs
                    )
            return True

        def sums(a, d, depth):
            # Bounds are necessary conditions, not generalized arc consistency.
            changed = True
            while changed:
                changed = False
                for c in constraints:
                    if c["type"] != "sum":
                        continue
                    for v in c["vars"]:
                        guard()
                        stats["propagations"] += 1
                        others = [w for w in c["vars"] if w != v]
                        lo = sum(min(d[w]) for w in others)
                        hi = sum(max(d[w]) for w in others)
                        k = c["value"]
                        op = c["op"]

                        def possible(x):
                            l, h = lo + x, hi + x
                            return {
                                "eq": l <= k <= h,
                                "ne": not l == h == k,
                                "lt": l < k,
                                "le": l <= k,
                                "gt": h > k,
                                "ge": h >= k,
                            }[op]

                        keep = [x for x in d[v] if possible(x)]
                        changed |= len(keep) != len(d[v])
                        if not reduce(v, keep, a, d, depth):
                            return False
            return True

        def propagate(a, d, depth):
            if not forward(a, d, depth):
                return False
            if cfg.algorithm == "MAC":
                # Iterate both propagators to a common fixed point.
                while True:
                    before = stats["deleted_values"]
                    if not mac(a, d, depth) or not sums(a, d, depth):
                        return False
                    if stats["deleted_values"] == before:
                        break
            elif not sums(a, d, depth):
                return False
            return True

        def visit(a, d):
            guard()
            depth = len(a)
            stats["max_depth"] = max(stats["max_depth"], depth)
            if not consistent(a):
                emit("CONSTRAINT_FAILED", a, d, depth)
                return
            if any(not x for x in d.values()):
                return
            if len(a) == len(d):
                if not verify(p, a):
                    raise ValueError("Independent solution validation failed")
                solutions.append(dict(a))
                emit("SOLUTION_FOUND", a, d, depth)
                if len(solutions) >= cfg.max_solutions:
                    raise Stop("solution_limit")
                return
            remaining = [v for v in d if v not in a]
            degree = lambda v: len(neighbors[v] - a.keys())
            key = {
                "fixed": lambda v: 0,
                "MRV": lambda v: len(d[v]),
                "Degree": lambda v: -degree(v),
                "Dom/Ddeg": lambda v: len(d[v]) / max(1, degree(v)),
            }[cfg.variable]
            v = min(remaining, key=key)
            emit("SELECT_VARIABLE", a, d, depth, variable=v)
            values = list(d[v])
            if cfg.value == "random":
                rng.shuffle(values)
            if cfg.value == "LCV":

                def cost(x):
                    total = 0
                    for w in neighbors[v] - a.keys():
                        for y in d[w]:
                            partial = {**a, v: x, w: y}
                            total += not all(
                                test(i, partial)
                                for i in byvar[v]
                                if all(z in partial for z in scopes[i])
                            )
                    return total

                values.sort(key=cost)
            for x in values:
                guard()
                if stats["nodes"] >= cfg.max_nodes:
                    raise Stop("node_limit")
                stats["nodes"] += 1
                child = {w: list(vals) for w, vals in d.items()}
                child[v] = [x]
                aa = {**a, v: x}
                emit("TRY_VALUE", aa, child, depth + 1, variable=v, value=x)
                if cfg.algorithm == "BT" or propagate(aa, child, depth + 1):
                    visit(aa, child)
                else:
                    emit("CONSTRAINT_FAILED", aa, child, depth + 1)
                stats["backtracks"] += 1
                emit("BACKTRACK", a, d, depth)

        guard()
        if not any(not d for d in domains.values()):
            # Unary filtering for all algorithms, including the BT baseline.
            for v in domains:
                unary = [i for i in byvar[v] if len(scopes[i]) == 1]
                reduce(
                    v,
                    [x for x in domains[v] if all(test(i, {v: x}) for i in unary)],
                    {},
                    domains,
                    0,
                )
            if not any(not d for d in domains.values()) and (
                cfg.algorithm == "BT" or propagate({}, domains, 0)
            ):
                visit({}, domains)
    except Stop as e:
        reason = str(e)
    except (ValueError, TypeError, KeyError, RecursionError) as e:
        return dict(
            status="ERROR",
            reason=str(e),
            complete=False,
            solutions=[],
            events=events,
            trace_truncated=truncated,
            stats={
                **stats,
                "seconds": time.perf_counter() - started,
                "peak_memory_bytes": None,
            },
        )
    status = "SAT" if solutions else ("UNSAT" if reason == "exhausted" else "UNKNOWN")
    emit("SEARCH_COMPLETED", {}, domains, 0, status=status, reason=reason)
    return dict(
        status=status,
        reason=reason,
        complete=reason == "exhausted",
        solutions=solutions,
        events=events,
        trace_truncated=truncated,
        stats={
            **stats,
            "seconds": time.perf_counter() - started,
            "peak_memory_bytes": None,
        },
    )
