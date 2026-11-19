from functools import lru_cache


@lru_cache(maxsize=200_000)
def meldable(counts: tuple[int, ...], wildcards: int) -> bool:
    """Complete search; a sequence may start BELOW the first real tile.

    E.g. 8,9,gold requires considering 7,8,9. Always consuming a real tile
    when available is sufficient: swapping an identical wildcard with it
    preserves any valid partition.
    """
    if wildcards < 0 or (sum(counts) + wildcards) % 3:
        return False
    first = next((i for i, n in enumerate(counts) if n), None)
    if first is None:
        return wildcards % 3 == 0
    used = min(3, counts[first])
    rest = list(counts)
    rest[first] -= used
    if wildcards >= 3 - used and meldable(tuple(rest), wildcards - (3 - used)):
        return True
    if first < 27:
        base = first // 9 * 9
        for start in range(max(base, first - 2), min(first, base + 6) + 1):
            rest = list(counts)
            missing = 0
            for t in range(start, start + 3):
                if rest[t]:
                    rest[t] -= 1
                else:
                    missing += 1
            if missing <= wildcards and meldable(tuple(rest), wildcards - missing):
                return True
    return False
