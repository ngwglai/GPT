import { MailError } from './errors';
import { parseResponse, quote, encodeFolder, text, list, type Value } from './imap-parser';
export interface MailSocket { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; opened: Promise<unknown>; closed: Promise<unknown>; close(): Promise<unknown>; }
export type Dial = () => MailSocket;
const enc = new TextEncoder();
const MAX_RESPONSE = 512 * 1024;
export class ImapClient {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = new Uint8Array(0);
  private sequence = 0;
  private received = 0;
  private stopped = false;
  private deadline: number;
  connected = false;
  authenticated = false;
  constructor(private socket: MailSocket, timeoutMs = 20000) {
    this.reader = socket.readable.getReader(); this.writer = socket.writable.getWriter();
    this.deadline = Date.now() + timeoutMs;
    void socket.closed.catch(() => {});
  }
  private async timed<T>(promise: Promise<T>): Promise<T> {
    const ms = Math.min(8000, this.deadline - Date.now());
    if (ms <= 0 || this.stopped) throw new MailError('TIMEOUT');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new MailError('TIMEOUT')); void this.close(); }, ms); })]); }
    catch (e) { if (e instanceof MailError) throw e; throw new MailError('CONNECTION_FAILED'); }
    finally { if (timer) clearTimeout(timer); }
  }
  private async fill(): Promise<void> {
    const {value, done} = await this.timed(this.reader.read());
    if (done || !value) throw new MailError('SERVER_DISCONNECTED');
    this.received += value.length;
    if (this.received > 2 * 1024 * 1024 || this.buffer.length + value.length > MAX_RESPONSE) throw new MailError('RESPONSE_TOO_LARGE');
    const next = new Uint8Array(this.buffer.length + value.length); next.set(this.buffer); next.set(value, this.buffer.length); this.buffer = next;
  }
  private async line(): Promise<Uint8Array> {
    let scan = 0;
    for (;;) {
      for (let i = scan; i + 1 < this.buffer.length; i++) if (this.buffer[i] === 13 && this.buffer[i+1] === 10) {
        if (i > 65536) throw new MailError('RESPONSE_TOO_LARGE');
        const result = this.buffer.slice(0, i+2); this.buffer = this.buffer.slice(i+2); return result;
      }
      if (this.buffer.length > 65536) throw new MailError('RESPONSE_TOO_LARGE');
      scan = Math.max(0, this.buffer.length - 1); await this.fill();
    }
  }
  private async response(): Promise<Value[]> {
    const parts: Uint8Array[] = []; let size = 0;
    for (;;) {
      const line = await this.line(); parts.push(line); size += line.length;
      const match = /\{(\d+)\}\r\n$/.exec(new TextDecoder().decode(line));
      if (!match) break;
      const n = Number(match[1]); size += n;
      if (!Number.isSafeInteger(n) || size > MAX_RESPONSE) throw new MailError('RESPONSE_TOO_LARGE');
      while (this.buffer.length < n) await this.fill();
      parts.push(this.buffer.slice(0,n)); this.buffer = this.buffer.slice(n);
    }
    if (size > MAX_RESPONSE) throw new MailError('RESPONSE_TOO_LARGE');
    const all = new Uint8Array(size); let offset = 0;
    for (const part of parts) { all.set(part, offset); offset += part.length; }
    return parseResponse(all);
  }
  async login(address: string, password: string): Promise<void> {
    await this.timed(this.socket.opened);
    const greeting = await this.response();
    if (text(greeting[0]) !== '*' || text(greeting[1]).toUpperCase() !== 'OK') throw new MailError('IMAP_GREETING');
    this.connected = true;
    try { await this.command(`LOGIN ${quote(address)} ${quote(password)}`); }
    catch (e) { if (e instanceof MailError && e.code === 'IMAP_REJECTED') throw new MailError('AUTH_FAILED'); throw e; }
    this.authenticated = true;
  }
  /** Private command surface: no mutating IMAP command is exposed to tools. */
  private async command(command: string): Promise<Value[][]> {
    if (/[\r\n\0]/.test(command)) throw new MailError('INVALID_INPUT');
    const tag = `A${++this.sequence}`;
    await this.timed(this.writer.write(enc.encode(`${tag} ${command}\r\n`)));
    const responses: Value[][] = [];
    for (let n = 0; n < 10000; n++) {
      const row = await this.response();
      if (text(row[0]) === tag) { if (text(row[1]).toUpperCase() !== 'OK') throw new MailError('IMAP_REJECTED'); return responses; }
      if (text(row[0]) !== '*' || text(row[1]).toUpperCase() === 'BYE') throw new MailError('SERVER_DISCONNECTED');
      responses.push(row);
    }
    throw new MailError('RESPONSE_TOO_LARGE');
  }
  async folders() { return (await this.command('LIST "" "*"')).filter(r => text(r[1]).toUpperCase() === 'LIST'); }
  async examine(folder: string): Promise<number> {
    const rows = await this.command(`EXAMINE ${quote(encodeFolder(folder))}`);
    for (const r of rows) for (let i=0;i<r.length-1;i++) if (text(r[i]).toUpperCase() === '[UIDVALIDITY') {
      const n = Number(text(r[i+1]).replace(/\]$/, '')); if (Number.isInteger(n) && n > 0 && n <= 4294967295) return n;
    }
    throw new MailError('UIDVALIDITY_MISSING');
  }
  async search(criteria: string): Promise<number[]> {
    const rows = await this.command(`UID SEARCH CHARSET UTF-8 ${criteria}`);
    return rows.filter(r => text(r[1]).toUpperCase() === 'SEARCH').flatMap(r => r.slice(2).map(v => {
      const n = Number(text(v)); if (!Number.isInteger(n) || n <= 0 || n > 4294967295) throw new MailError('IMAP_PROTOCOL'); return n;
    }));
  }
  async fetch(uid: number, fields: string): Promise<Value[]> {
    if (!Number.isInteger(uid) || uid <= 0 || uid > 4294967295 || !/^(UID |RFC822.SIZE|BODYSTRUCTURE|FLAGS|BODY.PEEK\[(?:HEADER|[\d.]+)\]|[ ()])+$/.test(fields)) throw new MailError('INVALID_INPUT');
    const rows = await this.command(`UID FETCH ${uid} (${fields})`);
    for (const r of rows) {
      if (text(r[2]).toUpperCase() !== 'FETCH') continue;
      const values = list(r[3]);
      if (Number(field(values,'UID')) === uid) return values;
    }
    throw new MailError('MAIL_NOT_FOUND');
  }
  async close(): Promise<void> {
    if (this.stopped) return; this.stopped = true;
    // Close TCP directly: never CLOSE/EXPUNGE, and no wait for a remote LOGOUT.
    await this.socket.close().catch(() => {});
    try { this.reader.releaseLock(); this.writer.releaseLock(); } catch { /* pending read is cancelled by socket.close */ }
  }
}
export function field(values: Value[], key: string): Value | undefined {
  for (let i=0;i<values.length-1;i+=2) if (text(values[i]).toUpperCase() === key.toUpperCase()) return values[i+1];
}
