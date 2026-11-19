def check_seven_pairs(counts: tuple[int, ...], wildcards: int, quad_as_two_pairs: bool = True) -> bool:
    if sum(counts) + wildcards != 14:
        return False
    if not quad_as_two_pairs and any(n > 2 for n in counts):
        return False
    missing = sum(n % 2 for n in counts)
    if missing > wildcards or (wildcards - missing) % 2:
        return False
    if not quad_as_two_pairs:
        return sum(n > 0 for n in counts) + (wildcards - missing) // 2 <= 34
    return True
