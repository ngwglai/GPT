"""Real HTTP + WebSocket clients against an ephemeral listening server.

Synthetic rule fixtures stay server-side and are used only to reach rare claims;
all player actions in these tests travel over authenticated WebSockets.
"""
import asyncio
import json
import unittest
from aiohttp import ClientSession, web

from lan_server import create_app, ROOMS, LOCAL
from mahjong import Seat, RuleConfig
from mahjong.core.player import MeldType
from mahjong.game.debug import build_fixture, PlayerFixture
from mahjong.solver.thirteen_orphans import ORPHANS
from web_server import PLAYER_IDS
from tests.helpers import E, S, W, N


class LanTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = create_app(seed=42)
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, '127.0.0.1', 0)
        await self.site.start()
        port = self.site._server.sockets[0].getsockname()[1]
        self.url = f'http://127.0.0.1:{port}'
        self.http = ClientSession()
        self.sockets = []
        self.credentials = []
        self.views = {}

    async def asyncTearDown(self):
        await asyncio.gather(*(ws.close() for ws in self.sockets))
        await self.http.close()
        await self.runner.cleanup()

    async def post(self, path, body, status=200):
        async with self.http.post(self.url + path, json=body) as response:
            self.assertEqual(response.status, status, await response.text())
            return await response.json()

    async def read(self, ws, predicate=lambda m: m.get('type') == 'state'):
        async with asyncio.timeout(15):
            while True:
                data = await ws.receive_json()
                if predicate(data):
                    return data
                if data.get('type') == 'error':
                    self.fail(data)

    async def open_socket(self, credential):
        ws = await self.http.ws_connect(self.url + '/ws/' + credential['room_code'])
        self.sockets.append(ws)
        await ws.send_json({'type': 'authenticate', 'session_token': credential['session_token']})
        return ws

    async def setup_room(self, start=True):
        first = await self.post('/api/rooms', {'nickname': '玩家东'})
        self.code = first['room_code']
        self.room = self.app[ROOMS][self.code]
        self.credentials = [first]
        for i in range(1, 4):
            self.credentials.append(await self.post('/api/rooms/join', {'room_code': self.code, 'nickname': f'玩家{i}'}))
        self.clients = []
        for i, credential in enumerate(self.credentials):
            ws = await self.open_socket(credential)
            self.clients.append(ws)
            await self.read(ws)
            await ws.send_json({'type': 'choose_seat', 'seat': i})
            await self.read(ws, lambda m: m.get('type') == 'state' and m['you']['seat'] == i)
        if start:
            await self.clients[0].send_json({'type': 'start'})
            await self.all_states(lambda m: m['player_view'] is not None)
        else:
            await self.clients[0].send_json({'type': 'sync'})
            await self.all_states(lambda m: all(p['seat'] is not None for p in m['room']['members']))

    async def all_states(self, predicate):
        result = await asyncio.gather(*(self.read(ws, lambda m: m.get('type') == 'state' and predicate(m)) for ws in self.clients))
        self.views = dict(enumerate(result))
        return result

    def intent(self, seat, kind, **extra):
        view = self.views[seat]['player_view']
        action = next(a for a in view['legal_actions'] if a['type'] == kind)
        return {'type': 'action', 'intent': dict(round_id=view['round_id'], revision=view['revision'], **action, **extra)}

    async def act(self, seat, kind):
        command = self.intent(seat, kind)
        revision = command['intent']['revision']
        await self.clients[seat].send_json(command)
        await self.all_states(lambda m: m['player_view']['revision'] == revision + 1)
        return self.views[seat]['player_view']

    async def reject(self, seat, command):
        before = self.room.table.engine.state.revision if self.room.table else None
        await self.clients[seat].send_json(command)
        msg = await self.read(self.clients[seat], lambda m: m.get('type') == 'error')
        self.assertTrue(msg['error'])
        if before is not None:
            self.assertEqual(self.room.table.engine.state.revision, before)
        return msg

    async def fixture(self, players, **kwargs):
        async with self.room.lock:
            build_fixture(self.room.table.engine, players, **kwargs)
            for seat, p in self.room.table.engine.state.players.items():
                p.player_id = PLAYER_IDS[seat]
            self.room.touch()
            version = self.room.version
            await self.room.broadcast()
        await self.all_states(lambda m: m['room_version'] == version)

    def assert_private(self):
        public = []
        for viewer, state in self.views.items():
            view = state['player_view']
            for seat in range(4):
                p = view['players'][str(seat)]
                self.assertEqual(p['concealed_count'], len(self.room.table.engine.state.players[Seat(seat)].concealed_tiles))
                for key in ('concealed_tiles', 'current_waits', 'declared_waits', 'last_drawn_tile'):
                    self.assertEqual(key in p, seat == viewer, (seat, viewer, key))
                if seat != viewer and p['ting_tile']:
                    self.assertEqual(p['ting_tile'], {'hidden': True})
                self.assertEqual(p['picked_orphans'], self.views[0]['player_view']['players'][str(seat)]['picked_orphans'])
            encoded = json.dumps(state)
            for secret in ('shuffle_seed', 'seed', 'test_mode', 'event_log', 'response_options', 'pending_responses', 'session_token'):
                self.assertNotIn('"' + secret + '"', encoded)
            for credential in self.credentials:
                self.assertNotIn(credential['session_token'], encoded)
            wall = json.dumps(view['wall_view'])
            for secret in ('type', 'id', 'tile', 'tile_id', 'instance_id'):
                self.assertNotIn('"' + secret + '"', wall)
            self.assertIsInstance(view['legal_actions'], list)
            public.append({k: view[k] for k in ('round_id', 'revision', 'phase', 'wall_view', 'dice', 'dealer', 'discards', 'result')})
        self.assertTrue(all(p == public[0] for p in public))

    async def test_create_join_seats_and_host_start(self):
        await self.setup_room(start=False)
        self.assertEqual(len(self.code), 6)
        self.assertEqual(len({c['session_token'] for c in self.credentials}), 4)
        await self.post('/api/rooms/join', {'room_code': self.code, 'nickname': '第五人'}, 400)
        await self.reject(1, {'type': 'choose_seat', 'seat': 0})
        await self.reject(1, {'type': 'start'})
        await self.clients[0].send_json({'type': 'start'})
        await self.all_states(lambda m: m['player_view'] is not None)
        self.assertEqual([m['seat'] for m in self.views[0]['room']['members']], [0, 1, 2, 3])
        await self.reject(0, {'type': 'choose_seat', 'seat': 1})
        await self.post('/api/rooms/join', {'room_code': self.code, 'nickname': '新人'}, 400)
        self.assert_private()

    async def test_invalid_session_and_missing_room(self):
        c = await self.post('/api/rooms', {'nickname': '房主'})
        for code in (c['room_code'], 'ZZZZZZ'):
            ws = await self.open_socket({'room_code': code, 'session_token': 'forged'})
            error = await self.read(ws, lambda m: m.get('type') == 'error')
            self.assertTrue(error['invalid_session'])

    async def test_identity_dealer_illegal_stale_and_hidden_data(self):
        await self.setup_room()
        command = self.intent(0, 'ROLL_DICE')
        await self.reject(1, command)
        await self.reject(1, {**command, 'seat': 0})
        await self.reject(1, {'type': 'action', 'intent': {**command['intent'], 'player_id': PLAYER_IDS[E]}})
        await self.reject(0, {'type': 'action', 'intent': {**command['intent'], 'type': 'HU'}})
        before = self.views[0]['player_view']['wall_view']['tiles_present']
        await self.act(0, 'ROLL_DICE')
        self.assertEqual(before, 136)
        self.assertEqual(self.views[0]['player_view']['wall_view']['tiles_present'], 83)
        await self.reject(0, command)
        await self.reject(1, self.intent(0, 'DISCARD'))
        self.assert_private()
        await self.act(0, 'DISCARD')
        self.assert_private()

    async def test_room_and_local_debug_are_isolated(self):
        await self.setup_room()
        await self.act(0, 'ROLL_DICE')
        initial = self.views[0]['player_view']['round_id']
        data = await self.post('/api/new-round', {'seed': '123', 'dealer': 2})
        self.assertTrue(data['table']['test_mode']['all_hands_open'])
        self.assertNotEqual(data['table']['round_id'], initial)
        self.assertEqual(self.room.table.engine.state.round_id, initial)
        self.assertIsNot(self.room.table, self.app[LOCAL])
        await self.reject(0, {'type': 'timeout-responses'})
        await self.reject(0, {'type': 'start', 'seed': 42})

    async def test_disconnect_refresh_and_multiple_tabs(self):
        await self.setup_room()
        await self.act(0, 'ROLL_DICE')
        old = self.views[2]['player_view']
        await self.clients[2].close()
        offline = await self.read(self.clients[0], lambda m: m.get('type') == 'state' and not m['room']['members'][2]['connected'])
        self.assertEqual(offline['player_view']['revision'], old['revision'])
        self.clients[2] = await self.open_socket(self.credentials[2])
        resumed = await self.read(self.clients[2])
        self.assertEqual(resumed['you']['seat'], 2)
        self.assertEqual(resumed['player_view']['round_id'], old['round_id'])
        self.assertEqual(resumed['player_view']['players']['2']['concealed_tiles'], old['players']['2']['concealed_tiles'])
        extra = await self.open_socket(self.credentials[2])
        await self.read(extra)
        await extra.close()
        msg = await self.read(self.clients[0], lambda m: m.get('type') == 'state' and m['room_version'] > resumed['room_version'])
        self.assertTrue(msg['room']['members'][2]['connected'])
        self.assertEqual(self.room.table.engine.state.revision, old['revision'])

    async def test_waiting_leave_frees_seat_revokes_token_and_transfers_host(self):
        await self.setup_room(start=False)
        await self.clients[0].send_json({'type': 'leave'})
        left = await self.read(self.clients[0], lambda m: m.get('type') == 'left')
        self.assertFalse(left['resumable'])
        msg = await self.read(self.clients[1], lambda m: m.get('type') == 'state' and len(m['room']['members']) == 3)
        self.assertEqual(msg['room']['host_id'], msg['you']['member_id'])
        ws = await self.open_socket(self.credentials[0])
        self.assertTrue((await self.read(ws, lambda m: m.get('type') == 'error'))['invalid_session'])
        c = await self.post('/api/rooms/join', {'room_code': self.code, 'nickname': '替补'})
        ws = await self.open_socket(c)
        await self.read(ws)
        await ws.send_json({'type': 'choose_seat', 'seat': 0})
        self.assertEqual((await self.read(ws))['you']['seat'], 0)

    async def test_in_game_leave_reserves_seat_and_can_resume(self):
        await self.setup_room()
        await self.clients[0].send_json({'type': 'leave'})
        msg = await self.read(self.clients[0], lambda m: m.get('type') == 'left')
        self.assertTrue(msg['resumable'])
        other = await self.read(self.clients[1], lambda m: m.get('type') == 'state' and not m['room']['members'][0]['connected'])
        self.assertEqual(other['room']['host_id'], other['you']['member_id'])
        self.clients[0] = await self.open_socket(self.credentials[0])
        msg = await self.read(self.clients[0])
        self.assertEqual(msg['you']['seat'], 0)
        self.assertEqual(msg['player_view']['legal_actions'][0]['type'], 'ROLL_DICE')

    async def test_chi_peng_hu_window_priority_and_stale_response(self):
        await self.setup_room()
        await self.fixture({S: PlayerFixture([0,1]), W: PlayerFixture([2,2]),
                            N: PlayerFixture([3,4,5,9,10,11,18,19,20,27,27,27,2], declared=True)}, gold=33, discard=(E,2))
        self.assertEqual({a['type'] for a in self.views[0]['player_view']['legal_actions']}, set())
        for seat, kind in ((1,'CHI'), (2,'PENG'), (3,'HU')):
            self.assertIn(kind, [a['type'] for a in self.views[seat]['player_view']['legal_actions']])
        stale = self.intent(2, 'PENG')
        await self.act(3, 'HU')
        self.assertEqual(self.views[0]['player_view']['phase'], 'WAITING_FOR_RESPONSES')
        self.assertEqual(self.views[3]['player_view']['legal_actions'], [])
        await self.clients[3].close()
        self.clients[3] = await self.open_socket(self.credentials[3])
        resumed = await self.read(self.clients[3])
        self.assertEqual(resumed['player_view']['legal_actions'], [])
        self.assertEqual(resumed['player_view']['phase'], 'WAITING_FOR_RESPONSES')
        await self.reject(2, stale)
        await self.act(2, 'PENG')
        await self.act(1, 'CHI')
        self.assertEqual(self.views[0]['player_view']['result']['winner'], 3)
        self.assert_private()
        old = self.views[0]['player_view']
        await self.reject(1, {'type': 'next_round', 'round_id': old['round_id'], 'revision': old['revision']})
        await self.clients[0].send_json({'type':'next_round', 'round_id':old['round_id'], 'revision':old['revision']})
        await self.all_states(lambda m: m['player_view']['round_id'] != old['round_id'])
        for seat, msg in self.views.items():
            self.assertEqual(msg['room']['code'], self.code)
            self.assertEqual(msg['you']['seat'], seat)
            self.assertEqual(msg['player_view']['dealer'], 1)
            self.assertEqual(msg['player_view']['match']['round_no'], 2)
        await self.reject(0, {'type':'action', 'intent': {'round_id':old['round_id'], 'revision':0, 'type':'ROLL_DICE', 'tile_ids':[]}})
        await self.act(1, 'ROLL_DICE')
        self.assert_private()

    async def test_ming_gang_and_wall_sync(self):
        await self.setup_room()
        await self.fixture({S:PlayerFixture([0]*3+[9,10,11,18,19,20,27,27,27,31], declared=True)}, gold=33, discard=(E,0))
        before = self.views[0]['player_view']['wall_view']['tiles_present']
        await self.act(1, 'MING_GANG')
        for state in self.views.values():
            self.assertEqual(state['player_view']['gang_count'], 1)
            self.assertEqual(state['player_view']['wall_view']['tiles_present'], before - 1)
        self.assert_private()

    async def test_an_gang_does_not_leak_in_animation_events(self):
        await self.setup_room()
        await self.fixture({E:PlayerFixture([0]*4+[9,10,11,18,19,20,27,27,27,31], declared=True, last_draw_type=0)}, gold=33)
        await self.act(0, 'AN_GANG')
        for seat, state in self.views.items():
            view = state['player_view']
            meld = view['players']['0']['melds'][0]
            event = next(e for e in view['presentation_events'] if e['type'] == 'GANG')
            if seat == 0:
                self.assertEqual(meld['tiles'], [0]*4)
                self.assertEqual(event['payload']['tile_types'], [0]*4)
            else:
                self.assertIsNone(meld['tiles'])
                self.assertNotIn('tile_types', event['payload'])
        self.assert_private()

    async def test_rob_bu_gang_window_and_reconnect_preserves_response(self):
        await self.setup_room()
        self.room.table.engine.rules = RuleConfig(allow_rob_bu_gang=True)
        await self.fixture({E:PlayerFixture([0,1,2,3,4,5,6,7,8,9,9], melds=[(MeldType.PENG,[0]*3,W)], last_draw_type=0),
                            S:PlayerFixture([10,11,12,13,14,15,18,19,20,27,27,27,33], declared=True, shelves=1)}, gold=33)
        await self.act(0, 'BU_GANG')
        self.assertEqual(self.views[1]['player_view']['pending_claim']['kind'], 'ROB_BU_GANG')
        await self.clients[1].close()
        self.clients[1] = await self.open_socket(self.credentials[1])
        self.views[1] = await self.read(self.clients[1])
        self.assertIn('HU', [a['type'] for a in self.views[1]['player_view']['legal_actions']])
        await self.act(1, 'HU')
        self.assertEqual(self.views[0]['player_view']['result']['method'], 'ROB_GANG')
        self.assert_private()

    async def test_ting_tile_and_waits_are_private(self):
        from tests.test_gold import WAIT
        await self.setup_room()
        await self.fixture({E:PlayerFixture(WAIT+[7], last_draw_type=7)}, gold=33)
        await self.act(0, 'DECLARE_TING')
        self.assertIsNotNone(self.views[0]['player_view']['players']['0']['ting_tile'])
        self.assert_private()

    async def test_orphan_pickup_stays_public_through_reconnect_and_win(self):
        await self.setup_room()
        hand = sorted(ORPHANS - {0, 8}) + [27, 1]
        await self.fixture({S: PlayerFixture(hand), W: PlayerFixture([8])}, gold=4, discard=(E, 0))
        walls_before = self.views[0]['player_view']['wall_view']
        await self.act(1, 'PICK_ORPHAN')
        await self.act(2, 'PASS')
        for message in self.views.values():
            view = message['player_view']
            self.assertEqual(view['players']['1']['picked_orphans'], [0])
            self.assertEqual(view['wall_view'], walls_before)
            self.assertEqual(view['discards'], [])
            self.assertEqual(view['current_player'], 1)
        self.assert_private()

        await self.clients[1].close()
        self.clients[1] = await self.open_socket(self.credentials[1])
        self.views[1] = await self.read(self.clients[1])
        self.assertEqual(self.views[1]['player_view']['players']['1']['picked_orphans'], [0])
        await self.act(1, 'DECLARE_TING')
        await self.act(2, 'DISCARD')
        await self.act(1, 'HU')
        for message in self.views.values():
            view = message['player_view']
            self.assertEqual(view['result']['patterns'], ['thirteen_orphans'])
            self.assertEqual(view['players']['1']['picked_orphans'], [0])
        self.assert_private()

    async def test_complete_round_over_four_sockets_and_next_round(self):
        await self.setup_room()
        # A deterministic seed is injected on the server only, never via a route.
        self.room.table.new_round(seed=20260916)
        async with self.room.lock:
            self.room.touch()
            version = self.room.version
            await self.room.broadcast()
        await self.all_states(lambda m: m['room_version'] == version)
        steps = 0
        while self.views[0]['player_view']['phase'] != 'ROUND_END':
            self.assert_private()
            options = [(seat, a) for seat, msg in self.views.items() for a in msg['player_view']['legal_actions']]
            self.assertTrue(options)
            # This is a test driver choosing *only* server-provided intents.
            seat, action = next(((s,a) for s,a in options if a['type'] == 'PASS'), options[0])
            await self.act(seat, action['type'])
            steps += 1
            self.assertLess(steps, 600)
        last = self.views[0]['player_view']
        self.assertEqual(last['result']['type'], 'DRAW')
        self.assert_private()
        self.assertGreater(steps, 50)
        await self.clients[0].send_json({'type':'next_round', 'round_id':last['round_id'], 'revision':last['revision']})
        await self.all_states(lambda m: m['player_view']['round_id'] != last['round_id'])
        for msg in self.views.values():
            self.assertEqual(msg['player_view']['dealer'], last['dealer'])
            self.assertEqual(msg['player_view']['match']['round_no'], 2)
            self.assertEqual(len(msg['room']['members']), 4)
        await self.act(last['dealer'], 'ROLL_DICE')
        self.assert_private()
        print(f'LAN complete round: {steps} authenticated actions, DRAW, next round dealt.')

    async def test_dealer_win_keeps_dealer_on_next_round(self):
        from tests.test_gold import WAIT
        await self.setup_room()
        await self.fixture({E:PlayerFixture(WAIT+[31], declared=True, last_draw_type=31)}, gold=33)
        await self.act(0, 'HU')
        last = self.views[0]['player_view']
        self.assertEqual(last['result']['winner'], 0)
        self.assert_private()
        await self.clients[0].send_json({'type':'next_round', 'round_id':last['round_id'], 'revision':last['revision']})
        await self.all_states(lambda m: m['player_view']['round_id'] != last['round_id'])
        self.assertTrue(all(m['player_view']['dealer'] == 0 for m in self.views.values()))
        self.assert_private()

    async def test_local_debug_denies_remote_clients(self):
        from types import SimpleNamespace
        from lan_server import local_only
        for address in ('192.168.1.20', '10.0.0.3', None):
            with self.assertRaises(web.HTTPForbidden):
                local_only(SimpleNamespace(remote=address))
        local_only(SimpleNamespace(remote='127.0.0.1'))

    async def test_cross_origin_and_server_files_blocked(self):
        async with self.http.post(self.url + '/api/rooms', json={'nickname':'x'}, headers={'Origin':'https://other.example'}) as res:
            self.assertEqual(res.status, 403)
        for path in ('/lan_server.py', '/mahjong/game/engine.py', '/.git/config'):
            async with self.http.get(self.url + path) as res:
                self.assertEqual(res.status, 404)
        await self.post('/api/rooms', {'nickname': ''}, 400)
        await self.post('/api/rooms', {'nickname': 'x', 'seed': 42}, 400)
        async with self.http.get(self.url + '/local.html') as res:
            self.assertEqual(res.status, 200)
            self.assertIn('四家明牌', await res.text())


if __name__ == '__main__':
    unittest.main()
