import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src/index';
import { createServer } from '../src/tools';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { BiliClient, boundedJson, type Fetcher } from '../src/bilibili/client';
import { BiliApi } from '../src/bilibili/api';
import { signWbi } from '../src/bilibili/wbi';
import { apiError } from '../src/errors';

const env: Env = { ALLOWED_ORIGINS: 'https://chatgpt.com,https://chat.openai.com', MCP_ACCESS_TOKEN: 'test-access-token-at-least-32-characters', BILI_SESSDATA: '', BILI_JCT: '', BILI_BUVID3: '', BILI_BACKEND_TOKEN: '', OAUTH_ALLOWED_SUBJECT: '', BILI_TRANSPORT: 'direct', BILI_BACKEND_URL: '', OAUTH_ISSUER: '', OAUTH_RESOURCE: '', OAUTH_JWKS_URL: '' };
const valid = { BILI_SESSDATA: 'fixture-session', BILI_JCT: '0123456789abcdef0123456789abcdef' };
const detail = { aid: 170001, bvid: 'BV17x411w7KC', title: 'Fixture video', owner: { mid: 42, name: '示例作者' }, pubdate: 1700000000, desc: 'description', stat: { view: 123, like: 5 }, pages: [{ page: 1, cid: 99, part: 'P1' }] };
const reply = { rpid_str: '12345678901234567890', root_str: '111', parent_str: '222', ctime: 1700000000, like: 7, content: { message: '<原始>\n评论 & 不做总结' }, member: { uname: '示例用户', mid: '42' } };
const json = (data: unknown, code = 0) => Response.json({ code, data });
function mock(routes: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn<Fetcher>(async (input, init) => routes(new URL(String(input)), init));
}
async function rpc(method: string, params: unknown = {}, fetcher?: Fetcher) {
  const handler = createMcpHandler(() => createServer(env, fetcher), { legacy: 'stateless' });
  const response = await handler.fetch(new Request('https://example.invalid/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  const text = await response.text();
  return JSON.parse(text.startsWith('event:') ? text.split('data: ')[1].split('\n')[0] : text);
}
function req(method = 'POST', body = '{}', token = env.MCP_ACCESS_TOKEN, origin?: string) {
  return new Request('https://example.invalid/mcp', { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(origin ? { Origin: origin } : {}) }, ...(method === 'POST' ? { body } : {}) });
}
afterEach(() => vi.restoreAllMocks());

describe('Worker and MCP security', () => {
  it('health starts without credentials and returns no secrets', async () => {
    const r = await worker.fetch(new Request('https://example.invalid/health'), env);
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ status: 'ok' });
  });
  it.each(['', 'wrong'])('rejects unauthorized token %s', async token => {
    expect((await worker.fetch(req('POST', '{}', token), env)).status).toBe(401);
  });
  it('fails closed if token absent', async () => {
    expect((await worker.fetch(req(), { ...env, MCP_ACCESS_TOKEN: '' })).status).toBe(503);
  });
  it('rejects cross-site origin and query tokens', async () => {
    expect((await worker.fetch(req('POST', '{}', env.MCP_ACCESS_TOKEN, 'https://evil.example'), env)).status).toBe(403);
    expect((await worker.fetch(new Request('https://example.invalid/mcp?token=example'), env)).status).toBe(400);
  });
  it('initializes official Streamable HTTP and discovers all nine tools', async () => {
    const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } });
    expect(initialized.result.serverInfo.name).toBe('bili-observer');
    const data = await rpc('tools/list');
    expect(data.result.tools).toHaveLength(9);
    for (const tool of data.result.tools) {
      const write = ['post_comment', 'reply_comment'].includes(tool.name);
      expect(tool.annotations.readOnlyHint).toBe(!write); expect(tool.annotations.destructiveHint).toBe(write); expect(tool.outputSchema).toBeDefined();
    }
  });
  it('also handles modern protocol discovery', async () => {
    const handler = createMcpHandler(() => createServer(env));
    const r = await handler.fetch(new Request('https://example.invalid/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }) }));
    const body = await r.text(); expect(r.status).toBe(200);
    expect(body).toContain('search_videos');
  });
  it.each([
    ['get_video_info', { video_id: 'https://evil.example' }],
    ['get_comments', { video_id: '170001', page_size: 10000 }],
    ['get_comments', { video_id: '170001', page: -1 }],
    ['post_comment', { video_id: '170001', message: '  ' }],
    ['reply_comment', { video_id: '170001', root_id: '0', message: 'example' }],
    ['search_videos', { keyword: 'x', extra: 'forbidden' }]
  ])('validates %s parameters', async (name, args) => {
    const fetcher = mock(() => { throw Error('must not fetch'); });
    const result = await rpc('tools/call', { name, arguments: args }, fetcher);
    expect(result.error ?? result.result?.isError).toBeTruthy(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects oversized MCP bodies', async () => {
    const r = await worker.fetch(req('POST', JSON.stringify({ text: 'x'.repeat(20000) })), env);
    expect(r.status).toBe(413);
  });
});

describe('Bilibili read operations', () => {
  it('search pagination and structured tool results preserve useful fields', async () => {
    const f = mock(url => { expect(url.searchParams.get('page')).toBe('2'); expect(url.searchParams.get('page_size')).toBe('2'); return json({ numResults: 9, numPages: 5, result: [{ ...detail, title: '<em>Fixture</em>' }] }); });
    const result = await rpc('tools/call', { name: 'search_videos', arguments: { keyword: 'fixture', page: 2, page_size: 2 } }, f);
    expect(result.result.structuredContent).toMatchObject({ ok: true, data: { page: 2, has_more: true, items: [{ title: 'Fixture' }] } });
  });
  it('video detail uses an alternate public endpoint on a recoverable HTTP error', async () => {
    const f = mock(url => url.pathname.includes('/wbi/') ? new Response('', { status: 502 }) : json(detail));
    expect(await new BiliApi(new BiliClient({}, f)).info('BV17x411w7KC')).toMatchObject({ title: 'Fixture video', likes: 5 }); expect(f).toHaveBeenCalledTimes(2);
  });
  it('stops immediately on HTTP 412 instead of probing more endpoints', async () => {
    const f = mock(() => new Response('', { status: 412 }));
    await expect(new BiliApi(new BiliClient({}, f)).info('170001')).rejects.toMatchObject({ code: 'RISK_CONTROL', upstreamCode: 412 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('invokes injected fetch without a receiver, matching Workers native fetch', async () => {
    const f = function(this: unknown) { expect(this).toBeUndefined(); return Promise.resolve(json(detail)); } as Fetcher;
    expect(await new BiliApi(new BiliClient({}, f)).info('170001')).toMatchObject({ title: 'Fixture video' });
  });
  it('public reads do not forward login cookies', async () => {
    const f = mock((_url, init) => { expect(init?.redirect).toBe('manual'); expect(new Headers(init?.headers).get('Cookie')).toBeNull(); return json(detail); });
    await new BiliApi(new BiliClient(valid, f)).info('170001');
  });
  it('user information and user videos support mapped pagination', async () => {
    const f = mock(url => {
      if (url.pathname.endsWith('/nav')) return json({ wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } }, -101);
      if (url.pathname.endsWith('/card')) return json({ card: { mid: '42', name: '示例作者', fans: 5 }, archive_count: 3 });
      expect(url.searchParams.has('w_rid')).toBe(true); return json({ page: { count: 3 }, list: { vlist: [detail] } });
    });
    const api = new BiliApi(new BiliClient({}, f));
    expect(await api.user('42')).toMatchObject({ mid: '42', followers: 5 });
    expect(await api.userVideos('42', 1, 2, 'pubdate')).toMatchObject({ total: 3, has_more: true });
  });
  it('returns raw comments and exact string identifiers without nested overfetch', async () => {
    const f = mock(url => { expect(url.searchParams.get('sort')).toBe('0'); return json({ page: { count: 8 }, replies: [{ ...reply, replies: [reply] }] }); });
    const result = await new BiliApi(new BiliClient({}, f)).comments('170001', 2, 2, 'time');
    expect(result.items).toEqual([{ comment_id: '12345678901234567890', root_id: '111', parent_id: '222', content: '<原始>\n评论 & 不做总结', user_name: '示例用户', user_id: '42', created_at: '2023-11-14T22:13:20.000Z', created_timestamp: 1700000000, likes: 7, reply_count: null }]);
  });
  it('reads a bounded page of replies preserving parent and root', async () => {
    const f = mock(url => { expect(url.searchParams.get('root')).toBe('111'); return json({ root: reply, replies: [reply], page: { count: 10 } }); });
    expect(await new BiliApi(new BiliClient({}, f)).replies('170001', '111', 1, 2)).toMatchObject({ items: [{ root_id: '111', parent_id: '222' }], has_more: true });
  });
  it('paginates a long subtitle, identifies AI tracks, and never sends cookies to CDN', async () => {
    const f = mock((url, init) => {
      if (url.hostname.endsWith('hdslb.com')) { expect(new Headers(init?.headers).get('Cookie')).toBeNull(); return Response.json({ body: Array.from({ length: 1200 }, (_, i) => ({ from: i, to: i + 1, content: `原始字幕 ${i}` })) }); }
      if (url.pathname.endsWith('/view')) return json(detail);
      if (url.pathname.endsWith('/nav')) return json({ wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } }, -101);
      return json({ subtitle: { subtitles: [{ id_str: '22', lan: 'ai-zh', lan_doc: '自动中文字幕', subtitle_url: '//aisubtitle.hdslb.com/fixture.json' }] } });
    });
    const result = await new BiliApi(new BiliClient(valid, f)).subtitles('170001', 1, undefined, 400, 500);
    expect(result).toMatchObject({ status: 'available', next_offset: 900, total_segments: 1200, available_subtitles: [{ ai: true }] });
    expect(result.segments).toHaveLength(500); expect(result.text).toContain('原始字幕 899');
  });
  it('reports no subtitles honestly', async () => {
    const f = mock(url => url.pathname.endsWith('/view') ? json(detail) : url.pathname.endsWith('/nav') ? json({ wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } }, -101) : json({ subtitle: { subtitles: [] } }));
    expect(await new BiliApi(new BiliClient({}, f)).subtitles('170001', 1, undefined, 0, 20)).toMatchObject({ status: 'unavailable', segments: [] });
  });
  it('distinguishes login-required subtitles from no subtitles', async () => {
    const f = mock(url => url.pathname.endsWith('/view') ? json(detail) : url.pathname.endsWith('/nav') ? json({ wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } }, -101) : json({ need_login_subtitle: true, subtitle: { subtitles: [] } }));
    expect(await new BiliApi(new BiliClient({}, f)).subtitles('170001', 1, undefined, 0, 20)).toMatchObject({ status: 'login_required' });
  });
  it.each(['http://aisubtitle.hdslb.com/a', 'https://evil.example/a', 'https://evil.hdslb.com.evil.example/a', 'https://i0.hdslb.com:444/a'])('blocks untrusted subtitle URL %s', async url => {
    const f = mock(() => Response.json({})); await expect(new BiliClient({}, f).subtitle(url)).rejects.toMatchObject({ code: 'UNSAFE_SUBTITLE_URL' }); expect(f).not.toHaveBeenCalled();
  });
  it('bounded JSON rejects oversized payloads', async () => {
    await expect(boundedJson(new Response('a'.repeat(100)), 10)).rejects.toMatchObject({ code: 'UPSTREAM_TOO_LARGE' });
  });
  it('WBI signing matches fixed independently reproducible digest', () => {
    const signed = signWbi({ foo: '114', bar: '514', baz: '1919810' }, 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png', 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png', 1702204169000);
    expect(signed).toBe('bar=514&baz=1919810&foo=114&wts=1702204169&w_rid=6149fdadf571698ca7e6a567265cd0ee');
  });
});

describe('Write safety with mocked upstream only', () => {
  it.each([
    [{}, 'COOKIE_MISSING'],
    [{ BILI_SESSDATA: 'fixture' }, 'CSRF_MISSING'],
    [{ BILI_SESSDATA: 'fixture', BILI_JCT: 'bad' }, 'CSRF_INVALID']
  ])('rejects missing or invalid credentials before network', async (credentials, code) => {
    const f = mock(() => { throw Error('must not send'); }); await expect(new BiliApi(new BiliClient(credentials, f)).write('170001', 'fixture')).rejects.toMatchObject({ code }); expect(f).not.toHaveBeenCalled();
  });
  it('checks login and sends one form with exact caller-supplied message and CSRF', async () => {
    const f = mock((url, init) => {
      if (url.pathname.endsWith('/nav')) return json({ isLogin: true });
      expect(init?.method).toBe('POST');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('message')).toBe('fixture & 文本'); expect(form.get('csrf')).toBe(valid.BILI_JCT); expect(form.has('root')).toBe(false);
      expect(new Headers(init?.headers).get('Cookie')).toContain('SESSDATA=fixture-session'); return json({ rpid_str: '777' });
    });
    expect(await new BiliApi(new BiliClient(valid, f)).write('170001', 'fixture & 文本')).toMatchObject({ status: 'submitted', comment_id: '777' }); expect(f).toHaveBeenCalledTimes(2);
  });
  it('reply verifies root then preserves direct parent', async () => {
    const f = mock((url, init) => {
      if (url.pathname.endsWith('/nav')) return json({ isLogin: true });
      if (url.pathname.endsWith('/reply')) return json({ root: { rpid: 111 } });
      const form = new URLSearchParams(String(init?.body)); expect(form.get('root')).toBe('111'); expect(form.get('parent')).toBe('222'); return json({ rpid: 777 });
    });
    expect(await new BiliApi(new BiliClient(valid, f)).write('170001', 'fixture', '111', '222')).toMatchObject({ parent_id: '222', root_id: '111' }); expect(f).toHaveBeenCalledTimes(3);
  });
  it('expired login never posts', async () => {
    const f = mock(() => json({ isLogin: false }, -101)); await expect(new BiliApi(new BiliClient(valid, f)).write('170001', 'fixture')).rejects.toMatchObject({ code: 'LOGIN_EXPIRED' }); expect(f).toHaveBeenCalledTimes(1);
  });
  it('reports Bilibili CSRF failure without leaking response message', async () => {
    expect(apiError(-111).code).toBe('CSRF_OR_ACCESS_DENIED');
    const f = mock(url => url.pathname.endsWith('/nav') ? json({ isLogin: true }) : Response.json({ code: -111, message: 'do not echo credentials' }));
    await expect(new BiliApi(new BiliClient(valid, f)).write('170001', 'fixture')).rejects.toMatchObject({ code: 'CSRF_OR_ACCESS_DENIED' });
  });
  it('never retries a write with an ambiguous network outcome', async () => {
    const f = mock(url => { if (url.pathname.endsWith('/nav')) return json({ isLogin: true }); throw Error('network failed'); });
    await expect(new BiliApi(new BiliClient(valid, f)).write('170001', 'fixture')).rejects.toMatchObject({ code: 'WRITE_OUTCOME_UNKNOWN' }); expect(f).toHaveBeenCalledTimes(2);
  });
});
