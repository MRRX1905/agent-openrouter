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
