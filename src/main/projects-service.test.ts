import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './db/schema';
import { ProjectsService } from './projects-service';
import { WorkspaceService } from './workspace/workspace-service';

let service: ProjectsService;
let root: string;
beforeEach(async () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  root = await mkdtemp(join(tmpdir(), 'r3x-projects-'));
  service = new ProjectsService(db, new WorkspaceService(root));
});

const brief = {
  problem: 'Membantu warung mencatat penjualan.',
  targetUsers: 'Pemilik warung',
  mvpFeatures: ['catat transaksi'],
  constraints: ['offline'],
  stack: ['react'],
  acceptanceCriteria: ['transaksi tersimpan'],
};

describe('ProjectsService', () => {
  it('creates a project and its workspace', async () => {
    const project = await service.create({ name: 'Kasir Warung', brief, mode: 'supervised' });
    expect(project).toMatchObject({ name: 'Kasir Warung', slug: 'kasir-warung', status: 'IDEA' });
    expect((await stat(project.workspacePath)).isDirectory()).toBe(true);
    expect(service.list()).toHaveLength(1);
  });

  it('makes duplicate slugs unique', async () => {
    await service.create({ name: 'Demo', brief, mode: 'supervised' });
    const second = await service.create({ name: 'Demo', brief, mode: 'supervised' });
    expect(second.slug).toBe('demo-2');
  });

  it('rejects incomplete briefs', async () => {
    await expect(service.create({ name: 'Demo', brief: { ...brief, problem: '' }, mode: 'supervised' }))
      .rejects.toThrow('VALIDATION:');
  });
});
