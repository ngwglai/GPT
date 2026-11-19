ORPHANS = frozenset((0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33))


def check_thirteen_orphans(counts: tuple[int, ...], wildcards: int) -> bool:
    if sum(counts) + wildcards != 14:
        return False
    if any(n and i not in ORPHANS for i, n in enumerate(counts)):
        return False
    if any(counts[i] > 2 for i in ORPHANS):
        return False
    missing = sum(counts[i] == 0 for i in ORPHANS)
    duplicates = sum(counts[i] == 2 for i in ORPHANS)
    return duplicates <= 1 and wildcards >= missing and duplicates + wildcards - missing == 1
