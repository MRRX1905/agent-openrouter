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
