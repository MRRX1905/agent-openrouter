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
