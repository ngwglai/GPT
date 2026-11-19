from mahjong import *
from mahjong.game.debug import build_fixture, PlayerFixture

E, S, W, N = Seat


def engine(**options):
    return GameEngine(RuleConfig(**options))


def play(e, action):
    return e.submit(action, expected_revision=e.state.revision, actor_id=e.state.players[action.seat].player_id,
                    expected_round_id=e.state.round_id)


def choose(e, seat, kind):
    return next(a for a in e.legal_actions(seat) if a.type == kind)


def has(e, seat, kind):
    return any(a.type == kind for a in e.legal_actions(seat))


def set_next(e, typ, tail=False):
    """Swap two undrawn physical wall tiles without touching ownership."""
    w = e.state.wall
    indices = range(w.tail, w.head - 1, -1) if tail else range(w.head, w.tail + 1)
    target = next(w.slots[w._order[i]] for i in indices if not w.slots[w._order[i]].drawn)
    opposite_position = w.normal_draw_cursor if tail else w.gang_draw_cursor
    candidates = [s for s in w.slots if not s.drawn and s.tile.type_id == typ]
    donor = next((s for s in candidates if s.position != opposite_position), candidates[0])
    target.tile, donor.tile = donor.tile, target.tile
    return target.tile
