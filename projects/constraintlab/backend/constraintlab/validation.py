"""Independent full-assignment semantics for oracle and returned-solution checks.
No dependency on search, propagation, scope expansion or model.evaluate.
"""


def valid(problem, assignment):
    if set(assignment) != set(problem.domains):
        return False
    if any(
        type(assignment[v]) != int or assignment[v] not in values
        for v, values in problem.domains.items()
    ):
        return False

    def relation(a, op, b):
        if op == "eq":
            return a == b
        if op == "ne":
            return a != b
        if op == "lt":
            return a < b
        if op == "le":
            return a <= b
        if op == "gt":
            return a > b
        if op == "ge":
            return a >= b
        return False

    def check(c):
        kind = c["type"]
        if kind == "and":
            return all(check(child) for child in c["constraints"])
        if kind == "or":
            return any(check(child) for child in c["constraints"])
        values = [assignment[v] for v in c["vars"]]
        if kind == "all_different":
            return all(x != y for i, x in enumerate(values) for y in values[i + 1 :])
        if kind == "sum":
            total = 0
            for value in values:
                total += value
            return relation(total, c["op"], c["value"])
        if kind == "table":
            return any(all(x == y for x, y in zip(values, row)) for row in c["allowed"])
        if kind == "queens":
            return values[0] != values[1] and values[0] - values[1] not in (
                c["distance"],
                -c["distance"],
            )
        return relation(
            values[0], c["op"], values[1] if len(values) == 2 else c["value"]
        )

    return all(check(c) for c in problem.constraints)
