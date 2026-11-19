from ..core.player import Meld, MeldType


def valid_meld(meld: Meld) -> bool:
    if not isinstance(meld.type, MeldType):
        return False
    ids = [t.instance_id for t in meld.tiles]
    types = sorted(t.type_id for t in meld.tiles)
    if len(set(ids)) != len(ids):
        return False
    if meld.type == MeldType.CHI:
        return len(types) == 3 and types[0] < 27 and types[0] // 9 == types[-1] // 9 and types == list(range(types[0], types[0] + 3))
    required = 3 if meld.type == MeldType.PENG else 4
    return len(types) == required and len(set(types)) == 1
