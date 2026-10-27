import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { detectChecks, runChecks } from './checks';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'r3x-checks-')); });

describe('checks', () => {
  it('detects package scripts', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', build: 'tsc' } }));
    expect(await detectChecks(dir)).toEqual([
      { name: 'test', executable: 'npm', args: ['run', 'test'] },
      { name: 'build', executable: 'npm', args: ['run', 'build'] },
    ]);
  });

  it('runs checks and reports failures', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    const results = await runChecks(dir, {
      run: async () => ({ exitCode: 1, stdout: 'fail', stderr: 'boom' }),
    });
    expect(results).toEqual([{ name: 'test', ok: false, exitCode: 1, output: 'failboom' }]);
  });
});
