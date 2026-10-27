# R3X Agent Studio â€” Foundation Plan (Fase 0-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghasilkan fondasi aplikasi Electron yang aman, database lokal, penyimpanan secret, client OpenRouter dengan ledger/budget, workspace terisolasi, dan terminal real-time.

**Architecture:** Main process memegang semua I/O dan state. Renderer hanya React + IPC. Test unit memakai Vitest dengan `:memory:` SQLite dan direktori temporer; tidak ada network di test.

**Tech Stack:** Electron 45, electron-vite 6, React 19, TypeScript 7, Vitest 5, `node:sqlite`, `safeStorage`, `child_process.spawn`.

**Prasyarat:** Windows 10/11 64-bit, Node 24+, npm 11+, git. Tidak perlu Rust.

---

## Fase 0 â€” Fondasi

### Task 1: Scaffold Electron + smoke test

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `vitest.config.mts`
- Create: `src/shared/ids.ts`
- Create: `src/shared/ids.test.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/env.d.ts`
- Create: `src/renderer/src/styles.css`

- [ ] **Step 1: Tulis test yang gagal**

`src/shared/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newId, nowIso } from './ids';

describe('ids', () => {
  it('prefixes unique ids', () => {
    const a = newId('prj');
    const b = newId('prj');
    expect(a).toMatch(/^prj_[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  it('returns ISO timestamps', () => {
    const value = nowIso();
    expect(new Date(value).toISOString()).toBe(value);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/shared/ids.test.ts`
Expected: FAIL karena `src/shared/ids.ts` belum ada.

- [ ] **Step 3: Buat scaffold dan implementasi minimal**

`package.json`:

```json
{
  "name": "r3x-agent-studio",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json && electron-vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "dist": "npm run build && electron-builder --win nsis"
  },
  "dependencies": {
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@types/node": "^24.19.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "electron": "^45.0.0",
    "electron-builder": "^26.18.0",
    "electron-vite": "^6.0.0",
    "typescript": "~7.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```

`src/shared/ids.ts`:

```ts
export const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;
export const nowIso = (): string => new Date().toISOString();
```

`electron.vite.config.ts`:

```ts
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer/src'),
};

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias } },
  renderer: { plugins: [react()], resolve: { alias } },
});
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/main/**/*.ts", "src/preload/**/*.ts", "src/shared/**/*.ts", "electron.vite.config.ts", "vitest.config.mts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`tsconfig.web.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"], "@renderer/*": ["src/renderer/src/*"] }
  },
  "include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
```

`src/main/index.ts`:

```ts
import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (isDev) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL as string);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

`src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  onAgentEvent: (callback: (event: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
};

contextBridge.exposeInMainWorld('r3x', api);
```

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:*"
    />
    <title>R3X Agent Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/renderer/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app">
      <h1>R3X Agent Studio</h1>
      <p>Fondasi siap. Pilih proyek atau buat proyek baru.</p>
    </main>
  );
}
```

`src/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />

declare global {
  interface Window {
    r3x: {
      invoke(channel: string, payload?: unknown): Promise<unknown>;
      onAgentEvent(callback: (event: unknown) => void): () => void;
    };
  }
}

export {};
```

`src/renderer/src/styles.css`:

```css
:root {
  color-scheme: dark;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: #101317;
  color: #e7edf3;
}
* { box-sizing: border-box; }
body { margin: 0; }
.app { padding: 24px; }
button, input, textarea, select { font: inherit; }
```

- [ ] **Step 4: Install dan verifikasi**

Run: `npm install`
Expected: selesai tanpa error native module.

Run: `npm test -- --run src/shared/ids.test.ts`
Expected: 2 passed.

Run: `npm run build`
Expected: `out/main`, `out/preload`, `out/renderer` terbentuk.

Run: `npm run dev`
Expected: jendela Electron terbuka menampilkan judul. Tutup manual.

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json electron.vite.config.ts tsconfig*.json vitest.config.mts src
git commit -m "chore: scaffold electron app and smoke test"
```

---

### Task 2: SQLite schema, migrasi, dan repository

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/schema.test.ts`
- Create: `src/main/db/database.ts`
- Create: `src/main/db/repositories.ts`
- Create: `src/main/db/repositories.test.ts`
- Create: `src/shared/types.ts` (subset; diperluas di task berikutnya)

- [ ] **Step 1: Tulis test skema yang gagal**

`src/main/db/schema.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from './schema';

describe('migrate', () => {
  it('creates all tables and sets user_version', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    expect(tables).toEqual(
      expect.arrayContaining([
        'api_requests', 'approvals', 'audit_events', 'ideas', 'job_messages',
        'jobs', 'projects', 'settings', 'skills', 'tool_runs',
      ]),
    );
    expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 1 });
    db.close();
  });

  it('is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    migrate(db);
    expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 1 });
    db.close();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/db/schema.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi skema dan migrasi**

`src/main/db/schema.ts`:

```ts
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
```

`src/main/db/database.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './schema';

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}
```

`src/shared/types.ts` (subset; jangan hapus field saat task berikutnya menambah):

```ts
export type ProjectStatus =
  | 'IDEA' | 'PLANNING' | 'READY' | 'BUILDING' | 'TESTING' | 'REPAIRING'
  | 'DOCUMENTING' | 'REVIEW_REQUIRED' | 'PUBLISHING' | 'COMPLETED'
  | 'PAUSED' | 'NEEDS_REPAIR' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export interface ProjectBrief {
  problem: string;
  targetUsers: string;
  mvpFeatures: string[];
  constraints: string[];
  stack: string[];
  acceptanceCriteria: string[];
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  workspacePath: string;
  stack: string[];
  status: ProjectStatus;
  brief: ProjectBrief;
  githubUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  currentStage: ProjectStatus;
  stateJson: string;
  retryCount: number;
  lastCheckpoint: string | null;
  startedAt: string;
  endedAt: string | null;
}
```

- [ ] **Step 4: Tulis test repository yang gagal**

`src/main/db/repositories.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './schema';
import {
  appendMessage, countRequestsToday, createJob, createProject, getProject,
  loadMessages, recordApiRequest, setSetting, getSetting, listPublicSettings,
} from './repositories';

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
});

const brief = {
  problem: 'p', targetUsers: 'u', mvpFeatures: ['f'], constraints: [],
  stack: ['ts'], acceptanceCriteria: ['a'],
};

describe('projects', () => {
  it('round-trips a project', () => {
    const created = createProject(db, {
      name: 'Demo', slug: 'demo', workspacePath: 'C:/ws/demo', stack: ['ts'], brief,
    });
    const loaded = getProject(db, created.id);
    expect(loaded).toMatchObject({ name: 'Demo', slug: 'demo', status: 'IDEA', brief });
  });

  it('cascades messages when a job is deleted', () => {
    const project = createProject(db, { name: 'Demo', slug: 'demo', workspacePath: 'C:/ws/demo', stack: [], brief });
    const job = createJob(db, project.id, 'BUILDING');
    appendMessage(db, job.id, { role: 'user', content: 'hello' });
    db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
    expect(loadMessages(db, job.id)).toEqual([]);
  });
});

describe('ledger', () => {
  it('counts only requests from the given UTC day', () => {
    recordApiRequest(db, {
      id: 'r1', projectId: 'p', provider: 'openrouter', model: 'm', status: 'ok',
      httpStatus: 200, timestamp: '2026-10-28T01:00:00.000Z', tokenUsage: null, cost: null, errorCode: null,
    });
    recordApiRequest(db, {
      id: 'r2', projectId: 'p', provider: 'openrouter', model: 'm', status: 'error',
      httpStatus: 429, timestamp: '2026-10-27T23:59:59.000Z', tokenUsage: null, cost: null, errorCode: '429',
    });
    expect(countRequestsToday(db, '2026-10-28T12:00:00.000Z')).toBe(1);
  });
});

describe('settings', () => {
  it('hides secret values from public listing', () => {
    setSetting(db, 'model', 'openrouter/auto');
    setSetting(db, 'secret:openrouter', 'ciphertext', true);
    expect(getSetting(db, 'model')).toBe('openrouter/auto');
    expect(getSetting(db, 'secret:openrouter')).toBe('ciphertext');
    expect(listPublicSettings(db)).toEqual({ model: 'openrouter/auto' });
  });
});
```

- [ ] **Step 5: Implementasi repository**

`src/main/db/repositories.ts`:

```ts
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
```

- [ ] **Step 6: Jalankan test**

Run: `npm test -- --run src/main/db`
Expected: semua test lulus.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/db
git commit -m "feat: add sqlite schema and repositories"
```

---

### Task 3: Secret storage, settings, redaksi, dan IPC shell

**Files:**
- Modify: `src/shared/types.ts` (tambahkan tipe domain yang belum ada)
- Create: `src/shared/ipc-contract.ts`
- Create: `src/shared/redact.ts`
- Create: `src/shared/redact.test.ts`
- Create: `src/main/security/secrets.ts`
- Create: `src/main/security/secrets.test.ts`
- Create: `src/main/settings-service.ts`
- Create: `src/main/settings-service.test.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `src/renderer/src/lib/api.ts`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Tulis test redaksi dan SecretBox yang gagal**

`src/shared/redact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('removes openrouter and github tokens', () => {
    const text = 'key sk-or-v1-abcdefghijklmnopqrstuvwxyz token ghp_abcdefghijklmnopqrstuvwxyz012345';
    const out = redact(text);
    expect(out).not.toContain('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    expect(out).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
  });

  it('removes private keys and bearer headers', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----\nAuthorization: Bearer abc.def';
    const out = redact(text);
    expect(out).not.toContain('secret');
    expect(out).not.toContain('abc.def');
  });
});
```

`src/main/security/secrets.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { getSetting } from '../db/repositories';
import { SecretBox, type CryptoPort } from './secrets';

const xor: CryptoPort = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value.split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 7)).join('')),
  decrypt: (buffer) => buffer.toString().split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 7)).join(''),
};

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
});

describe('SecretBox', () => {
  it('stores ciphertext, not plaintext', () => {
    const box = new SecretBox(db, xor);
    box.set('secret:openrouter', 'sk-or-v1-plain-secret');
    const stored = getSetting(db, 'secret:openrouter');
    expect(stored).not.toContain('plain-secret');
    expect(box.get('secret:openrouter')).toBe('sk-or-v1-plain-secret');
    expect(box.has('secret:openrouter')).toBe(true);
  });

  it('refuses to store when OS encryption is unavailable', () => {
    const box = new SecretBox(db, { ...xor, isAvailable: () => false });
    expect(() => box.set('secret:openrouter', 'x')).toThrow('SECRET:');
  });

  it('clears a secret', () => {
    const box = new SecretBox(db, xor);
    box.set('secret:openrouter', 'x');
    box.clear('secret:openrouter');
    expect(box.get('secret:openrouter')).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/shared/redact.test.ts src/main/security/secrets.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi redaksi dan SecretBox**

`src/shared/redact.ts`:

```ts
const PATTERNS: Array<[RegExp, string]> = [
  [/sk-or-v1-[A-Za-z0-9_-]{16,}/g, 'sk-or-v1-[REDACTED]'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh*_[REDACTED]'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_[REDACTED]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]'],
  [/(Authorization:\s*Bearer\s+)\S+/gi, '$1[REDACTED]'],
];

export const redact = (text: string): string =>
  PATTERNS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
```

`src/main/security/secrets.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { getSetting, setSetting } from '../db/repositories';

export interface CryptoPort {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export class SecretBox {
  constructor(private readonly db: DatabaseSync, private readonly crypto: CryptoPort) {}

  set(key: string, value: string): void {
    if (!this.crypto.isAvailable()) throw new Error('SECRET: OS encryption is unavailable');
    const cipher = this.crypto.encrypt(value).toString('base64');
    setSetting(this.db, key, cipher, true);
  }

  get(key: string): string | null {
    const cipher = getSetting(this.db, key);
    if (!cipher) return null;
    try {
      return this.crypto.decrypt(Buffer.from(cipher, 'base64'));
    } catch {
      throw new Error('SECRET: unable to decrypt stored value');
    }
  }

  has(key: string): boolean {
    return getSetting(this.db, key) !== null;
  }

  clear(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}
```

- [ ] **Step 4: Tulis test SettingsService yang gagal**

`src/main/settings-service.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './db/schema';
import { SecretBox } from './security/secrets';
import { SettingsService } from './settings-service';

let service: SettingsService;
let secrets: SecretBox;
beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  secrets = new SecretBox(db, {
    isAvailable: () => true,
    encrypt: (v) => Buffer.from(v),
    decrypt: (v) => v.toString(),
  });
  service = new SettingsService(db, secrets, 'C:/Users/test/Documents/R3X-Projects');
});

describe('SettingsService', () => {
  it('returns safe defaults without secrets', () => {
    const settings = service.get();
    expect(settings).toMatchObject({
      model: 'openrouter/auto', dailyRequestCap: 50, repairReservePct: 20,
      mode: 'supervised', hasOpenRouterKey: false, hasGithubToken: false,
    });
    expect(JSON.stringify(settings)).not.toContain('secret:');
  });

  it('stores the api key encrypted and exposes only a boolean', () => {
    service.setOpenRouterKey('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    expect(service.get().hasOpenRouterKey).toBe(true);
    expect(JSON.stringify(service.get())).not.toContain('sk-or-v1-');
    expect(secrets.get('secret:openrouter')).toBe('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
  });

  it('validates caps and reserve', () => {
    expect(() => service.update({ dailyRequestCap: 0 })).toThrow('VALIDATION:');
    expect(() => service.update({ repairReservePct: 90 })).toThrow('VALIDATION:');
  });
});
```

- [ ] **Step 5: Implementasi SettingsService dan kontrak IPC**

Tambahkan ke `src/shared/types.ts`:

```ts
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PolicyAction = 'allow' | 'approval' | 'block';
export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired';
export type OperatingMode = 'auto' | 'supervised' | 'repair';
export type SkillReviewStatus = 'pending' | 'approved' | 'rejected';

export interface TokenUsage { prompt: number; completion: number; total: number }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolResult { ok: boolean; output: string; exitCode?: number | null }
export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ApiRequestRecord {
  id: string; projectId: string; provider: string; model: string;
  status: 'ok' | 'error'; httpStatus: number | null; timestamp: string;
  tokenUsage: TokenUsage | null; cost: number | null; errorCode: string | null;
}
export interface ApprovalRecord {
  id: string; projectId: string; actionType: 'command' | 'publish' | 'skill_script';
  commandSummary: string; workingDirectory: string; riskLevel: RiskLevel;
  decision: ApprovalDecision; tokenHash: string; payloadJson: string;
  expiresAt: string; decidedAt: string | null; consumedAt: string | null;
}
export interface ToolRunRecord {
  id: string; projectId: string; tool: string; command: string;
  exitCode: number | null; startedAt: string; endedAt: string | null; outputLogPath: string | null;
}
export interface SkillRecord {
  id: string; name: string; source: string; versionOrCommit: string;
  checksum: string; reviewStatus: SkillReviewStatus; enabled: boolean;
}
export interface AuditEventRecord {
  id: string; actor: 'user' | 'agent' | 'system'; eventType: string; target: string;
  result: 'ok' | 'denied' | 'error'; timestamp: string; metadataJson: string;
}
export interface AppSettings {
  model: string; dailyRequestCap: number; repairReservePct: number;
  workspaceRoot: string; mode: OperatingMode; githubClientId: string;
  hasOpenRouterKey: boolean; hasGithubToken: boolean;
}
export interface SkillSearchResult {
  id: string; source: string; skillId: string; name: string; installs: number;
}
```

`src/shared/ipc-contract.ts`:

```ts
import type {
  AgentEvent, AppSettings, ApprovalRecord, OperatingMode, Project, ProjectBrief,
  SkillRecord, SkillSearchResult,
} from './types';

export interface IpcContract {
  'app:ping': { req: void; res: { version: string } };
  'settings:get': { req: void; res: AppSettings };
  'settings:update': { req: Partial<Pick<AppSettings, 'model' | 'dailyRequestCap' | 'repairReservePct' | 'workspaceRoot' | 'mode' | 'githubClientId'>>; res: AppSettings };
  'secret:setOpenRouterKey': { req: { apiKey: string }; res: { ok: true } };
  'secret:clearOpenRouterKey': { req: void; res: { ok: true } };
  'projects:list': { req: void; res: Project[] };
  'projects:create': { req: { name: string; brief: ProjectBrief; mode: OperatingMode }; res: Project };
  'projects:get': { req: { projectId: string }; res: Project };
  'jobs:start': { req: { projectId: string }; res: { jobId: string } };
  'jobs:pause': { req: { jobId: string }; res: { ok: true } };
  'jobs:resume': { req: { jobId: string }; res: { ok: true } };
  'terminal:run': { req: { projectId: string; executable: string; args: string[] }; res: { runId: string } };
  'terminal:stop': { req: { runId: string }; res: { ok: true } };
  'approvals:list': { req: { projectId: string }; res: ApprovalRecord[] };
  'approvals:decide': { req: { approvalId: string; decision: 'approved' | 'rejected' }; res: { ok: true } };
  'skills:search': { req: { query: string }; res: SkillSearchResult[] };
  'skills:install': { req: { source: string; skillId: string }; res: SkillRecord };
  'skills:setEnabled': { req: { skillId: string; enabled: boolean }; res: { ok: true } };
  'github:startDeviceFlow': { req: void; res: { userCode: string; verificationUri: string; expiresIn: number } };
  'github:pollDeviceFlow': { req: void; res: { status: 'pending' | 'connected' | 'expired'; login?: string } };
  'github:publish': { req: { projectId: string; repoName: string; visibility: 'private' | 'public' }; res: { repoUrl: string; commitSha: string } };
  'budget:get': { req: { projectId?: string }; res: { used: number; cap: number; reservePct: number } };
  'backup:create': { req: void; res: { path: string } };
  'stats:get': { req: void; res: { projects: number; requestsToday: number; requestsTotal: number } };
}

export type IpcChannel = keyof IpcContract;

export interface R3xApi {
  invoke<C extends IpcChannel>(channel: C, payload?: IpcContract[C]['req']): Promise<IpcContract[C]['res']>;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
}
```

Tambahkan `AgentEvent` ke `src/shared/types.ts`:

```ts
export type AgentEvent =
  | { type: 'stage'; projectId: string; jobId: string; stage: ProjectStatus; summary: string }
  | { type: 'token'; projectId: string; text: string }
  | { type: 'tool'; projectId: string; tool: string; command: string; status: 'start' | 'ok' | 'error'; exitCode?: number | null }
  | { type: 'terminal'; runId: string; stream: 'stdout' | 'stderr' | 'exit'; data: string; exitCode?: number | null }
  | { type: 'approval'; approval: ApprovalRecord }
  | { type: 'budget'; projectId: string; used: number; cap: number; reservePct: number }
  | { type: 'error'; projectId: string; message: string };
```

`src/main/settings-service.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { getSetting, listPublicSettings, setSetting } from './db/repositories';
import type { SecretBox } from './security/secrets';
import type { AppSettings, OperatingMode } from '../shared/types';

const DEFAULT_MODEL = 'openrouter/auto';
const DEFAULT_CAP = 50;
const DEFAULT_RESERVE = 20;
const MODES: OperatingMode[] = ['auto', 'supervised', 'repair'];

export class SettingsService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly secrets: SecretBox,
    private readonly defaultWorkspaceRoot: string,
  ) {}

  get(): AppSettings {
    const values = listPublicSettings(this.db);
    return {
      model: values.model ?? DEFAULT_MODEL,
      dailyRequestCap: Number(values.dailyRequestCap ?? DEFAULT_CAP),
      repairReservePct: Number(values.repairReservePct ?? DEFAULT_RESERVE),
      workspaceRoot: values.workspaceRoot ?? this.defaultWorkspaceRoot,
      mode: (values.mode as OperatingMode | undefined) ?? 'supervised',
      githubClientId: values.githubClientId ?? '',
      hasOpenRouterKey: this.secrets.has('secret:openrouter'),
      hasGithubToken: this.secrets.has('secret:github'),
    };
  }

  update(patch: Partial<Pick<AppSettings, 'model' | 'dailyRequestCap' | 'repairReservePct' | 'workspaceRoot' | 'mode' | 'githubClientId'>>): AppSettings {
    if (patch.dailyRequestCap !== undefined && (!Number.isInteger(patch.dailyRequestCap) || patch.dailyRequestCap < 1 || patch.dailyRequestCap > 1000)) {
      throw new Error('VALIDATION: dailyRequestCap must be 1..1000');
    }
    if (patch.repairReservePct !== undefined && (!Number.isInteger(patch.repairReservePct) || patch.repairReservePct < 0 || patch.repairReservePct > 80)) {
      throw new Error('VALIDATION: repairReservePct must be 0..80');
    }
    if (patch.mode !== undefined && !MODES.includes(patch.mode)) throw new Error('VALIDATION: invalid mode');
    if (patch.workspaceRoot !== undefined && !patch.workspaceRoot.trim()) throw new Error('VALIDATION: workspaceRoot is required');
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) setSetting(this.db, key, String(value));
    }
    return this.get();
  }

  setOpenRouterKey(apiKey: string): void {
    const value = apiKey.trim();
    if (!value.startsWith('sk-or-') || value.length < 20) throw new Error('VALIDATION: invalid OpenRouter API key');
    this.secrets.set('secret:openrouter', value);
  }

  getOpenRouterKey(): string {
    const value = this.secrets.get('secret:openrouter');
    if (!value) throw new Error('AUTH: OpenRouter API key is not configured');
    return value;
  }

  clearOpenRouterKey(): void {
    this.secrets.clear('secret:openrouter');
  }

  getSetting(key: string): string | null {
    return getSetting(this.db, key);
  }
}
```

`src/main/ipc.ts`:

```ts
import { app, ipcMain } from 'electron';
import type { AppSettings } from '../shared/types';
import type { SettingsService } from './settings-service';

export interface IpcDeps { settings: SettingsService }

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) throw new Error('VALIDATION: payload must be an object');
  return value as Record<string, unknown>;
};

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('app:ping', () => ({ version: app.getVersion() }));
  ipcMain.handle('settings:get', () => deps.settings.get());
  ipcMain.handle('settings:update', (_event, payload) => deps.settings.update(asObject(payload) as Partial<AppSettings>));
  ipcMain.handle('secret:setOpenRouterKey', (_event, payload) => {
    const { apiKey } = asObject(payload);
    if (typeof apiKey !== 'string') throw new Error('VALIDATION: apiKey must be a string');
    deps.settings.setOpenRouterKey(apiKey);
    return { ok: true } as const;
  });
  ipcMain.handle('secret:clearOpenRouterKey', () => {
    deps.settings.clearOpenRouterKey();
    return { ok: true } as const;
  });
}
```

Modify `src/main/index.ts` untuk membuka DB, SecretBox, SettingsService, dan memanggil `registerIpc`:

```ts
import { app, BrowserWindow, safeStorage, session } from 'electron';
import { join } from 'node:path';
import { openDatabase } from './db/database';
import { registerIpc } from './ipc';
import { SecretBox } from './security/secrets';
import { SettingsService } from './settings-service';

// ...createWindow tetap...
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const db = openDatabase(join(app.getPath('userData'), 'r3x.db'));
  const secrets = new SecretBox(db, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  });
  const settings = new SettingsService(db, secrets, join(app.getPath('documents'), 'R3X-Projects'));
  registerIpc({ settings });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
```

Modify `src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { AgentEvent } from '../shared/types';
import type { R3xApi } from '../shared/ipc-contract';

const api: R3xApi = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  onAgentEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: AgentEvent) => callback(value);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
};

contextBridge.exposeInMainWorld('r3x', api);
```

Update `src/renderer/src/env.d.ts` agar memakai `R3xApi`:

```ts
/// <reference types="vite/client" />
import type { R3xApi } from '../../shared/ipc-contract';

declare global {
  interface Window { r3x: R3xApi }
}

export {};
```

- [ ] **Step 6: UI Settings dan API client**

`src/renderer/src/lib/api.ts`:

```ts
import type { IpcChannel, IpcContract } from '@shared/ipc-contract';

export const api = {
  invoke<C extends IpcChannel>(channel: C, payload?: IpcContract[C]['req']): Promise<IpcContract[C]['res']> {
    return window.r3x.invoke(channel, payload);
  },
  onAgentEvent: (callback: Parameters<typeof window.r3x.onAgentEvent>[0]) => window.r3x.onAgentEvent(callback),
};
```

`src/renderer/src/pages/SettingsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AppSettings } from '@shared/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api.invoke('settings:get').then(setSettings);
  }, []);

  if (!settings) return <p>Memuat pengaturanâ€¦</p>;

  const save = async () => {
    const next = await api.invoke('settings:update', {
      model: settings.model,
      dailyRequestCap: settings.dailyRequestCap,
      repairReservePct: settings.repairReservePct,
      workspaceRoot: settings.workspaceRoot,
      mode: settings.mode,
      githubClientId: settings.githubClientId,
    });
    setSettings(next);
    setMessage('Pengaturan disimpan.');
  };

  const saveKey = async () => {
    await api.invoke('secret:setOpenRouterKey', { apiKey });
    setApiKey('');
    setSettings(await api.invoke('settings:get'));
    setMessage('API key disimpan terenkripsi.');
  };

  return (
    <section>
      <h2>Pengaturan</h2>
      <label>Model <input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} /></label>
      <label>Batas request/hari <input type="number" min={1} max={1000} value={settings.dailyRequestCap} onChange={(e) => setSettings({ ...settings, dailyRequestCap: Number(e.target.value) })} /></label>
      <label>Reserve repair (%) <input type="number" min={0} max={80} value={settings.repairReservePct} onChange={(e) => setSettings({ ...settings, repairReservePct: Number(e.target.value) })} /></label>
      <label>Folder workspace <input value={settings.workspaceRoot} onChange={(e) => setSettings({ ...settings, workspaceRoot: e.target.value })} /></label>
      <label>Mode
        <select value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value as AppSettings['mode'] })}>
          <option value="auto">Auto Build</option>
          <option value="supervised">Supervised Build</option>
          <option value="repair">Repair Existing Project</option>
        </select>
      </label>
      <label>GitHub OAuth Client ID <input value={settings.githubClientId} onChange={(e) => setSettings({ ...settings, githubClientId: e.target.value })} /></label>
      <button onClick={() => void save()}>Simpan</button>

      <h3>OpenRouter API Key</h3>
      <p>{settings.hasOpenRouterKey ? 'Tersimpan.' : 'Belum ada.'}</p>
      <input type="password" value={apiKey} placeholder="sk-or-v1-..." onChange={(e) => setApiKey(e.target.value)} />
      <button disabled={!apiKey} onClick={() => void saveKey()}>Simpan key</button>
      <button onClick={() => void api.invoke('secret:clearOpenRouterKey').then(() => api.invoke('settings:get')).then(setSettings)}>Hapus key</button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
```

Modify `App.tsx` untuk menampilkan SettingsPage sementara:

```tsx
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <main className="app">
      <h1>R3X Agent Studio</h1>
      <SettingsPage />
    </main>
  );
}
```

- [ ] **Step 7: Jalankan test dan build**

Run: `npm test -- --run`
Expected: semua test lulus.

Run: `npm run build`
Expected: build sukses; tidak ada error tipe.

Run: `npm run dev`
Expected: SettingsPage tampil; simpan key, tutup app, buka lagi, status key tetap "Tersimpan".

- [ ] **Step 8: Commit**

```bash
git add src/shared src/main src/preload src/renderer
git commit -m "feat: add encrypted settings and ipc shell"
```

---

## Fase 1 â€” OpenRouter

### Task 4: SSE parser dan OpenRouter client

**Files:**
- Create: `src/main/providers/sse.ts`
- Create: `src/main/providers/sse.test.ts`
- Create: `src/main/providers/openrouter.ts`
- Create: `src/main/providers/openrouter.test.ts`

- [ ] **Step 1: Tulis test SSE yang gagal**

`src/main/providers/sse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSseStream } from './sse';

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};

const collect = async (stream: ReadableStream<Uint8Array>): Promise<string[]> => {
  const values: string[] = [];
  for await (const value of parseSseStream(stream)) values.push(value);
  return values;
};

describe('parseSseStream', () => {
  it('handles events split across chunks', async () => {
    const values = await collect(streamOf('data: {"a":', '1}\n\ndata: [DONE]\n\n'));
    expect(values).toEqual(['{"a":1}', '[DONE]']);
  });

  it('handles CRLF and multiline data', async () => {
    const values = await collect(streamOf('data: line1\r\ndata: line2\r\n\r\n'));
    expect(values).toEqual(['line1\nline2']);
  });

  it('ignores comments and empty blocks', async () => {
    const values = await collect(streamOf(': keepalive\n\n\n\ndata: x\n\n'));
    expect(values).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/providers/sse.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi parser**

`src/main/providers/sse.ts`:

```ts
const parseBlock = (block: string): string | null => {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return data.length > 0 ? data : null;
};

export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let match = buffer.match(/\r?\n\r?\n/);
    while (match && match.index !== undefined) {
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = parseBlock(block);
      if (data !== null) yield data;
      match = buffer.match(/\r?\n\r?\n/);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const data = parseBlock(buffer);
    if (data !== null) yield data;
  }
}
```

- [ ] **Step 4: Tulis test OpenRouter yang gagal**

`src/main/providers/openrouter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OpenRouterClient, OpenRouterError } from './openrouter';

const sseResponse = (chunks: string[]): Response => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

describe('OpenRouterClient', () => {
  it('assembles content, tool calls, and usage from a stream', async () => {
    const fetchImpl = (async () =>
      sseResponse([
        'data: {"id":"gen-1","model":"test/model","provider":"p","choices":[{"delta":{"content":"Hello "},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","model":"test/model","choices":[{"delta":{"content":"world"},"finish_reason":null}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"a.txt\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: {"id":"gen-1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ])) as typeof fetch;

    const client = new OpenRouterClient({ apiKey: () => 'sk-or-v1-test', fetchImpl });
    const result = await client.chat({
      model: 'test/model',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });

    expect(result.content).toBe('Hello world');
    expect(result.toolCalls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } },
    ]);
    expect(result.usage).toEqual({ prompt: 10, completion: 5, total: 15 });
    expect(result.finishReason).toBe('tool_calls');
  });

  it('throws a typed error on http failure and redacts the body', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'rate limited sk-or-v1-secretsecretsecret' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const client = new OpenRouterClient({ apiKey: () => 'sk-or-v1-test', fetchImpl });
    await expect(client.chat({ model: 'm', messages: [] })).rejects.toMatchObject({
      name: 'OpenRouterError', status: 429,
    });
    try {
      await client.chat({ model: 'm', messages: [] });
      throw new Error('expected failure');
    } catch (error) {
      expect(String(error)).not.toContain('secretsecretsecret');
    }
  });
});
```

- [ ] **Step 5: Implementasi client**

`src/main/providers/openrouter.ts`:

```ts
import { redact } from '../../shared/redact';
import type { AgentMessage, TokenUsage, ToolCall, ToolDefinition } from '../../shared/types';
import { parseSseStream } from './sse';

export interface ChatRequest {
  model: string;
  messages: AgentMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  id: string;
  model: string;
  provider: string | null;
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage | null;
  finishReason: string | null;
}

export class OpenRouterError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

interface Chunk {
  id?: string;
  model?: string;
  provider?: string;
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: number | string; message?: string };
}

export class OpenRouterClient {
  private readonly baseUrl: string;

  constructor(private readonly options: { apiKey: () => string; fetchImpl?: typeof fetch; baseUrl?: string }) {
    this.baseUrl = options.baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey()}`,
        'Content-Type': 'application/json',
        'X-Title': 'R3X Agent Studio',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        stream: true,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      const body = redact(await response.text());
      let code = String(response.status);
      try { code = String((JSON.parse(body) as { error?: { code?: unknown } }).error?.code ?? code); } catch { /* body bukan JSON */ }
      throw new OpenRouterError(response.status, code, `OpenRouter ${response.status}: ${body.slice(0, 500)}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') || !response.body) {
      const json = (await response.json()) as {
        id?: string; model?: string; provider?: string;
        choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const choice = json.choices?.[0];
      return {
        id: json.id ?? '', model: json.model ?? request.model, provider: json.provider ?? null,
        content: choice?.message?.content ?? '', toolCalls: choice?.message?.tool_calls ?? [],
        usage: json.usage ? { prompt: json.usage.prompt_tokens ?? 0, completion: json.usage.completion_tokens ?? 0, total: json.usage.total_tokens ?? 0 } : null,
        finishReason: choice?.finish_reason ?? null,
      };
    }

    let id = '';
    let model = request.model;
    let provider: string | null = null;
    let content = '';
    let finishReason: string | null = null;
    let usage: TokenUsage | null = null;
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of parseSseStream(response.body)) {
      if (data === '[DONE]') break;
      let chunk: Chunk;
      try { chunk = JSON.parse(data) as Chunk; } catch { throw new OpenRouterError(502, 'bad_stream', 'OpenRouter mengirim event yang tidak valid'); }
      if (chunk.error) {
        throw new OpenRouterError(Number(chunk.error.code ?? 502), String(chunk.error.code ?? 'stream_error'), redact(chunk.error.message ?? 'stream error'));
      }
      id = chunk.id ?? id;
      model = chunk.model ?? model;
      provider = chunk.provider ?? provider;
      if (chunk.usage) {
        usage = {
          prompt: chunk.usage.prompt_tokens ?? 0,
          completion: chunk.usage.completion_tokens ?? 0,
          total: chunk.usage.total_tokens ?? 0,
        };
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      content += choice.delta?.content ?? '';
      finishReason = choice.finish_reason ?? finishReason;
      for (const part of choice.delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const current = toolCalls.get(index) ?? { id: '', name: '', args: '' };
        if (part.id) current.id = part.id;
        current.name += part.function?.name ?? '';
        current.args += part.function?.arguments ?? '';
        toolCalls.set(index, current);
      }
    }

    return {
      id, model, provider, content, finishReason, usage,
      toolCalls: [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, call]) => ({
          id: call.id || `call_${index}`,
          type: 'function' as const,
          function: { name: call.name, arguments: call.args },
        })),
    };
  }
}
```

- [ ] **Step 6: Jalankan test**

Run: `npm test -- --run src/main/providers`
Expected: semua test lulus.

- [ ] **Step 7: Commit**

```bash
git add src/main/providers
git commit -m "feat: add openrouter streaming client"
```

---

### Task 5: Ledger request dan budget guard

**Files:**
- Create: `src/main/providers/budget.ts`
- Create: `src/main/providers/budget.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/components/BudgetBar.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Tulis test budget yang gagal**

`src/main/providers/budget.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { recordApiRequest } from '../db/repositories';
import { BudgetService, canSpend } from './budget';

describe('canSpend', () => {
  it('reserves part of the cap outside repair', () => {
    expect(canSpend({ used: 39, cap: 50, reservePct: 20 }, 'BUILDING').allowed).toBe(true);
    expect(canSpend({ used: 40, cap: 50, reservePct: 20 }, 'BUILDING').allowed).toBe(false);
    expect(canSpend({ used: 40, cap: 50, reservePct: 20 }, 'REPAIRING').allowed).toBe(true);
    expect(canSpend({ used: 50, cap: 50, reservePct: 20 }, 'REPAIRING').allowed).toBe(false);
  });
});

describe('BudgetService', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    migrate(db);
  });

  it('blocks when the effective cap is reached', () => {
    const service = new BudgetService(db, { dailyRequestCap: 5, repairReservePct: 20 }, '2026-10-28T10:00:00.000Z');
    for (let i = 0; i < 4; i += 1) {
      recordApiRequest(db, {
        id: `r${i}`, projectId: 'p', provider: 'openrouter', model: 'm', status: 'ok',
        httpStatus: 200, timestamp: '2026-10-28T09:00:00.000Z', tokenUsage: null, cost: null, errorCode: null,
      });
    }
    expect(() => service.beforeRequest('BUILDING')).toThrow('BUDGET:');
    expect(service.beforeRequest('REPAIRING').effectiveCap).toBe(5);
  });

  it('records every attempt, including errors', () => {
    const service = new BudgetService(db, { dailyRequestCap: 10, repairReservePct: 20 }, '2026-10-28T10:00:00.000Z');
    service.record({ projectId: 'p', model: 'm', status: 'error', httpStatus: 429, tokenUsage: null, cost: null, errorCode: '429' });
    expect(service.snapshot().used).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/providers/budget.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi budget**

`src/main/providers/budget.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { newId, nowIso } from '../../shared/ids';
import type { ProjectStatus, TokenUsage } from '../../shared/types';
import { countRequestsToday, recordApiRequest } from '../db/repositories';

export interface BudgetConfig { dailyRequestCap: number; repairReservePct: number }

export interface BudgetCheck { allowed: boolean; used: number; effectiveCap: number; reason?: string }

export function effectiveCap(config: BudgetConfig, stage: ProjectStatus): number {
  if (stage === 'REPAIRING') return config.dailyRequestCap;
  const reserve = Math.ceil((config.dailyRequestCap * config.repairReservePct) / 100);
  return Math.max(0, config.dailyRequestCap - reserve);
}

export function canSpend(
  input: { used: number; cap: number; reservePct: number },
  stage: ProjectStatus,
): BudgetCheck {
  const cap = effectiveCap({ dailyRequestCap: input.cap, repairReservePct: input.reservePct }, stage);
  if (input.used >= cap) {
    return { allowed: false, used: input.used, effectiveCap: cap, reason: `BUDGET: daily cap reached (${input.used}/${cap})` };
  }
  return { allowed: true, used: input.used, effectiveCap: cap };
}

export class BudgetService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly config: BudgetConfig,
    private readonly now: () => string = nowIso,
  ) {}

  snapshot(): { used: number; cap: number; reservePct: number } {
    return {
      used: countRequestsToday(this.db, this.now()),
      cap: this.config.dailyRequestCap,
      reservePct: this.config.repairReservePct,
    };
  }

  beforeRequest(stage: ProjectStatus): BudgetCheck {
    const { used, cap, reservePct } = this.snapshot();
    const check = canSpend({ used, cap, reservePct }, stage);
    if (!check.allowed) throw new Error(check.reason);
    return check;
  }

  record(input: {
    projectId: string; model: string; status: 'ok' | 'error'; httpStatus: number | null;
    tokenUsage: TokenUsage | null; cost: number | null; errorCode: string | null;
  }): void {
    recordApiRequest(this.db, {
      id: newId('req'),
      provider: 'openrouter',
      timestamp: this.now(),
      ...input,
    });
  }
}
```

- [ ] **Step 4: Tambahkan IPC budget dan UI**

Tambahkan handler di `src/main/ipc.ts`:

```ts
ipcMain.handle('budget:get', () => deps.budget.snapshot());
```

Perluas `IpcDeps`:

```ts
export interface IpcDeps {
  settings: SettingsService;
  budget: BudgetService;
}
```

Di `src/main/index.ts`, buat `BudgetService` dari settings saat ini. Karena settings bisa berubah, gunakan getter:

```ts
const budget = new BudgetService(db, {
  dailyRequestCap: settings.get().dailyRequestCap,
  repairReservePct: settings.get().repairReservePct,
});
registerIpc({ settings, budget });
```

`src/renderer/src/components/BudgetBar.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function BudgetBar() {
  const [state, setState] = useState({ used: 0, cap: 50, reservePct: 20 });
  useEffect(() => {
    void api.invoke('budget:get', {}).then(setState);
  }, []);
  const reserve = Math.ceil((state.cap * state.reservePct) / 100);
  return (
    <div className="budget">
      <span>{state.used}/{state.cap} request hari ini</span>
      <progress value={state.used} max={state.cap} />
      <small>reserve repair: {reserve}</small>
    </div>
  );
}
```

Tampilkan `<BudgetBar />` di `SettingsPage` bagian atas.

- [ ] **Step 5: Jalankan test dan build**

Run: `npm test -- --run`
Expected: semua test lulus.

Run: `npm run build`
Expected: sukses.

- [ ] **Step 6: Commit**

```bash
git add src/main/providers src/main/ipc.ts src/main/index.ts src/renderer
git commit -m "feat: add request ledger and budget guard"
```

---

## Fase 2 â€” Workspace & Terminal

### Task 6: Path guard, workspace service, dan file tools

**Files:**
- Create: `src/main/security/path-guard.ts`
- Create: `src/main/security/path-guard.test.ts`
- Create: `src/main/workspace/workspace-service.ts`
- Create: `src/main/workspace/workspace-service.test.ts`
- Create: `src/main/tools/tool-defs.ts`
- Create: `src/main/tools/tool-router.ts`
- Create: `src/main/tools/tool-router.test.ts`

- [ ] **Step 1: Tulis test path guard yang gagal**

`src/main/security/path-guard.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveInWorkspace } from './path-guard';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'r3x-guard-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'a.txt'), 'ok');
});

describe('resolveInWorkspace', () => {
  it('accepts a relative path inside the workspace', async () => {
    await expect(resolveInWorkspace(root, 'src/a.txt')).resolves.toBe(join(root, 'src', 'a.txt'));
  });

  it('rejects traversal and absolute paths', async () => {
    await expect(resolveInWorkspace(root, '../outside.txt')).rejects.toThrow('POLICY:');
    await expect(resolveInWorkspace(root, 'C:/Windows/win.ini')).rejects.toThrow('POLICY:');
  });

  it('rejects a symlink that resolves outside', async () => {
    const fakeRealpath = async (value: string) => (value.endsWith('a.txt') ? 'C:/outside/a.txt' : value);
    await expect(resolveInWorkspace(root, 'src/a.txt', fakeRealpath)).rejects.toThrow('POLICY:');
  });

  it('rejects null bytes and empty paths', async () => {
    await expect(resolveInWorkspace(root, 'a\0b')).rejects.toThrow('VALIDATION:');
    await expect(resolveInWorkspace(root, '  ')).rejects.toThrow('VALIDATION:');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/security/path-guard.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi path guard**

`src/main/security/path-guard.ts`:

```ts
import { realpath as fsRealpath } from 'node:fs/promises';
import path from 'node:path';

export type RealpathFn = (value: string) => Promise<string>;

const assertInside = (root: string, target: string): void => {
  const relative = path.relative(root, target);
  if (relative === '') return;
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('POLICY: path outside workspace');
  }
};

export async function resolveInWorkspace(
  root: string,
  relative: string,
  realpathFn: RealpathFn = fsRealpath,
): Promise<string> {
  if (!relative.trim()) throw new Error('VALIDATION: path is required');
  if (relative.includes('\0')) throw new Error('VALIDATION: invalid path');

  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relative);
  assertInside(absoluteRoot, absolute);

  const realRoot = await realpathFn(absoluteRoot);
  let realTarget: string;
  try {
    realTarget = await realpathFn(absolute);
  } catch {
    realTarget = path.join(await realpathFn(path.dirname(absolute)), path.basename(absolute));
  }
  assertInside(realRoot, realTarget);
  return absolute;
}
```

- [ ] **Step 4: Tulis test workspace yang gagal**

`src/main/workspace/workspace-service.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceService } from './workspace-service';

let root: string;
let service: WorkspaceService;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'r3x-ws-'));
  service = new WorkspaceService(root);
});

describe('WorkspaceService', () => {
  it('creates a project dir with .gitignore', async () => {
    const dir = await service.createProjectDir('demo-app');
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toContain('node_modules');
  });

  it('writes and reads files inside the workspace', async () => {
    const dir = await service.createProjectDir('demo');
    await service.writeFile(dir, 'src/index.ts', 'export const x = 1;');
    expect(await service.readFile(dir, 'src/index.ts')).toBe('export const x = 1;');
    expect(await service.listFiles(dir)).toContain('src/index.ts');
  });

  it('rejects traversal and oversized files', async () => {
    const dir = await service.createProjectDir('demo');
    await expect(service.writeFile(dir, '../escape.txt', 'x')).rejects.toThrow('POLICY:');
    await expect(service.writeFile(dir, 'big.txt', 'x'.repeat(1_048_577))).rejects.toThrow('VALIDATION:');
  });

  it('rejects invalid slugs', async () => {
    await expect(service.createProjectDir('../bad')).rejects.toThrow('VALIDATION:');
  });
});
```

- [ ] **Step 5: Implementasi workspace service**

`src/main/workspace/workspace-service.ts`:

```ts
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveInWorkspace } from '../security/path-guard';

const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES = 2_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', '.next', 'coverage']);
const DEFAULT_GITIGNORE = `node_modules/\ndist/\nout/\n.env\n.env.*\n*.log\n*.sqlite\n*.db\n.DS_Store\n`;

const assertSize = (content: string): void => {
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('VALIDATION: file exceeds 1 MiB limit');
  }
};

export class WorkspaceService {
  constructor(private readonly root: string) {}

  async createProjectDir(slug: string): Promise<string> {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) throw new Error('VALIDATION: invalid project slug');
    const dir = path.join(this.root, slug);
    await mkdir(dir, { recursive: true });
    const gitignore = path.join(dir, '.gitignore');
    try {
      await stat(gitignore);
    } catch {
      await writeFile(gitignore, DEFAULT_GITIGNORE, 'utf8');
    }
    return dir;
  }

  async writeFile(workspace: string, relative: string, content: string): Promise<void> {
    assertSize(content);
    const target = await resolveInWorkspace(workspace, relative);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.tmp-${process.pid}`;
    await writeFile(temp, content, 'utf8');
    await rename(temp, target);
  }

  async readFile(workspace: string, relative: string): Promise<string> {
    const target = await resolveInWorkspace(workspace, relative);
    const info = await stat(target);
    if (!info.isFile()) throw new Error('VALIDATION: not a file');
    if (info.size > MAX_FILE_BYTES) throw new Error('VALIDATION: file exceeds 1 MiB limit');
    return readFile(target, 'utf8');
  }

  async listFiles(workspace: string, relative = '.'): Promise<string[]> {
    const start = await resolveInWorkspace(workspace, relative);
    const results: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (results.length >= MAX_FILES) return;
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_FILES) return;
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        else results.push(path.relative(workspace, absolute).replaceAll('\\', '/'));
      }
    };
    await walk(start);
    return results.sort();
  }

  async deleteFile(workspace: string, relative: string): Promise<void> {
    const target = await resolveInWorkspace(workspace, relative);
    const info = await stat(target);
    if (!info.isFile()) throw new Error('VALIDATION: only files can be deleted');
    await unlink(target);
  }
}
```

- [ ] **Step 6: Tulis test tool router yang gagal**

`src/main/tools/tool-router.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceService } from '../workspace/workspace-service';
import { ToolRouter } from './tool-router';
import type { ToolCall } from '../../shared/types';

let workspace: string;
let router: ToolRouter;
beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'r3x-tools-'));
  const ws = new WorkspaceService(root);
  workspace = await ws.createProjectDir('demo');
  router = new ToolRouter(ws);
});

const call = (name: string, args: unknown): ToolCall => ({
  id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) },
});

describe('ToolRouter', () => {
  it('writes then reads a file', async () => {
    expect((await router.execute(workspace, call('write_file', { path: 'a.txt', content: 'hi' }))).ok).toBe(true);
    const result = await router.execute(workspace, call('read_file', { path: 'a.txt' }));
    expect(result).toEqual({ ok: true, output: 'hi' });
  });

  it('returns a policy error instead of throwing', async () => {
    const result = await router.execute(workspace, call('read_file', { path: '../x' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('POLICY:');
  });

  it('rejects malformed arguments', async () => {
    const result = await router.execute(workspace, call('write_file', { path: 'a.txt' }));
    expect(result).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 7: Implementasi tool definitions dan router**

`src/main/tools/tool-defs.ts`:

```ts
import type { ToolDefinition } from '../../shared/types';

export const FILE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file inside the project workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a UTF-8 text file inside the project workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files inside the project workspace, excluding dependency and build directories.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete one file inside the project workspace. Directories are rejected.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    },
  },
];
```

`src/main/tools/tool-router.ts`:

```ts
import { redact } from '../../shared/redact';
import type { ToolCall, ToolResult } from '../../shared/types';
import type { WorkspaceService } from '../workspace/workspace-service';

const requireString = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`VALIDATION: ${key} must be a string`);
  return value;
};

export class ToolRouter {
  constructor(private readonly workspaces: WorkspaceService) {}

  async execute(workspace: string, call: ToolCall): Promise<ToolResult> {
    try {
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      switch (call.function.name) {
        case 'read_file':
          return { ok: true, output: await this.workspaces.readFile(workspace, requireString(args, 'path')) };
        case 'write_file':
          await this.workspaces.writeFile(workspace, requireString(args, 'path'), requireString(args, 'content'));
          return { ok: true, output: 'written' };
        case 'list_files': {
          const path = typeof args.path === 'string' ? args.path : '.';
          return { ok: true, output: (await this.workspaces.listFiles(workspace, path)).join('\n') };
        }
        case 'delete_file':
          await this.workspaces.deleteFile(workspace, requireString(args, 'path'));
          return { ok: true, output: 'deleted' };
        default:
          return { ok: false, output: `POLICY: unknown tool ${call.function.name}` };
      }
    } catch (error) {
      return { ok: false, output: redact(error instanceof Error ? error.message : String(error)) };
    }
  }
}
```

- [ ] **Step 8: Jalankan test**

Run: `npm test -- --run src/main/security src/main/workspace src/main/tools`
Expected: semua test lulus.

- [ ] **Step 9: Commit**

```bash
git add src/main/security src/main/workspace src/main/tools
git commit -m "feat: add sandboxed workspace and file tools"
```

---

### Task 7: Terminal runner real-time dan Stop

**Files:**
- Create: `src/main/events.ts`
- Create: `src/main/workspace/terminal-runner.ts`
- Create: `src/main/workspace/terminal-runner.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/components/TerminalPanel.tsx`

- [ ] **Step 1: Tulis test terminal yang gagal**

`src/main/workspace/terminal-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TerminalRunner, type TerminalEvent } from './terminal-runner';

const waitForExit = (events: TerminalEvent[], timeoutMs = 8_000): Promise<TerminalEvent> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const exit = events.find((event) => event.stream === 'exit');
      if (exit) { clearInterval(timer); resolve(exit); }
      else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 20);
  });

describe('TerminalRunner', () => {
  it('streams stdout, stderr, and exit code', async () => {
    const events: TerminalEvent[] = [];
    const runner = new TerminalRunner((event) => events.push(event));
    runner.start({
      runId: 'r1', executable: process.execPath,
      args: ['-e', 'console.log("out"); console.error("err")'], cwd: process.cwd(),
    });
    const exit = await waitForExit(events);
    expect(exit.exitCode).toBe(0);
    expect(events.some((event) => event.stream === 'stdout' && event.data.includes('out'))).toBe(true);
    expect(events.some((event) => event.stream === 'stderr' && event.data.includes('err'))).toBe(true);
  });

  it('stops a long-running process', async () => {
    const events: TerminalEvent[] = [];
    const runner = new TerminalRunner((event) => events.push(event));
    runner.start({
      runId: 'r2', executable: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 60000)'], cwd: process.cwd(),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    runner.stop('r2');
    const exit = await waitForExit(events);
    expect(exit.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/workspace/terminal-runner.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi terminal runner dan event sink**

`src/main/workspace/terminal-runner.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process';

const MAX_OUTPUT_CHARS = 1_048_576;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface TerminalEvent {
  runId: string;
  stream: 'stdout' | 'stderr' | 'exit';
  data: string;
  exitCode?: number | null;
}

export interface TerminalInput {
  runId: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

const sanitizedEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(OPENROUTER_API_KEY|GITHUB_TOKEN|GH_TOKEN|R3X_SECRET_)/i.test(key)) delete env[key];
  }
  return env;
};

export class TerminalRunner {
  private readonly children = new Map<string, ChildProcess>();

  constructor(private readonly onEvent: (event: TerminalEvent) => void) {}

  start(input: TerminalInput): void {
    if (!input.executable.trim()) throw new Error('VALIDATION: executable is required');
    if (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== 'string')) {
      throw new Error('VALIDATION: args must be strings');
    }
    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      shell: false,
      windowsHide: true,
      env: sanitizedEnv(),
    });
    this.children.set(input.runId, child);

    let sent = 0;
    let exited = false;
    let timer: ReturnType<typeof setTimeout>;
    const emit = (stream: 'stdout' | 'stderr', data: string): void => {
      if (sent >= MAX_OUTPUT_CHARS) return;
      const chunk = data.slice(0, MAX_OUTPUT_CHARS - sent);
      sent += chunk.length;
      if (chunk) this.onEvent({ runId: input.runId, stream, data: chunk });
    };
    const finish = (code: number | null): void => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      this.children.delete(input.runId);
      this.onEvent({ runId: input.runId, stream: 'exit', data: '', exitCode: code });
    };

    child.stdout?.on('data', (data: Buffer) => emit('stdout', data.toString('utf8')));
    child.stderr?.on('data', (data: Buffer) => emit('stderr', data.toString('utf8')));
    child.on('error', (error) => {
      emit('stderr', `${error.message}\n`);
      finish(-1);
    });
    child.on('close', (code) => finish(code));

    timer = setTimeout(() => this.stop(input.runId), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  stop(runId: string): void {
    const child = this.children.get(runId);
    if (!child || child.killed) return;
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false });
    } else {
      child.kill('SIGTERM');
    }
  }
}
```

`src/main/events.ts`:

```ts
import { BrowserWindow } from 'electron';
import type { AgentEvent } from '../shared/types';

export const emitAgentEvent = (event: AgentEvent): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:event', event);
  }
};
```

- [ ] **Step 4: Sambungkan IPC terminal**

Tambahkan ke `IpcDeps` di `src/main/ipc.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { getProject } from './db/repositories';
import type { TerminalRunner } from './workspace/terminal-runner';

export interface IpcDeps {
  settings: SettingsService;
  budget: BudgetService;
  db: DatabaseSync;
  terminal: TerminalRunner;
}
```

Tambahkan handler:

```ts
ipcMain.handle('terminal:run', (_event, payload) => {
  const { projectId, executable, args } = asObject(payload);
  if (typeof projectId !== 'string' || typeof executable !== 'string' || !Array.isArray(args)) {
    throw new Error('VALIDATION: invalid terminal payload');
  }
  const project = getProject(deps.db, projectId);
  const runId = newId('run');
  deps.terminal.start({
    runId,
    executable,
    args: args.map(String),
    cwd: project.workspacePath,
  });
  return { runId };
});

ipcMain.handle('terminal:stop', (_event, payload) => {
  const { runId } = asObject(payload);
  if (typeof runId !== 'string') throw new Error('VALIDATION: runId is required');
  deps.terminal.stop(runId);
  return { ok: true } as const;
});
```

Di `src/main/index.ts`, buat runner setelah `createWindow` tersedia:

```ts
const terminal = new TerminalRunner((event) => emitAgentEvent({ type: 'terminal', ...event }));
registerIpc({ settings, budget, db, terminal });
```

`src/renderer/src/components/TerminalPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function TerminalPanel({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [executable, setExecutable] = useState('node');
  const [args, setArgs] = useState('--version');

  useEffect(() => api.onAgentEvent((event) => {
    if (event.type === 'terminal') {
      setLines((current) => [...current, event.stream === 'exit' ? `[exit ${event.exitCode}]` : event.data]);
    }
  }), []);

  const run = async () => {
    const result = await api.invoke('terminal:run', {
      projectId,
      executable,
      args: args.split(' ').filter(Boolean),
    });
    setRunId(result.runId);
  };

  return (
    <section className="terminal">
      <div className="terminal-controls">
        <input value={executable} onChange={(e) => setExecutable(e.target.value)} />
        <input value={args} onChange={(e) => setArgs(e.target.value)} />
        <button onClick={() => void run()}>Run</button>
        <button disabled={!runId} onClick={() => runId && void api.invoke('terminal:stop', { runId })}>Stop</button>
      </div>
      <pre>{lines.join('')}</pre>
    </section>
  );
}
```

- [ ] **Step 5: Jalankan test dan build**

Run: `npm test -- --run src/main/workspace`
Expected: test terminal lulus di Windows.

Run: `npm run build`
Expected: sukses.

- [ ] **Step 6: Commit**

```bash
git add src/main/events.ts src/main/workspace src/main/ipc.ts src/main/index.ts src/renderer
git commit -m "feat: add realtime terminal runner"
```

---

### Task 8: Project service dan UI proyek

**Files:**
- Create: `src/shared/slug.ts`
- Create: `src/shared/slug.test.ts`
- Modify: `src/main/db/repositories.ts` (audit)
- Create: `src/main/projects-service.ts`
- Create: `src/main/projects-service.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/pages/DashboardPage.tsx`
- Create: `src/renderer/src/pages/NewProjectPage.tsx`
- Create: `src/renderer/src/pages/ProjectPage.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Tulis test slug dan project service yang gagal**

`src/shared/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('normalizes names', () => {
    expect(slugify('  Aplikasi Kasir CafÃ©!  ')).toBe('aplikasi-kasir-cafe');
    expect(slugify('API-Test_v2')).toBe('api-test-v2');
  });

  it('rejects names without enough letters', () => {
    expect(() => slugify('!!!')).toThrow('VALIDATION:');
  });
});
```

`src/main/projects-service.test.ts`:

```ts
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './db/schema';
import { ProjectsService } from './projects-service';
import { WorkspaceService } from './workspace/workspace-service';

let service: ProjectsService;
let root: string;
beforeEach(async () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  root = await mkdtemp(join(tmpdir(), 'r3x-projects-'));
  service = new ProjectsService(db, new WorkspaceService(root));
});

const brief = {
  problem: 'Membantu warung mencatat penjualan.',
  targetUsers: 'Pemilik warung',
  mvpFeatures: ['catat transaksi'],
  constraints: ['offline'],
  stack: ['react'],
  acceptanceCriteria: ['transaksi tersimpan'],
};

describe('ProjectsService', () => {
  it('creates a project and its workspace', async () => {
    const project = await service.create({ name: 'Kasir Warung', brief, mode: 'supervised' });
    expect(project).toMatchObject({ name: 'Kasir Warung', slug: 'kasir-warung', status: 'IDEA' });
    expect((await stat(project.workspacePath)).isDirectory()).toBe(true);
    expect(service.list()).toHaveLength(1);
  });

  it('makes duplicate slugs unique', async () => {
    await service.create({ name: 'Demo', brief, mode: 'supervised' });
    const second = await service.create({ name: 'Demo', brief, mode: 'supervised' });
    expect(second.slug).toBe('demo-2');
  });

  it('rejects incomplete briefs', async () => {
    await expect(service.create({ name: 'Demo', brief: { ...brief, problem: '' }, mode: 'supervised' }))
      .rejects.toThrow('VALIDATION:');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/shared/slug.test.ts src/main/projects-service.test.ts`
Expected: FAIL karena modul belum ada.

- [ ] **Step 3: Implementasi slug, audit, dan project service**

`src/shared/slug.ts`:

```ts
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (slug.length < 2) throw new Error('VALIDATION: name must contain at least 2 letters or digits');
  return slug;
}
```

Tambahkan ke `src/main/db/repositories.ts`:

```ts
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
```

`src/main/projects-service.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { slugify } from '../shared/slug';
import type { OperatingMode, Project, ProjectBrief } from '../shared/types';
import { appendAudit, createProject, getProject, listProjects } from './db/repositories';
import type { WorkspaceService } from './workspace/workspace-service';

const MODES: OperatingMode[] = ['auto', 'supervised', 'repair'];

const validateBrief = (brief: ProjectBrief): void => {
  if (!brief.problem || brief.problem.trim().length < 10) throw new Error('VALIDATION: problem must be at least 10 characters');
  if (!brief.targetUsers || brief.targetUsers.trim().length < 3) throw new Error('VALIDATION: targetUsers is required');
  if (!Array.isArray(brief.mvpFeatures) || brief.mvpFeatures.length === 0) throw new Error('VALIDATION: at least one MVP feature is required');
  if (!Array.isArray(brief.acceptanceCriteria) || brief.acceptanceCriteria.length === 0) throw new Error('VALIDATION: at least one acceptance criterion is required');
  if (!Array.isArray(brief.stack) || !Array.isArray(brief.constraints)) throw new Error('VALIDATION: invalid brief arrays');
};

export class ProjectsService {
  constructor(private readonly db: DatabaseSync, private readonly workspaces: WorkspaceService) {}

  list(): Project[] {
    return listProjects(this.db);
  }

  get(id: string): Project {
    return getProject(this.db, id);
  }

  async create(input: { name: string; brief: ProjectBrief; mode: OperatingMode }): Promise<Project> {
    const name = input.name.trim();
    if (name.length < 3 || name.length > 80) throw new Error('VALIDATION: name must be 3..80 characters');
    if (!MODES.includes(input.mode)) throw new Error('VALIDATION: invalid mode');
    validateBrief(input.brief);

    const base = slugify(name);
    let slug = base;
    let suffix = 2;
    while (this.db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    const workspacePath = await this.workspaces.createProjectDir(slug);
    const project = createProject(this.db, {
      name,
      slug,
      workspacePath,
      stack: input.brief.stack,
      brief: input.brief,
    });
    appendAudit(this.db, { actor: 'user', eventType: 'project.create', target: project.id, result: 'ok', metadata: { mode: input.mode } });
    return project;
  }
}
```

- [ ] **Step 4: Daftarkan IPC proyek**

Tambahkan `projects: ProjectsService` ke `IpcDeps`, lalu handler:

```ts
ipcMain.handle('projects:list', () => deps.projects.list());
ipcMain.handle('projects:get', (_event, payload) => {
  const { projectId } = asObject(payload);
  if (typeof projectId !== 'string') throw new Error('VALIDATION: projectId is required');
  return deps.projects.get(projectId);
});
ipcMain.handle('projects:create', (_event, payload) => {
  const { name, brief, mode } = asObject(payload);
  if (typeof name !== 'string' || typeof mode !== 'string' || typeof brief !== 'object' || brief === null) {
    throw new Error('VALIDATION: invalid project payload');
  }
  return deps.projects.create({ name, brief: brief as ProjectBrief, mode: mode as OperatingMode });
});
```

Tambahkan import tipe:

```ts
import type { OperatingMode, ProjectBrief } from '../shared/types';
```

Di `src/main/index.ts`:

```ts
const workspaces = new WorkspaceService(settings.get().workspaceRoot);
const projects = new ProjectsService(db, workspaces);
const terminal = new TerminalRunner((event) => emitAgentEvent({ type: 'terminal', ...event }));
registerIpc({ settings, budget, db, terminal, projects });
```

Catatan: `WorkspaceService` memakai root saat dibuat. Jika pengguna mengubah `workspaceRoot`, restart aplikasi diperlukan; UI harus menampilkan catatan ini.

- [ ] **Step 5: Implementasi halaman UI**

`src/renderer/src/pages/DashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Project } from '@shared/types';
import { api } from '../lib/api';
import BudgetBar from '../components/BudgetBar';
import StatusBadge from '../components/StatusBadge';

export default function DashboardPage({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => { void api.invoke('projects:list').then(setProjects); }, []);

  return (
    <section>
      <div className="row">
        <h2>Dashboard</h2>
        <button onClick={onNew}>Proyek baru</button>
      </div>
      <BudgetBar />
      {projects.length === 0 && <p>Belum ada proyek.</p>}
      <div className="grid">
        {projects.map((project) => (
          <article key={project.id} className="card">
            <h3>{project.name}</h3>
            <StatusBadge status={project.status} />
            <p>{project.brief.problem}</p>
            <small>{project.stack.join(', ') || 'stack belum dipilih'}</small>
            <button onClick={() => onOpen(project.id)}>Buka</button>
          </article>
        ))}
      </div>
    </section>
  );
}
```

`src/renderer/src/components/StatusBadge.tsx`:

```tsx
import type { ProjectStatus } from '@shared/types';

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}
```

`src/renderer/src/pages/NewProjectPage.tsx`:

```tsx
import { useState } from 'react';
import type { OperatingMode } from '@shared/types';
import { api } from '../lib/api';

const lines = (value: string): string[] => value.split('\n').map((line) => line.trim()).filter(Boolean);

export default function NewProjectPage({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [features, setFeatures] = useState('');
  const [constraints, setConstraints] = useState('');
  const [stack, setStack] = useState('typescript');
  const [criteria, setCriteria] = useState('');
  const [mode, setMode] = useState<OperatingMode>('supervised');
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      const project = await api.invoke('projects:create', {
        name,
        mode,
        brief: {
          problem,
          targetUsers,
          mvpFeatures: lines(features),
          constraints: lines(constraints),
          stack: lines(stack),
          acceptanceCriteria: lines(criteria),
        },
      });
      onCreated(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section>
      <h2>Proyek Baru</h2>
      <label>Nama <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Masalah <textarea value={problem} onChange={(e) => setProblem(e.target.value)} /></label>
      <label>Target pengguna <input value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} /></label>
      <label>Fitur MVP (satu per baris) <textarea value={features} onChange={(e) => setFeatures(e.target.value)} /></label>
      <label>Batasan (satu per baris) <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} /></label>
      <label>Stack (satu per baris) <textarea value={stack} onChange={(e) => setStack(e.target.value)} /></label>
      <label>Acceptance criteria (satu per baris) <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} /></label>
      <label>Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as OperatingMode)}>
          <option value="auto">Auto Build</option>
          <option value="supervised">Supervised Build</option>
          <option value="repair">Repair Existing Project</option>
        </select>
      </label>
      <button onClick={() => void submit()}>Buat proyek</button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

`src/renderer/src/pages/ProjectPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Project } from '@shared/types';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import TerminalPanel from '../components/TerminalPanel';

export default function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api.invoke('projects:get', { projectId }).then(setProject).catch((cause) => setError(String(cause)));
  }, [projectId]);

  if (error) return <p role="alert">{error}</p>;
  if (!project) return <p>Memuat proyekâ€¦</p>;

  return (
    <section>
      <div className="row">
        <h2>{project.name}</h2>
        <StatusBadge status={project.status} />
      </div>
      <p>{project.brief.problem}</p>
      <small>{project.workspacePath}</small>
      <TerminalPanel projectId={project.id} />
    </section>
  );
}
```

`src/renderer/src/App.tsx`:

```tsx
import { useState } from 'react';
import DashboardPage from './pages/DashboardPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectPage from './pages/ProjectPage';
import SettingsPage from './pages/SettingsPage';

type Page =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'settings' }
  | { name: 'project'; projectId: string };

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' });
  return (
    <div className="shell">
      <nav className="sidebar">
        <h1>R3X Agent Studio</h1>
        <button onClick={() => setPage({ name: 'dashboard' })}>Dashboard</button>
        <button onClick={() => setPage({ name: 'new' })}>Proyek Baru</button>
        <button onClick={() => setPage({ name: 'settings' })}>Pengaturan</button>
      </nav>
      <main className="content">
        {page.name === 'dashboard' && (
          <DashboardPage onNew={() => setPage({ name: 'new' })} onOpen={(projectId) => setPage({ name: 'project', projectId })} />
        )}
        {page.name === 'new' && <NewProjectPage onCreated={(projectId) => setPage({ name: 'project', projectId })} />}
        {page.name === 'settings' && <SettingsPage />}
        {page.name === 'project' && <ProjectPage projectId={page.projectId} />}
      </main>
    </div>
  );
}
```

Tambahkan CSS ke `src/renderer/src/styles.css`:

```css
.shell { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
.sidebar { display: flex; flex-direction: column; gap: 8px; padding: 16px; background: #171c22; }
.sidebar button { text-align: left; }
.content { padding: 24px; overflow: auto; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.card { padding: 16px; border: 1px solid #2a323c; border-radius: 8px; background: #151a20; }
label { display: block; margin: 8px 0; }
input, textarea, select { width: 100%; padding: 8px; background: #0d1116; color: inherit; border: 1px solid #2a323c; border-radius: 6px; }
textarea { min-height: 72px; }
button { padding: 8px 12px; background: #234; color: inherit; border: 1px solid #345; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #26313d; font-size: 12px; }
.terminal pre { min-height: 180px; max-height: 360px; overflow: auto; padding: 12px; background: #05080b; border: 1px solid #2a323c; white-space: pre-wrap; }
.terminal-controls { display: flex; gap: 8px; margin: 12px 0; }
.budget { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
```

- [ ] **Step 6: Jalankan test, build, dan verifikasi manual**

Run: `npm test -- --run`
Expected: semua test lulus.

Run: `npm run build`
Expected: sukses.

Run: `npm run dev`
Expected: buat proyek "Kasir Warung", folder muncul di `Documents/R3X-Projects/kasir-warung`, halaman proyek menampilkan terminal. Jalankan `node -e console.log("terminal ok")`; output terlihat; Stop menghentikan proses panjang.

- [ ] **Step 7: Commit**

```bash
git add src/shared src/main src/renderer
git commit -m "feat: add project creation and terminal ui"
```

---

## Verifikasi Akhir Fase 0-2

```bash
npm test -- --run
npm run build
```

Kriteria lulus:
- Semua test unit hijau.
- Build menghasilkan `out/main`, `out/preload`, `out/renderer`.
- API key tidak pernah muncul di SQLite plaintext, log, atau renderer.
- Proyek baru berada di subfolder workspace dan command terminal nyata terlihat.
- `COMPLETED` belum mungkin dicapai; fase 4-5 menambahkannya.


