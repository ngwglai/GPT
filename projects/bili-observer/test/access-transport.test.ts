import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../src/index';
import { verifyOAuth, resourceMetadata } from '../src/oauth';
import { createBiliTransport } from '../src/bilibili/transport';
import { BiliClient, type Fetcher } from '../src/bilibili/client';
import { handleBackend } from '../backend/handler.mjs';
const config = { OAUTH_ISSUER: 'https://issuer.example.com/', OAUTH_RESOURCE: 'https://worker.example.com/mcp', OAUTH_JWKS_URL: 'https://issuer.example.com/jwks', OAUTH_ALLOWED_SUBJECT: 'fixture-owner' };
const base: Env = { ...config, ALLOWED_ORIGINS: '', MCP_ACCESS_TOKEN: 'fixture-owner-token-at-least-32-characters', BILI_SESSDATA: '', BILI_JCT: '', BILI_BUVID3: '', BILI_TRANSPORT: 'direct', BILI_BACKEND_URL: '', BILI_BACKEND_TOKEN: '' };
const pair = await generateKeyPair('ES256');
const jwk = { ...await exportJWK(pair.publicKey), kid: 'fixture-key', alg: 'ES256' };
async function token(changes: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: config.OAUTH_ISSUER, aud: config.OAUTH_RESOURCE, sub: config.OAUTH_ALLOWED_SUBJECT, scope: 'bili:read', iat: now, exp: now + 300, ...changes }).setProtectedHeader({ alg: 'ES256', kid: 'fixture-key' }).sign(pair.privateKey);
}
const keys: Fetcher = vi.fn(async (_input, init) => {
  expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  expect(new Headers(init?.headers).has('Cookie')).toBe(false);
  return Response.json({ keys: [jwk] });
});
afterEach(() => vi.restoreAllMocks());

describe('OAuth resource-server boundary', () => {
  it('publishes metadata only when a complete owner-restricted provider is configured', async () => {
    expect(resourceMetadata({})).toBeNull();
    expect(() => resourceMetadata({ OAUTH_ISSUER: config.OAUTH_ISSUER })).toThrow();
    const response = await worker.fetch(new Request('https://worker.example.com/.well-known/oauth-protected-resource/mcp'), base);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ resource: config.OAUTH_RESOURCE, authorization_servers: [config.OAUTH_ISSUER], scopes_supported: ['bili:read', 'bili:write'] });
  });
  it('validates an owner token while preserving the static-token client', async () => {
    const access = await verifyOAuth(await token(), config, keys);
    expect(access.scopes.has('bili:read')).toBe(true);
    const response = await worker.fetch(new Request('https://worker.example.com/mcp', { method: 'POST', headers: { Authorization: `Bearer ${base.MCP_ACCESS_TOKEN}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }), base);
    expect(response.status).toBe(200); expect(await response.text()).toContain('reply_comment');
  });
  it.each([{ sub: 'someone-else' }, { aud: 'https://other.example.com/mcp' }, { iss: 'https://other.example.com/' }, { exp: 1 }, { scope: 'bili:write' }])('rejects wrong claims %j', async claims => {
    await expect(verifyOAuth(await token(claims), config, keys)).rejects.toThrow();
  });
  it('rejects unsigned/forged tokens', async () => {
    const signed = await token(); const parts = signed.split('.'); parts[1] = btoa(JSON.stringify({ sub: 'fixture-owner', exp: 9999999999 })).replace(/=+$/, '');
    await expect(verifyOAuth(parts.join('.'), config, keys)).rejects.toThrow();
  });
  it('returns an OAuth challenge for unauthorized requests', async () => {
    const response = await worker.fetch(new Request('https://worker.example.com/mcp', { method: 'POST', body: '{}' }), base);
    expect(response.status).toBe(401); expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata="https://worker.example.com/.well-known/oauth-protected-resource"');
  });
  it('passes an OAuth MCP read and blocks a write before any Bili request without write scope', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === config.OAUTH_JWKS_URL) return await keys(input, init);
      return Response.json({ code: 0, data: { aid: 170001, bvid: 'BV17x411w7KC', title: 'Fixture video', pages: [] } });
    });
    const bearer = await token();
    const rpc = async (name: string, args: object) => {
      const response = await worker.fetch(new Request(config.OAUTH_RESOURCE, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), base);
      const raw = await response.text(); return JSON.parse(raw.startsWith('event:') ? raw.split('data: ')[1].split('\n')[0] : raw);
    };
    expect((await rpc('get_video_info', { video_id: '170001' })).result.structuredContent.data.title).toBe('Fixture video');
    upstream.mockClear();
    const write = await rpc('post_comment', { video_id: '170001', message: 'fixture' });
    expect(write.result.structuredContent.error.code).toBe('INSUFFICIENT_SCOPE');
    expect(write.result._meta['mcp/www_authenticate'][0]).toContain('bili:write'); expect(upstream).toHaveBeenCalledTimes(1);
  });
});

describe('Explicit trusted backend adapter', () => {
  const secret = 'fixture-backend-token-at-least-32-characters';
  const target = 'https://api.bilibili.com/x/web-interface/wbi/view?aid=170001';
  it('keeps direct requests direct and requires a complete HTTPS backend opt-in', async () => {
    const direct = vi.fn<Fetcher>(); expect(createBiliTransport({}, direct)).toBe(direct);
    await expect(createBiliTransport({ BILI_TRANSPORT: 'backend', BILI_BACKEND_URL: 'http://localhost/bilibili' }, direct)(target)).rejects.toMatchObject({ code: 'BACKEND_CONFIGURATION' });
    expect(direct).not.toHaveBeenCalled();
  });
  it('routes only to the configured endpoint without putting secrets in URLs', async () => {
    const fetcher = vi.fn<Fetcher>(async (input, init) => {
      expect(String(input)).toBe('https://backend.example.com/bilibili');
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${secret}`);
      expect(JSON.parse(String(init?.body))).toMatchObject({ url: target, method: 'GET' });
      return new Response('{}', { headers: { 'X-Bili-Backend': '1' } });
    });
    await createBiliTransport({ BILI_TRANSPORT: 'backend', BILI_BACKEND_URL: 'https://backend.example.com/bilibili', BILI_BACKEND_TOKEN: secret }, fetcher)(target);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('backend enforces authentication and target allowlists; never forwards Set-Cookie', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { headers: { 'Set-Cookie': 'fixture=never-forward' } }));
    const request = (url: string, auth = secret) => new Request('https://backend.example.com/bilibili', { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: JSON.stringify({ url, method: 'GET', headers: {}, body: null }) });
    expect((await handleBackend(request(target, 'wrong'), secret, fetcher)).status).toBe(401);
    expect((await handleBackend(request('https://other.example.com/'), secret, fetcher)).status).toBe(400);
    expect((await handleBackend(request('https://api.bilibili.com/not-allowed'), secret, fetcher)).status).toBe(400);
    const response = await handleBackend(request(target), secret, fetcher);
    expect(response.headers.has('Set-Cookie')).toBe(false); expect(response.headers.get('X-Bili-Backend')).toBe('1'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not retry or switch egress when a write response is lost', async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response('bad gateway', { status: 502 }));
    const adapter = createBiliTransport({ BILI_TRANSPORT: 'backend', BILI_BACKEND_URL: 'https://backend.example.com/bilibili', BILI_BACKEND_TOKEN: secret }, fetcher);
    await expect(adapter('https://api.bilibili.com/x/v2/reply/add', { method: 'POST', body: 'message=fixture' })).rejects.toMatchObject({ code: 'WRITE_OUTCOME_UNKNOWN' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('treats a direct posting HTTP 5xx as an unknown outcome', async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response('error', { status: 503 }));
    await expect(new BiliClient({ BILI_JCT: '0123456789abcdef0123456789abcdef' }, fetcher).post({ oid: '170001', message: 'fixture' })).rejects.toMatchObject({ code: 'WRITE_OUTCOME_UNKNOWN' }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
