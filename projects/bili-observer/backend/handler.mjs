import { createHash, timingSafeEqual } from 'node:crypto';
const API_PATHS = new Set(['/x/web-interface/nav', '/x/web-interface/view', '/x/web-interface/wbi/view', '/x/web-interface/search/type', '/x/web-interface/wbi/search/type', '/x/web-interface/card', '/x/space/wbi/acc/info', '/x/space/wbi/arc/search', '/x/space/arc/search', '/x/player/v2', '/x/player/wbi/v2', '/x/v2/reply', '/x/v2/reply/reply', '/x/v2/reply/add']);
const SAFE_HEADERS = new Set(['user-agent', 'referer', 'accept', 'cookie', 'content-type']);
const digest = value => createHash('sha256').update(value).digest();
const reject = (status, code) => Response.json({ error: code }, { status });

// A private Bilibili-only backend, not a general forward proxy. Importable for local checks.
export async function handleBackend(request, secret, fetcher = fetch) {
  if (!secret || secret.length < 32) return reject(503, 'NOT_CONFIGURED');
  if (!timingSafeEqual(digest(request.headers.get('Authorization') ?? ''), digest(`Bearer ${secret}`))) return reject(401, 'UNAUTHORIZED');
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/bilibili') return reject(404, 'NOT_FOUND');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 32768) return reject(413, 'TOO_LARGE');
  let input, url;
  try {
    input = JSON.parse(raw); url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error();
    const api = url.hostname === 'api.bilibili.com';
    const subtitle = url.hostname === 'aisubtitle.hdslb.com' || url.hostname === 'i0.hdslb.com' || url.hostname === 'i1.hdslb.com' || url.hostname === 'i2.hdslb.com';
    if (!(api && API_PATHS.has(url.pathname)) && !(subtitle && url.pathname.endsWith('.json'))) throw Error();
    if (!['GET', 'POST'].includes(input.method) || (input.method === 'POST') !== (api && url.pathname === '/x/v2/reply/add')) throw Error();
    if (input.method === 'GET' && input.body !== null) throw Error();
    const headers = new Headers(input.headers);
    for (const [key] of headers) if (!SAFE_HEADERS.has(key)) throw Error();
    if (!api && headers.has('Cookie')) throw Error();
    input.headers = headers;
  } catch { return reject(400, 'INVALID_TARGET'); }
  try {
    const response = await fetcher(url, { method: input.method, headers: input.headers, body: input.body, redirect: 'manual', signal: AbortSignal.timeout(11000) });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return reject(502, 'REDIRECT_REJECTED'); }
    const headers = new Headers({ 'X-Bili-Backend': '1', 'Cache-Control': 'no-store', 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' });
    // Never forward Set-Cookie, Authorization, or other upstream response headers.
    return new Response(response.body, { status: response.status, headers });
  } catch { return reject(502, input.method === 'POST' ? 'WRITE_OUTCOME_UNKNOWN' : 'UPSTREAM_NETWORK'); }
}
