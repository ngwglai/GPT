"""Strict declarative finite-domain model. No executable expressions."""

from dataclasses import dataclass
import itertools

OPS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "lt": lambda a, b: a < b,
    "le": lambda a, b: a <= b,
    "gt": lambda a, b: a > b,
    "ge": lambda a, b: a >= b,
}


def scope(c):
    if c["type"] in ("and", "or"):
        return tuple(
            dict.fromkeys(v for child in c["constraints"] for v in scope(child))
        )
    return tuple(c["vars"])


def evaluate(c, a):
    t = c["type"]
    if t in ("and", "or"):
        return (all if t == "and" else any)(evaluate(x, a) for x in c["constraints"])
    xs = [a[v] for v in c["vars"]]
    if t == "all_different":
        return len(set(xs)) == len(xs)
    if t == "sum":
        return OPS[c["op"]](sum(xs), c["value"])
    if t == "table":
        return xs in c["allowed"]
    if t == "queens":
        return xs[0] != xs[1] and abs(xs[0] - xs[1]) != c["distance"]
    return OPS[c["op"]](xs[0], xs[1] if len(xs) == 2 else c["value"])


@dataclass
class Problem:
    domains: dict
    constraints: list
    name: str = "Custom CSP"
    metadata: dict = None

    def json(self):
        return {
            "name": self.name,
            "variables": self.domains,
            "constraints": self.constraints,
            "metadata": self.metadata or {},
        }


def parse(data):
    if not isinstance(data, dict) or set(data) - {
        "name",
        "variables",
        "constraints",
        "metadata",
    }:
        raise ValueError(
            "Problem must contain variables and constraints; unknown fields are rejected"
        )
    ds, cs = data.get("variables"), data.get("constraints")
    if (
        not isinstance(ds, dict)
        or len(ds) > 150
        or not isinstance(cs, list)
        or len(cs) > 12000
    ):
        raise ValueError(
            "Expected variables object (≤150) and constraints list (≤12000)"
        )
    for v, d in ds.items():
        if (
            not isinstance(v, str)
            or not v
            or len(v) > 80
            or not isinstance(d, list)
            or len(d) > 150
        ):
            raise ValueError("Invalid variable or domain (≤150 values)")
        if any(type(x) != int or abs(x) > 1000000 for x in d) or len(d) != len(set(d)):
            raise ValueError("Domains require unique bounded integers")

    def check(c, depth=0):
        if depth > 8 or not isinstance(c, dict):
            raise ValueError("Invalid constraint nesting")
        t = c.get("type")
        fields = {
            "and": {"constraints"},
            "or": {"constraints"},
            "all_different": {"vars"},
            "sum": {"vars", "op", "value"},
            "compare": {"vars", "op"},
            "table": {"vars", "allowed"},
            "queens": {"vars", "distance"},
        }
        if t not in fields:
            raise ValueError("Unknown constraint type")
        allowed = fields[t] | {"type"} | ({"value"} if t == "compare" else set())
        if set(c) - allowed or not fields[t] <= set(c):
            raise ValueError("Invalid constraint fields")
        if t in ("and", "or"):
            if not isinstance(c["constraints"], list) or len(c["constraints"]) > 100:
                raise ValueError("Invalid composition")
            for x in c["constraints"]:
                check(x, depth + 1)
            return
        vs = c["vars"]
        if (
            not isinstance(vs, list)
            or any(not isinstance(v, str) or v not in ds for v in vs)
            or len(vs) != len(set(vs))
        ):
            raise ValueError("Constraint variables must be distinct known names")
        if t in ("compare", "sum") and c["op"] not in OPS:
            raise ValueError("Unknown comparison")
        if t == "compare" and (
            len(vs) not in (1, 2) or (len(vs) == 1) != ("value" in c)
        ):
            raise ValueError("Comparison arity/value mismatch")
        if "value" in c and (type(c["value"]) != int or abs(c["value"]) > 150000000):
            raise ValueError("Invalid constant")
        if t == "queens" and (
            len(vs) != 2 or type(c["distance"]) != int or c["distance"] < 1
        ):
            raise ValueError("Invalid queen constraint")
        if t == "table" and (
            not isinstance(c["allowed"], list)
            or len(c["allowed"]) > 10000
            or any(
                not isinstance(row, list)
                or len(row) != len(vs)
                or any(type(x) != int for x in row)
                for row in c["allowed"]
            )
        ):
            raise ValueError("Invalid allowed tuples")

    for c in cs:
        check(c)
    if not isinstance(data.get("name", ""), str) or len(data.get("name", "")) > 200:
        raise ValueError("Invalid name")
    meta = data.get("metadata", {})
    if not isinstance(meta, dict):
        raise ValueError("Metadata must be an object")
    kind = meta.get("kind")
    if kind in ("queens", "sudoku"):
        n = meta.get("size")
        if (
            type(n) != int
            or (kind == "queens" and not 1 <= n <= 32)
            or (kind == "sudoku" and n not in (4, 9))
        ):
            raise ValueError("Invalid board display size")
    if kind in ("graph", "map"):
        edges = meta.get("edges", [])
        if (
            not isinstance(edges, list)
            or len(edges) > 12000
            or any(
                not isinstance(e, list)
                or len(e) != 2
                or any(not isinstance(v, str) or v not in ds for v in e)
                for e in edges
            )
        ):
            raise ValueError("Invalid display edges")
    if "slots" in meta and (
        not isinstance(meta["slots"], list)
        or any(not isinstance(x, str) for x in meta["slots"])
    ):
        raise ValueError("Invalid display slots")
    if "courses" in meta and (
        not isinstance(meta["courses"], list)
        or any(
            not isinstance(x, list)
            or len(x) != 3
            or any(not isinstance(v, str) for v in x)
            for x in meta["courses"]
        )
    ):
        raise ValueError("Invalid display courses")
    return Problem(
        {v: list(d) for v, d in ds.items()},
        cs,
        data.get("name", "Custom CSP"),
        data.get("metadata", {}),
    )


def verify(p, a):
    from .validation import valid

    return valid(p, a)


def reference(p):
    """Independent Cartesian enumeration, no search or propagation code."""
    return [
        a
        for values in itertools.product(*p.domains.values())
        if verify(p, a := dict(zip(p.domains, values)))
    ]
