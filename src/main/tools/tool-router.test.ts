import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceService } from '../workspace/workspace-service';
import { ToolRouter } from './tool-router';
import type { ToolCall } from '../../shared/types';

let workspace: string;
let router: ToolRouter;
beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'r3x-tools-'));
  const ws = new WorkspaceService(root);
  workspace = await ws.createProjectDir('demo');
  router = new ToolRouter(ws);
});

const call = (name: string, args: unknown): ToolCall => ({
  id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) },
});

describe('ToolRouter', () => {
  it('writes then reads a file', async () => {
    expect((await router.execute(workspace, call('write_file', { path: 'a.txt', content: 'hi' }))).ok).toBe(true);
    const result = await router.execute(workspace, call('read_file', { path: 'a.txt' }));
    expect(result).toEqual({ ok: true, output: 'hi' });
  });

  it('returns a policy error instead of throwing', async () => {
    const result = await router.execute(workspace, call('read_file', { path: '../x' }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('POLICY:');
  });

  it('rejects malformed arguments', async () => {
    const result = await router.execute(workspace, call('write_file', { path: 'a.txt' }));
    expect(result).toMatchObject({ ok: false });
  });
});
