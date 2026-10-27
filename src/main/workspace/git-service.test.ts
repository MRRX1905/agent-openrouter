import { appendFile, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TerminalRunner } from './terminal-runner';
import { GitService } from './git-service';

let dir: string;
let git: GitService;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'r3x-git-'));
  git = new GitService(new TerminalRunner(() => {}));
});

describe('GitService', () => {
  it('initializes, commits, and reports a clean tree', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello');
    await git.init(dir);
    const commit = await git.commitAll(dir, 'checkpoint');
    expect(commit.exitCode).toBe(0);
    const status = await git.status(dir);
    expect(status.stdout.trim()).toBe('');
  });

  it('ignores repo-local fsmonitor hooks in status', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello');
    await git.init(dir);
    const marker = join(dir, 'hook-ran.txt');
    const hook = join(dir, '.git', 'hooks', 'fsmonitor');
    await writeFile(hook, `#!/bin/sh\necho ran > "${marker.replaceAll('\\', '/')}"\nexit 0\n`);
    await chmod(hook, 0o755);
    await appendFile(join(dir, '.git', 'config'), '\n[core]\n\tfsmonitor = .git/hooks/fsmonitor\n');
    await git.status(dir);
    expect(await readFile(marker, 'utf8').catch(() => null)).toBeNull();
  });
});
