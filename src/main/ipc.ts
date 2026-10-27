import { app, ipcMain, shell } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { newId, nowIso } from '../shared/ids';
import type { AppSettings, OperatingMode, ProjectBrief } from '../shared/types';
import type { Orchestrator } from './agent/orchestrator';
import { createBackup } from './backup';
import { getLatestJob, getProject } from './db/repositories';
import type { GitHubAuth } from './github/auth';
import type { GitHubPublisher } from './github/publish';
import type { ApprovalService } from './policy/approval-service';
import type { BudgetService } from './providers/budget';
import type { ProjectsService } from './projects-service';
import type { SettingsService } from './settings-service';
import { searchSkills } from './skills/registry';
import type { SkillService } from './skills/skill-service';
import type { TerminalRunner } from './workspace/terminal-runner';

export interface IpcDeps {
  settings: SettingsService;
  budget: BudgetService;
  db: DatabaseSync;
  terminal: TerminalRunner;
  projects: ProjectsService;
  approvals: ApprovalService;
  orchestrator: Orchestrator;
  skills: SkillService;
  github: GitHubAuth;
  publisher: GitHubPublisher;
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) throw new Error('VALIDATION: payload must be an object');
  return value as Record<string, unknown>;
};

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('app:ping', () => ({ version: app.getVersion() }));
  ipcMain.handle('budget:get', () => deps.budget.snapshot());
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
  ipcMain.handle('jobs:start', async (_event, payload) => {
    const { projectId } = asObject(payload);
    if (typeof projectId !== 'string') throw new Error('VALIDATION: projectId is required');
    const instructions = await deps.skills.enabledInstructions();
    return { jobId: deps.orchestrator.start(projectId, instructions) };
  });
  ipcMain.handle('jobs:pause', (_event, payload) => {
    const { jobId } = asObject(payload);
    if (typeof jobId !== 'string') throw new Error('VALIDATION: jobId is required');
    deps.orchestrator.pause(jobId);
    return { ok: true } as const;
  });
  ipcMain.handle('jobs:resume', async (_event, payload) => {
    const { jobId } = asObject(payload);
    if (typeof jobId !== 'string') throw new Error('VALIDATION: jobId is required');
    await deps.orchestrator.resume(jobId);
    return { ok: true } as const;
  });
  ipcMain.handle('jobs:get', (_event, payload) => {
    const { projectId } = asObject(payload);
    if (typeof projectId !== 'string') throw new Error('VALIDATION: projectId is required');
    return getLatestJob(deps.db, projectId);
  });
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
  ipcMain.handle('approvals:list', (_event, payload) => {
    const { projectId } = asObject(payload);
    if (typeof projectId !== 'string') throw new Error('VALIDATION: projectId is required');
    return deps.approvals.list(projectId);
  });
  ipcMain.handle('approvals:decide', (_event, payload) => {
    const { approvalId, decision } = asObject(payload);
    if (typeof approvalId !== 'string' || (decision !== 'approved' && decision !== 'rejected')) {
      throw new Error('VALIDATION: invalid approval decision');
    }
    deps.approvals.decide(approvalId, decision);
    return { ok: true } as const;
  });
  ipcMain.handle('skills:search', (_event, payload) => {
    const { query } = asObject(payload);
    if (typeof query !== 'string') throw new Error('VALIDATION: query is required');
    return searchSkills(query);
  });
  ipcMain.handle('skills:list', () => deps.skills.list());
  ipcMain.handle('skills:install', async (_event, payload) => {
    const { source, skillId } = asObject(payload);
    if (typeof source !== 'string' || typeof skillId !== 'string') throw new Error('VALIDATION: source and skillId are required');
    const resolved = await deps.skills.resolve(source, skillId);
    return deps.skills.install(resolved);
  });
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
  ipcMain.handle('github:preflight', async (_event, payload) => {
    const { projectId } = asObject(payload);
    if (typeof projectId !== 'string') throw new Error('VALIDATION: projectId is required');
    const project = getProject(deps.db, projectId);
    return deps.publisher.preflight(project.workspacePath);
  });
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
}
