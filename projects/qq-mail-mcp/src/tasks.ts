import { z } from 'zod';
import { connect } from 'cloudflare:sockets';
import { MailService, readSchema, searchSchema } from './mail';
import { sendMail, sendSchema, type Send } from './smtp';
import { errorCode, MailError } from './errors';
import { hash } from './security';

const id = z.string().uuid();
const common = { task_id: id, created_at: z.string().datetime({ offset: true }) };
export const taskSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('mail.search'), params: searchSchema }).strict(),
  z.object({ ...common, type: z.literal('mail.read'), params: readSchema }).strict(),
  z.object({ ...common, type: z.literal('mail.send'), params: sendSchema }).strict(),
  z.object({ ...common, type: z.literal('mail.status'), params: z.object({ task_id: id }).strict() }).strict(),
]);
export type Task = z.infer<typeof taskSchema>;
type Row = { task_id: string; type: string; fingerprint: string; status: string; started_at: number | null; commit_started: number };
export type TaskEnv = Pick<Env, 'TASK_DB' | 'QQ_MAIL_ADDRESS' | 'QQ_MAIL_AUTH_CODE'>;
export interface Services {
  search: MailService['search']; read: MailService['read'];
  send(input: Send, beforeCommit: () => Promise<void>): Promise<unknown>;
}
export function services(env: TaskEnv): Services {
  const mail = new MailService(env, () => connect({ hostname: 'imap.qq.com', port: 993 }, { secureTransport: 'on', allowHalfOpen: false }));
  return { search: p => mail.search(p), read: p => mail.read(p), send: (p, before) => sendMail(env, () => connect({ hostname: 'smtp.qq.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false }), p, before) };
}
export async function taskStatus(db: D1Database, taskId: string) {
  id.parse(taskId);
  const now = Date.now();
  return db.prepare(`SELECT task_id,type,status,created_at,completed_at,error,
    CASE WHEN result_expires_at > ? THEN result_json ELSE NULL END AS result_json,
    result_expires_at FROM mail_tasks WHERE task_id = ?`).bind(now, taskId).first();
}
export async function cleanupTasks(db: D1Database, now = Date.now()) {
  await db.batch([
    db.prepare(`UPDATE mail_tasks SET status=CASE WHEN type='mail.send' THEN 'unknown' ELSE 'failed' END,
      error=CASE WHEN type='mail.send' THEN 'SMTP_RESULT_UNKNOWN' ELSE 'WORKER_INTERRUPTED' END,completed_at=?
      WHERE status='processing' AND started_at < ?`).bind(now, now - 120000),
    db.prepare("UPDATE mail_tasks SET result_json=NULL,result_expires_at=NULL WHERE result_expires_at <= ?").bind(now),
    db.prepare('UPDATE mail_tasks SET error=NULL,completed_at=NULL,started_at=NULL,commit_started=0 WHERE metadata_expires_at <= ? AND (error IS NOT NULL OR completed_at IS NOT NULL OR started_at IS NOT NULL)').bind(now),
  ]);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
async function finish(db: D1Database, task: Task, status: string, result: unknown, error: string | null) {
  const now = Date.now(); const json = result === null ? null : JSON.stringify(result);
  if (json && new TextEncoder().encode(json).length > 256000) throw new MailError('RESULT_TOO_LARGE');
  await db.prepare(`UPDATE mail_tasks SET status=?,completed_at=?,error=?,result_json=?,result_expires_at=?
    WHERE task_id=? AND status='processing'`).bind(status, now, error, json, now + 15 * 60000, task.task_id).run();
}
/** Queue access is controlled by Cloudflare IAM; there is deliberately no public submission route. */
export async function consumeTask(message: Message<unknown>, env: TaskEnv, api: Services = services(env)) {
  const bytes = new TextEncoder().encode(JSON.stringify(message.body)).length;
  const parsed = bytes <= 60000 ? taskSchema.safeParse(message.body) : null;
  if (!parsed?.success) {
    const envelope = z.object({ ...common, type: z.enum(['mail.search', 'mail.read', 'mail.send', 'mail.status']) }).safeParse(message.body);
    if (envelope.success) {
      const task = envelope.data; const now = Date.now();
      // Preserve a queryable validation failure without retaining rejected parameters.
      await env.TASK_DB.prepare(`INSERT INTO mail_tasks(task_id,type,fingerprint,status,created_at,completed_at,error,metadata_expires_at)
        VALUES(?,?,?,'failed',?,?,'INVALID_TASK',?) ON CONFLICT(task_id) DO NOTHING`)
        .bind(task.task_id, task.type, await hash('invalid:' + canonical(task)), Date.parse(task.created_at), now, now + 7 * 86400000).run();
    }
    console.warn(JSON.stringify({ event: 'mail_task_rejected', code: 'INVALID_TASK' })); message.ack(); return;
  }
  const task = parsed.data; const now = Date.now(); const created = Date.parse(task.created_at);
  const fingerprint = await hash(canonical(task));
  // Reject stale tasks, even when their queue delivery has been delayed or replayed.
  const expired = created < now - 24 * 3600000 || created > now + 300000;
  await env.TASK_DB.prepare(`INSERT INTO mail_tasks(task_id,type,fingerprint,status,created_at,metadata_expires_at)
    VALUES(?,?,?,'queued',?,?) ON CONFLICT(task_id) DO NOTHING`).bind(task.task_id, task.type, fingerprint, created, now + 7 * 86400000).run();
  const row = await env.TASK_DB.prepare('SELECT task_id,type,fingerprint,status,started_at,commit_started FROM mail_tasks WHERE task_id=?').bind(task.task_id).first<Row>();
  if (!row) throw new MailError('TASK_STORAGE_FAILED');
  if (row.fingerprint !== fingerprint) { console.warn(JSON.stringify({ event: 'mail_task_rejected', code: 'TASK_ID_CONFLICT', task_id: task.task_id })); message.ack(); return; }
  if (row.status === 'processing') {
    // No second SMTP connection is ever opened for an already claimed task.
    if (row.started_at !== null && row.started_at >= now - 120000) { message.retry({ delaySeconds: 60 }); return; }
    await finish(env.TASK_DB, task, task.type === 'mail.send' ? 'unknown' : 'failed', null, task.type === 'mail.send' ? 'SMTP_RESULT_UNKNOWN' : 'WORKER_INTERRUPTED');
    message.ack(); return;
  }
  if (row.status !== 'queued') { message.ack(); return; }
  const claim = await env.TASK_DB.prepare("UPDATE mail_tasks SET status='processing',started_at=? WHERE task_id=? AND status='queued'").bind(now, task.task_id).run();
  if (claim.meta.changes !== 1) { message.retry({ delaySeconds: 60 }); return; }
  let result: unknown = null; let status = 'completed'; let error: string | null = null;
  try {
    if (expired) throw new MailError('TASK_EXPIRED');
    if (task.type === 'mail.search') result = await api.search(task.params);
    else if (task.type === 'mail.read') result = await api.read(task.params);
    else if (task.type === 'mail.status') {
      const row = await taskStatus(env.TASK_DB, task.params.task_id);
      if (row) { const { result_json: _body, ...metadata } = row; result = metadata; }
    }
    else {
      result = await api.send(task.params, async () => {
        const barrier = await env.TASK_DB.prepare("UPDATE mail_tasks SET commit_started=1 WHERE task_id=? AND status='processing'").bind(task.task_id).run();
        if (barrier.meta.changes !== 1) throw new MailError('TASK_STORAGE_FAILED');
      }); status = 'sent';
    }
    if (new TextEncoder().encode(JSON.stringify(result)).length > 256000) throw new MailError('RESULT_TOO_LARGE');
  } catch (e) { result = null; error = errorCode(e); status = error === 'SMTP_RESULT_UNKNOWN' ? 'unknown' : 'failed'; }
  // A failure saving SMTP success must escape: redelivery sees the claim and cannot resend.
  await finish(env.TASK_DB, task, status, result, error);
  console.info(JSON.stringify({ event: 'mail_task_finished', task_id: task.task_id, status, error }));
  message.ack();
}
export async function consumeBatch(batch: MessageBatch<unknown>, env: TaskEnv, api = services(env)) {
  for (const message of batch.messages) {
    try { await consumeTask(message, env, api); }
    catch { message.retry({ delaySeconds: 60 }); }
  }
  await cleanupTasks(env.TASK_DB);
}
