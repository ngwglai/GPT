import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { cleanupTasks, consumeBatch, consumeTask, taskSchema, taskStatus, type Services, type TaskEnv } from '../src/tasks';
import { MailError } from '../src/errors';
import { MailService } from '../src/mail';
import { fakeSocket } from './fixture';

let mf: Miniflare; let env: TaskEnv;
const credentials = { QQ_MAIL_ADDRESS: 'sender@example.com', QQ_MAIL_AUTH_CODE: 'fake-test-secret' };
function task(type = 'mail.send', params: unknown = { to: ['recipient@example.com'], subject: '中文', text: '你好', confirmed: true }) {
  return { task_id: crypto.randomUUID(), created_at: new Date().toISOString(), type, params };
}
function message(body: unknown): Message<unknown> {
  return { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body, ack: vi.fn(), retry: vi.fn() };
}
function api(): Services {
  const mail = new MailService(credentials, () => fakeSocket().socket);
  return { search: p => mail.search(p), read: p => mail.read(p), send: vi.fn(async (_p, before) => { await before(); return { smtp: { code: 250 }, deliveryConfirmed: false }; }) };
}
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-10-15', d1Databases: ['TASK_DB'] }));
  env = { ...credentials, TASK_DB: await mf.getD1Database('TASK_DB') as D1Database };
  const sql = (await readFile('task-migrations/0001_tasks.sql', 'utf8')).split('\n').filter(s => !s.startsWith('--')).join(' ');
  await env.TASK_DB.exec(sql);
});
beforeEach(async () => { await env.TASK_DB.exec('DELETE FROM mail_tasks'); });
afterAll(async () => { await mf?.dispose(); });
describe('Queue consumer with real local D1', () => {
  it('stores sent metadata, expires sensitive results and retains replay tombstones', async () => {
    const t = task(); const m = message(t); const svc = api();
    await consumeTask(m, env, svc); expect(m.ack).toHaveBeenCalledOnce();
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'sent' });
    const row = await env.TASK_DB.prepare('SELECT * FROM mail_tasks').first();
    expect(JSON.stringify(row)).not.toContain(credentials.QQ_MAIL_AUTH_CODE); expect(row?.commit_started).toBe(1);
    await cleanupTasks(env.TASK_DB, Date.now() + 16 * 60000);
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ result_json: null });
    await cleanupTasks(env.TASK_DB, Date.now() + 8 * 86400000);
    await consumeTask(message(t), env, svc); expect(svc.send).toHaveBeenCalledOnce();
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'sent', error: null, completed_at: null });
  });
  it('preserves search, pagination, Chinese MIME and full read via queued tasks', async () => {
    const svc = api(); const search = task('mail.search', { page: 2, limit: 2, from: 'sender@example.com', subject: '中文', since: '2026-01-01', before: '2027-01-01' });
    await consumeTask(message(search), env, svc);
    const row = await taskStatus(env.TASK_DB, search.task_id) as { result_json: string; status: string };
    const result = JSON.parse(row.result_json); expect(row.status).toBe('completed'); expect(result.page).toBe(2); expect(result.messages.map((m: { uid: number }) => m.uid)).toEqual([43, 42]);
    const read = task('mail.read', { uid: 43, uidvalidity: 77 }); await consumeTask(message(read), env, svc);
    const readRow = await taskStatus(env.TASK_DB, read.task_id) as { result_json: string };
    expect(JSON.parse(readRow.result_json)).toMatchObject({ body: '你好，世界', subject: '中文主题', untrustedContent: true });
    const status = task('mail.status', { task_id: read.task_id }); await consumeTask(message(status), env, svc);
    const statusRow = await taskStatus(env.TASK_DB, status.task_id) as { result_json: string };
    expect(JSON.parse(statusRow.result_json)).toMatchObject({ task_id: read.task_id, status: 'completed' });
  });
  it('does not copy a referenced result into a status task', async () => {
    const first = task('mail.read', { uid: 1, uidvalidity: 77 }); await consumeTask(message(first), env, api());
    const status = task('mail.status', { task_id: first.task_id }); await consumeTask(message(status), env, api());
    const result = await taskStatus(env.TASK_DB, status.task_id) as { result_json: string };
    expect(JSON.parse(result.result_json).result_json).toBeUndefined();
  });
  it('deduplicates sequential and concurrent deliveries without reopening SMTP', async () => {
    const t = task(); const svc = api(); const messages = [message(t), message(t), message(t)];
    await Promise.all(messages.map(m => consumeTask(m, env, svc)));
    await consumeTask(message(t), env, svc); expect(svc.send).toHaveBeenCalledOnce();
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'sent' });
  });
  it('rejects a duplicate task ID with different payload', async () => {
    const svc = api(); const t = task(); await consumeTask(message(t), env, svc);
    await consumeTask(message({ ...t, params: { ...t.params as object, subject: 'different' } }), env, svc);
    expect(svc.send).toHaveBeenCalledOnce();
  });
  it('treats reordered JSON keys as the same task', async () => {
    const svc = api(); const t = task(); await consumeTask(message(t), env, svc);
    await consumeTask(message({ params: t.params, type: t.type, created_at: t.created_at, task_id: t.task_id }), env, svc);
    expect(svc.send).toHaveBeenCalledOnce();
  });
  it.each(['SMTP_RESULT_UNKNOWN', 'SMTP_AUTH_FAILED', 'SMTP_DISCONNECTED'])('records %s without retrying SMTP', async code => {
    const svc = api(); svc.send = vi.fn(async () => { throw new MailError(code); }); const t = task();
    await consumeTask(message(t), env, svc); await consumeTask(message(t), env, svc);
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: code === 'SMTP_RESULT_UNKNOWN' ? 'unknown' : 'failed', error: code }); expect(svc.send).toHaveBeenCalledOnce();
  });
  it('records safe errors rather than raw exceptions or bodies', async () => {
    const svc = api(); svc.read = async () => { throw Error('PRIVATE_BODY_AND_TOKEN'); }; const t = task('mail.read', { uid: 1, uidvalidity: 77 });
    await consumeTask(message(t), env, svc); const row = await taskStatus(env.TASK_DB, t.task_id);
    expect(row).toMatchObject({ status: 'failed', error: 'OPERATION_FAILED' }); expect(JSON.stringify(row)).not.toContain('PRIVATE_');
  });
  it('records oversized read results as a bounded failure', async () => {
    const svc = api(); const originalRead = svc.read;
    svc.read = async p => ({ ...await originalRead(p), body: '中'.repeat(100000) });
    const t = task('mail.read', { uid: 1, uidvalidity: 77 });
    await consumeTask(message(t), env, svc);
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'failed', error: 'RESULT_TOO_LARGE', result_json: null });
  });
  it('never resends after SMTP accepts but saving the result fails', async () => {
    const svc = api(); const t = task(); const db = env.TASK_DB;
    const failingDB = new Proxy(db, { get(target, prop) {
      if (prop === 'prepare') return (sql: string) => { if (sql.includes('SET status=?,completed_at=')) throw Error('storage outage'); return target.prepare(sql); };
      const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(consumeTask(message(t), { ...env, TASK_DB: failingDB }, svc)).rejects.toThrow('storage outage');
    expect(svc.send).toHaveBeenCalledOnce();
    const duplicate = message(t); await consumeTask(duplicate, env, svc); expect(duplicate.retry).toHaveBeenCalled();
    await env.TASK_DB.prepare('UPDATE mail_tasks SET started_at=? WHERE task_id=?').bind(Date.now() - 180000, t.task_id).run();
    await consumeTask(message(t), env, svc); expect(svc.send).toHaveBeenCalledOnce();
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'unknown', error: 'SMTP_RESULT_UNKNOWN' });
  });
  it('expires stale claims automatically and hides expired results even before cleanup', async () => {
    const t = task(); await consumeTask(message(t), env, api());
    await env.TASK_DB.prepare("UPDATE mail_tasks SET status='processing',started_at=?,result_expires_at=? WHERE task_id=?").bind(Date.now() - 180000, Date.now() - 1, t.task_id).run();
    expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ result_json: null });
    await cleanupTasks(env.TASK_DB); expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'unknown' });
  });
  it('records expired tasks without connecting', async () => {
    const svc = api(); const t = { ...task(), created_at: new Date(Date.now() - 25 * 3600000).toISOString() };
    await consumeTask(message(t), env, svc); expect(svc.send).not.toHaveBeenCalled(); expect(await taskStatus(env.TASK_DB, t.task_id)).toMatchObject({ status: 'failed', error: 'TASK_EXPIRED' });
  });
  it('acks malformed messages and does not persist arbitrary fields or credentials', async () => {
    const t = { ...task(), host: 'https://evil.invalid', password: 'test-only-fake-password' }; const m = message(t);
    await consumeTask(m, env, api()); expect(m.ack).toHaveBeenCalled(); expect(await taskStatus(env.TASK_DB, t.task_id)).toBeNull(); expect(taskSchema.safeParse(t).success).toBe(false);
  });
  it('consumes batches and retries transient D1 outages', async () => {
    const svc = api(); const a = message(task()); const b = message(task('mail.search', {}));
    await consumeBatch({ queue: 'test', metadata: {metrics: {backlogCount: 2, backlogBytes: 0}}, messages: [a, b], ackAll: vi.fn(), retryAll: vi.fn() }, env, svc); expect(a.ack).toHaveBeenCalled(); expect(b.ack).toHaveBeenCalled();
    let outage = true; const db = env.TASK_DB;
    const failingDB = new Proxy(db, {get(target, prop) {
      if (prop === 'prepare') return (sql: string) => {if (outage) {outage = false; throw Error('transient outage');} return target.prepare(sql);};
      const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value;
    }});
    const pending = message(task());
    await consumeBatch({queue: 'test', metadata: {metrics: {backlogCount: 1, backlogBytes: 0}}, messages: [pending], ackAll: vi.fn(), retryAll: vi.fn()}, {...env, TASK_DB: failingDB}, svc);
    expect(pending.retry).toHaveBeenCalled(); expect(pending.ack).not.toHaveBeenCalled();
    await consumeTask(pending, env, svc); expect(pending.ack).toHaveBeenCalled();
  });
});
