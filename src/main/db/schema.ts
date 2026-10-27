import type { DatabaseSync } from 'node:sqlite';

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  workspace_path TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  brief_json TEXT NOT NULL DEFAULT '{}',
  github_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_checkpoint TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS job_messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(job_id, seq)
);
CREATE TABLE IF NOT EXISTS api_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  timestamp TEXT NOT NULL,
  token_usage_json TEXT,
  cost REAL,
  error_code TEXT
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  token_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS tool_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  command TEXT NOT NULL,
  exit_code INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  output_log_path TEXT
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  version_or_commit TEXT NOT NULL,
  checksum TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target TEXT NOT NULL,
  result TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  created_at TEXT NOT NULL,
  project_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_requests_day ON api_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_approvals_project ON approvals(project_id, decision);
`;

export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const version = Number(row?.user_version ?? 0);
  if (version < 1) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA_V1);
      db.exec('PRAGMA user_version = 1');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
