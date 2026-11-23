"""Transport-independent, single-table authoritative state machine.

Use one actor/lock per table in a network adapter. submit() additionally checks
revision and authenticates the seat against a trusted player_id argument.
Never expose state or event_log to a client; only player_view().
"""
from collections import defaultdict
from copy import deepcopy
from dataclasses import asdict
from itertools import combinations, product
import random
import secrets
import time
import uuid

from ..core.action import Action, ActionType as A, IllegalAction
from ..core.event import EventType as E, GameEvent
from ..core.player import PlayerState, Meld, MeldType
from ..core.seat import Seat, next_seat, previous_seat, turn_order
from ..core.state import Discard, GamePhase as P, GameState, RuleConfig, RoundResult
from ..core.tile import Tile, make_deck
from ..core.wall import WallState, WallExhausted, validate_dice
from ..rules.dealer import determine_next_dealer
from ..rules.gold import get_opposite_tile
from ..rules.gang import simulate_gang
from ..rules.response import ResponseResolver
from ..rules.scoring import HuEffect, ScoreEngine
from .visibility import wait_hint
from ..rules.thirteen_orphans import (
    advance_pickup_cycle, check_player_hu, claim_pickup, find_player_waits, orphans_locked, pickup_action,
)
from ..rules.win import WinSolver


class GameEngine:
    def __init__(self, rules: RuleConfig, score_engine: ScoreEngine | None = None,
                 solver: WinSolver | None = None, resolver: ResponseResolver | None = None,
                 clock=time.time):
        self.rules = rules
        self.scoring = score_engine or ScoreEngine()
        self.solver = solver or WinSolver(rules.quad_as_two_pairs)
        self.resolver = resolver or ResponseResolver()
        self.clock = clock
        self.state: GameState | None = None

    def start_round(self, player_ids: dict[Seat, str], dealer: Seat = Seat.EAST,
                    *, seed: int | None = None, dice: tuple[int, int] | None = None,
                    wall_tiles: list[Tile] | None = None, round_id: str | None = None,
                    manual_dice_roll: bool = False) -> GameState:
        """Server-only. seed/dice/wall injection are debug inputs, never client inputs.

        ``manual_dice_roll`` is intended for interactive transports.  The seed still
        deterministically fixes the dice and shuffled wall, but the result is not
        revealed and no tiles are dealt until the dealer submits ROLL_DICE.
        """
        if self.state and self.state.phase != P.ROUND_END:
            raise IllegalAction("previous round is still active")
        if set(player_ids) != set(Seat) or len(set(player_ids.values())) != 4 or any(not isinstance(v, str) or not v for v in player_ids.values()):
            raise ValueError("four unique nonempty player IDs required")
        if not isinstance(dealer, Seat):
            raise ValueError("dealer must be a Seat")
        seed = secrets.randbits(256) if seed is None else seed
        rng = random.Random(seed)
        tiles = make_deck()
        rng.shuffle(tiles)
        rolled = (rng.randint(1, 6), rng.randint(1, 6))
        dice = rolled if dice is None else dice
        validate_dice(dice)
        wall = WallState(list(wall_tiles) if wall_tiles is not None else tiles, dealer, dice)
        self.state = GameState(round_id or uuid.uuid4().hex,
            {s: PlayerState(player_ids[s], s) for s in Seat}, dealer, dealer,
            P.ROLLING_DICE if manual_dice_roll else P.DEALING, wall, *dice,
            get_opposite_tile(wall.get_slot(wall.gold_indicator_position).tile.type_id), seed)
        s = self.state
        self._emit(E.ROUND_STARTED, seed=seed, dealer=int(dealer), rules=asdict(self.rules),
                   wall=[t.instance_id for t in (wall_tiles if wall_tiles is not None else tiles)])
        if not manual_dice_roll:
            self._reveal_dice_and_deal()
        return s

    def _reveal_dice_and_deal(self) -> None:
        """Reveal the already-seeded dice result and perform the initial deal."""
        s = self.state
        if s is None or s.phase not in {P.ROLLING_DICE, P.DEALING}:
            raise IllegalAction("round is not waiting for dice/deal")
        s.phase = P.DEALING
        self._emit(E.DICE_ROLLED, s.dealer, dice=[s.dice1, s.dice2])
        self._emit(E.GOLD_INDICATOR_REVEALED, position=self._position(s.gold_indicator_position),
                   tile=s.gold_indicator_tile.instance_id, gold=s.gold_tile_type)
        order = turn_order(s.dealer)
        for _ in range(3):
            for seat in order:
                for _ in range(4):
                    s.players[seat].concealed_tiles.append(s.wall.draw_normal())
        for seat in order:
            s.players[seat].concealed_tiles.append(s.wall.draw_normal())
        extra = s.wall.draw_normal()
        s.players[s.dealer].concealed_tiles.append(extra)
        s.players[s.dealer].last_drawn_tile = extra
        s.players[s.dealer].last_draw_source = "NORMAL"
        self._emit(E.DEAL_COMPLETED, hands={int(seat): [t.instance_id for t in s.players[seat].concealed_tiles] for seat in Seat})
        # Gold in the initial hand is not resolved specially. The dealer starts
        # the normal action phase and may either discard a non-gold tile or
        # shelve a gold tile. Gold can never be discarded to the river.
        s.phase = P.TURN_ACTION
        self.assert_invariants()

    def _emit(self, event: E, player: Seat | None = None, **payload):
        s = self.state
        s.event_log.append(GameEvent(len(s.event_log) + 1, event, player, payload, self.clock()))

    @staticmethod
    def _position(p):
        return {"side": int(p.side), "column": p.column, "layer": int(p.layer)}

    def _acquire(self, seat: Seat, tile: Tile, source: str, mark_last: bool = True):
        s = self.state
        p = s.players[seat]
        p.concealed_tiles.append(tile)
        if mark_last:
            p.last_drawn_tile, p.last_draw_source = tile, source
        position = next(slot.position for slot in s.wall.slots if slot.tile == tile)
        self._emit(E.TILE_DRAWN, seat, tile=tile.instance_id, source=source, position=self._position(position))

    def _shelve(self, seat: Seat, tile_id: int):
        """Shelving gold consumes the player's normal discard opportunity.

        It does not draw a replacement and does not open a response window;
        play passes directly to the next seat, which draws normally.
        """
        s = self.state
        p = s.players[seat]
        tile = next(t for t in p.concealed_tiles if t.instance_id == tile_id)
        if tile.type_id != s.gold_tile_type:
            raise IllegalAction("only gold may be shelved")
        p.concealed_tiles.remove(tile)
        p.shelf_tiles.append(tile)
        p.has_completed_first_gold_shelf = True
        p.last_drawn_tile = None
        p.last_draw_source = None
        s.current_discard = s.current_discarder = None
        self._emit(E.GOLD_SHELVED, seat, tile=tile_id, shelf_count=p.shelf_count)
        self._draw_for(next_seat(seat))

    def _draw_for(self, seat: Seat):
        s = self.state
        advance_pickup_cycle(s, seat)
        s.current_player = seat
        s.current_discard = s.current_discarder = None
        try:
            tile = s.wall.draw_normal(s.total_gang_count)
        except WallExhausted:
            self._end_draw("normal draw reached reserve")
            return
        self._acquire(seat, tile, "NORMAL")
        s.phase = P.TURN_ACTION

    def _can_hu(self, seat: Seat, extra: Tile | None = None) -> bool:
        s = self.state
        p = s.players[seat]
        if not p.is_declared_ting:
            return False
        tiles = p.concealed_tiles + ([extra] if extra is not None else [])
        if not p.has_completed_first_gold_shelf and (
            any(t.type_id == s.gold_tile_type for t in tiles)
            or any(tile.type_id == s.gold_tile_type for meld in p.melds for tile in meld.tiles)
        ):
            return False
        return bool(check_player_hu(self.solver, p, tiles, s.gold_tile_type))

    def _can_gang(self, action: Action, discard: Tile | None = None, source: Seat | None = None) -> bool:
        s = self.state
        if not s.wall.can_draw_tail():
            return False
        try:
            simulate_gang(s.players[action.seat], action, self.solver, s.gold_tile_type, discard, source)
            return True
        except IllegalAction:
            return False

    def legal_actions(self, seat: Seat) -> list[Action]:
        """Complete concrete intents including physical tile IDs; read-only."""
        s = self.state
        if s is None or s.phase == P.ROUND_END or seat not in s.players:
            return []
        if s.phase == P.ROLLING_DICE:
            return [Action(A.ROLL_DICE, seat)] if seat == s.dealer else []
        if s.phase == P.WAITING_FOR_RESPONSES:
            return list(s.response_options.get(seat, [])) if seat not in s.pending_responses else []
        if s.phase != P.TURN_ACTION or seat != s.current_player:
            return []
        p = s.players[seat]
        actions = []
        if p.last_drawn_tile is not None and self._can_hu(seat):
            actions.append(Action(A.HU, seat))
        discardable = [p.last_drawn_tile] if p.is_declared_ting else p.concealed_tiles
        for tile in discardable:
            if tile is None or tile not in p.concealed_tiles:
                continue
            if tile.type_id == s.gold_tile_type:
                continue
            actions.append(Action(A.DISCARD, seat, (tile.instance_id,)))
            if not p.is_declared_ting:
                remaining = [t for t in p.concealed_tiles if t != tile]
                if find_player_waits(self.solver, p, remaining, s.gold_tile_type):
                    actions.append(Action(A.DECLARE_TING, seat, (tile.instance_id,)))
        if not orphans_locked(p):
            grouped = defaultdict(list)
            for t in p.concealed_tiles:
                grouped[t.type_id].append(t.instance_id)
            for ids in grouped.values():
                if len(ids) == 4:
                    a = Action(A.AN_GANG, seat, tuple(sorted(ids)))
                    if self._can_gang(a):
                        actions.append(a)
            for meld in p.melds:
                if meld.type == MeldType.PENG:
                    for tile_id in grouped[meld.tiles[0].type_id]:
                        a = Action(A.BU_GANG, seat, (tile_id,))
                        if self._can_gang(a):
                            actions.append(a)
        # A gold already kept may be shelved later before ting. After ting,
        # only the actual latest acquired tile may be removed.
        for tile in p.concealed_tiles:
            if tile.type_id == s.gold_tile_type and (not p.is_declared_ting or tile == p.last_drawn_tile):
                actions.append(Action(A.SHELVE_GOLD, seat, (tile.instance_id,)))
        return actions

    def _response_actions(self, seat: Seat, rob: bool = False) -> list[Action]:
        s = self.state
        p, tile, source = s.players[seat], s.current_discard, s.current_discarder
        result = []
        # Gold must never enter the river. If a synthetic/debug state contains
        # such a discard, it is deliberately unclaimable by any response.
        if not rob and tile.type_id == s.gold_tile_type:
            return []
        if self._can_hu(seat, tile):
            result.append(Action(A.HU, seat))
        if rob:
            return result + [Action(A.PASS, seat)] if result else []
        pickup = pickup_action(s, seat)
        if pickup is not None:
            result.append(pickup)
        if orphans_locked(p):
            return result + [Action(A.PASS, seat)] if result else []
        same = sorted(t.instance_id for t in p.concealed_tiles if t.type_id == tile.type_id)
        for ids in combinations(same, 3):
            a = Action(A.MING_GANG, seat, ids)
            if self._can_gang(a, tile, source):
                result.append(a)
        if not p.is_declared_ting:
            result += [Action(A.PENG, seat, ids) for ids in combinations(same, 2)]
            if previous_seat(seat) == source and tile.type_id < 27:
                base = tile.type_id // 9 * 9
                for start in range(max(base, tile.type_id - 2), min(tile.type_id, base + 6) + 1):
                    needed = [t for t in range(start, start + 3) if t != tile.type_id]
                    options = [[t.instance_id for t in p.concealed_tiles if t.type_id == typ] for typ in needed]
                    result += [Action(A.CHI, seat, tuple(sorted(ids))) for ids in product(*options)]
        return result + [Action(A.PASS, seat)] if result else []

    def _open_responses(self, rob: bool = False):
        s = self.state
        s.phase = P.WAITING_FOR_RESPONSES
        s.response_kind = "ROB_BU_GANG" if rob else "DISCARD"
        s.pending_responses = {}
        s.response_options = {}
        for seat in turn_order(s.current_discarder, False):
            choices = self._response_actions(seat, rob)
            if choices:
                s.response_options[seat] = choices
        if not s.response_options:
            self._resolve_responses()

    def submit(self, action: Action, *, expected_revision: int, actor_id: str, expected_round_id: str) -> dict:
        """actor_id must come from authenticated transport, not JSON payload.

        A rejected action has no effects. Revision prevents stale commands.
        Call while holding the table's exclusive lock/actor mailbox.
        """
        s = self.state
        if s is None:
            raise IllegalAction("no active round")
        if not isinstance(action, Action) or not isinstance(action.seat, Seat):
            raise IllegalAction("typed Action and Seat required")
        if not isinstance(action.tile_ids, tuple) or any(type(i) is not int for i in action.tile_ids):
            raise IllegalAction("tile_ids must be a tuple of integers")
        if actor_id != s.players[action.seat].player_id:
            raise IllegalAction("actor does not own this seat")
        if expected_round_id != s.round_id:
            raise IllegalAction("stale round ID")
        if type(expected_revision) is not int or expected_revision != s.revision:
            raise IllegalAction("stale state revision")
        action = Action(action.type, action.seat, tuple(sorted(action.tile_ids)))
        if action not in self.legal_actions(action.seat):
            raise IllegalAction("action is not currently legal")
        backup = deepcopy(s)
        try:
            self._execute(action)
            self.assert_invariants()
            self.state.revision += 1
        except Exception:
            self.state = backup
            raise
        return self.player_view(action.seat)

    def set_orphan_pickup(self, seat: Seat, enabled: bool, *, expected_round_id: str, actor_id: str) -> None:
        """Change a seat's private intent under the same lock used for ordinary actions."""
        s = self.state
        if s is None or expected_round_id != s.round_id:
            raise IllegalAction("stale round ID")
        if not isinstance(seat, Seat) or seat not in s.players or actor_id != s.players[seat].player_id:
            raise IllegalAction("actor does not own this seat")
        if type(enabled) is not bool:
            raise IllegalAction("pickup intent must be a boolean")
        if s.phase not in {P.ROLLING_DICE, P.TURN_ACTION, P.WAITING_FOR_RESPONSES}:
            raise IllegalAction("牌局未在进行中")
        player = s.players[seat]
        if orphans_locked(player):
            raise IllegalAction("十三幺路线已锁定")
        if player.orphan_pickup_enabled == enabled:
            return

        backup = deepcopy(s)
        try:
            player.orphan_pickup_enabled = enabled
            self._refresh_pickup_response(seat, enabled)
        except Exception:
            self.state = backup
            raise

    def _refresh_pickup_response(self, seat: Seat, enabled: bool) -> None:
        s = self.state
        if s.phase != P.WAITING_FOR_RESPONSES or s.response_kind != "DISCARD" or s.current_discarder == seat:
            return
        submitted = s.pending_responses.get(seat)
        if submitted is None:
            choices = self._response_actions(seat)
            if choices:
                s.response_options[seat] = choices
            else:
                s.response_options.pop(seat, None)
        elif submitted.type == A.PICK_ORPHAN and not enabled:
            # Withdrawing an unawarded pickup is a final pass for this discard.
            s.pending_responses[seat] = Action(A.PASS, seat)

        if len(s.pending_responses) == len(s.response_options):
            self._resolve_responses()
            self.assert_invariants()
            s.revision += 1

    def _execute(self, action: Action):
        s = self.state
        if s.phase == P.WAITING_FOR_RESPONSES:
            s.pending_responses[action.seat] = action
            self._emit(E.RESPONSE_SUBMITTED, action.seat, action=action.type.name, tiles=list(action.tile_ids))
            if len(s.pending_responses) == len(s.response_options):
                self._resolve_responses()
            return
        if action.type == A.ROLL_DICE:
            self._reveal_dice_and_deal()
        elif action.type in {A.DISCARD, A.DECLARE_TING}:
            self._discard(action)
        elif action.type == A.HU:
            effects = ()
            if s.players[action.seat].last_draw_source == "GANG":
                effects += (HuEffect.GANG_SHANG_KAI_HUA,)
            if self.rules.enable_hai_di_tag and s.wall.is_normal_draw_exhausted(s.total_gang_count):
                effects += (HuEffect.HAI_DI,)
            self._end_hu(action.seat, None, effects)
        elif action.type in {A.AN_GANG, A.BU_GANG}:
            if action.type == A.BU_GANG and self.rules.allow_rob_bu_gang:
                s.pending_gang = action
                s.current_discard = next(t for t in s.players[action.seat].concealed_tiles if t.instance_id == action.tile_ids[0])
                s.current_discarder = action.seat
                self._emit(E.GANG_PROPOSED, action.seat, kind=action.type.name, tiles=list(action.tile_ids))
                self._open_responses(True)
            else:
                self._commit_gang(action)
        elif action.type == A.SHELVE_GOLD:
            self._shelve(action.seat, action.tile_ids[0])

    def _discard(self, action: Action):
        s = self.state
        p = s.players[action.seat]
        tile = next(t for t in p.concealed_tiles if t.instance_id == action.tile_ids[0])
        p.concealed_tiles.remove(tile)
        if action.type == A.DECLARE_TING:
            # The declaration tile is a special private tile, not a normal river discard.
            # It therefore never becomes current_discard and never opens a response window.
            p.declared_waits = find_player_waits(self.solver, p, p.concealed_tiles, s.gold_tile_type)
            p.current_waits = set(p.declared_waits)
            p.is_declared_ting = True
            p.ting_tile = tile
            p.last_drawn_tile = None
            p.last_draw_source = None
            s.current_discard = s.current_discarder = None
            self._emit(E.TING_DECLARED, action.seat, waits=sorted(p.declared_waits), tile=tile.instance_id)
            self._draw_for(next_seat(action.seat))
            return
        p.last_drawn_tile = None
        p.last_draw_source = None
        s.current_discard, s.current_discarder = tile, action.seat
        s.discards.append(Discard(tile, action.seat))
        self._emit(E.TILE_DISCARDED, action.seat, tile=tile.instance_id, declared_ting=p.is_declared_ting)
        self._open_responses()

    def _resolve_responses(self):
        s = self.state
        source, tile = s.current_discarder, s.current_discard
        selected = self.resolver.resolve(source, s.pending_responses)
        rob = s.response_kind == "ROB_BU_GANG"
        s.response_options = {}
        s.pending_responses = {}
        if selected and selected.type == A.HU:
            self._end_hu(selected.seat, source, (HuEffect.QIANG_GANG_HU,) if rob else ())
        elif rob:
            action = s.pending_gang
            s.pending_gang = None
            self._commit_gang(action)
        elif selected and selected.type == A.PICK_ORPHAN:
            picked = claim_pickup(s, selected)
            self._emit(E.ORPHAN_PICKED, selected.seat, tile=picked.instance_id, source=int(source))
        elif selected and selected.type == A.MING_GANG:
            s.discards[-1].claimed = True
            self._commit_gang(selected, tile, source)
        elif selected:
            p = s.players[selected.seat]
            own = [t for t in p.concealed_tiles if t.instance_id in selected.tile_ids]
            p.concealed_tiles = [t for t in p.concealed_tiles if t.instance_id not in selected.tile_ids]
            kind = MeldType.CHI if selected.type == A.CHI else MeldType.PENG
            p.melds.append(Meld(kind, own + [tile], source))
            p.last_drawn_tile = p.last_draw_source = None
            s.discards[-1].claimed = True
            advance_pickup_cycle(s, selected.seat)
            s.current_player, s.phase = selected.seat, P.TURN_ACTION
            s.current_discard = s.current_discarder = None
            self._emit(E.CHI if kind == MeldType.CHI else E.PENG, selected.seat,
                       tiles=[t.instance_id for t in own + [tile]], source=int(source))
        else:
            self._draw_for(next_seat(source))

    def _commit_gang(self, action: Action, discard: Tile | None = None, source: Seat | None = None):
        s = self.state
        simulation = simulate_gang(s.players[action.seat], action, self.solver, s.gold_tile_type, discard, source)
        s.players[action.seat] = simulation.player
        if simulation.player.is_declared_ting and simulation.before_waits != simulation.after_waits:
            self._emit(E.WAITS_CHANGED, action.seat, before=sorted(simulation.before_waits), after=sorted(simulation.after_waits),
                       added=sorted(simulation.after_waits - simulation.before_waits), action=action.type.name,
                       hand=[t.instance_id for t in simulation.player.concealed_tiles])
        s.total_gang_count += 1
        advance_pickup_cycle(s, action.seat)
        s.current_player, s.phase = action.seat, P.GANG_REPLACEMENT
        s.current_discard = s.current_discarder = None
        s.pending_gang = None
        self._emit(E.GANG, action.seat, kind=action.type.name, tiles=list(action.tile_ids),
                   discard=discard.instance_id if discard else None, total=s.total_gang_count,
                   source=int(source) if source is not None else None)
        tile = s.wall.draw_gang_replacement()
        self._acquire(action.seat, tile, "GANG")
        s.phase = P.TURN_ACTION

    def timeout_responses(self, *, expected_revision: int):
        """Trusted scheduler only. Atomically PASS all unanswered seats."""
        s = self.state
        if s is None or s.phase != P.WAITING_FOR_RESPONSES or expected_revision != s.revision:
            raise IllegalAction("no matching response window")
        backup = deepcopy(s)
        try:
            for seat in s.response_options:
                if seat not in s.pending_responses:
                    s.pending_responses[seat] = Action(A.PASS, seat)
                    self._emit(E.RESPONSE_SUBMITTED, seat, action="PASS", timeout=True)
            self._resolve_responses()
            self.assert_invariants()
            s.revision += 1
        except Exception:
            self.state = backup
            raise

    def _end_hu(self, winner: Seat, source: Seat | None, effects: tuple[HuEffect, ...]):
        s = self.state
        tile = s.current_discard if source is not None else s.players[winner].last_drawn_tile
        p = s.players[winner]
        if source is not None:
            if s.response_kind == "ROB_BU_GANG":
                source_player = s.players[source]
                source_player.concealed_tiles.remove(tile)
                if source_player.last_drawn_tile == tile:
                    source_player.last_drawn_tile = None
            else:
                s.discards[-1].claimed = True
            p.concealed_tiles.append(tile)
        hu = check_player_hu(self.solver, p, p.concealed_tiles, s.gold_tile_type)
        if not hu:
            raise IllegalAction("winning state failed validation")
        settlement = self.scoring.settle(s, winner, source, effects)
        method = "SELF_DRAW" if source is None else ("ROB_GANG" if HuEffect.QIANG_GANG_HU in effects else "DISCARD")
        s.result = RoundResult("HU", winner, source, method,
                               tile, hu.patterns, effects, determine_next_dealer(s.dealer, winner, "HU"), settlement)
        s.phase = P.ROUND_END
        s.pending_gang = None
        self._emit(E.HU, winner, source=int(source) if source is not None else None,
                   tile=tile.instance_id, patterns=list(hu.patterns), effects=[e.name for e in effects])
        self._emit(E.ROUND_SETTLED, status=settlement.status, mode=settlement.mode.name,
                   transfers={int(k): str(v) for k, v in settlement.transfers.items()}, missing=list(settlement.missing))

    def _end_draw(self, reason: str):
        s = self.state
        settlement = self.scoring.settle(s, None, None, ())
        s.result = RoundResult("DRAW", None, None, None, None, (), (), s.dealer, settlement)
        s.phase = P.ROUND_END
        s.pending_responses.clear()
        s.response_options.clear()
        self._emit(E.ROUND_DRAW, reason=reason)
        self._emit(E.ROUND_SETTLED, status=settlement.status, mode=settlement.mode.name, missing=list(settlement.missing))

    def _wall_public_view(self, reveal_break: bool) -> dict:
        """Public geometry only: never expose the types/IDs of undrawn wall tiles."""
        s = self.state
        reserved = set()
        if reveal_break:
            limit = s.wall.normal_limit(s.total_gang_count)
            reserved = {s.wall._order[i] for i in range(limit, 136)}
        normal_cursor = s.wall.normal_draw_cursor if reveal_break else None
        gang_cursor = s.wall.gang_draw_cursor if reveal_break else None
        sides = {}
        for side in Seat:
            columns = []
            for column in range(17):
                layers = {}
                for layer_name, layer_value in (("top", 0), ("bottom", 1)):
                    index = int(side) * 34 + column * 2 + layer_value
                    slot = s.wall.slots[index]
                    layers[layer_name] = {
                        "present": not slot.drawn,
                        "reserved": index in reserved,
                        "indicator": bool(reveal_break and slot.is_gold_indicator),
                        "normal_cursor": bool(normal_cursor is not None and slot.position == normal_cursor),
                        "gang_cursor": bool(gang_cursor is not None and slot.position == gang_cursor),
                    }
                columns.append({"column": column, **layers})
            sides[str(int(side))] = columns
        return {
            "sides": sides,
            "tiles_present": sum(not slot.drawn for slot in s.wall.slots),
            "break_position": self._position(s.wall.original_break_position) if reveal_break else None,
            "draw_cursor": self._position(normal_cursor) if normal_cursor is not None else None,
            "replacement_cursor": self._position(gang_cursor) if gang_cursor is not None else None,
        }

    def _presentation_events(self, viewer: Seat | None = None) -> list[dict]:
        """Sanitized public event stream for UI audio/animation/notifications.

        This deliberately does not mirror event_log payloads.  Private waits,
        concealed hands, physical IDs and the shuffle seed never cross this boundary.
        """
        s = self.state
        result = []
        for event in s.event_log:
            payload = {}
            kind = event.event_type
            raw = event.payload
            if kind == E.ROUND_STARTED:
                payload = {"dealer": int(s.dealer)}
            elif kind == E.DICE_ROLLED:
                payload = {"dice": list(raw.get("dice", ())) }
            elif kind == E.GOLD_INDICATOR_REVEALED:
                payload = {"position": raw.get("position"), "type": s.gold_indicator_tile.type_id, "gold": s.gold_tile_type}
            elif kind == E.DEAL_COMPLETED:
                payload = {}
            elif kind == E.TILE_DRAWN:
                payload = {"source": raw.get("source"), "position": raw.get("position")}
            elif kind == E.TILE_DISCARDED:
                payload = {"tile_type": raw["tile"] // 4, "declared_ting": bool(raw.get("declared_ting"))}
            elif kind == E.ORPHAN_PICKED:
                payload = {"tile_type": raw["tile"] // 4, "source": raw["source"]}
            elif kind in {E.CHI, E.PENG}:
                payload = {"tile_types": [tile_id // 4 for tile_id in raw.get("tiles", ())], "source": raw.get("source")}
            elif kind in {E.GANG, E.GANG_PROPOSED}:
                payload = {"kind": raw.get("kind"), "tile_types": [tile_id // 4 for tile_id in raw.get("tiles", ())]}
                if raw.get("source") is not None:
                    payload["source"] = raw["source"]
                if self.rules.hide_an_gang and raw.get("kind") == "AN_GANG" and event.player != viewer:
                    payload = {"kind": "AN_GANG", "count": len(raw.get("tiles", ()))}
            elif kind == E.GOLD_SHELVED:
                payload = {"tile_type": raw["tile"] // 4, "shelf_count": raw.get("shelf_count")}
            elif kind == E.GOLD_KEPT:
                payload = {}
            elif kind == E.TING_DECLARED:
                payload = {}
            elif kind == E.HU:
                payload = {"source": raw.get("source"), "tile_type": raw["tile"] // 4,
                           "patterns": list(raw.get("patterns", ())), "effects": list(raw.get("effects", ()))}
            elif kind == E.ROUND_DRAW:
                payload = {"reason": raw.get("reason")}
            elif kind == E.ROUND_SETTLED:
                payload = {"status": raw.get("status"), "mode": raw.get("mode")}
            else:
                # RESPONSE_SUBMITTED and WAITS_CHANGED contain timing/private
                # information that presentation code does not need.
                continue
            result.append({
                "id": event.event_id,
                "type": kind.name,
                "player": int(event.player) if event.player is not None else None,
                "payload": payload,
            })
        return result

    def player_view(self, viewer: Seat) -> dict:
        s = self.state
        if s is None or viewer not in s.players:
            raise ValueError("unknown viewer")
        players = {}
        for seat, p in s.players.items():
            data = {"seat": int(seat), "player_id": p.player_id, "concealed_count": len(p.concealed_tiles),
                    "declared_ting": p.is_declared_ting, "shelf_tiles": [t.type_id for t in p.shelf_tiles],
                    "shelf_count": p.shelf_count, "connected": p.connected, "melds": [],
                    "ting_tile": None, "picked_orphans": [t.type_id for t in p.picked_orphans]}
            if p.ting_tile is not None:
                # Never leak the declaration tile's type or physical ID to another seat.
                data["ting_tile"] = ({"id": p.ting_tile.instance_id, "type": p.ting_tile.type_id}
                                     if seat == viewer else {"hidden": True})
            for m in p.melds:
                hidden = self.rules.hide_an_gang and seat != viewer and m.type == MeldType.AN_GANG
                data["melds"].append({"type": m.type.name, "tiles": None if hidden else [t.type_id for t in m.tiles],
                                      "count": len(m.tiles), "source": int(m.source_seat) if m.source_seat is not None else None})
            if seat == viewer:
                data["concealed_tiles"] = [
                    {"id": t.instance_id, "type": t.type_id}
                    for t in p.concealed_tiles
                ]

                data["declared_waits"] = sorted(p.declared_waits)
                data["current_waits"] = sorted(p.current_waits)
                data["has_completed_first_gold_shelf"] = p.has_completed_first_gold_shelf
                data["orphan_pickup_enabled"] = p.orphan_pickup_enabled
                data["last_drawn_tile"] = p.last_drawn_tile.instance_id if p.last_drawn_tile else None
            players[int(seat)] = data
        result = None
        if s.result:
            r = s.result
            result = {"type": r.type, "winner": int(r.winner) if r.winner is not None else None,
                      "source": int(r.source) if r.source is not None else None, "method": r.method,
                      "winning_tile": r.winning_tile.type_id if r.winning_tile else None,
                      "next_dealer": int(r.next_dealer), "patterns": list(r.patterns), "effects": [e.name for e in r.effects],
                      "settlement": {"status": r.settlement.status, "mode": r.settlement.mode.name,
                                     "transfers": {int(k): str(v) for k, v in r.settlement.transfers.items()},
                                     "missing": list(r.settlement.missing)}}
        visible_phase = s.phase.name
        pending_claim = None
        if s.phase == P.WAITING_FOR_RESPONSES:
            pending_claim = {"kind": s.response_kind, "source": int(s.current_discarder), "tile_type": s.current_discard.type_id}
        dice_revealed = s.phase != P.ROLLING_DICE
        wall_view = self._wall_public_view(dice_revealed)
        view = {"round_id": s.round_id, "revision": s.revision, "phase": visible_phase,
                "dealer": int(s.dealer), "current_player": int(s.current_player), "players": players,
                "dice": [s.dice1, s.dice2] if dice_revealed else [None, None],
                "break_wall": int(s.break_wall) if dice_revealed else None,
                "break_column": s.break_column if dice_revealed else None,
                "gold_tile_type": s.gold_tile_type if dice_revealed else None,
                "gold_indicator": ({"position": self._position(s.gold_indicator_position),
                    "type": s.gold_indicator_tile.type_id, "drawn": s.wall.get_slot(s.gold_indicator_position).drawn}
                    if dice_revealed else None),
                "normal_tiles_remaining": s.wall.remaining_normal_count(s.total_gang_count) if dice_revealed else None,
                "reserved_columns": s.wall.get_reserved_columns(s.total_gang_count) if dice_revealed else None,
                "gang_count": s.total_gang_count,
                "wall_view": wall_view,
                "presentation_events": self._presentation_events(viewer),
                "pending_claim": pending_claim,
                "discards": [{"seat": int(d.seat), "type": d.tile.type_id, "claimed": d.claimed} for d in s.discards],
                "legal_actions": [{"type": a.type.name, "tile_ids": list(a.tile_ids)} for a in self.legal_actions(viewer)],
                "result": result}
        players[int(viewer)]["wait_hint"] = wait_hint(view, int(viewer))
        return view

    def assert_invariants(self):
        """Physical conservation gate after every mutation, including debug states."""
        s = self.state
        owned = [slot.tile.instance_id for slot in s.wall.slots if not slot.drawn]
        for p in s.players.values():
            owned += [t.instance_id for t in p.concealed_tiles + p.shelf_tiles + p.picked_orphans]
            if orphans_locked(p) and p.melds:
                raise AssertionError("thirteen orphans pickup route cannot contain melds")
            if p.ting_tile is not None:
                owned.append(p.ting_tile.instance_id)
            owned += [t.instance_id for m in p.melds for t in m.tiles]
            if p.last_drawn_tile is not None and p.last_drawn_tile not in p.concealed_tiles:
                raise AssertionError("last drawn tile not in hand")
            if p.shelf_count and not p.has_completed_first_gold_shelf:
                raise AssertionError("shelf flag inconsistent")
        owned += [d.tile.instance_id for d in s.discards if not d.claimed]
        if len(owned) != 136 or set(owned) != set(range(136)):
            raise AssertionError("physical tiles lost or duplicated")
        if s.strict_hand_sizes and not (s.result and s.result.type == "DRAW"):
            for seat, p in s.players.items():
                has_extra = (
                    (s.phase == P.TURN_ACTION and seat == s.current_player)
                    or (s.phase == P.WAITING_FOR_RESPONSES and s.response_kind == "ROB_BU_GANG" and seat == s.current_discarder)
                    or (s.result is not None and s.result.winner == seat)
                )
                if len(p.concealed_tiles) + len(p.picked_orphans) + 3 * len(p.melds) != 13 + int(has_extra):
                    raise AssertionError(f"wrong structural tile count at seat {seat.name}")
