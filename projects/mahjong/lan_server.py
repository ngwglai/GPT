"""LAN transport for the existing GameEngine / TableService (no game rules here).

Only Room.view() crosses the network. Credentials never enter player_view.
All room mutations and broadcasts are serialized by the room's asyncio lock.
"""
from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass, field
import ipaddress
import json
import logging
import os
import secrets
import socket
import time

# Windows native TransmitFile/Proactor may fail after a peer resets.
# Set before importing aiohttp, including when another caller imported it first.
if os.name == 'nt':
    os.environ['AIOHTTP_NOSENDFILE'] = '1'

from aiohttp import web, WSMsgType, web_fileresponse

if os.name == 'nt':
    web_fileresponse.NOSENDFILE = True
from network_admin import ConnectionRegistry, GameListener, create_admin_app
from mahjong import Seat, IllegalAction, ScoreConfig, __version__
from mahjong.game.autoplay import AutoRunner
from web_server import LocalTable, WEB_ROOT

LOG = logging.getLogger(__name__)
ROOM_TTL = 24 * 60 * 60
FILE_TIMEOUT = 30
SEND_TIMEOUT = 3
CLOSE_TIMEOUT = 3
ROOMS = web.AppKey('rooms', dict)
LOCAL = web.AppKey('local', LocalTable)
LOCAL_LOCK = web.AppKey('local_lock', asyncio.Lock)
LOCAL_AI = web.AppKey('local_ai', AutoRunner)
NETWORK = web.AppKey('network', ConnectionRegistry)


def peer_io_error(exc):
    return isinstance(exc, (ConnectionError, TimeoutError)) or (
        isinstance(exc, OSError) and getattr(exc, 'winerror', None)
        in {64, 121, 995, 10053, 10054, 10060}
    )


class NetworkFileResponse(web.FileResponse):
    """Keep range/HEAD handling, but bound file preparation and transfer."""
    async def prepare(self, request):
        transport = request.transport
        registry = request.app[NETWORK]
        registry.update(transport, kind='file', path=request.path)
        try:
            return await asyncio.wait_for(super().prepare(request), FILE_TIMEOUT)
        except OSError as exc:
            if not peer_io_error(exc):
                raise
            LOG.info("Static transfer interrupted: peer=%s path=%s error=%s",
                     request.remote, request.path, type(exc).__name__)
            registry.error(transport, exc)
            if transport is not None:
                transport.abort()
            # aiohttp finish_response treats ConnectionError as peer disconnect.
            raise ConnectionResetError("Static transfer interrupted") from exc
        finally:
            registry.update(transport, kind="http")


async def close_socket(ws, *, drain=True, **kwargs):
    try:
        await asyncio.wait_for(ws.close(drain=drain, **kwargs), CLOSE_TIMEOUT)
    except (OSError, RuntimeError):
        LOG.debug("WebSocket close interrupted", exc_info=True)


class ClientError(ValueError):
    pass


class InvalidSession(ClientError):
    pass


def fields(data, required):
    if not isinstance(data, dict) or set(data) != set(required):
        raise ClientError('请求字段不正确，请刷新后重试。')


def nickname(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 20:
        raise ClientError('昵称需要 1–20 个字符。')
    if any(ord(c) < 32 for c in value):
        raise ClientError('昵称不能包含控制字符。')
    return value.strip()


@dataclass
class Member:
    name: str
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    member_id: str = field(default_factory=lambda: secrets.token_hex(8))
    seat: int | None = None
    sockets: set = field(default_factory=set)

    @property
    def connected(self):
        return any(not ws.closed for ws in self.sockets)


class Room:
    def __init__(self, code, base_score=1, name=None, password=''):
        self.code = code
        self.name = name or '麻将房间'
        self.password = password
        self.paused = False
        self.base_score = ScoreConfig(base_score).base_ping_hu
        self.members: dict[str, Member] = {}
        self.host_id = None
        self.table: LocalTable | None = None
        self.lock = asyncio.Lock()
        self.ai = None
        self.ready_seats = set()
        self.version = 0
        self.touched = time.monotonic()

    def touch(self):
        self.version += 1
        self.touched = time.monotonic()

    def join(self, name):
        if len(self.members) >= 4:
            raise ClientError('房间已满。')
        member = Member(nickname(name))
        self.members[member.token] = member
        if self.host_id is None:
            self.host_id = member.member_id
        self.touch()
        return member

    def can_run(self):
        return not self.paused and any(p.connected and p.seat is not None for p in self.members.values())

    def summary(self):
        return {'code': self.code, 'name': self.name, 'base_score': self.base_score,
                'started': self.table is not None, 'paused': self.paused or not self.can_run(),
                'private': bool(self.password), 'players': len(self.members),
                'online': sum(p.connected for p in self.members.values()),
                'vacant': 4 - sum(p.seat is not None for p in self.members.values()),
                'vacant_controls': {int(s): self.table.control[s] for s in Seat if not any(p.seat == int(s) for p in self.members.values())} if self.table else {},
                'ai': sum(mode != 'human' for mode in self.table.control.values()) if self.table else 0}

    def transfer_host(self, member):
        if self.host_id == member.member_id:
            others = [p for p in self.members.values() if p is not member]
            successor = next((p for p in others if p.connected), others[0] if others else None)
            self.host_id = successor.member_id if successor else None

    async def reset_member(self, member, registry):
        peers = tuple(member.sockets)
        member.sockets.clear()
        self.ready_seats.discard(member.seat)
        count = registry.abort_sockets(peers)
        for peer in peers:
            asyncio.create_task(close_socket(peer, drain=False))
        self.touch()
        await self.broadcast()
        return count

    async def release(self, member, *, use_ai=False):
        # Remove authorization BEFORE any await, so a stale socket cannot act.
        if self.members.get(member.token) is not member:
            return
        peers = tuple(member.sockets)
        member.sockets.clear()
        del self.members[member.token]
        self.transfer_host(member)
        if member.seat is not None:
            self.ready_seats.discard(member.seat)
            if self.table:
                seat = Seat(member.seat)
                self.table.set_control(seat=seat, round_id=self.table.engine.state.round_id,
                                       mode='easy' if use_ai else 'human')
                # Invalidate any ticket already computed for the former occupant.
                self.table.control_generation[seat] += 1
        self.touch()
        await asyncio.gather(*(self.send(peer, {'type': 'left', 'resumable': False}) for peer in peers))
        for peer in peers:
            asyncio.create_task(close_socket(peer))
        await self.broadcast()
        if self.ai:
            self.ai.kick()

    def authenticate(self, token):
        if not isinstance(token, str) or token not in self.members:
            raise InvalidSession('身份已失效，请重新加入房间。')
        return self.members[token]

    async def publish_ai(self):
        self.touch()
        await self.broadcast()

    def ready_status(self):
        if not self.table or self.table.engine.state.phase.name != "ROUND_END":
            return set()
        return {int(seat) for seat in Seat if self.table.control[seat] != 'human'} | {
            p.seat for p in self.members.values() if p.seat is not None and p.connected and p.seat in self.ready_seats}

    def advance_if_ready(self):
        if self.can_run() and len(self.ready_status()) == 4 and self.ready_seats:
            self.table.next_round()
            self.ready_seats.clear()

    def view(self, member):
        ready_seats = self.ready_status()
        roster = [dict(member_id=p.member_id, nickname=p.name, seat=p.seat,
                       connected=p.connected, host=p.member_id == self.host_id)
                  for p in self.members.values()]
        table = None
        if self.table and member.seat is not None:
            # One player's TableService view, never LocalTable.snapshot().
            table = self.table.view_for(Seat(member.seat))
            by_seat = {p.seat: p for p in self.members.values()}
            for seat, player in table['players'].items():
                p = by_seat.get(seat)
                player.pop('player_id', None)
                player.update(nickname=p.name if p else ('AI' if self.table.control[Seat(seat)] != 'human' else '空缺'),
                              connected=p.connected if p else False, ready=seat in ready_seats)
            # Match metadata is public; omit all seeds, including historical seeds.
            def record(r):
                return {k: r[k] for k in ('round_no', 'dealer', 'result')} if r else None
            table['match'] = {
                'match_id': self.table.match_id, 'round_no': self.table.round_no,
                'previous_result': record(self.table.previous_result),
                'history': [record(r) for r in self.table.history],
                'scoring': self.table.scoring_view(),
            }
        return {'type': 'state', 'room_version': self.version,
                'room': {**self.summary(), 'host_id': self.host_id, 'members': roster},
                'you': {'member_id': member.member_id, 'seat': member.seat},
                'controls': {
                    'can_start': self.table is None and member.member_id == self.host_id and
                                 len(self.members) == 4 and all(p.seat is not None and p.connected for p in self.members.values()),
                    'can_next_round': bool(self.table and member.seat is not None and
                                           self.table.engine.state.phase.name == 'ROUND_END'),
                    'ready_seats': sorted(ready_seats),
                    'can_choose_seat': self.table is None or member.seat is None,
                    'can_start_ai': self.table is None and member.member_id == self.host_id and
                                    bool(self.members) and all(p.seat is not None and p.connected for p in self.members.values()),
                    'can_manage': member.member_id == self.host_id,
                }, 'player_view': table}

    def command(self, member, data) -> bool:
        """Return whether this update is shared with all seats."""
        if not isinstance(data, dict):
            raise ClientError('请求必须是 JSON 对象。')
        kind = data.get('type')
        if kind == 'choose_seat':
            fields(data, ('type', 'seat'))
            if self.table and member.seat is not None:
                raise ClientError('进行中不能换到另一席；请先释放原座位。')
            seat = data['seat']
            if type(seat) is not int or seat not in range(4):
                raise ClientError('座位必须为东、南、西、北之一。')
            if any(p is not member and p.seat == seat for p in self.members.values()):
                raise ClientError('这个座位已有玩家。')
            member.seat = seat
            if self.table:
                self.table.set_control(seat=Seat(seat), round_id=self.table.engine.state.round_id, mode='human')
                self.table.control_generation[Seat(seat)] += 1
                self.ready_seats.discard(seat)
        elif kind in ('start', 'start_ai'):
            fields(data, ('type',))
            control = 'can_start' if kind == 'start' else 'can_start_ai'
            if not self.view(member)['controls'][control]:
                raise ClientError('需要玩家在线并入座，由房主开始。')
            self.table = LocalTable(base_score=self.base_score)
            occupied = {p.seat for p in self.members.values()}
            for seat in Seat:
                if int(seat) not in occupied:
                    self.table.set_control(seat=seat, round_id=self.table.engine.state.round_id, mode='easy')
            self.ai = AutoRunner(self.table, self.lock, self.publish_ai, can_run=self.can_run)
        elif kind == 'pause':
            fields(data, ('type', 'enabled'))
            if member.member_id != self.host_id or type(data['enabled']) is not bool:
                raise ClientError('仅房主可以暂停或恢复房间。')
            self.paused = data['enabled']
        elif kind == 'vacant_control':
            fields(data, ('type', 'seat', 'mode'))
            seat = data['seat']
            if (member.member_id != self.host_id or not self.table or type(seat) is not int
                    or seat not in range(4) or any(p.seat == seat for p in self.members.values())):
                raise ClientError('仅房主可以管理空缺座位。')
            self.table.set_control(seat=Seat(seat), round_id=self.table.engine.state.round_id, mode=data['mode'])
            self.advance_if_ready()
        elif kind == 'action':
            fields(data, ('type', 'intent'))
            if self.paused:
                raise ClientError('房间已暂停。')
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            self.table.human_act(seat=Seat(member.seat), payload=data['intent'])
        elif kind == 'control':
            fields(data, ('type', 'round_id', 'mode'))
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            self.table.set_control(seat=Seat(member.seat), round_id=data['round_id'], mode=data['mode'])
            self.ready_seats.discard(member.seat)
            self.advance_if_ready()
        elif kind == 'auto_ting':
            fields(data, ('type', 'round_id', 'enabled'))
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            self.table.set_auto_ting(seat=Seat(member.seat), round_id=data['round_id'], enabled=data['enabled'])
            self.touch()
            return False
        elif kind == 'orphan_pickup':
            fields(data, ('type', 'round_id', 'enabled'))
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            revision = self.table.engine.state.revision
            self.table.update_orphan_pickup(seat=Seat(member.seat), round_id=data['round_id'], enabled=data['enabled'])
            if self.table.engine.state.revision == revision:
                return False
        elif kind == 'ready_next_round':
            fields(data, ('type', 'round_id', 'enabled'))
            if not self.view(member)['controls']['can_next_round']:
                raise ClientError('本局结束后才能准备下一局。')
            if data['round_id'] != self.table.engine.state.round_id or type(data['enabled']) is not bool:
                raise ClientError('准备状态已过期或无效。')
            if data['enabled']:
                self.ready_seats.add(member.seat)
            else:
                self.ready_seats.discard(member.seat)
            self.advance_if_ready()
        elif kind == 'sync':
            fields(data, ('type',))
            return True
        else:
            raise ClientError('不支持的操作。')
        self.touch()
        return True

    async def broadcast(self, only: Member | None = None):
        # Serialize messages under lock; bound slow clients so one phone cannot
        # indefinitely block the other seats. No shared all-open payload exists.
        deliveries = []
        recipients = (only,) if only is not None else self.members.values()
        for member in recipients:
            if member.connected:
                payload = self.view(member)
                for ws in tuple(member.sockets):
                    if not ws.closed:
                        deliveries.append(self.send(ws, payload))
        if deliveries:
            await asyncio.gather(*deliveries)

    @staticmethod
    async def send(ws, payload):
        try:
            await asyncio.wait_for(ws.send_json(payload), timeout=SEND_TIMEOUT)
            return True
        except (OSError, RuntimeError) as exc:
            LOG.info("WebSocket send interrupted (%s)", type(exc).__name__)
            # Never await a closing handshake while holding the room lock.
            asyncio.create_task(close_socket(ws, drain=False))
            return False


def room_for(request, code):
    if not isinstance(code, str):
        raise ClientError('请输入房间号。')
    room = request.app[ROOMS].get(code.strip().upper())
    if room is None:
        raise InvalidSession('房间不存在或已过期。')
    return room


def check_origin(request):
    origin = request.headers.get('Origin')
    if origin and origin != f'{request.scheme}://{request.host}':
        raise web.HTTPForbidden(text='拒绝跨站请求')


@web.middleware
async def boundary(request, handler):
    check_origin(request)
    registry = request.app[NETWORK]
    transport = request.transport
    registry.update(transport, kind='http', path=request.path)
    if registry.blocked(transport):
        raise web.HTTPForbidden(text='此地址暂时被管理员限制')
    try:
        response = await handler(request)
    except (ClientError, IllegalAction, ValueError, TypeError, KeyError) as exc:
        response = web.json_response({'ok': False, 'error': str(exc)}, status=400)
    if not isinstance(response, web.WebSocketResponse):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
    return response


async def list_rooms(request):
    rooms = [room.summary() for room in request.app[ROOMS].values() if not room.password]
    return web.json_response({'ok': True, 'rooms': rooms,
                              'online': sum(room['online'] for room in rooms)})


async def reset_player(request):
    data = await request.json()
    fields(data, ('room_code', 'session_token'))
    room = room_for(request, data['room_code'])
    async with room.lock:
        member = room.authenticate(data['session_token'])
        count = await room.reset_member(member, request.app[NETWORK])
    return web.json_response({'ok': True, 'closed': count})


async def create_room(request):
    data = await request.json()
    if not isinstance(data, dict) or 'nickname' not in data or set(data) - {'nickname', 'base_score', 'name', 'password'}:
        raise ClientError('请求字段不正确，请刷新后重试。')
    name = nickname(data['nickname'])
    base_score = ScoreConfig(data.get('base_score', 1)).base_ping_hu
    rooms = request.app[ROOMS]
    if len(rooms) >= 128:
        raise ClientError('临时房间已满，请稍后再试。')
    alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    code = ''.join(secrets.choice(alphabet) for _ in range(6))
    while code in rooms:
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
    title = data.get('name') or '麻将房间'
    password = data.get('password', '')
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 40 or not isinstance(password, str) or len(password) > 64:
        raise ClientError('房间名或密码格式不正确。')
    room = rooms[code] = Room(code, base_score, title.strip(), password)
    member = room.join(name)
    return web.json_response({'ok': True, 'room_code': code, 'session_token': member.token})


async def join_room(request):
    data = await request.json()
    if not isinstance(data, dict) or not {'nickname', 'room_code'} <= set(data) or set(data) - {'nickname', 'room_code', 'password'}:
        raise ClientError('请求字段不正确。')
    room = room_for(request, data['room_code'])
    async with room.lock:
        if request.app[ROOMS].get(room.code) is not room:
            raise InvalidSession('房间已关闭。')
        password = data.get('password', '')
        if not isinstance(password, str) or (room.password and password != room.password):
            raise ClientError('房间密码错误。')
        member = room.join(data['nickname'])
        await room.broadcast()
    return web.json_response({'ok': True, 'room_code': room.code, 'session_token': member.token})


async def websocket(request):
    room = None
    registry = request.app[NETWORK]
    transport = request.transport
    ws = web.WebSocketResponse(heartbeat=10, max_msg_size=8192)
    await ws.prepare(request)
    member = None
    try:
        data = await asyncio.wait_for(ws.receive_json(), timeout=10)
        room = room_for(request, request.match_info['code'])
        fields(data, ('type', 'session_token'))
        if data['type'] != 'authenticate':
            raise ClientError('请先验证身份。')
        async with room.lock:
            member = room.authenticate(data['session_token'])
            member.sockets.add(ws)
            host = next((p for p in room.members.values() if p.member_id == room.host_id), None)
            if host is None or not host.connected:
                room.host_id = member.member_id
            registry.update(transport, kind='ws', room=room.code, member=member.member_id, ws=ws)
            room.touch()
            await room.broadcast()
            if room.ai:
                room.ai.kick()
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                if msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                    break
                continue
            try:
                registry.update(transport)
                data = json.loads(msg.data)
                # Probe the connection without mutating state or replaying commands.
                if data == {'type': 'ping'}:
                    room.authenticate(member.token)
                    if ws not in member.sockets:
                        break
                    if not await room.send(ws, {'type': 'pong'}):
                        break
                    continue
                command_id = data.pop('command_id', None) if isinstance(data, dict) else None
                if command_id is not None and (type(command_id) is not int or command_id < 1):
                    raise ClientError('操作编号无效。')
                async with room.lock:
                    # Recheck token: another tab may have explicitly left.
                    room.authenticate(member.token)
                    if ws not in member.sockets or transport is None or transport.is_closing():
                        break
                    if isinstance(data, dict) and data.get('type') == 'delete_room':
                        fields(data, ('type',))
                        if member.member_id != room.host_id:
                            raise ClientError('仅房主可以删除房间。')
                        room.paused = True
                        request.app[ROOMS].pop(room.code, None)
                        for target in list(room.members.values()):
                            await room.release(target)
                        if room.ai:
                            asyncio.create_task(room.ai.close())
                        break
                    if isinstance(data, dict) and data.get('type') == 'release':
                        fields(data, ('type',))
                        await room.release(member)
                        break
                    if isinstance(data, dict) and data.get('type') == 'remove_member':
                        fields(data, ('type', 'member_id'))
                        if member.member_id != room.host_id:
                            raise ClientError('只有房主可以移除玩家。')
                        target = next((p for p in room.members.values() if p.member_id == data['member_id']), None)
                        if target is None or target is member:
                            raise ClientError('玩家不存在或不能移除自己。')
                        await room.release(target)
                        if command_id is not None:
                            await room.send(ws, {'type': 'command_ack', 'command_id': command_id})
                        continue
                    if isinstance(data, dict) and data.get('type') == 'leave':
                        fields(data, ('type',))
                        peers = tuple(member.sockets)
                        member.sockets.clear()
                        room.ready_seats.discard(member.seat)
                        if not room.table:
                            del room.members[member.token]
                        room.transfer_host(member)
                        if room.host_id is None and room.table:
                            room.host_id = member.member_id
                        room.touch()
                        for peer in peers:
                            await room.send(peer, {'type': 'left', 'resumable': room.table is not None})
                            asyncio.create_task(close_socket(peer))
                        await room.broadcast()
                        break
                    shared = room.command(member, data)
                    await room.broadcast(only=None if shared else member)
                    if command_id is not None:
                        await room.send(ws, {'type': 'command_ack', 'command_id': command_id})
                    if room.ai:
                        room.ai.kick()
            except (ClientError, IllegalAction, ValueError, TypeError, KeyError) as exc:
                if isinstance(exc, InvalidSession):
                    await room.send(ws, {'type': 'error', 'error': str(exc), 'invalid_session': True})
                    break
                await room.send(ws, {'type': 'error', 'error': str(exc)})
                async with room.lock:
                    if member.token in room.members:
                        await room.send(ws, room.view(member))
    except InvalidSession as exc:
        await Room.send(ws, {'type': 'error', 'error': str(exc), 'invalid_session': True})
    except (ValueError, TypeError, TimeoutError) as exc:
        LOG.info("WebSocket interrupted (%s)", type(exc).__name__)
    except OSError as exc:
        if not peer_io_error(exc):
            raise
        registry.error(transport, exc)
        LOG.info("WebSocket peer disconnected: room=%s peer=%s error=%s",
                 room.code if room else '-', request.remote, type(exc).__name__)
    finally:
        try:
            if member is not None:
                async with room.lock:
                    member.sockets.discard(ws)
                    if room.members.get(member.token) is member:
                        if not member.connected:
                            room.ready_seats.discard(member.seat)
                            if member.member_id == room.host_id and any(p.connected for p in room.members.values() if p is not member):
                                room.transfer_host(member)
                        room.touch()
                        await room.broadcast()
        finally:
            registry.update(transport, kind='http', room=None, member=None, ws=None)
            await close_socket(ws)
    return ws


def local_only(request):
    # Debug endpoints belong to an independent LocalTable and are never room APIs.
    try:
        allowed = ipaddress.ip_address(request.remote or '').is_loopback
    except ValueError:
        allowed = False
    if not allowed:
        raise web.HTTPForbidden(text='四家明牌测试仅允许服务器本机访问。')


def seed_value(raw):
    if raw in (None, ''):
        return None
    if type(raw) is int or (isinstance(raw, str) and raw.strip().lstrip('-').isdigit()):
        return int(raw)
    raise ClientError('seed must be an integer or empty')


async def local_api(request):
    local_only(request)
    table = request.app[LOCAL]
    async with request.app[LOCAL_LOCK]:
        if request.method == 'GET' and request.path == '/api/table':
            result = table.snapshot()
        else:
            data = await request.json()
            if request.path == '/api/new-round':
                if not isinstance(data, dict) or set(data) - {'seed', 'dealer', 'base_score'}:
                    raise ClientError('unexpected fields')
                dealer = data.get('dealer', 0)
                if type(dealer) is not int or dealer not in range(4):
                    raise ClientError('dealer must be 0..3')
                base_score = ScoreConfig(data['base_score']).base_ping_hu if 'base_score' in data else None
                result = table.new_round(seed=seed_value(data.get('seed')), dealer=Seat(dealer), base_score=base_score)
            elif request.path == '/api/next-round':
                if not isinstance(data, dict) or set(data) - {'seed'}:
                    raise ClientError('unexpected fields')
                result = table.next_round(seed=seed_value(data.get('seed')))
            elif request.path == '/api/action':
                fields(data, ('seat', 'round_id', 'revision', 'type', 'tile_ids'))
                seat = data.pop('seat')
                if type(seat) is not int or seat not in range(4):
                    raise ClientError('seat must be 0..3')
                result = table.act(seat=Seat(seat), payload=data)
            elif request.path == '/api/orphan-pickup':
                fields(data, ('seat', 'round_id', 'enabled'))
                seat = data['seat']
                if type(seat) is not int or seat not in range(4):
                    raise ClientError('seat must be 0..3')
                result = table.set_orphan_pickup(seat=Seat(seat), round_id=data['round_id'], enabled=data['enabled'])
            elif request.path == '/api/auto-ting':
                fields(data, ('seat', 'round_id', 'enabled'))
                seat = data['seat']
                if type(seat) is not int or seat not in range(4):
                    raise ClientError('seat must be 0..3')
                table.set_auto_ting(seat=Seat(seat), round_id=data['round_id'], enabled=data['enabled'])
                result = table.snapshot()
            elif request.path == '/api/control':
                fields(data, ('seat', 'round_id', 'mode'))
                seat = data['seat']
                if seat is not None and (type(seat) is not int or seat not in range(4)):
                    raise ClientError('seat must be 0..3 or null')
                table.set_control(seat=None if seat is None else Seat(seat), round_id=data['round_id'], mode=data['mode'])
                result = table.snapshot()
            elif request.path == '/api/timeout-responses':
                fields(data, ('round_id', 'revision'))
                result = table.timeout_responses(**data)
            else:
                raise web.HTTPNotFound()
        if request.method == 'POST':
            request.app[LOCAL_AI].kick()
    return web.json_response({'ok': True, 'table': result})


async def static_file(request):
    path = request.match_info.get('path', '') or 'index.html'
    target = (WEB_ROOT / path).resolve()
    if WEB_ROOT.resolve() not in target.parents or not target.is_file():
        raise web.HTTPNotFound()
    if target.suffix not in {'.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.mp3', '.ogg', '.wav'}:
        raise web.HTTPNotFound()
    return NetworkFileResponse(target)


async def cleanup(app):
    async def prune():
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            app[NETWORK].prune()
            for code, room in list(app[ROOMS].items()):
                async with room.lock:
                    expired = now - room.touched > ROOM_TTL and not any(p.connected for p in room.members.values())
                    if expired and app[ROOMS].get(code) is room:
                        del app[ROOMS][code]
                        room.paused = True
                    else:
                        expired = False
                if expired and room.ai:
                    await room.ai.close()
    task = asyncio.create_task(prune())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


async def shutdown(app):
    await asyncio.gather(app[LOCAL_AI].close(), *(room.ai.close() for room in app[ROOMS].values() if room.ai))
    peers = [ws for room in app[ROOMS].values() for p in room.members.values() for ws in p.sockets]
    await asyncio.gather(*(close_socket(ws, code=1001, message=b'Server shutdown') for ws in peers))


async def health(request):
    return web.json_response({'ok': True, 'version': __version__})


def create_app(seed=None, dealer=Seat.EAST):
    app = web.Application(middlewares=[boundary], client_max_size=8192)
    app[ROOMS] = {}
    app[NETWORK] = ConnectionRegistry()
    app[LOCAL] = LocalTable(seed=seed, dealer=dealer)
    app[LOCAL_LOCK] = asyncio.Lock()
    app[LOCAL_AI] = AutoRunner(app[LOCAL], app[LOCAL_LOCK])
    app.cleanup_ctx.append(cleanup)
    app.on_shutdown.append(shutdown)
    app.router.add_get('/api/health', health)
    app.router.add_get('/api/rooms', list_rooms)
    app.router.add_post('/api/rooms', create_room)
    app.router.add_post('/api/connections/reset', reset_player)
    app.router.add_post('/api/rooms/join', join_room)
    app.router.add_get('/ws/{code}', websocket)
    app.router.add_get('/api/table', local_api)
    for path in ('new-round', 'next-round', 'action', 'orphan-pickup', 'auto-ting', 'control', 'timeout-responses'):
        app.router.add_post('/api/' + path, local_api)
    app.router.add_get('/{path:.*}', static_file)
    return app


def run(args):
    import threading
    import webbrowser
    shown_host = '127.0.0.1' if args.host in {'0.0.0.0', '::'} else args.host
    url = f'http://{shown_host}:{args.port}/'
    print(f'麻将 v{__version__} 已启动，本机入口：{url}', flush=True)
    if args.host == '0.0.0.0':
        addresses = set()
        with suppress(OSError):
            addresses.update(socket.gethostbyname_ex(socket.gethostname())[2])
        for address in sorted(addresses):
            if not address.startswith('127.'):
                print(f'局域网地址（请选择同一网络的地址）：http://{address}:{args.port}/', flush=True)
        print('手机连接同一个 Wi-Fi；若地址不通，用 ipconfig 查看电脑 IPv4 地址。', flush=True)
    print('按 Ctrl+C 停止；重启服务器会清除临时房间。', flush=True)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    async def serve():
        app = create_app(args.seed, Seat(args.dealer))
        runner = web.AppRunner(app, access_log=None, keepalive_timeout=30)
        await runner.setup()
        registry = app[NETWORK]
        listener = GameListener(runner, registry, args.host, args.port)
        restart = listener.restart

        async def room_action(code, action, member_id=None):
            room = app[ROOMS].get(code)
            if room is None:
                raise ValueError('房间不存在')
            async with room.lock:
                if action in ('remove', 'reset_member'):
                    target = next((p for p in room.members.values() if p.member_id == member_id), None)
                    if target is None:
                        raise ValueError('玩家不存在')
                    if action == 'reset_member':
                        return await room.reset_member(target, registry)
                    await room.release(target)
                elif action in ('pause', 'resume'):
                    room.paused = action == 'pause'
                    room.touch()
                    await room.broadcast()
                    if room.ai:
                        room.ai.kick()
                elif action == 'delete':
                    room.paused = True
                    del app[ROOMS][code]
                    for member in list(room.members.values()):
                        await room.release(member)
                else:
                    raise ValueError('未知房间操作')
            if action == 'delete' and room.ai:
                await room.ai.close()

        admin_runner = None
        try:
            await restart()
            admin_port = args.admin_port if args.admin_port is not None else args.port + 1
            if admin_port:
                def admin_rooms():
                    return [{**r.summary(), 'members': [
                        {'member_id': p.member_id, 'nickname': p.name, 'seat': p.seat, 'online': p.connected}
                        for p in r.members.values()]} for r in app[ROOMS].values()]
                admin = create_admin_app(registry, admin_rooms, room_action, restart)
                admin_runner = web.AppRunner(admin, access_log=None)
                await admin_runner.setup()
                try:
                    await web.TCPSite(admin_runner, '127.0.0.1', admin_port).start()
                    print(f'服务器管理后台：http://127.0.0.1:{admin_port}/', flush=True)
                except OSError as exc:
                    LOG.warning('管理端口不可用：%s', exc)
            await asyncio.Event().wait()
        finally:
            if admin_runner is not None:
                await admin_runner.cleanup()
            await runner.cleanup()

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
