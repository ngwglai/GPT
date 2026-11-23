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
import secrets
import socket
import time

from aiohttp import web, WSMsgType
from mahjong import Seat, IllegalAction, __version__
from mahjong.game.autoplay import AutoRunner
from web_server import LocalTable, WEB_ROOT

LOG = logging.getLogger(__name__)
ROOM_TTL = 24 * 60 * 60
ROOMS = web.AppKey('rooms', dict)
LOCAL = web.AppKey('local', LocalTable)
LOCAL_LOCK = web.AppKey('local_lock', asyncio.Lock)
LOCAL_AI = web.AppKey('local_ai', AutoRunner)


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
    def __init__(self, code):
        self.code = code
        self.members: dict[str, Member] = {}
        self.host_id = None
        self.table: LocalTable | None = None
        self.lock = asyncio.Lock()
        self.ai = None
        self.version = 0
        self.touched = time.monotonic()

    def touch(self):
        self.version += 1
        self.touched = time.monotonic()

    def join(self, name):
        if self.table:
            raise ClientError('牌局已经开始，只能使用原身份重连。')
        if len(self.members) >= 4:
            raise ClientError('房间已满。')
        member = Member(nickname(name))
        self.members[member.token] = member
        if self.host_id is None:
            self.host_id = member.member_id
        self.touch()
        return member

    def authenticate(self, token):
        if not isinstance(token, str) or token not in self.members:
            raise InvalidSession('身份已失效，请重新加入房间。')
        return self.members[token]

    async def publish_ai(self):
        self.touch()
        await self.broadcast()

    def view(self, member):
        roster = [dict(member_id=p.member_id, nickname=p.name, seat=p.seat,
                       connected=p.connected, host=p.member_id == self.host_id)
                  for p in self.members.values()]
        table = None
        if self.table and member.seat is not None:
            # One player's TableService view, never LocalTable.snapshot().
            table = self.table.view_for(Seat(member.seat))
            by_seat = {p.seat: p for p in self.members.values()}
            for seat, player in table['players'].items():
                p = by_seat[seat]
                player.pop('player_id', None)
                player.update(nickname=p.name, connected=p.connected)
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
                'room': {'code': self.code, 'started': self.table is not None,
                         'host_id': self.host_id, 'members': roster},
                'you': {'member_id': member.member_id, 'seat': member.seat},
                'controls': {
                    'can_start': self.table is None and member.member_id == self.host_id and
                                 len(self.members) == 4 and all(p.seat is not None and p.connected for p in self.members.values()),
                    'can_next_round': bool(self.table and member.member_id == self.host_id and
                                           self.table.engine.state.phase.name == 'ROUND_END'),
                    'can_choose_seat': self.table is None,
                }, 'player_view': table}

    def command(self, member, data) -> bool:
        """Return whether this update is shared with all seats."""
        if not isinstance(data, dict):
            raise ClientError('请求必须是 JSON 对象。')
        kind = data.get('type')
        if kind == 'choose_seat':
            fields(data, ('type', 'seat'))
            if self.table:
                raise ClientError('开始后不能换座。')
            seat = data['seat']
            if type(seat) is not int or seat not in range(4):
                raise ClientError('座位必须为东、南、西、北之一。')
            if any(p is not member and p.seat == seat for p in self.members.values()):
                raise ClientError('这个座位已有玩家。')
            member.seat = seat
        elif kind == 'start':
            fields(data, ('type',))
            if not self.view(member)['controls']['can_start']:
                raise ClientError('需要四位玩家在线并入座，由房主开始。')
            self.table = LocalTable()
            self.ai = AutoRunner(self.table, self.lock, self.publish_ai)
        elif kind == 'action':
            fields(data, ('type', 'intent'))
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            self.table.human_act(seat=Seat(member.seat), payload=data['intent'])
        elif kind == 'control':
            fields(data, ('type', 'round_id', 'mode'))
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            self.table.set_control(seat=Seat(member.seat), round_id=data['round_id'], mode=data['mode'])
        elif kind == 'orphan_pickup':
            fields(data, ('type', 'round_id', 'enabled'))
            if not self.table or member.seat is None:
                raise ClientError('牌局尚未开始。')
            revision = self.table.engine.state.revision
            self.table.update_orphan_pickup(seat=Seat(member.seat), round_id=data['round_id'], enabled=data['enabled'])
            if self.table.engine.state.revision == revision:
                return False
        elif kind == 'next_round':
            fields(data, ('type', 'round_id', 'revision'))
            if not self.view(member)['controls']['can_next_round']:
                raise ClientError('本局结束后由房主开始下一局。')
            state = self.table.engine.state
            if type(data['revision']) is not int or data['round_id'] != state.round_id or data['revision'] != state.revision:
                raise ClientError('状态已更新，请根据最新画面重试。')
            self.table.next_round()
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
            await asyncio.wait_for(ws.send_json(payload), timeout=3)
        except (TimeoutError, ConnectionError, RuntimeError):
            # Don't await close while holding the room lock; receiver's finally
            # will remove this socket and broadcast the offline roster.
            asyncio.create_task(ws.close())


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


async def create_room(request):
    data = await request.json()
    fields(data, ('nickname',))
    name = nickname(data['nickname'])
    rooms = request.app[ROOMS]
    if len(rooms) >= 128:
        raise ClientError('临时房间已满，请稍后再试。')
    alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    code = ''.join(secrets.choice(alphabet) for _ in range(6))
    while code in rooms:
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
    room = rooms[code] = Room(code)
    member = room.join(name)
    return web.json_response({'ok': True, 'room_code': code, 'session_token': member.token})


async def join_room(request):
    data = await request.json()
    fields(data, ('nickname', 'room_code'))
    room = room_for(request, data['room_code'])
    async with room.lock:
        member = room.join(data['nickname'])
        await room.broadcast()
    return web.json_response({'ok': True, 'room_code': room.code, 'session_token': member.token})


async def websocket(request):
    room = None
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
            room.touch()
            await room.broadcast()
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                if msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                    break
                continue
            try:
                data = json.loads(msg.data)
                command_id = data.pop('command_id', None) if isinstance(data, dict) else None
                if command_id is not None and (type(command_id) is not int or command_id < 1):
                    raise ClientError('操作编号无效。')
                async with room.lock:
                    # Recheck token: another tab may have explicitly left.
                    room.authenticate(member.token)
                    if isinstance(data, dict) and data.get('type') == 'leave':
                        fields(data, ('type',))
                        peers = tuple(member.sockets)
                        member.sockets.clear()
                        if not room.table:
                            del room.members[member.token]
                        if room.host_id == member.member_id:
                            others = [p for p in room.members.values() if p is not member]
                            if others:
                                room.host_id = next((p.member_id for p in others if p.connected), others[0].member_id)
                            elif not room.table:
                                room.host_id = None
                        room.touch()
                        for peer in peers:
                            await room.send(peer, {'type': 'left', 'resumable': room.table is not None})
                            asyncio.create_task(peer.close())
                        await room.broadcast()
                        break
                    shared = room.command(member, data)
                    await room.broadcast(only=None if shared else member)
                    if command_id is not None:
                        await room.send(ws, {'type': 'command_ack', 'command_id': command_id})
                    if room.ai and any(mode != 'human' for mode in room.table.control.values()):
                        room.ai.kick()
            except (ClientError, IllegalAction, ValueError, TypeError, KeyError) as exc:
                await room.send(ws, {'type': 'error', 'error': str(exc)})
                async with room.lock:
                    if member.token in room.members:
                        await room.send(ws, room.view(member))
    except InvalidSession as exc:
        await Room.send(ws, {'type': 'error', 'error': str(exc), 'invalid_session': True})
    except (ValueError, TypeError, TimeoutError) as exc:
        LOG.info("WebSocket authentication interrupted (%s)", type(exc).__name__)
    finally:
        if member is not None:
            async with room.lock:
                member.sockets.discard(ws)
                room.touch()
                await room.broadcast()
        await ws.close()
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
                if not isinstance(data, dict) or set(data) - {'seed', 'dealer'}:
                    raise ClientError('unexpected fields')
                dealer = data.get('dealer', 0)
                if type(dealer) is not int or dealer not in range(4):
                    raise ClientError('dealer must be 0..3')
                result = table.new_round(seed=seed_value(data.get('seed')), dealer=Seat(dealer))
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
        if request.method == 'POST' and any(mode != 'human' for mode in table.control.values()):
            request.app[LOCAL_AI].kick()
    return web.json_response({'ok': True, 'table': result})


async def static_file(request):
    path = request.match_info.get('path', '') or 'index.html'
    target = (WEB_ROOT / path).resolve()
    if WEB_ROOT.resolve() not in target.parents or not target.is_file():
        raise web.HTTPNotFound()
    if target.suffix not in {'.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.mp3', '.ogg', '.wav'}:
        raise web.HTTPNotFound()
    return web.FileResponse(target)


async def cleanup(app):
    async def prune():
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            for code, room in list(app[ROOMS].items()):
                if now - room.touched > ROOM_TTL and not any(p.connected for p in room.members.values()):
                    if room.ai:
                        await room.ai.close()
                    del app[ROOMS][code]
    task = asyncio.create_task(prune())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


async def shutdown(app):
    await asyncio.gather(app[LOCAL_AI].close(), *(room.ai.close() for room in app[ROOMS].values() if room.ai))
    peers = [ws for room in app[ROOMS].values() for p in room.members.values() for ws in p.sockets]
    await asyncio.gather(*(ws.close(code=1001, message=b'Server shutdown') for ws in peers))


async def health(request):
    return web.json_response({'ok': True, 'version': __version__})


def create_app(seed=None, dealer=Seat.EAST):
    app = web.Application(middlewares=[boundary], client_max_size=8192)
    app[ROOMS] = {}
    app[LOCAL] = LocalTable(seed=seed, dealer=dealer)
    app[LOCAL_LOCK] = asyncio.Lock()
    app[LOCAL_AI] = AutoRunner(app[LOCAL], app[LOCAL_LOCK])
    app.cleanup_ctx.append(cleanup)
    app.on_shutdown.append(shutdown)
    app.router.add_get('/api/health', health)
    app.router.add_post('/api/rooms', create_room)
    app.router.add_post('/api/rooms/join', join_room)
    app.router.add_get('/ws/{code}', websocket)
    app.router.add_get('/api/table', local_api)
    for path in ('new-round', 'next-round', 'action', 'orphan-pickup', 'control', 'timeout-responses'):
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
    web.run_app(create_app(args.seed, Seat(args.dealer)), host=args.host, port=args.port, access_log=None)
