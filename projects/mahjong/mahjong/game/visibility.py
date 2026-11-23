"""Visibility accounting from a single player's authorized projection."""
from collections import Counter


def visible_remaining(view: dict, seat: int) -> tuple[int, ...]:
    players = view["players"]
    own = players[seat]
    seen = Counter(tile["type"] for tile in own["concealed_tiles"])
    seen.update(discard["type"] for discard in view["discards"] if not discard["claimed"])
    for player in players.values():
        seen.update(player["shelf_tiles"])
        seen.update(player["picked_orphans"])
        for meld in player["melds"]:
            seen.update(meld["tiles"] or ())
        declaration = player["ting_tile"]
        if declaration and "type" in declaration:
            seen[declaration["type"]] += 1

    pending = view["pending_claim"]
    if pending and pending["kind"] == "ROB_BU_GANG" and pending["source"] != seat:
        seen[pending["tile_type"]] += 1
    indicator = view["gold_indicator"]
    if indicator:
        kind = indicator["type"]
        if not indicator["drawn"]:
            seen[kind] += 1
        # Once moved, a known indicator can overlap a public or owned zone.
        # Its last publicly identifiable position no longer proves another copy.
        else:
            seen[kind] = max(seen[kind], 1)
    return tuple(max(0, 4 - seen[kind]) for kind in range(34))


def wait_hint(view: dict, seat: int) -> list[dict]:
    own = view["players"][seat]
    if not own["declared_ting"] or view["phase"] == "ROUND_END":
        return []
    remaining = visible_remaining(view, seat)
    gold = view["gold_tile_type"]
    unshelved_gold = not own["has_completed_first_gold_shelf"]
    holds_gold = any(tile["type"] == gold for tile in own["concealed_tiles"]) or any(
        gold in meld["tiles"] for meld in own["melds"]
    )
    return [{"type": kind, "remaining": remaining[kind],
             "requires_shelf": unshelved_gold and (kind == gold or holds_gold)}
            for kind in own["current_waits"]]
