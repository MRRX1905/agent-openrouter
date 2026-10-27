import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceService } from './workspace-service';

let root: string;
let service: WorkspaceService;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'r3x-ws-'));
  service = new WorkspaceService(root);
});

describe('WorkspaceService', () => {
  it('creates a project dir with .gitignore', async () => {
    const dir = await service.createProjectDir('demo-app');
    expect(await readFile(join(dir, '.gitignore'), 'utf8')).toContain('node_modules');
  });

  it('writes and reads files inside the workspace', async () => {
    const dir = await service.createProjectDir('demo');
    await service.writeFile(dir, 'src/index.ts', 'export const x = 1;');
    expect(await service.readFile(dir, 'src/index.ts')).toBe('export const x = 1;');
    expect(await service.listFiles(dir)).toContain('src/index.ts');
  });

  it('rejects traversal and oversized files', async () => {
    const dir = await service.createProjectDir('demo');
    await expect(service.writeFile(dir, '../escape.txt', 'x')).rejects.toThrow('POLICY:');
    await expect(service.writeFile(dir, 'big.txt', 'x'.repeat(1_048_577))).rejects.toThrow('VALIDATION:');
  });

  it('rejects invalid slugs', async () => {
    await expect(service.createProjectDir('../bad')).rejects.toThrow('VALIDATION:');
  });
});
