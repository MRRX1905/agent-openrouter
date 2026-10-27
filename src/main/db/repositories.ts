import type { DatabaseSync } from 'node:sqlite';
import { newId, nowIso } from '../../shared/ids';
import type { AgentMessage, Job, Project, ProjectBrief, ProjectStatus } from '../../shared/types';

type Row = Record<string, unknown>;

const parseJson = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
};

const toProject = (row: Row): Project => ({
  id: String(row.id),
  name: String(row.name),
  slug: String(row.slug),
  workspacePath: String(row.workspace_path),
  stack: parseJson<string[]>(row.stack, []),
  status: String(row.status) as ProjectStatus,
  brief: parseJson<ProjectBrief>(row.brief_json, {
    problem: '', targetUsers: '', mvpFeatures: [], constraints: [], stack: [], acceptanceCriteria: [],
  }),
  githubUrl: row.github_url ? String(row.github_url) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const toJob = (row: Row): Job => ({
  id: String(row.id),
  projectId: String(row.project_id),
  currentStage: String(row.current_stage) as ProjectStatus,
  stateJson: String(row.state_json),
  retryCount: Number(row.retry_count),
  lastCheckpoint: row.last_checkpoint ? String(row.last_checkpoint) : null,
  startedAt: String(row.started_at),
  endedAt: row.ended_at ? String(row.ended_at) : null,
});

export function createProject(
  db: DatabaseSync,
  input: { name: string; slug: string; workspacePath: string; stack: string[]; brief: ProjectBrief },
): Project {
  const id = newId('prj');
  const at = nowIso();
  db.prepare(
    `INSERT INTO projects (id, name, slug, workspace_path, stack, status, brief_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'IDEA', ?, ?, ?)`,
  ).run(id, input.name, input.slug, input.workspacePath, JSON.stringify(input.stack), JSON.stringify(input.brief), at, at);
  return getProject(db, id);
}

export function getProject(db: DatabaseSync, id: string): Project {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new Error(`NOT_FOUND: project ${id}`);
  return toProject(row);
}

export function listProjects(db: DatabaseSync): Project[] {
  return (db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Row[]).map(toProject);
}

export function updateProjectStatus(db: DatabaseSync, id: string, status: ProjectStatus): void {
  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
}

export function createJob(db: DatabaseSync, projectId: string, stage: ProjectStatus): Job {
  const id = newId('job');
  db.prepare(
    'INSERT INTO jobs (id, project_id, current_stage, started_at) VALUES (?, ?, ?, ?)',
  ).run(id, projectId, stage, nowIso());
  return getJob(db, id);
}

export function getJob(db: DatabaseSync, id: string): Job {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new Error(`NOT_FOUND: job ${id}`);
  return toJob(row);
}

export function updateJob(
  db: DatabaseSync,
  id: string,
  patch: Partial<Pick<Job, 'currentStage' | 'stateJson' | 'retryCount' | 'lastCheckpoint' | 'endedAt'>>,
): void {
  const current = getJob(db, id);
  db.prepare(
    `UPDATE jobs SET current_stage = ?, state_json = ?, retry_count = ?, last_checkpoint = ?, ended_at = ? WHERE id = ?`,
  ).run(
    patch.currentStage ?? current.currentStage,
    patch.stateJson ?? current.stateJson,
    patch.retryCount ?? current.retryCount,
    patch.lastCheckpoint === undefined ? current.lastCheckpoint : patch.lastCheckpoint,
    patch.endedAt === undefined ? current.endedAt : patch.endedAt,
    id,
  );
}

export function appendMessage(db: DatabaseSync, jobId: string, message: AgentMessage): void {
  const row = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM job_messages WHERE job_id = ?').get(jobId) as { seq: number };
  db.prepare(
    'INSERT INTO job_messages (id, job_id, seq, role, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(newId('msg'), jobId, Number(row.seq) + 1, message.role, JSON.stringify(message), nowIso());
}

export function loadMessages(db: DatabaseSync, jobId: string): AgentMessage[] {
  return (db.prepare('SELECT content_json FROM job_messages WHERE job_id = ? ORDER BY seq').all(jobId) as Row[])
    .map((row) => parseJson<AgentMessage>(row.content_json, { role: 'user', content: '' }));
}

export function recordApiRequest(
  db: DatabaseSync,
  input: {
    id: string; projectId: string; provider: string; model: string;
    status: 'ok' | 'error'; httpStatus: number | null; timestamp: string;
    tokenUsage: { prompt: number; completion: number; total: number } | null;
    cost: number | null; errorCode: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO api_requests (id, project_id, provider, model, status, http_status, timestamp, token_usage_json, cost, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id, input.projectId, input.provider, input.model, input.status, input.httpStatus,
    input.timestamp, input.tokenUsage ? JSON.stringify(input.tokenUsage) : null, input.cost, input.errorCode,
  );
}

export function countRequestsToday(db: DatabaseSync, now = nowIso()): number {
  const day = now.slice(0, 10);
  const row = db.prepare('SELECT COUNT(*) AS count FROM api_requests WHERE substr(timestamp, 1, 10) = ?').get(day) as { count: number };
  return Number(row.count);
}

export function setSetting(db: DatabaseSync, key: string, value: string, isSecret = false): void {
  db.prepare(
    `INSERT INTO settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret, updated_at = excluded.updated_at`,
  ).run(key, value, isSecret ? 1 : 0, nowIso());
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function listPublicSettings(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings WHERE is_secret = 0').all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function appendAudit(
  db: DatabaseSync,
  input: {
    actor: 'user' | 'agent' | 'system';
    eventType: string;
    target: string;
    result: 'ok' | 'denied' | 'error';
    metadata?: Record<string, unknown>;
  },
): void {
  db.prepare(
    'INSERT INTO audit_events (id, actor, event_type, target, result, timestamp, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(newId('aud'), input.actor, input.eventType, input.target, input.result, nowIso(), JSON.stringify(input.metadata ?? {}));
}

export function listAudit(db: DatabaseSync, target?: string): Array<Record<string, unknown>> {
  return (target
    ? db.prepare('SELECT * FROM audit_events WHERE target = ? ORDER BY timestamp DESC').all(target)
    : db.prepare('SELECT * FROM audit_events ORDER BY timestamp DESC').all()) as Array<Record<string, unknown>>;
}
