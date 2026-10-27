import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '../../shared/types';
import { TerminalRunner } from '../workspace/terminal-runner';
import { WorkspaceService } from '../workspace/workspace-service';
import { QualityService } from './quality-service';

let root: string;
let workspaces: WorkspaceService;

const project = (workspacePath: string): Project => ({
  id: 'prj_1', name: 'Demo', slug: 'demo', workspacePath, stack: ['typescript'],
  status: 'REVIEW_REQUIRED',
  brief: {
    problem: 'Demo problem', targetUsers: 'Demo users', mvpFeatures: ['demo'],
    constraints: [], stack: ['typescript'], acceptanceCriteria: ['works'],
  },
  githubUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'r3x-quality-'));
  workspaces = new WorkspaceService(root);
});

describe('QualityService', () => {
  it('adds a structure check when no stack-specific checks exist', async () => {
    const workspace = join(root, 'demo');
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, '.gitignore'), 'node_modules/\n');
    await writeFile(join(workspace, 'index.ts'), 'export const x = 1;\n');
    const quality = new QualityService(workspaces, new TerminalRunner(() => {}));

    const report = await quality.run(project(workspace));

    expect(report.checks).toEqual([expect.objectContaining({ name: 'structure', ok: true })]);
    expect(report.dod.passed).toBe(true);
  });
});
