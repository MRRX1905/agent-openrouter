# R3X Agent Studio â€” Skills, GitHub & Release Plan (Fase 6-8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan penemuan/review skill dari skills.sh, publikasi GitHub dengan approval dan secret preflight, serta packaging, backup, statistik, dan smoke test Electron.

**Architecture:** Skills memakai endpoint publik `https://skills.sh/api/search` untuk penemuan dan GitHub API untuk mengambil file pada commit tertentu. GitHub memakai OAuth Device Flow dengan client ID milik pengguna; token disimpan lewat `SecretBox`. Push memakai askpass berbasis environment, bukan token di argumen/URL. Semua aksi publikasi melewati approval.

**Prasyarat:** Fase 0-5 selesai; secret scan dan approval sudah teruji.

---

## Fase 6 â€” Skills

### Task 1: Pencarian skills.sh dan resolver GitHub

**Files:**
- Create: `src/main/skills/registry.ts`
- Create: `src/main/skills/registry.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Tulis test registry yang gagal**

`src/main/skills/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveSkill, searchSkills } from './registry';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('searchSkills', () => {
  it('maps the public skills.sh search response', async () => {
    const fetchImpl = (async () => json({
      skills: [
        { id: 'vercel-labs/agent-skills/vercel-react-best-practices', source: 'vercel-labs/agent-skills', skillId: 'vercel-react-best-practices', name: 'vercel-react-best-practices', installs: 844260 },
      ],
    })) as typeof fetch;
    const results = await searchSkills('react', fetchImpl);
    expect(results).toEqual([{
      id: 'vercel-labs/agent-skills/vercel-react-best-practices',
      source: 'vercel-labs/agent-skills',
      skillId: 'vercel-react-best-practices',
      name: 'vercel-react-best-practices',
      installs: 844260,
    }]);
  });

  it('rejects queries shorter than 2 characters', async () => {
    await expect(searchSkills('a', (async () => json({})) as typeof fetch)).rejects.toThrow('VALIDATION:');
  });
});

describe('resolveSkill', () => {
  it('resolves files and pins the commit', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/repos/owner/repo')) return json({ default_branch: 'main' });
      if (href.includes('/git/trees/main')) return json({
        sha: 'tree-sha',
        tree: [
          { path: 'skills/demo/SKILL.md', type: 'blob', sha: 'a' },
          { path: 'skills/demo/helper.js', type: 'blob', sha: 'b' },
        ],
      });
      if (href.includes('/commits/main')) return json({ sha: 'commit-sha' });
      if (href.includes('/contents/skills/demo/SKILL.md')) return json({ content: Buffer.from('---\nname: demo\n---\nUse me').toString('base64') });
      if (href.includes('/contents/skills/demo/helper.js')) return json({ content: Buffer.from('console.log(1)').toString('base64') });
      return json({}, 404);
    }) as typeof fetch;

    const resolved = await resolveSkill('owner/repo', 'demo', fetchImpl);
    expect(resolved.commit).toBe('commit-sha');
    expect(resolved.files.map((file) => file.path)).toEqual(['skills/demo/SKILL.md', 'skills/demo/helper.js']);
    expect(resolved.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects unsafe source identifiers', async () => {
    await expect(resolveSkill('../evil', 'demo', (async () => json({})) as typeof fetch)).rejects.toThrow('VALIDATION:');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/skills/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi registry**

`src/main/skills/registry.ts`:

```ts
import { createHash } from 'node:crypto';
import type { SkillSearchResult } from '../../shared/types';

const SEARCH_URL = 'https://skills.sh/api/search';
const GITHUB_API = 'https://api.github.com';

export interface ResolvedSkillFile { path: string; content: string }
export interface ResolvedSkill {
  source: string;
  skillId: string;
  name: string;
  commit: string;
  checksum: string;
  files: ResolvedSkillFile[];
}

const assertSource = (source: string): void => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source)) throw new Error('VALIDATION: invalid source');
};
const assertSkillId = (skillId: string): void => {
  if (!/^[A-Za-z0-9_.-]+$/.test(skillId)) throw new Error('VALIDATION: invalid skill id');
};

export async function searchSkills(query: string, fetchImpl: typeof fetch = fetch): Promise<SkillSearchResult[]> {
  if (query.trim().length < 2) throw new Error('VALIDATION: query must be at least 2 characters');
  const response = await fetchImpl(`${SEARCH_URL}?q=${encodeURIComponent(query.trim())}&limit=20`);
  if (!response.ok) throw new Error(`NOT_FOUND: skills.sh search failed (${response.status})`);
  const data = (await response.json()) as { skills?: Array<{ id: string; source: string; skillId: string; name: string; installs: number }> };
  return (data.skills ?? []).map((skill) => ({
    id: skill.id, source: skill.source, skillId: skill.skillId,
    name: skill.name, installs: skill.installs ?? 0,
  }));
}

const github = async <T>(url: string, fetchImpl: typeof fetch): Promise<T> => {
  const response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'r3x-agent-studio' } });
  if (!response.ok) throw new Error(`NOT_FOUND: GitHub API ${response.status} for ${url}`);
  return (await response.json()) as T;
};

const rawFile = async (source: string, commit: string, filePath: string, fetchImpl: typeof fetch): Promise<string> => {
  const response = await fetchImpl(`${GITHUB_API}/repos/${source}/contents/${filePath}?ref=${commit}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'r3x-agent-studio' },
  });
  if (!response.ok) throw new Error(`NOT_FOUND: cannot fetch ${filePath}`);
  const data = (await response.json()) as { content?: string; encoding?: string };
  return Buffer.from(data.content ?? '', 'base64').toString('utf8');
};

const frontmatterName = (content: string): string | null => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const line = match[1]?.split(/\r?\n/).find((item) => item.startsWith('name:'));
  return line ? line.slice(5).trim().replace(/^['"]|['"]$/g, '') : null;
};

export async function resolveSkill(
  source: string,
  skillId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedSkill> {
  assertSource(source);
  assertSkillId(skillId);

  const repo = await github<{ default_branch: string }>(`${GITHUB_API}/repos/${source}`, fetchImpl);
  const branch = repo.default_branch;
  const tree = await github<{ tree: Array<{ path: string; type: string }> }>(
    `${GITHUB_API}/repos/${source}/git/trees/${encodeURIComponent(branch)}?recursive=1`, fetchImpl,
  );
  const commit = await github<{ sha: string }>(`${GITHUB_API}/repos/${source}/commits/${encodeURIComponent(branch)}`, fetchImpl);

  const candidates = tree.tree
    .filter((entry) => entry.type === 'blob' && (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md')))
    .slice(0, 20);

  let selected: string | null = null;
  let selectedName = skillId;
  for (const candidate of candidates) {
    const content = await rawFile(source, commit.sha, candidate.path, fetchImpl);
    const directory = candidate.path === 'SKILL.md' ? '' : candidate.path.slice(0, -'SKILL.md'.length);
    const basename = directory.split('/').filter(Boolean).at(-1) ?? '';
    const name = frontmatterName(content) ?? basename;
    if (basename === skillId || name === skillId || name.toLowerCase() === skillId.toLowerCase()) {
      selected = candidate.path;
      selectedName = name;
      break;
    }
  }
  if (!selected) throw new Error(`NOT_FOUND: skill ${skillId} not found in ${source}`);

  const directory = selected === 'SKILL.md' ? '' : selected.slice(0, -'SKILL.md'.length);
  const files = tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(directory))
    .filter((entry) => entry.path.split('/').length - directory.split('/').filter(Boolean).length <= 3)
    .slice(0, 100);

  const resolvedFiles: ResolvedSkillFile[] = [];
  for (const file of files) {
    resolvedFiles.push({ path: file.path, content: await rawFile(source, commit.sha, file.path, fetchImpl) });
  }
  const checksum = createHash('sha256')
    .update(resolvedFiles.map((file) => `${file.path}\0${file.content}`).sort().join('\0'))
    .digest('hex');

  return { source, skillId, name: selectedName, commit: commit.sha, checksum, files: resolvedFiles };
}
```

- [ ] **Step 4: Daftarkan IPC pencarian**

Tambahkan `skills` service ke `IpcDeps` (dibuat pada task berikutnya), lalu sementara:

```ts
ipcMain.handle('skills:search', async (_event, payload) => {
  const { query } = asObject(payload);
  if (typeof query !== 'string') throw new Error('VALIDATION: query is required');
  return deps.skills.search(query);
});
```

- [ ] **Step 5: Jalankan test dan commit**

Run: `npm test -- --run src/main/skills/registry.test.ts`
Expected: lulus.

```bash
git add src/main/skills
git commit -m "feat: add skills.sh search and github resolver"
```

---

### Task 2: Install, review, enable, dan UI skills

**Files:**
- Create: `src/main/skills/skill-service.ts`
- Create: `src/main/skills/skill-service.test.ts`
- Modify: `src/main/db/repositories.ts` (skill CRUD)
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/pages/SkillsPage.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Tulis test skill service yang gagal**

`src/main/skills/skill-service.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { SkillService } from './skill-service';
import type { ResolvedSkill } from './registry';

let db: DatabaseSync;
let service: SkillService;
const resolved: ResolvedSkill = {
  source: 'owner/repo', skillId: 'demo', name: 'Demo', commit: 'abc123', checksum: 'a'.repeat(64),
  files: [
    { path: 'skills/demo/SKILL.md', content: '---\nname: demo\n---\nDo the thing' },
    { path: 'skills/demo/helper.js', content: 'console.log(1)' },
  ],
};

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  service = new SkillService(db, await mkdtemp(join(tmpdir(), 'r3x-skills-')));
});

describe('SkillService', () => {
  it('installs pending and requires approval before enabling', async () => {
    const record = await service.install(resolved);
    expect(record).toMatchObject({ reviewStatus: 'pending', enabled: false });
    expect(() => service.setEnabled(record.id, true)).toThrow('POLICY:');
    service.review(record.id, 'approved');
    service.setEnabled(record.id, true);
    expect(service.list()[0]).toMatchObject({ reviewStatus: 'approved', enabled: true });
  });

  it('rejects path traversal in skill files', async () => {
    await expect(service.install({ ...resolved, files: [{ path: '../evil.js', content: 'x' }] }))
      .rejects.toThrow('POLICY:');
  });

  it('loads enabled instructions only', async () => {
    const record = await service.install(resolved);
    service.review(record.id, 'approved');
    service.setEnabled(record.id, true);
    expect(await service.enabledInstructions()).toEqual(['---\nname: demo\n---\nDo the thing']);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/skills/skill-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tambahkan repository skill**

Tambahkan ke `src/main/db/repositories.ts`:

```ts
import type { SkillRecord, SkillReviewStatus } from '../../shared/types';

const toSkill = (row: Row): SkillRecord => ({
  id: String(row.id), name: String(row.name), source: String(row.source),
  versionOrCommit: String(row.version_or_commit), checksum: String(row.checksum),
  reviewStatus: String(row.review_status) as SkillReviewStatus,
  enabled: Number(row.enabled) === 1,
});

export function upsertSkill(
  db: DatabaseSync,
  input: { id: string; name: string; source: string; versionOrCommit: string; checksum: string },
): SkillRecord {
  db.prepare(
    `INSERT INTO skills (id, name, source, version_or_commit, checksum, review_status, enabled)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, source = excluded.source,
       version_or_commit = excluded.version_or_commit, checksum = excluded.checksum,
       review_status = 'pending', enabled = 0`,
  ).run(input.id, input.name, input.source, input.versionOrCommit, input.checksum);
  return getSkill(db, input.id);
}

export function getSkill(db: DatabaseSync, id: string): SkillRecord {
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new Error(`NOT_FOUND: skill ${id}`);
  return toSkill(row);
}

export function listSkills(db: DatabaseSync): SkillRecord[] {
  return (db.prepare('SELECT * FROM skills ORDER BY name').all() as Row[]).map(toSkill);
}

export function setSkillReview(db: DatabaseSync, id: string, status: SkillReviewStatus): void {
  db.prepare('UPDATE skills SET review_status = ? WHERE id = ?').run(status, id);
}

export function setSkillEnabled(db: DatabaseSync, id: string, enabled: boolean): void {
  db.prepare('UPDATE skills SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}
```

- [ ] **Step 4: Implementasi SkillService**

`src/main/skills/skill-service.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { SkillRecord, SkillReviewStatus } from '../../shared/types';
import {
  getSkill, listSkills, setSkillEnabled, setSkillReview, upsertSkill,
} from '../db/repositories';
import { resolveInWorkspace } from '../security/path-guard';
import { resolveSkill, type ResolvedSkill } from './registry';

export class SkillService {
  constructor(private readonly db: DatabaseSync, private readonly root: string) {}

  async install(resolved: ResolvedSkill): Promise<SkillRecord> {
    const id = `${resolved.source}/${resolved.skillId}`;
    const targetRoot = path.join(this.root, resolved.source, resolved.skillId, resolved.commit);
    await mkdir(targetRoot, { recursive: true });
    for (const file of resolved.files) {
      const target = await resolveInWorkspace(targetRoot, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
    return upsertSkill(this.db, {
      id, name: resolved.name, source: resolved.source,
      versionOrCommit: resolved.commit, checksum: resolved.checksum,
    });
  }

  list(): SkillRecord[] {
    return listSkills(this.db);
  }

  review(id: string, status: SkillReviewStatus): void {
    getSkill(this.db, id);
    setSkillReview(this.db, id, status);
  }

  setEnabled(id: string, enabled: boolean): void {
    const skill = getSkill(this.db, id);
    if (enabled && skill.reviewStatus !== 'approved') throw new Error('POLICY: skill must be approved before enabling');
    setSkillEnabled(this.db, id, enabled);
  }

  async enabledInstructions(): Promise<string[]> {
    const enabled = this.list().filter((skill) => skill.enabled).slice(0, 3);
    const instructions: string[] = [];
    for (const skill of enabled) {
      const skillFile = path.join(this.root, skill.source, skill.id.split('/').at(-1) ?? '', skill.versionOrCommit, 'SKILL.md');
      const candidates = [skillFile, path.join(this.root, skill.source, skill.id.split('/').at(-1) ?? '', skill.versionOrCommit, 'skills', skill.id.split('/').at(-1) ?? '', 'SKILL.md')];
      for (const candidate of candidates) {
        try {
          instructions.push((await readFile(candidate, 'utf8')).slice(0, 8_000));
          break;
        } catch { /* coba kandidat berikutnya */ }
      }
    }
    return instructions;
  }
}
```

Catatan: resolver menyimpan file dengan path asli (`skills/demo/SKILL.md`), sehingga `SKILL.md` berada di subfolder. Untuk kesederhanaan, `install` juga menulis salinan `SKILL.md` di root commit:

```ts
const skillFile = resolved.files.find((file) => file.path.endsWith('/SKILL.md') || file.path === 'SKILL.md');
if (skillFile) await writeFile(path.join(targetRoot, 'SKILL.md'), skillFile.content, 'utf8');
```

Tambahkan baris ini sebelum `return upsertSkill`. Dengan begitu `enabledInstructions` cukup membaca `path.join(root, source, skillId, commit, 'SKILL.md')`.

- [ ] **Step 5: Daftarkan IPC dan rakit service**

`IpcDeps` tambah `skills: SkillService`. Handler:

```ts
ipcMain.handle('skills:install', async (_event, payload) => {
  const { source, skillId } = asObject(payload);
  if (typeof source !== 'string' || typeof skillId !== 'string') throw new Error('VALIDATION: source and skillId are required');
  const resolved = await deps.skills.resolve(source, skillId);
  return deps.skills.install(resolved);
});
ipcMain.handle('skills:list', () => deps.skills.list());
ipcMain.handle('skills:review', (_event, payload) => {
  const { skillId, status } = asObject(payload);
  if (typeof skillId !== 'string' || (status !== 'approved' && status !== 'rejected')) {
    throw new Error('VALIDATION: invalid skill review');
  }
  deps.skills.review(skillId, status);
  return { ok: true } as const;
});
ipcMain.handle('skills:setEnabled', (_event, payload) => {
  const { skillId, enabled } = asObject(payload);
  if (typeof skillId !== 'string' || typeof enabled !== 'boolean') throw new Error('VALIDATION: invalid skill toggle');
  deps.skills.setEnabled(skillId, enabled);
  return { ok: true } as const;
});
```

`SkillService` perlu metode `resolve`:

```ts
resolve(source: string, skillId: string) {
  return resolveSkill(source, skillId);
}
```

Di `src/main/index.ts`:

```ts
const skills = new SkillService(db, join(app.getPath('userData'), 'skills'));
registerIpc({ settings, budget, db, terminal, projects, approvals, orchestrator, skills });
```

Ubah handler `jobs:start` agar memuat instruksi skill yang aktif sebelum job dibuat:

```ts
ipcMain.handle('jobs:start', async (_event, payload) => {
  const { projectId } = asObject(payload);
  if (typeof projectId !== 'string') throw new Error('VALIDATION: projectId is required');
  const instructions = await deps.skills.enabledInstructions();
  return { jobId: deps.orchestrator.start(projectId, instructions) };
});
```

- [ ] **Step 6: UI Skills**

`src/renderer/src/pages/SkillsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { SkillRecord, SkillSearchResult } from '@shared/types';
import { api } from '../lib/api';

export default function SkillsPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [installed, setInstalled] = useState<SkillRecord[]>([]);
  const [error, setError] = useState('');

  const loadInstalled = () => { void api.invoke('skills:list').then(setInstalled); };
  useEffect(() => {
    loadInstalled();
    void api.invoke('skills:search', { query: 'react' }).then(setResults).catch(() => {});
  }, []);

  const search = async () => {
    try { setResults(await api.invoke('skills:search', { query })); }
    catch (cause) { setError(String(cause)); }
  };
  const install = async (skill: SkillSearchResult) => {
    try { await api.invoke('skills:install', { source: skill.source, skillId: skill.skillId }); loadInstalled(); }
    catch (cause) { setError(String(cause)); }
  };

  return (
    <section>
      <h2>Skills</h2>
      <div className="row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="cari skill" />
        <button onClick={() => void search()}>Cari</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {results.map((skill) => (
        <article key={skill.id} className="card">
          <strong>{skill.name}</strong>
          <small>{skill.source} Â· {skill.installs} installs</small>
          <button onClick={() => void install(skill)}>Install (review dulu)</button>
        </article>
      ))}
      <h3>Terpasang</h3>
      {installed.map((skill) => (
        <article key={skill.id} className="card">
          <p>{skill.name} Â· {skill.reviewStatus} Â· {skill.enabled ? 'aktif' : 'nonaktif'}</p>
          <button onClick={() => void api.invoke('skills:review', { skillId: skill.id, status: 'approved' }).then(loadInstalled)}>Approve</button>
          <button onClick={() => void api.invoke('skills:review', { skillId: skill.id, status: 'rejected' }).then(loadInstalled)}>Reject</button>
          <button
            disabled={skill.reviewStatus !== 'approved'}
            onClick={() => void api.invoke('skills:setEnabled', { skillId: skill.id, enabled: !skill.enabled }).then(loadInstalled)}
          >
            {skill.enabled ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </article>
      ))}
    </section>
  );
}
```

Perbaiki `reload`/`install` agar tidak memakai cast aneh: setelah install, muat daftar dari endpoint baru `skills:list`. Tambahkan channel `skills:list` ke kontrak dan handler `return deps.skills.list()`. Ganti `setInstalled(await api.invoke('skills:list'))`.

Tambahkan tombol review (approve/reject) di UI:

```tsx
<button onClick={() => void api.invoke('skills:setEnabled', { skillId: skill.id, enabled: !skill.enabled })}>
  {skill.enabled ? 'Nonaktifkan' : 'Aktifkan'}
</button>
```

Untuk approve/reject, tambahkan channel `skills:review`:

```ts
'skills:review': { req: { skillId: string; status: 'approved' | 'rejected' }; res: { ok: true } };
```

Handler memanggil `deps.skills.review`.

Tambahkan menu Skills di `App.tsx` dan render `<SkillsPage />`.

- [ ] **Step 7: Jalankan test, build, dan commit**

Run: `npm test -- --run src/main/skills`
Expected: lulus.

Run: `npm run build`
Expected: sukses.

```bash
git add src/main/skills src/main/db/repositories.ts src/main/ipc.ts src/main/index.ts src/shared/ipc-contract.ts src/renderer
git commit -m "feat: add skill review and enable flow"
```

---

## Fase 7 â€” GitHub

### Task 3: OAuth Device Flow dan penyimpanan token

**Files:**
- Create: `src/main/github/auth.ts`
- Create: `src/main/github/auth.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/components/GitHubPanel.tsx`
- Modify: `src/renderer/src/pages/ProjectPage.tsx`

- [ ] **Step 1: Tulis test device flow yang gagal**

`src/main/github/auth.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { SecretBox } from '../security/secrets';
import { GitHubAuth } from './auth';

let secrets: SecretBox;
let auth: GitHubAuth;
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  secrets = new SecretBox(db, {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
});

describe('GitHubAuth', () => {
  it('starts and completes the device flow', async () => {
    let step = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/login/device/code')) {
        return json({ device_code: 'dev', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
      }
      if (href.endsWith('/login/oauth/access_token')) {
        step += 1;
        return step === 1 ? json({ error: 'authorization_pending' }) : json({ access_token: 'gho_testtoken1234567890' });
      }
      if (href.endsWith('/user')) return json({ login: 'octocat' });
      return json({}, 404);
    }) as typeof fetch;

    auth = new GitHubAuth({ clientId: () => 'client', secrets, fetchImpl });
    const start = await auth.start();
    expect(start).toMatchObject({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' });
    await expect(auth.poll()).resolves.toEqual({ status: 'pending' });
    await expect(auth.poll()).resolves.toEqual({ status: 'connected', login: 'octocat' });
    expect(secrets.get('secret:github')).toBe('gho_testtoken1234567890');
  });

  it('requires a client id', async () => {
    auth = new GitHubAuth({ clientId: () => '', secrets, fetchImpl: (async () => json({})) as typeof fetch });
    await expect(auth.start()).rejects.toThrow('AUTH:');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/github/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi GitHubAuth**

`src/main/github/auth.ts`:

```ts
import type { SecretBox } from '../security/secrets';

interface DeviceState { deviceCode: string; expiresAt: number; interval: number }

export interface GitHubAuthOptions {
  clientId: () => string;
  secrets: SecretBox;
  fetchImpl?: typeof fetch;
}

export class GitHubAuth {
  private pending: DeviceState | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GitHubAuthOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async start(): Promise<{ userCode: string; verificationUri: string; expiresIn: number }> {
    const clientId = this.options.clientId();
    if (!clientId) throw new Error('AUTH: GitHub client ID is not configured');
    const response = await this.fetchImpl('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
    });
    if (!response.ok) throw new Error(`AUTH: GitHub device flow failed (${response.status})`);
    const data = (await response.json()) as { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number };
    this.pending = {
      deviceCode: data.device_code,
      expiresAt: Date.now() + data.expires_in * 1000,
      interval: data.interval,
    };
    return { userCode: data.user_code, verificationUri: data.verification_uri, expiresIn: data.expires_in };
  }

  async poll(): Promise<{ status: 'pending' | 'connected' | 'expired'; login?: string }> {
    if (!this.pending) throw new Error('AUTH: no device flow in progress');
    if (Date.now() > this.pending.expiresAt) {
      this.pending = null;
      return { status: 'expired' };
    }
    const clientId = this.options.clientId();
    const response = await this.fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: this.pending.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = (await response.json()) as { access_token?: string; error?: string };
    if (data.error === 'authorization_pending') return { status: 'pending' };
    if (data.error === 'slow_down') {
      this.pending.interval += 5;
      return { status: 'pending' };
    }
    if (data.error) {
      this.pending = null;
      return { status: 'expired' };
    }
    if (!data.access_token) throw new Error('AUTH: GitHub did not return a token');
    this.options.secrets.set('secret:github', data.access_token);
    this.pending = null;

    const user = await this.fetchImpl('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'r3x-agent-studio',
      },
    });
    const login = user.ok ? String(((await user.json()) as { login?: string }).login ?? '') : undefined;
    return { status: 'connected', login };
  }

  getToken(): string {
    const token = this.options.secrets.get('secret:github');
    if (!token) throw new Error('AUTH: GitHub is not connected');
    return token;
  }

  hasToken(): boolean {
    return this.options.secrets.has('secret:github');
  }

  disconnect(): void {
    this.options.secrets.clear('secret:github');
  }
}
```

- [ ] **Step 4: Daftarkan IPC GitHub**

Tambahkan `github: GitHubAuth` ke `IpcDeps`, lalu:

```ts
ipcMain.handle('github:startDeviceFlow', async () => {
  const started = await deps.github.start();
  await shell.openExternal(started.verificationUri);
  return started;
});
ipcMain.handle('github:pollDeviceFlow', () => deps.github.poll());
ipcMain.handle('github:disconnect', () => {
  deps.github.disconnect();
  return { ok: true } as const;
});
```

Di `src/main/index.ts`:

```ts
import { GitHubAuth } from './github/auth';

const github = new GitHubAuth({ clientId: () => settings.get().githubClientId, secrets });
registerIpc({ settings, budget, db, terminal, projects, approvals, orchestrator, skills, github });
```

- [ ] **Step 5: UI koneksi GitHub**

`src/renderer/src/components/GitHubPanel.tsx`:

```tsx
import { useState } from 'react';
import { api } from '../lib/api';

export default function GitHubPanel() {
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const connect = async () => {
    try {
      const start = await api.invoke('github:startDeviceFlow');
      setUserCode(start.userCode);
      setStatus(`Buka ${start.verificationUri} dan masukkan kode.`);
      const timer = setInterval(async () => {
        const result = await api.invoke('github:pollDeviceFlow');
        if (result.status === 'connected') {
          clearInterval(timer);
          setStatus(`Terhubung sebagai ${result.login ?? 'GitHub user'}.`);
        } else if (result.status === 'expired') {
          clearInterval(timer);
          setStatus('Kode kedaluwarsa. Coba lagi.');
        }
      }, 5000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section className="card">
      <h3>GitHub</h3>
      <button onClick={() => void connect()}>Hubungkan GitHub</button>
      <button onClick={() => void api.invoke('github:disconnect').then(() => setStatus('Terputus.'))}>Disconnect</button>
      {userCode && <p>Kode: <strong>{userCode}</strong></p>}
      {status && <p>{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
```

Tampilkan `<GitHubPanel />` di `ProjectPage` atau `SettingsPage`.

- [ ] **Step 6: Jalankan test dan commit**

Run: `npm test -- --run src/main/github/auth.test.ts`
Expected: lulus.

```bash
git add src/main/github src/main/ipc.ts src/main/index.ts src/renderer
git commit -m "feat: add github device flow"
```

---

### Task 4: Preflight, create repo, approval, dan push

**Files:**
- Create: `src/main/github/publish.ts`
- Create: `src/main/github/publish.test.ts`
- Modify: `src/main/workspace/terminal-runner.ts` (dukungan `env` tambahan)
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/components/GitHubPanel.tsx`

- [ ] **Step 1: Tulis test preflight dan publish yang gagal**

`src/main/github/publish.test.ts`:

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preflight, GitHubPublisher } from './publish';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('preflight', () => {
  it('rejects secrets and missing .gitignore', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r3x-preflight-'));
    await writeFile(join(dir, 'index.js'), 'console.log(1)');
    await writeFile(join(dir, 'a.env'), 'OPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    await expect(preflight(dir)).rejects.toThrow('POLICY:');
  });

  it('accepts a clean project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r3x-preflight-'));
    await writeFile(join(dir, 'index.js'), 'console.log(1)');
    await writeFile(join(dir, '.gitignore'), 'node_modules\n.env\n');
    await writeFile(join(dir, 'README.md'), '# Demo\n');
    await expect(preflight(dir)).resolves.toMatchObject({ hasGitignore: true });
  });
});

describe('GitHubPublisher', () => {
  it('requires approval before creating the repo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r3x-publish-'));
    await writeFile(join(dir, 'index.js'), 'console.log(1)');
    await writeFile(join(dir, '.gitignore'), 'node_modules\n.env\n');
    await writeFile(join(dir, 'README.md'), '# Demo\n');

    let fetched = false;
    const publisher = new GitHubPublisher({
      approvals: {
        request: () => ({ id: 'apr_1' }),
        wait: async () => false,
        consume: () => ({}),
      } as never,
      auth: { getToken: () => 'gho_test' },
      fetchImpl: (async () => { fetched = true; return json({}); }) as typeof fetch,
      runner: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
      askpass: async () => 'C:/tmp/askpass.cmd',
    });

    await expect(publisher.publish({
      workspace: dir, repoName: 'demo', visibility: 'private', projectId: 'prj_1',
    })).rejects.toThrow('POLICY:');
    expect(fetched).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/github/publish.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi preflight dan publisher**

`src/main/github/publish.ts`:

```ts
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { scanWorkspace, type SecretFinding } from '../security/secret-scan';
import type { ApprovalService } from '../policy/approval-service';
import type { TerminalResult } from '../workspace/terminal-runner';

export interface PreflightResult {
  files: string[];
  secrets: SecretFinding[];
  hasGitignore: boolean;
}

const walk = async (root: string, dir: string, files: string[]): Promise<void> => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, files);
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
};

export async function preflight(workspace: string): Promise<PreflightResult> {
  const files: string[] = [];
  await walk(workspace, workspace, files);
  const secrets = await scanWorkspace(workspace);
  const hasGitignore = files.includes('.gitignore');
  const envFiles = files.filter((file) => /(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.env.example'));
  if (secrets.length > 0) throw new Error(`POLICY: secret scan failed (${secrets.map((item) => item.file).join(', ')})`);
  if (envFiles.length > 0) throw new Error(`POLICY: environment files must not be published (${envFiles.join(', ')})`);
  if (!hasGitignore) throw new Error('POLICY: .gitignore is required before publishing');
  const gitignore = await readFile(path.join(workspace, '.gitignore'), 'utf8');
  if (!/^\s*\.env(\s|\/|$)/m.test(gitignore)) throw new Error('POLICY: .gitignore must exclude .env');
  if (!files.some((file) => file.toLowerCase() === 'readme.md')) throw new Error('POLICY: README.md is required before publishing');
  return { files, secrets, hasGitignore };
}

export interface PublishInput {
  workspace: string;
  repoName: string;
  visibility: 'private' | 'public';
  projectId: string;
}

export interface PublisherDeps {
  approvals: ApprovalService;
  auth: { getToken(): string };
  fetchImpl?: typeof fetch;
  runner: { run(input: { executable: string; args: string[]; cwd: string; env?: Record<string, string> }): Promise<TerminalResult> };
  askpass: () => Promise<string>;
}

export class GitHubPublisher {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: PublisherDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async publish(input: PublishInput): Promise<{ repoUrl: string; commitSha: string }> {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.repoName)) throw new Error('VALIDATION: invalid repository name');
    await preflight(input.workspace);

    const approval = this.deps.approvals.request({
      projectId: input.projectId,
      actionType: 'publish',
      commandSummary: `Create ${input.visibility} GitHub repository "${input.repoName}" and push the workspace`,
      workingDirectory: input.workspace,
      riskLevel: 'high',
      payload: { repoName: input.repoName, visibility: input.visibility },
    });
    const approved = await this.deps.approvals.wait(approval.id);
    if (!approved) throw new Error('POLICY: publish rejected or expired');
    this.deps.approvals.consume(approval.id);

    const token = this.deps.auth.getToken();
    const response = await this.fetchImpl('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'r3x-agent-studio',
      },
      body: JSON.stringify({
        name: input.repoName,
        private: input.visibility === 'private',
        auto_init: false,
      }),
    });
    if (!response.ok) throw new Error(`AUTH: GitHub repository creation failed (${response.status})`);
    const repo = (await response.json()) as { html_url: string; full_name: string };

    const askpass = await this.deps.askpass();
    const gitEnv = {
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: '0',
      R3X_GIT_TOKEN: token,
    };
    const runGit = (args: string[]) => this.deps.runner.run({ executable: 'git', args, cwd: input.workspace, env: gitEnv });

    await runGit(['init']);
    await runGit(['add', '-A']);
    await runGit(['-c', 'user.name=R3X Agent', '-c', 'user.email=r3x@localhost', 'commit', '-m', 'Initial commit by R3X Agent Studio']);
    await runGit(['remote', 'remove', 'origin']);
    await runGit(['remote', 'add', 'origin', `https://github.com/${repo.full_name}.git`]);
    const push = await runGit(['push', '-u', 'origin', 'HEAD']);
    if (push.exitCode !== 0) throw new Error(`AUTH: git push failed: ${push.stderr.slice(0, 500)}`);

    const head = await runGit(['rev-parse', 'HEAD']);
    return { repoUrl: repo.html_url, commitSha: head.stdout.trim() };
  }
}
```

Tambahkan `env` ke `TerminalInput` dan gabungkan setelah `sanitizedEnv()`:

```ts
export interface TerminalInput {
  runId: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

// di start()
env: { ...sanitizedEnv(), ...(input.env ?? {}) },
```

Tambahkan helper askpass di `src/main/github/askpass.ts`:

```ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureAskpass(userData: string): Promise<string> {
  const file = path.join(userData, 'git-askpass.cmd');
  await writeFile(file, '@echo off\r\necho %1 | findstr /I "username" >nul\r\nif %errorlevel%==0 (echo x-access-token) else (echo %R3X_GIT_TOKEN%)\r\n', 'utf8');
  return file;
}
```

- [ ] **Step 4: Daftarkan IPC publish**

Tambahkan `publisher: GitHubPublisher` ke `IpcDeps`, lalu:

```ts
ipcMain.handle('github:publish', async (_event, payload) => {
  const { projectId, repoName, visibility } = asObject(payload);
  if (typeof projectId !== 'string' || typeof repoName !== 'string' || (visibility !== 'private' && visibility !== 'public')) {
    throw new Error('VALIDATION: invalid publish payload');
  }
  const project = getProject(deps.db, projectId);
  if (project.status !== 'REVIEW_REQUIRED') {
    throw new Error('POLICY: project must be in REVIEW_REQUIRED before publishing');
  }
  const result = await deps.publisher.publish({ workspace: project.workspacePath, repoName, visibility, projectId });
  deps.db.prepare('UPDATE projects SET github_url = ?, updated_at = ? WHERE id = ?').run(result.repoUrl, nowIso(), projectId);
  return result;
});
```

Di `src/main/index.ts`:

```ts
const publisher = new GitHubPublisher({
  approvals, auth: github, fetchImpl: fetch,
  runner: terminal, askpass: () => ensureAskpass(app.getPath('userData')),
});
registerIpc({ settings, budget, db, terminal, projects, approvals, orchestrator, skills, github, publisher });
```

- [ ] **Step 5: UI publish**

Tambahkan ke `GitHubPanel`:

```tsx
const [repoName, setRepoName] = useState('');
const [visibility, setVisibility] = useState<'private' | 'public'>('private');
const [repoUrl, setRepoUrl] = useState('');
const [projectId, setProjectId] = useState('');

const publish = async () => {
  try {
    const result = await api.invoke('github:publish', { projectId, repoName, visibility });
    setRepoUrl(result.repoUrl);
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : String(cause));
  }
};

// JSX
<input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="project id" />
<input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="repo-name" />
<select value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}>
  <option value="private">Private</option>
  <option value="public">Public</option>
</select>
<button onClick={() => void publish()}>Publish</button>
{repoUrl && <p>Repo: {repoUrl}</p>}
```

Untuk UX yang benar, ganti input `projectId` dengan prop `projectId` dari `ProjectPage`. Approval publish muncul di `ApprovalModal`; pengguna harus menyetujui sebelum push.

- [ ] **Step 6: Jalankan test dan commit**

Run: `npm test -- --run src/main/github`
Expected: lulus.

Run: `npm run build`
Expected: sukses.

```bash
git add src/main/github src/main/workspace/terminal-runner.ts src/main/ipc.ts src/main/index.ts src/renderer
git commit -m "feat: add github publish with preflight and approval"
```

---

## Fase 8 â€” Polishing

### Task 5: Backup, statistik, packaging, dan smoke E2E

**Files:**
- Create: `src/main/backup.ts`
- Create: `src/main/backup.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/pages/DashboardPage.tsx`
- Modify: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `electron-builder.yml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Tulis test backup yang gagal**

`src/main/backup.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from './db/schema';
import { createBackup } from './backup';

describe('createBackup', () => {
  it('writes a usable sqlite copy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r3x-backup-'));
    const dbPath = join(dir, 'source.db');
    const db = new DatabaseSync(dbPath);
    migrate(db);
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('model', 'm', 'now')").run();
    const backup = await createBackup(db, dir);
    const copy = new DatabaseSync(backup);
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'model'").get()).toMatchObject({ value: 'm' });
    copy.close();
    db.close();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test -- --run src/main/backup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi backup dan statistik**

`src/main/backup.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export async function createBackup(db: DatabaseSync, destinationDir: string): Promise<string> {
  const file = path.join(destinationDir, `r3x-backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  return file;
}
```

Tambahkan ke `src/main/ipc.ts`:

```ts
ipcMain.handle('backup:create', async () => {
  const dir = app.getPath('userData');
  return { path: await createBackup(deps.db, dir) };
});
ipcMain.handle('stats:get', () => {
  const projects = Number((deps.db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number }).count);
  const requestsTotal = Number((deps.db.prepare('SELECT COUNT(*) AS count FROM api_requests').get() as { count: number }).count);
  const day = new Date().toISOString().slice(0, 10);
  const requestsToday = Number((deps.db.prepare('SELECT COUNT(*) AS count FROM api_requests WHERE substr(timestamp, 1, 10) = ?').get(day) as { count: number }).count);
  return { projects, requestsTotal, requestsToday };
});
```

Di `DashboardPage`, muat `stats:get` dan tampilkan. Di `SettingsPage`, tambahkan tombol "Backup database" yang memanggil `backup:create` dan menampilkan path.

- [ ] **Step 4: Packaging**

`electron-builder.yml`:

```yaml
appId: com.r3x.agentstudio
productName: R3X Agent Studio
directories:
  output: release
files:
  - out/**/*
  - package.json
asar: true
win:
  target:
    - target: nsis
      arch:
        - x64
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
```

Tambahkan dev dependency dan script:

```bash
npm install -D @playwright/test
```

`package.json` scripts:

```json
"test:e2e": "playwright test",
"dist": "npm run build && electron-builder --win nsis"
```

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
});
```

`tests/e2e/smoke.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';

test('launches the dashboard', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, R3X_E2E: '1' },
  });
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'R3X Agent Studio' })).toBeVisible();
  await app.close();
});
```

Di `src/main/index.ts`, arahkan userData ke folder temporer saat E2E agar tidak mengotori profil:

```ts
if (process.env.R3X_E2E === '1') {
  app.setPath('userData', join(app.getPath('temp'), `r3x-e2e-${process.pid}`));
}
```

- [ ] **Step 5: Verifikasi**

Run: `npm test -- --run`
Expected: semua unit test lulus.

Run: `npm run build`
Expected: sukses.

Run: `npm run test:e2e`
Expected: smoke test lulus (butuh `npm run build` lebih dulu).

Run: `npm run dist`
Expected: installer NSIS terbentuk di `release/`. Instal dan jalankan; aplikasi terbuka, settings tersimpan, proyek bisa dibuat. Code signing belum termasuk.

- [ ] **Step 6: Commit**

```bash
git add src/main/backup.ts src/main/backup.test.ts src/main/ipc.ts src/main/index.ts src/renderer electron-builder.yml playwright.config.ts tests package.json package-lock.json
git commit -m "chore: add backup, stats, packaging, and e2e smoke"
```

---

## Verifikasi Akhir Fase 6-8

```bash
npm test -- --run
npm run build
npm run test:e2e
```

Kriteria lulus:
- Skill baru berstatus `pending`; tidak bisa diaktifkan sebelum `approved`; checksum dan commit tersimpan.
- GitHub Device Flow menyimpan token di `SecretBox`; token tidak muncul di renderer, argumen git, atau log.
- Publish gagal jika ada secret, `.env`, README hilang, atau `.gitignore` hilang.
- Publish membuat repo private secara default dan hanya setelah approval.
- Backup SQLite bisa dibuka; statistik menampilkan jumlah proyek/request.
- Installer NSIS terbentuk dan aplikasi berjalan setelah instalasi.
