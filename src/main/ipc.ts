import { app, ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { newId } from '../shared/ids';
import type { AppSettings, OperatingMode, ProjectBrief } from '../shared/types';
import { getProject } from './db/repositories';
import type { BudgetService } from './providers/budget';
import type { ProjectsService } from './projects-service';
import type { SettingsService } from './settings-service';
import type { TerminalRunner } from './workspace/terminal-runner';

export interface IpcDeps {
  settings: SettingsService;
  budget: BudgetService;
  db: DatabaseSync;
  terminal: TerminalRunner;
  projects: ProjectsService;
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
}
