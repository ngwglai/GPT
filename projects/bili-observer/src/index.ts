import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './tools';

async function authorized(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const hashes = await Promise.all([provided, expected].map(v => crypto.subtle.digest('SHA-256', encoder.encode(v))));
  return crypto.subtle.timingSafeEqual(hashes[0], hashes[1]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    let status = 500;
    const finish = (response: Response) => {
      status = response.status;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Request-Id', requestId);
      return new Response(response.body, { status, headers });
    };
    try {
      if (url.pathname === '/health' && request.method === 'GET') return finish(Response.json({ name: 'bili-observer', version: '0.1.0', status: 'ok' }));
      if (url.pathname !== '/mcp') return finish(Response.json({ error: 'NOT_FOUND' }, { status: 404 }));
      if (url.search) return finish(Response.json({ error: 'QUERY_NOT_ALLOWED', message: '请通过 Authorization Header 传递访问令牌。' }, { status: 400 }));
      const origin = request.headers.get('Origin');
      const allowed = env.ALLOWED_ORIGINS.split(',').map(x => x.trim());
      if (origin && origin !== url.origin && !allowed.includes(origin)) return finish(Response.json({ error: 'ORIGIN_DENIED' }, { status: 403 }));
      if (request.method === 'OPTIONS') {
        const headers = new Headers({ 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' });
        if (origin) headers.set('Access-Control-Allow-Origin', origin);
        return finish(new Response(null, { status: 204, headers }));
      }
      if (!env.MCP_ACCESS_TOKEN || env.MCP_ACCESS_TOKEN.length < 32) return finish(Response.json({ error: 'SERVICE_NOT_CONFIGURED' }, { status: 503 }));
      const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1] ?? '';
      if (!await authorized(token, env.MCP_ACCESS_TOKEN)) return finish(Response.json({ error: 'UNAUTHORIZED' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="bili-observer"' } }));
      const handler = createMcpHandler(() => createServer(env), { legacy: 'stateless', responseMode: 'json', maxRequestBodySize: 16 * 1024, onerror: () => console.warn(JSON.stringify({ event: 'protocol_error', request_id: requestId })) });
      const response = await handler.fetch(request);
      const headers = new Headers(response.headers);
      if (origin) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
      return finish(new Response(response.body, { status: response.status, headers }));
    } catch {
      return finish(Response.json({ error: 'INTERNAL_ERROR', request_id: requestId }, { status: 500 }));
    } finally {
      // Never log URLs, request bodies, headers, account names or upstream payloads.
      console.log(JSON.stringify({ event: 'request', request_id: requestId, method: request.method, route: url.pathname === '/mcp' ? 'mcp' : url.pathname === '/health' ? 'health' : 'other', status, duration_ms: Date.now() - started }));
    }
  }
} satisfies ExportedHandler<Env>;
