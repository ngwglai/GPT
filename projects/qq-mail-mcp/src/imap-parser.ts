import { MailError } from './errors';
export type Value = string | null | Uint8Array | Value[];
const decoder = new TextDecoder();
export function text(value: Value | undefined): string {
  return typeof value === 'string' ? value : value instanceof Uint8Array ? decoder.decode(value) : '';
}
export function list(value: Value | undefined): Value[] { return Array.isArray(value) ? value : []; }
/** Byte lexer: literals are opaque bytes, never reinterpreted as protocol tokens. */
export function parseResponse(data: Uint8Array): Value[] {
  let p = 0;
  const fail = (): never => { throw new MailError('IMAP_PROTOCOL'); };
  function parse(depth: number, nested: boolean): Value[] {
    if (depth > 40) fail();
    const result: Value[] = [];
    while (p < data.length) {
      const c = data[p];
      if (c === 32 || c === 13 || c === 10 || c === 9) { p++; continue; }
      if (c === 41) { if (!nested) fail(); p++; return result; }
      if (c === 40) { p++; result.push(parse(depth + 1, true)); continue; }
      if (c === 34) {
        p++; const bytes: number[] = []; let closed = false;
        while (p < data.length) {
          const b = data[p++];
          if (b === 34) { closed = true; break; }
          if (b === 92) { if (p >= data.length) fail(); bytes.push(data[p++]); }
          else { if (b === 13 || b === 10) fail(); bytes.push(b); }
        }
        if (!closed) fail(); result.push(decoder.decode(new Uint8Array(bytes))); continue;
      }
      if (c === 123) {
        p++; const start = p;
        while (data[p] >= 48 && data[p] <= 57) p++;
        if (p === start || data[p] !== 125 || data[p + 1] !== 13 || data[p + 2] !== 10) fail();
        const length = Number(decoder.decode(data.subarray(start, p))); p += 3;
        if (!Number.isSafeInteger(length) || p + length > data.length) fail();
        result.push(data.slice(p, p + length)); p += length; continue;
      }
      const start = p;
      while (p < data.length && ![32, 9, 13, 10, 40, 41].includes(data[p])) p++;
      if (p === start) fail();
      const atom = decoder.decode(data.subarray(start, p));
      result.push(atom.toUpperCase() === 'NIL' ? null : atom);
    }
    if (nested) fail();
    return result;
  }
  return parse(0, false);
}
export function quote(value: string): string {
  if (/[\x00-\x1f\x7f]/.test(value) || value.length > 512) throw new MailError('INVALID_INPUT');
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
export function encodeFolder(value: string): string {
  return value.replace(/&|[^\x20-\x7e]+/g, s => {
    if (s === '&') return '&-';
    const bytes = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) { bytes[i * 2] = s.charCodeAt(i) >> 8; bytes[i * 2 + 1] = s.charCodeAt(i) & 255; }
    return '&' + btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\//g, ',') + '-';
  });
}
export function decodeFolder(value: string): string {
  return value.replace(/&([A-Za-z0-9+,]*)-/g, (_, b: string) => {
    if (!b) return '&';
    const bytes = atob(b.replace(/,/g, '/'));
    if (bytes.length % 2) throw new MailError('IMAP_PROTOCOL');
    let out = ''; for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode(bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1));
    return out;
  });
}
