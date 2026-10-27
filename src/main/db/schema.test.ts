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
