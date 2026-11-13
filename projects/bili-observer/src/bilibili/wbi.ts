import { createHash } from 'node:crypto';
import { AppError } from '../errors';
const table = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export function signWbi(params: Record<string, string>, image: string, sub: string, now = Date.now()) {
  const extract = (url: string) => url.split('/').pop()?.split('.')[0] ?? '';
  const raw = extract(image) + extract(sub);
  if (raw.length !== 64) throw new AppError('WBI_UNAVAILABLE', '无法取得 B站 WBI 签名信息。');
  const key = table.map(i => raw[i]).join('').slice(0, 32);
  const values = { ...params, wts: String(Math.floor(now / 1000)) };
  const query = Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.replace(/[!'()*]/g, ''))}`).join('&');
  return `${query}&w_rid=${createHash('md5').update(query + key).digest('hex')}`;
}
