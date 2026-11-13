import { AppError, apiError } from '../errors';
import { obj, str, type Obj } from './data';
import { signWbi } from './wbi';

export type Credentials = Partial<Pick<Env, 'BILI_SESSDATA' | 'BILI_JCT' | 'BILI_BUVID3'>>;
export type Fetcher = typeof fetch;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export async function boundedJson(response: Response, max = 4 * 1024 * 1024): Promise<unknown> {
  if (!response.body) throw new AppError('UPSTREAM_FORMAT', 'B站返回空响应。');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new AppError('UPSTREAM_TOO_LARGE', '接口内容超过安全大小限制，请缩小请求范围。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AppError('UPSTREAM_FORMAT', 'B站返回了非 JSON 内容，可能触发风控。'); }
}

export class BiliClient {
  private lastRequest = 0;
  private count = 0;
  private readonly deadline = Date.now() + 28000;
  constructor(private readonly credentials: Credentials = {}, private readonly fetcher: Fetcher = fetch) {}
  private cookie(login: boolean) {
    const values: string[] = [];
    for (const [name, value] of [['buvid3', this.credentials.BILI_BUVID3], ...(login ? [['SESSDATA', this.credentials.BILI_SESSDATA], ['bili_jct', this.credentials.BILI_JCT]] : [])]) {
      if (!value) continue;
      if (/[;\r\n\s]/.test(value)) throw new AppError('INVALID_CREDENTIALS', 'Cookie 配置格式错误；只填写各 Cookie 的值。');
      values.push(`${name}=${value}`);
    }
    return values.join('; ');
  }
  private async request(url: URL, login = false, body?: URLSearchParams, max?: number): Promise<unknown> {
    if (++this.count > 9 || Date.now() > this.deadline) throw new AppError('REQUEST_BUDGET', '请求预算耗尽，请稍后缩小范围重试。');
    const delay = Math.max(0, 300 - (Date.now() - this.lastRequest));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    this.lastRequest = Date.now();
    const headers = new Headers({ 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Accept': 'application/json' });
    // Cookies are sent only to the exact API host, never subtitle CDN hosts.
    if (url.hostname === 'api.bilibili.com') { const cookie = this.cookie(login); if (cookie) headers.set('Cookie', cookie); }
    if (body) headers.set('Content-Type', 'application/x-www-form-urlencoded');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(12000, Math.max(1, this.deadline - Date.now())));
    try {
      const fetcher = this.fetcher;
      const response = await fetcher(url, { method: body ? 'POST' : 'GET', headers, body, redirect: 'manual', signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new AppError([403, 412, 429].includes(response.status) ? 'RISK_CONTROL' : 'UPSTREAM_HTTP', `B站接口 HTTP ${response.status}；请稍后重试。`, response.status);
      }
      return await boundedJson(response, max);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(body ? 'WRITE_OUTCOME_UNKNOWN' : 'UPSTREAM_NETWORK', body ? '发送后连接中断，结果未知。请先读取目标评论区确认，勿自动重发。' : 'B站请求超时或网络不可达。');
    } finally { clearTimeout(timer); }
  }
  async get(path: string, params: Record<string, string> = {}, options: { login?: boolean; wbi?: boolean; allowGuest?: boolean } = {}): Promise<Obj> {
    let query = new URLSearchParams(params).toString();
    if (options.wbi) {
      const nav = await this.get('/x/web-interface/nav', {}, { allowGuest: true });
      const images = obj(nav.wbi_img);
      query = signWbi(params, str(images.img_url), str(images.sub_url));
    }
    const raw = obj(await this.request(new URL(`https://api.bilibili.com${path}?${query}`), options.login));
    if (raw.code !== 0 && !(options.allowGuest && raw.code === -101)) throw apiError(Number(raw.code));
    return obj(raw.data);
  }
  async subtitle(urlText: string): Promise<Obj> {
    const url = new URL(urlText.startsWith('//') ? `https:${urlText}` : urlText);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === 'hdslb.com' || url.hostname.endsWith('.hdslb.com') || url.hostname.endsWith('.bilibili.com'))) {
      throw new AppError('UNSAFE_SUBTITLE_URL', '字幕地址不在 B站可信域名中。');
    }
    return obj(await this.request(url, false, undefined, 8 * 1024 * 1024));
  }
  async checkLogin() {
    if (!this.credentials.BILI_SESSDATA) throw new AppError('COOKIE_MISSING', '此操作需要 BILI_SESSDATA Secret。');
    if (!this.credentials.BILI_JCT) throw new AppError('CSRF_MISSING', '此操作需要 BILI_JCT Secret。');
    if (!/^[a-fA-F0-9]{32}$/.test(this.credentials.BILI_JCT)) throw new AppError('CSRF_INVALID', 'bili_jct 必须为 32 位十六进制值。');
    const nav = await this.get('/x/web-interface/nav', {}, { login: true });
    if (nav.isLogin !== true) throw new AppError('LOGIN_EXPIRED', 'B站登录失效，请更新 SESSDATA。');
  }
  async post(params: Record<string, string>): Promise<Obj> {
    // No retries: a lost response must never produce duplicate comments.
    const csrf = this.credentials.BILI_JCT;
    if (!csrf || !/^[a-fA-F0-9]{32}$/.test(csrf)) throw new AppError('CSRF_INVALID', '缺少有效 bili_jct。');
    const body = new URLSearchParams({ ...params, csrf, csrf_token: csrf });
    const raw = obj(await this.request(new URL('https://api.bilibili.com/x/v2/reply/add'), true, body));
    if (raw.code !== 0) throw apiError(Number(raw.code));
    return obj(raw.data);
  }
}
