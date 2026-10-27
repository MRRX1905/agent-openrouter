import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveInWorkspace } from './path-guard';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'r3x-guard-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'a.txt'), 'ok');
});

describe('resolveInWorkspace', () => {
  it('accepts a relative path inside the workspace', async () => {
    await expect(resolveInWorkspace(root, 'src/a.txt')).resolves.toBe(join(root, 'src', 'a.txt'));
  });

  it('rejects traversal and absolute paths', async () => {
    await expect(resolveInWorkspace(root, '../outside.txt')).rejects.toThrow('POLICY:');
    await expect(resolveInWorkspace(root, 'C:/Windows/win.ini')).rejects.toThrow('POLICY:');
  });

  it('rejects a symlink that resolves outside', async () => {
    const fakeRealpath = async (value: string) => (value.endsWith('a.txt') ? 'C:/outside/a.txt' : value);
    await expect(resolveInWorkspace(root, 'src/a.txt', fakeRealpath)).rejects.toThrow('POLICY:');
  });

  it('rejects null bytes and empty paths', async () => {
    await expect(resolveInWorkspace(root, 'a\0b')).rejects.toThrow('VALIDATION:');
    await expect(resolveInWorkspace(root, '  ')).rejects.toThrow('VALIDATION:');
  });
});
