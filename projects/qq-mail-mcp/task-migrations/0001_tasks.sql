CREATE TABLE mail_tasks (
  task_id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('mail.search','mail.read','mail.send','mail.status')),
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','sent','completed','failed','unknown')),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  commit_started INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result_json TEXT,
  result_expires_at INTEGER,
  metadata_expires_at INTEGER NOT NULL
);
CREATE INDEX mail_tasks_result_expiry ON mail_tasks(result_expires_at);
CREATE INDEX mail_tasks_metadata_expiry ON mail_tasks(metadata_expires_at);
-- Consumers never store business parameters, credentials, or OAuth records here.
-- IDs + fingerprints remain as minimal tombstones to prevent future SMTP replay.
