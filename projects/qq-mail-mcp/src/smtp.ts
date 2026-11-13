import { z } from 'zod';
import { MailError } from './errors';
import type { Dial, MailSocket } from './imap';

const encoder = new TextEncoder();
const address = z.string().max(254).regex(/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/);
const body = z.string().max(32000).refine(s => encoder.encode(s).length <= 32000);
export const sendSchema = z.object({
  to: z.array(address).min(1).max(10), cc: z.array(address).max(10).default([]), bcc: z.array(address).max(10).default([]),
  subject: z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/), text: body.optional(), html: body.optional(),
  confirmed: z.literal(true),
}).strict().refine(s => s.text !== undefined || s.html !== undefined, 'Body required')
  .refine(s => { const all = [...s.to, ...s.cc, ...s.bcc].map(a => a.toLowerCase()); return all.length <= 10 && new Set(all).size === all.length; }, 'At most ten distinct recipients');
export type Send = z.infer<typeof sendSchema>;
function base64(value: string): string { return btoa(String.fromCharCode(...encoder.encode(value))); }
function encodedSubject(subject: string): string {
  const words: string[] = []; let word = '';
  for (const char of subject) { if (encoder.encode(word + char).length > 30) { words.push(word); word = ''; } word += char; }
  if (word) words.push(word);
  return words.map(w => `=?UTF-8?B?${base64(w)}?=`).join('\r\n ');
}
function part(type: string, value: string): string {
  return `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64(value).match(/.{1,76}/g)?.join('\r\n') ?? ''}\r\n`;
}
export function mimeMessage(sender: string, input: Send, messageId: string): string {
  address.parse(sender);
  const headers = [`From: <${sender}>`, `To: ${input.to.map(a => `<${a}>`).join(',\r\n ')}`];
  if (input.cc.length) headers.push(`Cc: ${input.cc.map(a => `<${a}>`).join(',\r\n ')}`);
  headers.push(`Subject: ${encodedSubject(input.subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${messageId}`, 'MIME-Version: 1.0');
  if (input.text !== undefined && input.html !== undefined) {
    const boundary = 'qq_' + crypto.randomUUID();
    return headers.join('\r\n') + `\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n--${boundary}\r\n` + part('text/plain', input.text) + `--${boundary}\r\n` + part('text/html', input.html) + `--${boundary}--\r\n`;
  }
  return headers.join('\r\n') + '\r\n' + part(input.html !== undefined ? 'text/html' : 'text/plain', input.html ?? input.text ?? '');
}
export class SmtpClient {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = ''; private received = 0; private deadline: number;
  constructor(private socket: MailSocket, timeout = 45000) {
    this.reader = socket.readable.getReader(); this.writer = socket.writable.getWriter(); this.deadline = Date.now() + timeout;
    void socket.closed.catch(() => {});
  }
  private async timed<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new MailError('SMTP_TIMEOUT')), Math.max(1, Math.min(8000, this.deadline - Date.now()))); })]); }
    catch (e) { if (e instanceof MailError) throw e; throw new MailError('SMTP_CONNECTION_FAILED'); }
    finally { clearTimeout(timer); }
  }
  private async line(): Promise<string> {
    while (!this.buffer.includes('\r\n')) {
      const { value, done } = await this.timed(this.reader.read());
      if (done || !value) throw new MailError('SMTP_DISCONNECTED');
      this.received += value.length;
      if (this.received > 65536 || this.buffer.length + value.length > 8192) throw new MailError('SMTP_PROTOCOL');
      this.buffer += new TextDecoder().decode(value);
    }
    const index = this.buffer.indexOf('\r\n'); const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 2); return line;
  }
  private async response(expected: number[]): Promise<number> {
    let code: number | undefined;
    for (let n = 0; n < 100; n++) {
      const match = /^(\d{3})([ -])[^\r\n]*$/.exec(await this.line());
      if (!match || (code !== undefined && code !== Number(match[1]))) throw new MailError('SMTP_PROTOCOL');
      code = Number(match[1]);
      if (match[2] === ' ') {
        if (!expected.includes(code)) throw new MailError(code >= 400 && code <= 599 ? `SMTP_REJECTED_${code}` : 'SMTP_PROTOCOL');
        return code;
      }
    }
    throw new MailError('SMTP_PROTOCOL');
  }
  private async write(value: string) { await this.timed(this.writer.write(encoder.encode(value))); }
  private async command(value: string, expected: number[]) { await this.write(value + '\r\n'); return this.response(expected); }
  async send(sender: string, secret: string, input: Send, beforeCommit: () => Promise<void>) {
    let committed = false;
    try {
      await this.timed(this.socket.opened); await this.response([220]); await this.command('EHLO gateway.invalid', [250]);
      try { await this.command('AUTH LOGIN', [334]); await this.command(base64(sender), [334]); await this.command(base64(secret), [235]); }
      catch (e) { if (e instanceof MailError && e.code.startsWith('SMTP_REJECTED_')) throw new MailError('SMTP_AUTH_FAILED'); throw e; }
      const messageId = `<${crypto.randomUUID()}@${sender.split('@')[1]}>`;
      const mime = mimeMessage(sender, input, messageId);
      await this.command(`MAIL FROM:<${sender}>`, [250]);
      for (const recipient of [...input.to, ...input.cc, ...input.bcc]) await this.command(`RCPT TO:<${recipient}>`, [250, 251]);
      await this.command('DATA', [354]);
      await this.write(mime.replace(/(^|\r\n)\./g, '$1..'));
      // Persist the uncertainty barrier BEFORE the server can accept the message.
      await beforeCommit(); committed = true;
      await this.write('.\r\n'); const code = await this.response([250]);
      return { recipients: [...input.to, ...input.cc, ...input.bcc], subject: input.subject, smtp: { code, response: '250 accepted' }, messageId, sentAt: new Date().toISOString(), deliveryConfirmed: false };
    } catch (e) {
      if (committed && !(e instanceof MailError && /^SMTP_REJECTED_[45]\d\d$/.test(e.code))) throw new MailError('SMTP_RESULT_UNKNOWN');
      throw e;
    } finally { await this.socket.close().catch(() => {}); }
  }
}
export async function sendMail(credentials: { QQ_MAIL_ADDRESS?: string; QQ_MAIL_AUTH_CODE?: string }, dial: Dial, input: Send, beforeCommit: () => Promise<void>) {
  if (!credentials.QQ_MAIL_ADDRESS || !credentials.QQ_MAIL_AUTH_CODE) throw new MailError('MAIL_NOT_CONFIGURED');
  return new SmtpClient(dial()).send(credentials.QQ_MAIL_ADDRESS, credentials.QQ_MAIL_AUTH_CODE, input, beforeCommit);
}
