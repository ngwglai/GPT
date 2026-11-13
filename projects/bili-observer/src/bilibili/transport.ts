import { AppError } from '../errors';
import type { Fetcher } from './client';
export type BackendSettings = Partial<Pick<Env, 'BILI_TRANSPORT' | 'BILI_BACKEND_URL' | 'BILI_BACKEND_TOKEN'>>;

export function createBiliTransport(env: BackendSettings, fetcher: Fetcher = fetch): Fetcher {
  if (!env.BILI_TRANSPORT || env.BILI_TRANSPORT === 'direct') return fetcher;
  return async (input, init) => {
    if (env.BILI_TRANSPORT !== 'backend') throw new AppError('BACKEND_CONFIGURATION', '未知的 B站请求适配器。');
    let endpoint: URL;
    try {
      endpoint = new URL(env.BILI_BACKEND_URL ?? '');
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port || endpoint.hostname === 'localhost' || /^[\d.:\[\]]+$/.test(endpoint.hostname) || !env.BILI_BACKEND_TOKEN || env.BILI_BACKEND_TOKEN.length < 32) throw Error();
    } catch { throw new AppError('BACKEND_CONFIGURATION', '请先配置可信 HTTPS 后端及独立的后端令牌。'); }
    // Explicit opt-in only. Never fall back to direct egress on backend failure, especially for writes.
    const url = input instanceof Request ? input.url : String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const response = await fetcher(endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${env.BILI_BACKEND_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method: init?.method ?? 'GET', headers, body: init?.body ? String(init.body) : null }),
      redirect: 'manual', signal: init?.signal
    });
    if (!response.headers.has('X-Bili-Backend')) {
      await response.body?.cancel();
      throw new AppError(init?.method === 'POST' ? 'WRITE_OUTCOME_UNKNOWN' : 'BACKEND_UNAVAILABLE', init?.method === 'POST' ? '后端发布请求结果未知，请先读取确认，勿自动重发。' : '可信请求后端未就绪或返回了无效响应。');
    }
    return response;
  };
}
