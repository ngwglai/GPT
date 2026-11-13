import { describe, it, expect } from 'vitest';
import PostalMime from 'postal-mime';
import { SmtpClient, mimeMessage, sendMail, sendSchema } from '../src/smtp';
import type { MailSocket } from '../src/imap';

export function smtpSocket(options: { authFail?: boolean; disconnectAt?: string; rejectData?: boolean; tlsFail?: boolean; hang?: boolean; multilineBad?: boolean } = {}) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const commands: string[] = []; let stage = 0; let data = false; let closed = false;
  const send = (s: string) => { const bytes = new TextEncoder().encode(s); for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); };
  const socket: MailSocket = {
    opened: options.tlsFail ? Promise.reject(new Error('private TLS detail')) : Promise.resolve(), closed: Promise.resolve(),
    readable: new ReadableStream({ start(c) { controller = c; if (!options.hang) send('220 QQ SMTP\r\n'); } }),
    writable: new WritableStream({ write(chunk) {
      const cmd = new TextDecoder().decode(chunk); commands.push(cmd);
      if (options.disconnectAt && cmd.startsWith(options.disconnectAt)) { controller.close(); closed = true; return; }
      if (cmd === '.\r\n') { send(options.rejectData ? '554 not accepted\r\n' : '250 2.0.0 queued as opaque-id\r\n'); data = false; }
      else if (data) return;
      else if (cmd.startsWith('EHLO')) send(options.multilineBad ? '250-hello\r\n251 wrong\r\n' : '250-hello\r\n250 AUTH LOGIN\r\n');
      else if (cmd.startsWith('AUTH LOGIN')) { stage = 1; send('334 username\r\n'); }
      else if (stage === 1) { stage = 2; send('334 password\r\n'); }
      else if (stage === 2) { stage = 0; send(options.authFail ? '535 private authentication detail\r\n' : '235 authenticated\r\n'); }
      else if (cmd.startsWith('MAIL FROM') || cmd.startsWith('RCPT TO')) send('250 accepted\r\n');
      else if (cmd === 'DATA\r\n') { data = true; send('354 go ahead\r\n'); }
      else throw new Error('Unexpected SMTP command');
    } }),
    async close() { if (!closed) { closed = true; controller.close(); } },
  };
  return { socket, commands, get closed() { return closed; } };
}
const params = { to: ['recipient@example.com'], cc: ['copy@example.com'], bcc: ['hidden@example.com'], subject: '中文主题'.repeat(20), text: '你好，世界\n.\n中文正文', html: '<p>你好</p>', confirmed: true as const };
describe('SMTP implicit TLS protocol and MIME', () => {
  it('authenticates, sends CC/BCC in envelope, commits once and parses Unicode multipart MIME', async () => {
    const f = smtpSocket(); let barrier = false;
    const result = await new SmtpClient(f.socket).send('sender@example.com', 'fake-test-secret', sendSchema.parse(params), async () => { expect(f.commands).not.toContain('.\r\n'); barrier = true; });
    expect(barrier).toBe(true); expect(result).toMatchObject({ smtp: { code: 250 }, deliveryConfirmed: false });
    expect(f.commands).toContain('RCPT TO:<hidden@example.com>\r\n');
    const raw = f.commands.find(c => c.startsWith('From:'))!;
    expect(raw).not.toContain('hidden@example.com'); expect(raw).not.toContain('fake-test-secret');
    const parsed = await PostalMime.parse(raw);
    expect(parsed.subject).toBe(params.subject); expect(parsed.text?.trim()).toBe(params.text); expect(parsed.html?.trim()).toBe(params.html);
    expect(raw.split('\r\n').every(line => line.length < 998)).toBe(true); expect(f.closed).toBe(true);
  });
  it.each(['text', 'html'] as const)('supports standalone %s body', async field => {
    const input = sendSchema.parse({ to: params.to, subject: '中文', [field]: '你好', confirmed: true });
    const parsed = await PostalMime.parse(mimeMessage('sender@example.com', input, '<test@example.com>'));
    expect(parsed[field]?.trim()).toBe('你好');
  });
  it('redacts failed authentication and never reaches DATA', async () => {
    const f = smtpSocket({ authFail: true });
    await expect(new SmtpClient(f.socket).send('sender@example.com', 'fake', sendSchema.parse(params), async () => {})).rejects.toThrow('SMTP_AUTH_FAILED');
    expect(f.commands).not.toContain('DATA\r\n'); expect(f.closed).toBe(true);
  });
  it.each([{ disconnectAt: 'MAIL FROM', code: 'SMTP_DISCONNECTED' }, { disconnectAt: '.\r\n', code: 'SMTP_RESULT_UNKNOWN' }, { rejectData: true, code: 'SMTP_REJECTED_554' }, { tlsFail: true, code: 'SMTP_CONNECTION_FAILED' }, { multilineBad: true, code: 'SMTP_PROTOCOL' }])('handles protocol failure %j', async ({ code, ...options }) => {
    const f = smtpSocket(options);
    await expect(new SmtpClient(f.socket).send('sender@example.com', 'fake', sendSchema.parse(params), async () => {})).rejects.toThrow(code); expect(f.closed).toBe(true);
  });
  it('never terminates DATA when the durable barrier fails', async () => {
    const f = smtpSocket(); await expect(new SmtpClient(f.socket).send('sender@example.com', 'fake', sendSchema.parse(params), async () => { throw new Error('storage unavailable'); })).rejects.toThrow();
    expect(f.commands).not.toContain('.\r\n'); expect(f.closed).toBe(true);
  });
  it('closes a stalled connection on timeout', async () => {
    const f = smtpSocket({ hang: true }); await expect(new SmtpClient(f.socket, 10).send('sender@example.com', 'fake', sendSchema.parse(params), async () => {})).rejects.toThrow('SMTP_TIMEOUT'); expect(f.closed).toBe(true);
  });
  it('does not connect without existing credentials', async () => { await expect(sendMail({}, () => { throw Error('dialed'); }, sendSchema.parse(params), async () => {})).rejects.toThrow('MAIL_NOT_CONFIGURED'); });
  it.each([
    { subject: 'subject\r\nBcc: attacker@example.com' }, { to: ['a@example.com\r\nDATA'] }, { to: Array.from({ length: 11 }, (_, n) => `r${n}@example.com`), cc: [], bcc: [] },
    { bcc: ['recipient@example.com'] }, { confirmed: false }, { host: 'evil.invalid' }, { attachments: [] }, { text: '中'.repeat(11000) }, { to: ['bad..dot@example.com'] },
  ])('rejects unsafe send parameters %j', change => { expect(sendSchema.safeParse({ ...params, ...change }).success).toBe(false); });
});
