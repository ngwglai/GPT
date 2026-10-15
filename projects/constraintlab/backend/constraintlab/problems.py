"""Deterministic built-in problem constructors."""

from .model import parse

SUDOKU9 = (
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
)
HARD9 = (
    "000000010400000000020000000000050407008000300001090000300400200050100000000806000"
)


def builtin(kind="queens", size=8, colors=3, puzzle=None, edges=None):
    ds = {}
    cs = []
    meta = {"kind": kind, "size": size}
    if kind == "queens":
        if type(size) != int or not 1 <= size <= 32:
            raise ValueError("N must be 1..32")
        ds = {f"Q{i}": list(range(size)) for i in range(size)}
        cs = [
            {"type": "queens", "vars": [f"Q{i}", f"Q{j}"], "distance": j - i}
            for i in range(size)
            for j in range(i + 1, size)
        ]
    elif kind == "sudoku":
        if size not in (4, 9):
            raise ValueError("Sudoku size must be 4 or 9")
        puzzle = (
            puzzle
            if puzzle is not None
            else ("1004041001404001" if size == 4 else SUDOKU9)
        )
        if (
            not isinstance(puzzle, str)
            or len(puzzle) != size * size
            or any(c not in "0123456789" or int(c) > size for c in puzzle)
        ):
            raise ValueError("Puzzle needs size² digits (0 = blank)")
        ds = {
            f"r{r}c{c}": (
                [int(puzzle[r * size + c])]
                if puzzle[r * size + c] != "0"
                else list(range(1, size + 1))
            )
            for r in range(size)
            for c in range(size)
        }
        groups = [[f"r{r}c{c}" for c in range(size)] for r in range(size)] + [
            [f"r{r}c{c}" for r in range(size)] for c in range(size)
        ]
        b = 2 if size == 4 else 3
        groups += [
            [f"r{r + i}c{c + j}" for i in range(b) for j in range(b)]
            for r in range(0, size, b)
            for c in range(0, size, b)
        ]
        cs = [{"type": "all_different", "vars": g} for g in groups]
        meta["puzzle"] = puzzle
    elif kind in ("graph", "map"):
        if type(colors) != int or not 1 <= colors <= 12:
            raise ValueError("Colors must be 1..12")
        if kind == "map":
            nodes = ["WA", "NT", "SA", "Q", "NSW", "V", "T"]
            edges = [
                ["WA", "NT"],
                ["WA", "SA"],
                ["NT", "SA"],
                ["NT", "Q"],
                ["SA", "Q"],
                ["SA", "NSW"],
                ["SA", "V"],
                ["Q", "NSW"],
                ["NSW", "V"],
            ]
        else:
            if type(size) != int or not 1 <= size <= 50:
                raise ValueError("Graph size must be 1..50")
            nodes = [str(i) for i in range(size)]
            edges = (
                edges
                if edges is not None
                else [[str(i), str((i + 1) % size)] for i in range(size) if size > 1]
            )
        if not isinstance(edges, list) or any(
            not isinstance(e, list)
            or len(e) != 2
            or e[0] not in nodes
            or e[1] not in nodes
            or e[0] == e[1]
            for e in edges
        ):
            raise ValueError("Invalid graph edges")
        ds = {v: list(range(colors)) for v in nodes}
        cs = [{"type": "compare", "vars": e, "op": "ne"} for e in edges]
        meta["edges"] = edges
    elif kind == "schedule":
        courses = [
            ("Math", "Teacher A", "Room 1"),
            ("Physics", "Teacher A", "Room 2"),
            ("Art", "Teacher B", "Room 1"),
            ("Music", "Teacher C", "Room 2"),
            ("History", "Teacher B", "Room 2"),
        ]
        ds = {x[0]: [0, 1, 2] for x in courses}
        cs = [
            {"type": "compare", "vars": [x[0], y[0]], "op": "ne"}
            for i, x in enumerate(courses)
            for y in courses[i + 1 :]
            if x[1] == y[1] or x[2] == y[2]
        ]
        meta["courses"] = [list(c) for c in courses]
        meta["slots"] = ["09:00", "10:00", "11:00"]
    else:
        raise ValueError("Unknown problem kind")
    return parse(
        {"name": kind.title(), "variables": ds, "constraints": cs, "metadata": meta}
    )
