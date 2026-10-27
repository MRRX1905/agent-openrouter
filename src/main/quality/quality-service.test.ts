import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalRecord, Project } from '../../shared/types';
import type { ApprovalService } from '../policy/approval-service';
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

const projectWithChecks = async (): Promise<string> => {
  const workspace = join(root, `demo-${Math.random().toString(36).slice(2)}`);
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, '.gitignore'), 'node_modules/\n');
  await writeFile(join(workspace, 'index.ts'), 'export const x = 1;\n');
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node -e ""' } }));
  return workspace;
};

const fakeTerminal = () => {
  const runs: Array<{ executable: string; args: string[] }> = [];
  const terminal = {
    run: async (input: { executable: string; args: string[] }) => {
      runs.push({ executable: input.executable, args: input.args });
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    },
  } as unknown as TerminalRunner;
  return { terminal, runs };
};

const fakeApprover = (approved: boolean) => {
  const requests: Array<Parameters<ApprovalService['request']>[0]> = [];
  let consumed = 0;
  const approver = {
    request: (input: Parameters<ApprovalService['request']>[0]) => {
      requests.push(input);
      return { id: 'apr_1' } as ApprovalRecord;
    },
    wait: async () => approved,
    consume: () => { consumed += 1; return {}; },
  };
  return { approver, requests, consumed: () => consumed };
};

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

  it('returns failed checks when the quality approval is rejected', async () => {
    const workspace = await projectWithChecks();
    const { terminal, runs } = fakeTerminal();
    const { approver, requests, consumed } = fakeApprover(false);
    const quality = new QualityService(workspaces, terminal, approver);

    const report = await quality.run(project(workspace));

    expect(requests).toEqual([{
      projectId: 'prj_1', actionType: 'command', commandSummary: 'npm run test',
      workingDirectory: workspace, riskLevel: 'medium',
      payload: {
        reason: 'local quality checks', needsNetwork: false, writesFiles: true,
        checks: [{ name: 'test', executable: 'npm', args: ['run', 'test'] }],
      },
    }]);
    expect(runs).toEqual([]);
    expect(consumed()).toBe(0);
    expect(report.checks).toEqual([{ name: 'test', ok: false, exitCode: null, output: 'POLICY: quality checks rejected' }]);
    expect(report.dod.passed).toBe(false);
  });

  it('runs checks after the quality approval is granted', async () => {
    const workspace = await projectWithChecks();
    const { terminal, runs } = fakeTerminal();
    const { approver, consumed } = fakeApprover(true);
    const quality = new QualityService(workspaces, terminal, approver);

    const report = await quality.run(project(workspace));

    expect(runs).toEqual([{ executable: 'npm', args: ['run', 'test'] }]);
    expect(consumed()).toBe(1);
    expect(report.checks).toEqual([{ name: 'test', ok: true, exitCode: 0, output: 'ok' }]);
  });
});
