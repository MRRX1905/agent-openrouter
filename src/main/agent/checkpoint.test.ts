import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { createJob, createProject, getJob } from '../db/repositories';
import { loadCheckpoint, saveCheckpoint } from './checkpoint';

let db: DatabaseSync;
let jobId: string;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  const project = createProject(db, {
    name: 'Demo', slug: 'demo', workspacePath: 'C:/ws/demo', stack: [], brief: {
      problem: 'p', targetUsers: 'u', mvpFeatures: ['f'], constraints: [], stack: [], acceptanceCriteria: ['a'],
    },
  });
  jobId = createJob(db, project.id, 'BUILDING').id;
});

describe('checkpoint', () => {
  it('round-trips state and updates the job stage', () => {
    saveCheckpoint(db, jobId, { stage: 'TESTING', lastTool: 'write_file', summary: 'built' });
    expect(loadCheckpoint(db, jobId)).toMatchObject({ stage: 'TESTING', lastTool: 'write_file' });
    expect(getJob(db, jobId).currentStage).toBe('TESTING');
    expect(getJob(db, jobId).lastCheckpoint).toBeTruthy();
  });
});
