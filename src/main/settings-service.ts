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
