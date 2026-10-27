import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preflight, GitHubPublisher } from './publish';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const project = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'r3x-publish-'));
  await writeFile(join(dir, 'index.js'), 'console.log(1)');
  await writeFile(join(dir, '.gitignore'), 'node_modules\n.env\n');
  await writeFile(join(dir, 'README.md'), '# Demo\n');
  return dir;
};

describe('preflight', () => {
  it('rejects secrets and missing .gitignore', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r3x-preflight-'));
    await writeFile(join(dir, 'index.js'), 'console.log(1)');
    await writeFile(join(dir, 'a.env'), 'OPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    await expect(preflight(dir)).rejects.toThrow('POLICY:');
  });

  it('accepts a clean project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'r3x-preflight-'));
    await writeFile(join(dir, 'index.js'), 'console.log(1)');
    await writeFile(join(dir, '.gitignore'), 'node_modules\n.env\n');
    await writeFile(join(dir, 'README.md'), '# Demo\n');
    await expect(preflight(dir)).resolves.toMatchObject({ hasGitignore: true });
  });
});

describe('GitHubPublisher', () => {
  it('requires approval before creating the repo', async () => {
    const dir = await project();

    let fetched = false;
    const publisher = new GitHubPublisher({
      approvals: {
        request: () => ({ id: 'apr_1' }),
        wait: async () => false,
        consume: () => ({}),
      } as never,
      auth: { getToken: () => 'gho_test' },
      fetchImpl: (async () => { fetched = true; return json({}); }) as typeof fetch,
      runner: { run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
      askpass: async () => 'C:/tmp/askpass.cmd',
    });

    await expect(publisher.publish({
      workspace: dir, repoName: 'demo', visibility: 'private', projectId: 'prj_1',
    })).rejects.toThrow('POLICY:');
    expect(fetched).toBe(false);
  });

  it('creates the repo, pushes, and returns the commit', async () => {
    const dir = await project();
    const calls: string[][] = [];
    const envs: Array<Record<string, string> | undefined> = [];
    let consumed = false;

    const publisher = new GitHubPublisher({
      approvals: {
        request: () => ({ id: 'apr_2' }),
        wait: async () => true,
        consume: () => { consumed = true; return {}; },
      } as never,
      auth: { getToken: () => 'gho_test' },
      fetchImpl: (async () => json({ html_url: 'https://github.com/octocat/demo', full_name: 'octocat/demo' })) as typeof fetch,
      runner: {
        run: async ({ args, env }) => {
          calls.push(args);
          envs.push(env);
          return args.includes('rev-parse')
            ? { exitCode: 0, stdout: 'abc123\n', stderr: '' }
            : { exitCode: 0, stdout: '', stderr: '' };
        },
      },
      askpass: async () => 'C:/tmp/askpass.cmd',
    });

    await expect(publisher.publish({
      workspace: dir, repoName: 'demo', visibility: 'private', projectId: 'prj_1',
    })).resolves.toEqual({ repoUrl: 'https://github.com/octocat/demo', commitSha: 'abc123' });
    expect(consumed).toBe(true);
    const pushCall = calls.findIndex((args) => args.includes('push'));
    expect(pushCall).toBeGreaterThan(-1);
    expect(envs[pushCall]).toMatchObject({ R3X_GIT_TOKEN: 'gho_test' });
    expect(envs.filter(Boolean)).toHaveLength(1);
  });
});
