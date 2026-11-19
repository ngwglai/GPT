from .wildcard import meldable


def check_standard(counts: tuple[int, ...], wildcards: int) -> bool:
    if wildcards >= 2 and meldable(counts, wildcards - 2):
        return True
    for t, n in enumerate(counts):
        if not n:
            continue
        used = min(2, n)
        missing = 2 - used
        if missing <= wildcards:
            rest = list(counts)
            rest[t] -= used
            if meldable(tuple(rest), wildcards - missing):
                return True
    return False
