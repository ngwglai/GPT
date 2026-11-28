"""Local-only administration and live TCP registry; no credentials or hands in diagnostics."""
from __future__ import annotations

from collections import deque
import ipaddress
import secrets
import asyncio
import time
from aiohttp import web


class ConnectionRegistry:
    def __init__(self):
        self.entries = {}
        self.protocols = lambda: ()
        self.banned = {}
        self.errors = deque(maxlen=100)
        self.started = time.monotonic()
        self.serial = 0
        self.total = 0
        self.resets = 0

    @staticmethod
    def ip(transport):
        peer = transport.get_extra_info('peername') if transport is not None else None
        return str(peer[0]) if peer else None

    def update(self, transport, **details):
        if transport is None or transport.is_closing():
            return
        row = self.entries.get(transport)
        if row is None:
            self.serial += 1
            self.total += 1
            row = self.entries[transport] = {'id': str(self.serial), 'ip': self.ip(transport),
                'first': time.time(), 'kind': 'tcp', 'path': None, 'room': None, 'member': None}
        row.update(details, last=time.time())

    def error(self, transport, exc):
        self.errors.append({'at': time.time(), 'ip': self.ip(transport),
                            'error': type(exc).__name__, 'code': getattr(exc, 'winerror', None)})

    def prune(self):
        for transport in list(self.entries):
            if transport.is_closing():
                del self.entries[transport]
        for ip, until in list(self.banned.items()):
            if until <= time.monotonic():
                del self.banned[ip]

    def live(self):
        self.prune()
        # Include accepted connections that have not sent a complete HTTP request.
        for protocol in tuple(self.protocols()):
            transport = protocol.transport
            if transport is not None and transport not in self.entries:
                self.update(transport)
        return self.entries

    def blocked(self, transport):
        self.prune()
        return self.ip(transport) in self.banned

    def abort(self, predicate):
        selected = [t for t, row in self.live().items() if predicate(row)]
        for transport in selected:
            transport.abort()
            self.entries.pop(transport, None)
        self.resets += len(selected)
        return len(selected)

    def abort_sockets(self, sockets):
        return self.abort(lambda row: row.get('ws') in sockets)

    def abort_all(self):
        return self.abort(lambda row: True)

    def status(self):
        rows = [{k: v for k, v in row.items() if k != 'ws'} for row in self.live().values()]
        return {'connections': rows, 'banned': [{'ip': ip, 'seconds': max(0, int(until-time.monotonic()))}
                   for ip, until in self.banned.items()],
                'uptime': int(time.monotonic()-self.started), 'total_observed': self.total,
                'reset_connections': self.resets, 'errors': list(self.errors)}


class GameListener:
    """Replace the listening socket and abort old transports, retaining the app."""
    def __init__(self, runner, registry, host, port, site=None):
        self.runner, self.registry, self.host, self.port = runner, registry, host, port
        self.site = site
        self.lock = asyncio.Lock()
        registry.protocols = lambda: runner.server.connections

    async def restart(self):
        async with self.lock:
            if self.site is not None:
                await self.site.stop()
                self.site = None
            count = self.registry.abort_all()
            site = web.TCPSite(self.runner, self.host, self.port)
            await site.start()
            self.site = site
            return count


ADMIN_HTML = """<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>青雀麻将 · 服务器管理</title><link rel="stylesheet" href="/admin.css">
<main><h1>青雀麻将 · 服务器管理</h1>
<p>仅服务器本机可访问。重置连接不会删除牌局；封禁按 IP 作用于所有共享该地址的连接。</p>
<p id="stats"></p><p id="notice" role="status"></p>
<button id="refresh">刷新</button> <button id="restart">重建游戏网络监听</button>
<section><h2>IP 与实时连接</h2><label>IP <input id="ip" placeholder="192.168.1.52"></label>
<button id="resetIp">重置 IP</button> <button id="ban">封禁 10 分钟</button> <button id="unban">解除封禁</button>
<div id="connections"></div><p id="banned"></p></section>
<section><h2>房间</h2><div id="rooms"></div></section>
<section><h2>近期传输异常</h2><pre id="errors"></pre></section>
</main><script src="/admin.js"></script></html>"""
ADMIN_CSS = """*{box-sizing:border-box}body{margin:0;background:#eef4ef;color:#213c34;font:15px system-ui,sans-serif}
main{max-width:1100px;margin:auto;padding:24px}section{background:white;border:1px solid #cbd8cf;border-radius:12px;padding:18px;margin:18px 0}
h1,h2{margin:0 0 12px}button,input{padding:8px 11px;margin:4px;border:1px solid #879f90;border-radius:6px;font:inherit}
button{background:#e7f1eb;color:#203b30;cursor:pointer}button:hover{background:#d1e5d9}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #e0e8e2;padding:8px 0}
.row span{flex:1;min-width:180px;overflow-wrap:anywhere}pre{white-space:pre-wrap}#notice{color:#92542c}"""
ADMIN_JS = r"""'use strict';
const $ = id => document.getElementById(id);
let token = '', busy = false;
const button = (text, fn) => { const b=document.createElement('button'); b.textContent=text; b.onclick=fn; return b; };
const row = (parent,text,buttons=[]) => { const d=document.createElement('div'); d.className='row';
const s=document.createElement('span'); s.textContent=text; d.append(s,...buttons); parent.append(d); };
async function refresh(){
  if(busy)return;
  try{
    const res=await fetch('/api/status',{cache:'no-store'});
    if(!res.ok)throw Error('管理服务不可用');
    const x=await res.json(); token=x.token;
    $('stats').textContent='运行 '+x.uptime+' 秒 | 活跃 TCP '+x.connections.length+' | IP '+new Set(x.connections.map(c=>c.ip)).size+' | WS '+x.connections.filter(c=>c.kind==='ws').length+' | 已观察连接 '+x.total_observed+' | 重置 '+x.reset_connections+' | 房间 '+x.rooms.length;
    $('connections').replaceChildren();
    for(const c of x.connections){
      row($('connections'), '#'+c.id+' · '+c.ip+' · '+c.kind+' · '+(c.path||'未发送请求')+' · '+(c.room||'未加入房间')+' · 最近通信 '+new Date(c.last*1000).toLocaleTimeString(),
        [button('选中 IP',()=>{$('ip').value=c.ip||''}),button('断开连接',()=>act({action:'reset_connection',id:c.id}))]);
    }
    $('banned').textContent='封禁：'+x.banned.map(b=>b.ip+' ('+b.seconds+' 秒)').join('、');
    $('rooms').replaceChildren();
    for(const r of x.rooms){
      row($('rooms'),r.name+' ['+r.code+'] '+r.players+'/4 · '+(r.started?'对局中':'等待中')+(r.paused?' · 暂停':''),
        [button('暂停',()=>act({action:'pause',code:r.code})),button('恢复',()=>act({action:'resume',code:r.code})),
         button('删除',()=>{if(confirm('确定销毁此房间及牌局？'))act({action:'delete',code:r.code});})]);
      for(const m of r.members)row($('rooms'),'　'+m.nickname+' · '+(m.seat==null?'未入座':['东','南','西','北'][m.seat])+' · '+(m.online?'在线':'离线'),
        [button('重置玩家连接',()=>act({action:'reset_member',code:r.code,member_id:m.member_id})),button('释放玩家座位',()=>{if(confirm('确定移除此玩家？'))act({action:'remove',code:r.code,member_id:m.member_id});})]);
    }
    $('errors').textContent=x.errors.map(e=>new Date(e.at*1000).toLocaleTimeString()+' '+e.ip+' '+e.error+' '+(e.code??'')).join('\n');
  }catch(e){$('notice').textContent=e.message;}
}
async function act(data){
  if(busy)return;busy=true;
  try{const res=await fetch('/api/manage',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Token':token},body:JSON.stringify(data)});
    const x=await res.json();if(!res.ok)throw Error(x.error||'操作失败');$('notice').textContent='操作完成'+(x.closed==null?'':'，关闭 '+x.closed+' 条连接');
  }catch(e){$('notice').textContent=e.message;}finally{busy=false;refresh();}
}
$('refresh').onclick=refresh;
$('resetIp').onclick=()=>act({action:'reset_ip',ip:$('ip').value.trim()});
$('ban').onclick=()=>{if(confirm('确定封禁此 IP 10 分钟？'))act({action:'ban',ip:$('ip').value.trim()});};
$('unban').onclick=()=>act({action:'unban',ip:$('ip').value.trim()});
$('restart').onclick=()=>{if(confirm('所有游戏连接将断开并自动重连，保留内存牌局。确定？'))act({action:'restart'});};
refresh();setInterval(refresh,3000);"""


def create_admin_app(registry, rooms, room_action, restart):
    token = secrets.token_urlsafe(32)

    @web.middleware
    async def security(request, handler):
        try:
            local = ipaddress.ip_address(request.remote or '').is_loopback
            port = request.transport.get_extra_info('sockname')[1]
        except (ValueError, TypeError, AttributeError, IndexError):
            local = False
            port = None
        if not local or request.host not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            raise web.HTTPForbidden()
        if request.method == 'POST':
            origin = request.headers.get('Origin')
            supplied = request.headers.get('X-Admin-Token', '')
            if (origin and origin != f'http://{request.host}') or not secrets.compare_digest(supplied, token):
                raise web.HTTPForbidden()
        response = await handler(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; frame-ancestors 'none'"
        return response

    async def status(request):
        return web.json_response({**registry.status(), 'rooms': rooms(), 'token': token})

    async def manage(request):
        try:
            data = await request.json()
            if not isinstance(data, dict):
                raise ValueError('无效请求')
            action = data.get('action')
            closed = None
            if action in ('reset_ip', 'ban', 'unban'):
                ip = str(ipaddress.ip_address(data.get('ip', '')))
                if action == 'unban':
                    registry.banned.pop(ip, None)
                else:
                    if action == 'ban':
                        registry.banned[ip] = time.monotonic() + 600
                    closed = registry.abort(lambda row: row['ip'] == ip)
            elif action == 'reset_connection':
                closed = registry.abort(lambda row: row['id'] == data.get('id'))
            elif action == 'restart':
                closed = await restart()
            elif action in ('remove', 'reset_member', 'pause', 'resume', 'delete'):
                closed = await room_action(data.get('code'), action, data.get('member_id'))
            else:
                raise ValueError('未知操作')
            return web.json_response({'ok': True, 'closed': closed})
        except (ValueError, TypeError, OSError) as exc:
            return web.json_response({'ok': False, 'error': str(exc)}, status=400)

    async def page(request):
        return web.Response(text=ADMIN_HTML, content_type='text/html')

    async def script(request):
        return web.Response(text=ADMIN_JS, content_type='application/javascript')

    async def css(request):
        return web.Response(text=ADMIN_CSS, content_type='text/css')

    app = web.Application(middlewares=[security], client_max_size=8192)
    app.router.add_get('/', page)
    app.router.add_get('/admin.js', script)
    app.router.add_get('/admin.css', css)
    app.router.add_get('/api/status', status)
    app.router.add_post('/api/manage', manage)
    return app
