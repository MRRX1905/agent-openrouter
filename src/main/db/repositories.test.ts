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
