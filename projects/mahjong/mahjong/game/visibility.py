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


def ting_presentation(view, seat, player, solver):
    """Provide wait shapes from the viewer's own tiles and the existing solver."""
    own = view["players"][seat]
    gold = view["gold_tile_type"]
    candidates = {action["tile_ids"][0] for action in view["legal_actions"]
                  if action["type"] == "DECLARE_TING"}
    if not own["wait_hint"] and not candidates:
        return {}

    def patterns(hand, waits):
        types = [tile.type_id for tile in hand + player.picked_orphans]
        return {kind: solver.check_types(types + [kind], player.melds, gold,
                                         thirteen_orphans_only=bool(player.picked_orphans)).patterns
                for kind in waits}

    hand = player.concealed_tiles
    if own["wait_hint"]:
        needed = 13 - 3 * len(player.melds) - len(player.picked_orphans)
        if len(hand) == needed + 1:
            hand = [tile for tile in hand if tile != player.last_drawn_tile]
        return {"wait_patterns": patterns(hand, (entry["type"] for entry in own["wait_hint"]))}

    remaining = visible_remaining(view, seat)
    previews = {}
    for tile in hand:
        if tile.instance_id not in candidates or tile.type_id in previews:
            continue
        after = [other for other in hand if other != tile]
        holds_gold = any(other.type_id == gold for other in after) or any(
            other.type_id == gold for meld in player.melds for other in meld.tiles)
        previews[tile.type_id] = [
            {"type": kind, "remaining": remaining[kind], "patterns": shapes,
             "requires_shelf": not player.has_completed_first_gold_shelf and (holds_gold or kind == gold)}
            for kind, shapes in patterns(after, range(34)).items() if shapes
        ]
    return {"ting_previews": previews}
