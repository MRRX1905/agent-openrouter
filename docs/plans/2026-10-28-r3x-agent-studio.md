# R3X Agent Studio — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi desktop Windows yang merencanakan, membangun, menguji, mendokumentasikan, dan (dengan approval) mempublikasikan proyek perangkat lunak melalui OpenRouter, dengan terminal nyata, ledger request, checkpoint/resume, dan quality gate yang jujur.

**Architecture:** Electron 45 sebagai shell; seluruh backend agen berjalan di main process (Node 24) tanpa sidecar. Renderer React hanya menampilkan state dan mengirim IPC tervalidasi. Persistensi memakai `node:sqlite`; secret memakai Electron `safeStorage` (DPAPI di Windows); command dijalankan lewat `child_process.spawn` tanpa shell; OpenRouter, GitHub, dan skills.sh diakses lewat `fetch` polos.

**Tech Stack:** Electron 45, React 19, TypeScript 7, Vite 8 via electron-vite 6, Vitest 5, electron-builder 26, `node:sqlite`, `node:crypto`, `child_process.spawn`.

---

## 1. Keputusan Arsitektur

| Keputusan | Pilihan | Alasan | Konsekuensi |
|---|---|---|---|
| Desktop shell | Electron 45 + electron-vite | Rust belum terpasang; satu runtime Node untuk UI, agen, PTY/process, DB | Binary lebih besar; wajib hardening renderer |
| Backend agen | Main process TypeScript | Tidak perlu sidecar, IPC, atau dua state store | Main process harus tetap responsif; operasi berat async |
| Database | `node:sqlite` (`DatabaseSync`) | Bawaan Node 24 di Electron 45; tanpa native rebuild | API sinkron; query pendek saja |
| Secret | `safeStorage` + ciphertext di SQLite | DPAPI Windows, tanpa keytar | Secret tidak bisa dibaca jika profil OS berubah |
| Terminal | `spawn` tanpa shell | Argumen terstruktur, tidak ada shell injection | Bukan PTY; TUI interaktif ditunda |
| Command policy | Allowlist executable + approval token | Model tidak pernah mengirim string shell | Perlu perawatan allowlist |
| OpenRouter | `fetch` + SSE parser sendiri | Tanpa SDK; kontrol penuh atas usage/error | Parser SSE harus diuji |
| Skills | `GET https://skills.sh/api/search` + GitHub API | Endpoint search publik; detail API butuh OIDC Vercel | Resolusi file memakai GitHub tree/raw |
| GitHub auth | OAuth Device Flow, client ID diisi pengguna | Tanpa client secret di aplikasi desktop | Pengguna harus membuat OAuth App sekali |
| Styling | Satu `styles.css` + CSS variables | Sedikit dependensi; konsisten | Tidak ada utility framework |
| Testing | Vitest untuk logika; Playwright Electron untuk smoke | Cepat, tanpa browser eksternal untuk unit | E2E hanya alur kritis |

**Deviasi sadar dari PRD:** Tauri diganti Electron; PTY ditunda; skills.sh detail API tidak dipakai karena memerlukan Vercel OIDC. Semua deviasi dicatat di `docs/ARCHITECTURE.md` saat implementasi.

---

## 2. Invariants Keamanan (tidak boleh dinegosiasikan)

1. `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`.
2. Renderer tidak pernah menerima API key, token GitHub, atau isi secret. Hanya boolean `hasOpenRouterKey` / `hasGithubToken`.
3. Tidak ada `shell: true` dan tidak ada `exec()` string. Semua command memakai `spawn(executable, args, { cwd, env, shell: false })`.
4. Shell interpreter (`cmd`, `powershell`, `pwsh`, `bash`, `sh`, `wscript`, `cscript`, `mshta`) diblokir sebagai executable agen.
5. Semua path file di-resolve dan diverifikasi berada di dalam workspace proyek; symlink di-resolve dengan `realpath`.
6. Approval terikat pada hash `{projectId, executable, args, cwd, nonce}`, berlaku 120 detik, sekali pakai. Perubahan command membatalkan approval.
7. Setiap request OpenRouter dicatat di `api_requests`, termasuk retry dan kegagalan.
8. Hard cap harian dan reserve repair ditegakkan sebelum request; tidak ada request diam-diam.
9. Secret scan wajib lulus sebelum commit/push; repo GitHub default private.
10. Log, prompt, dan output terminal diredaksi dengan pola token sebelum disimpan atau ditampilkan.
11. Tidak ada `force push`, hapus repo, elevasi admin, atau akses di luar workspace tanpa jalur khusus.
12. `COMPLETED` hanya diberikan jika Definition of Done lulus; kegagalan menjadi `NEEDS_REPAIR` atau `BLOCKED`.

---

## 3. Struktur File

```text
r3x-agent-studio/
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ vitest.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ tsconfig.web.json
├─ src/
│  ├─ shared/
│  │  ├─ types.ts              # domain types + agent message types
│  │  ├─ ipc-contract.ts       # channel -> req/res map + event union
│  │  ├─ ids.ts                # newId(), nowIso()
│  │  ├─ slug.ts               # slugify()
│  │  └─ redact.ts             # redaksi token (dipakai main + test)
│  ├─ main/
│  │  ├─ index.ts              # app lifecycle, window, security handlers
│  │  ├─ ipc.ts                # registrasi handler + validasi runtime
│  │  ├─ events.ts             # EventSink -> webContents.send
│  │  ├─ settings-service.ts   # settings publik + secret OpenRouter
│  │  ├─ projects-service.ts   # create/list/get proyek + workspace
│  │  ├─ backup.ts             # VACUUM INTO backup
│  │  ├─ db/
│  │  │  ├─ schema.ts          # SCHEMA_SQL + migrate()
│  │  │  ├─ database.ts        # openDatabase()
│  │  │  └─ repositories.ts    # projects/jobs/messages/requests/approvals/settings/audit
│  │  ├─ security/
│  │  │  ├─ secrets.ts         # SecretBox + safeStorage adapter
│  │  │  ├─ path-guard.ts      # resolveInWorkspace()
│  │  │  └─ secret-scan.ts     # regex scan + findings
│  │  ├─ providers/
│  │  │  ├─ sse.ts             # parseSseStream()
│  │  │  ├─ openrouter.ts      # OpenRouterClient
│  │  │  └─ budget.ts          # canSpend(), daily usage
│  │  ├─ workspace/
│  │  │  ├─ workspace-service.ts
│  │  │  ├─ terminal-runner.ts
│  │  │  └─ git-service.ts
│  │  ├─ tools/
│  │  │  ├─ tool-defs.ts       # JSON schema untuk OpenRouter
│  │  │  └─ tool-router.ts     # eksekusi tool + policy + approval
│  │  ├─ policy/
│  │  │  ├─ policy-engine.ts   # klasifikasi risiko
│  │  │  └─ approval-service.ts
│  │  ├─ agent/
│  │  │  ├─ state-machine.ts
│  │  │  ├─ prompts.ts
│  │  │  ├─ checkpoint.ts
│  │  │  └─ orchestrator.ts
│  │  ├─ quality/
│  │  │  ├─ checks.ts
│  │  │  ├─ readme.ts
│  │  │  ├─ dod.ts
│  │  │  └─ quality-service.ts
│  │  ├─ skills/
│  │  │  ├─ registry.ts
│  │  │  └─ skill-service.ts
│  │  └─ github/
│  │     ├─ auth.ts
│  │     ├─ askpass.ts
│  │     └─ publish.ts
│  ├─ preload/
│  │  └─ index.ts              # contextBridge: invoke + onAgentEvent
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ styles.css
│        ├─ lib/api.ts
│        ├─ components/
│        │  ├─ StatusBadge.tsx
│        │  ├─ BudgetBar.tsx
│        │  ├─ TerminalPanel.tsx
│        │  ├─ ApprovalModal.tsx
│        │  ├─ ReviewPanel.tsx
│        │  └─ GitHubPanel.tsx
│        └─ pages/
│           ├─ DashboardPage.tsx
│           ├─ NewProjectPage.tsx
│           ├─ ProjectPage.tsx
│           ├─ SkillsPage.tsx
│           └─ SettingsPage.tsx
└─ tests/
   └─ e2e/
      └─ smoke.spec.ts
```

Unit test diletakkan di samping file sumber: `src/**/foo.test.ts`. Test integrasi memakai `:memory:` atau direktori temporer.

---

## 4. Kontrak Lintas Modul

### 4.1 Domain types (`src/shared/types.ts`)

Nama dan bentuk ini dipakai semua plan fase. Jangan mengganti nama field tanpa memperbarui seluruh plan.

```ts
export type ProjectStatus =
  | 'IDEA' | 'PLANNING' | 'READY' | 'BUILDING' | 'TESTING' | 'REPAIRING'
  | 'DOCUMENTING' | 'REVIEW_REQUIRED' | 'PUBLISHING' | 'COMPLETED'
  | 'PAUSED' | 'NEEDS_REPAIR' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PolicyAction = 'allow' | 'approval' | 'block';
export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired';
export type OperatingMode = 'auto' | 'supervised' | 'repair';
export type SkillReviewStatus = 'pending' | 'approved' | 'rejected';

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

export interface ApiRequestRecord {
  id: string;
  projectId: string;
  provider: string;
  model: string;
  status: 'ok' | 'error';
  httpStatus: number | null;
  timestamp: string;
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  cost: number | null;
  errorCode: string | null;
}

export interface ApprovalRecord {
  id: string;
  projectId: string;
  actionType: 'command' | 'publish' | 'skill_script';
  commandSummary: string;
  workingDirectory: string;
  riskLevel: RiskLevel;
  decision: ApprovalDecision;
  tokenHash: string;
  payloadJson: string;
  expiresAt: string;
  decidedAt: string | null;
  consumedAt: string | null;
}

export interface ToolRunRecord {
  id: string;
  projectId: string;
  tool: string;
  command: string;
  exitCode: number | null;
  startedAt: string;
  endedAt: string | null;
  outputLogPath: string | null;
}

export interface SkillRecord {
  id: string;
  name: string;
  source: string;
  versionOrCommit: string;
  checksum: string;
  reviewStatus: SkillReviewStatus;
  enabled: boolean;
}

export interface AuditEventRecord {
  id: string;
  actor: 'user' | 'agent' | 'system';
  eventType: string;
  target: string;
  result: 'ok' | 'denied' | 'error';
  timestamp: string;
  metadataJson: string;
}

export interface AppSettings {
  model: string;
  dailyRequestCap: number;
  repairReservePct: number;
  workspaceRoot: string;
  mode: OperatingMode;
  githubClientId: string;
  hasOpenRouterKey: boolean;
  hasGithubToken: boolean;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolResult {
  ok: boolean;
  output: string;
  exitCode?: number | null;
}
```

### 4.2 IPC (`src/shared/ipc-contract.ts`)

Channel dan payload harus persis. Preload mengekspos `window.r3x.invoke(channel, payload)` dan `window.r3x.onAgentEvent(cb)`.

```ts
import type {
  AgentEvent, AppSettings, ApprovalRecord, Job, OperatingMode, Project, ProjectBrief,
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
  'jobs:get': { req: { projectId: string }; res: Job | null };
  'terminal:run': { req: { projectId: string; executable: string; args: string[] }; res: { runId: string } };
  'terminal:stop': { req: { runId: string }; res: { ok: true } };
  'approvals:list': { req: { projectId: string }; res: ApprovalRecord[] };
  'approvals:decide': { req: { approvalId: string; decision: 'approved' | 'rejected' }; res: { ok: true } };
  'skills:search': { req: { query: string }; res: SkillSearchResult[] };
  'skills:list': { req: void; res: SkillRecord[] };
  'skills:install': { req: { source: string; skillId: string }; res: SkillRecord };
  'skills:review': { req: { skillId: string; status: 'approved' | 'rejected' }; res: { ok: true } };
  'skills:setEnabled': { req: { skillId: string; enabled: boolean }; res: { ok: true } };
  'github:startDeviceFlow': { req: void; res: { userCode: string; verificationUri: string; expiresIn: number } };
  'github:pollDeviceFlow': { req: void; res: { status: 'pending' | 'connected' | 'expired'; login?: string } };
  'github:disconnect': { req: void; res: { ok: true } };
  'github:publish': { req: { projectId: string; repoName: string; visibility: 'private' | 'public' }; res: { repoUrl: string; commitSha: string } };
  'backup:create': { req: void; res: { path: string } };
  'stats:get': { req: void; res: { projects: number; requestsToday: number; requestsTotal: number } };
}
```

Event union (dikirim main -> renderer lewat `agent:event`):

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

### 4.3 Skema database

Tabel: `projects`, `jobs`, `job_messages`, `api_requests`, `approvals`, `tool_runs`, `skills`, `audit_events`, `settings`, `ideas`. Kolom mengikuti PRD bagian 15, ditambah `job_messages` dan `ideas`. Secret disimpan di `settings` dengan `is_secret = 1`; query settings biasa memfilter `is_secret = 0`.

### 4.4 Format error IPC

Semua handler melempar `Error` dengan pesan yang sudah diredaksi. Renderer menampilkan `error.message`; tidak ada stack trace ke UI. Kode error memakai prefix: `VALIDATION:`, `POLICY:`, `BUDGET:`, `NOT_FOUND:`, `AUTH:`.

---

## 5. Indeks Fase

| Fase | Plan | Isi | Kriteria keluar |
|---|---|---|---|
| 0 | [Fondasi](2026-10-28-r3x-foundation.md#fase-0--fondasi) | Scaffold Electron, SQLite, secret, settings, security shell | App jalan, settings tersimpan aman, test hijau |
| 1 | [OpenRouter](2026-10-28-r3x-foundation.md#fase-1--openrouter) | SSE client, ledger, budget guard | Request tercatat, cap menghentikan request |
| 2 | [Workspace & Terminal](2026-10-28-r3x-foundation.md#fase-2--workspace--terminal) | Workspace terisolasi, file tools, spawn terminal, Stop | Proyek uji dibuat dan command nyata terlihat |
| 3 | [Approval & Policy](2026-10-28-r3x-agent-workflow.md#fase-3--approval--policy) | Klasifikasi risiko, approval sekali pakai, audit | Command berisiko tertahan sampai disetujui |
| 4 | [Agent Workflow](2026-10-28-r3x-agent-workflow.md#fase-4--agent-workflow) | State machine, orchestrator, tool loop, checkpoint/resume | Proyek sederhana dibangun dan dilanjutkan |
| 5 | [Quality Gate](2026-10-28-r3x-agent-workflow.md#fase-5--dokumentasi--quality-gate) | Lint/test/build, secret scan, README, DoD | Status selesai hanya jika DoD lulus |
| 6 | [Skills](2026-10-28-r3x-skills-github-release.md#fase-6--skills) | Search skills.sh, review file, pin commit, enable | Skill tidak aktif sebelum disetujui |
| 7 | [GitHub](2026-10-28-r3x-skills-github-release.md#fase-7--github) | Device flow, create private repo, preflight, push | Repo dibuat hanya setelah approval |
| 8 | [Polishing](2026-10-28-r3x-skills-github-release.md#fase-8--polishing) | E2E, packaging NSIS, backup, stats | Installer jalan, alur kritis teruji |

---

## 6. Urutan Eksekusi

1. Fase 0-2 selesai dan `npm test` hijau sebelum menyentuh agen.
2. Fase 3 harus selesai sebelum tool `run_command` diaktifkan untuk model.
3. Fase 4 memakai gateway palsu di test; tidak ada network di unit test.
4. Fase 5 harus lulus sebelum UI menampilkan tombol publish.
5. Fase 6-7 independen; GitHub tidak boleh diimplementasikan sebelum secret scan fase 5.
6. Fase 8 terakhir; jangan packaging sebelum semua test stabil.

Perintah verifikasi setiap task:

```bash
npm test -- --run
npm run build
```

Perintah E2E fase 8:

```bash
npm run test:e2e
```

---

## 7. Batas MVP dan Pekerjaan yang Ditunda

Ditunda dengan sadar:
- Daily Build / generator ide otomatis dan riwayat ide. MVP memakai brief manual; tabel `ideas` sudah disiapkan.
- Perbedaan kebijakan per mode selain label dan approval konservatif. Auto/Supervised/Repair memakai gate yang sama sampai ada uji perilaku khusus.
- Alur Repair Existing Project (membuka folder lama, analisis diff, patch). Workspace saat ini selalu dibuat baru.
- PTY interaktif (TUI, prompt berwarna). Terminal memakai pipe; tambahkan `node-pty` hanya jika proyek target butuh input interaktif.
- Auto-update dan code signing. Installer NSIS unsigned untuk internal.
- Browser testing otomatis (Playwright untuk proyek hasil) — fase 8 hanya smoke aplikasi.
- Multi-user/cloud sync.
- GitHub App; memakai OAuth Device Flow dengan client ID milik pengguna dan scope classic `repo`.
- Audit skills.sh pihak ketiga; UI menautkan halaman audit, tidak menyimpulkan keamanan.
- Dukungan OS selain Windows 10/11 64-bit.

---

## 8. Pemetaan Definition of Done

| DoD PRD | Implementasi |
|---|---|
| Source code & struktur konsisten | Tool file + workspace guard; dicek `dod.ts` |
| Fitur inti / keterbatasan eksplisit | Brief acceptance criteria + laporan review |
| Build/test/lint tercatat | `quality/checks.ts` + `tool_runs` |
| Tidak ada secret | `security/secret-scan.ts` sebelum commit/push |
| README lengkap | `quality/readme.ts` + validasi heading |
| `.gitignore`/`.env.example` | Generator workspace + cek DoD |
| Dependensi/lisensi dasar | `npm ls --depth=0` dicatat; lisensi ditampilkan |
| Diff dapat ditinjau | `git diff` + halaman review |
| Kegagalan jujur | `dod.ts` memaksa `NEEDS_REPAIR`/`BLOCKED` |
| Publikasi sesuai izin | Approval publish + repo private default |

---

## 9. Risiko Implementasi

| Risiko | Mitigasi |
|---|---|
| Main process blocking karena SQLite sinkron | Query kecil; operasi file/command async; tidak ada loop besar di main |
| Renderer XSS mencuri IPC | CSP ketat, tanpa `dangerouslySetInnerHTML`, validasi semua payload di main |
| `node:sqlite` berubah API | Pin Electron 45; test DB di CI; fallback better-sqlite3 hanya jika perlu |
| Model mengirim command berbahaya | Policy engine + allowlist + approval; shell interpreter diblokir |
| Token GitHub bocor lewat proses | Askpass via env, bukan argumen/URL; redaksi log |
| Budget habis di tengah build | Checkpoint tiap turn, pause otomatis, reserve repair |
| Output terminal terlalu besar | Batas 1 MiB per run, truncate dengan penanda; log ke file |
| Skills berisi instruksi jahat | Review file, hash, pin commit, instruksi diperlakukan sebagai data |
