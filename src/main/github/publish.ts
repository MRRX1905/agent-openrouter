import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { scanWorkspace, type SecretFinding } from '../security/secret-scan';
import type { ApprovalService } from '../policy/approval-service';
import type { TerminalResult } from '../workspace/terminal-runner';

export interface PreflightResult {
  files: string[];
  secrets: SecretFinding[];
  hasGitignore: boolean;
}

export interface PreflightInfo extends PreflightResult {
  gitAvailable: boolean;
  authenticated: boolean;
  hasRemote: boolean;
  dirty: boolean;
}

const walk = async (root: string, dir: string, files: string[]): Promise<void> => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, files);
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
};

export async function preflight(workspace: string): Promise<PreflightResult> {
  const files: string[] = [];
  await walk(workspace, workspace, files);
  const secrets = await scanWorkspace(workspace);
  const hasGitignore = files.includes('.gitignore');
  const envFiles = files.filter((file) => /(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.env.example'));
  if (secrets.length > 0) throw new Error(`POLICY: secret scan failed (${secrets.map((item) => item.file).join(', ')})`);
  if (envFiles.length > 0) throw new Error(`POLICY: environment files must not be published (${envFiles.join(', ')})`);
  if (!hasGitignore) throw new Error('POLICY: .gitignore is required before publishing');
  const gitignore = await readFile(path.join(workspace, '.gitignore'), 'utf8');
  if (!/^\s*\.env(\s|\/|$)/m.test(gitignore)) throw new Error('POLICY: .gitignore must exclude .env');
  if (!files.some((file) => file.toLowerCase() === 'readme.md')) throw new Error('POLICY: README.md is required before publishing');
  return { files, secrets, hasGitignore };
}

export interface PublishInput {
  workspace: string;
  repoName: string;
  visibility: 'private' | 'public';
  projectId: string;
}

export interface PublisherDeps {
  approvals: ApprovalService;
  auth: { getToken(): string };
  fetchImpl?: typeof fetch;
  runner: { run(input: { executable: string; args: string[]; cwd: string; env?: Record<string, string> }): Promise<TerminalResult> };
  askpass: () => Promise<string>;
}

const githubHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'r3x-agent-studio',
});

export class GitHubPublisher {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: PublisherDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  async preflight(workspace: string): Promise<PreflightInfo> {
    const result = await preflight(workspace);
    this.deps.auth.getToken();
    const git = await this.deps.runner.run({ executable: 'git', args: ['--version'], cwd: workspace });
    if (git.exitCode !== 0) throw new Error('POLICY: git is required before publishing');
    const status = await this.deps.runner.run({ executable: 'git', args: ['status', '--porcelain'], cwd: workspace });
    const remote = await this.deps.runner.run({ executable: 'git', args: ['remote'], cwd: workspace });
    return {
      ...result,
      gitAvailable: true,
      authenticated: true,
      hasRemote: remote.stdout.trim().length > 0,
      dirty: status.stdout.trim().length > 0,
    };
  }

  async publish(input: PublishInput): Promise<{ repoUrl: string; commitSha: string }> {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.repoName)) throw new Error('VALIDATION: invalid repository name');
    await preflight(input.workspace);

    const approval = this.deps.approvals.request({
      projectId: input.projectId,
      actionType: 'publish',
      commandSummary: `Create ${input.visibility} GitHub repository "${input.repoName}" and push the workspace`,
      workingDirectory: input.workspace,
      riskLevel: 'high',
      payload: { repoName: input.repoName, visibility: input.visibility },
    });
    const approved = await this.deps.approvals.wait(approval.id);
    if (!approved) throw new Error('POLICY: publish rejected or expired');
    this.deps.approvals.consume(approval.id);

    const token = this.deps.auth.getToken();
    const headers = githubHeaders(token);
    const response = await this.fetchImpl('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: input.repoName,
        private: input.visibility === 'private',
        auto_init: false,
      }),
    });

    let repo: { html_url: string; full_name: string };
    if (response.ok) {
      repo = (await response.json()) as { html_url: string; full_name: string };
    } else if (response.status === 409 || response.status === 422) {
      try {
        repo = await this.existingRepo(token, input.repoName);
      } catch {
        throw new Error(`AUTH: GitHub repository creation failed (${response.status})`);
      }
    } else {
      throw new Error(`AUTH: GitHub repository creation failed (${response.status})`);
    }

    const askpass = await this.deps.askpass();
    const hooksPath = path.join(path.dirname(askpass), 'r3x-no-hooks');
    const gitEnv = {
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: '0',
      R3X_GIT_TOKEN: token,
    };
    const runGit = (args: string[], env?: Record<string, string>) =>
      this.deps.runner.run({ executable: 'git', args, cwd: input.workspace, env });

    await runGit(['init']);
    await runGit(['add', '-A']);
    await runGit(['-c', 'user.name=R3X Agent', '-c', 'user.email=r3x@localhost', '-c', `core.hooksPath=${hooksPath}`, 'commit', '-m', 'Initial commit by R3X Agent Studio']);
    await runGit(['remote', 'remove', 'origin']);
    await runGit(['remote', 'add', 'origin', `https://github.com/${repo.full_name}.git`]);
    const push = await runGit(['-c', `core.hooksPath=${hooksPath}`, 'push', '-u', 'origin', 'HEAD'], gitEnv);
    if (push.exitCode !== 0) throw new Error(`AUTH: git push failed: ${push.stderr.slice(0, 500)}`);

    const head = await runGit(['rev-parse', 'HEAD']);
    return { repoUrl: repo.html_url, commitSha: head.stdout.trim() };
  }

  private async existingRepo(token: string, repoName: string): Promise<{ html_url: string; full_name: string }> {
    const headers = githubHeaders(token);
    const user = await this.fetchImpl('https://api.github.com/user', { headers });
    if (!user.ok) throw new Error('AUTH: GitHub user lookup failed');
    const login = ((await user.json()) as { login?: string }).login;
    if (!login) throw new Error('AUTH: GitHub user lookup failed');
    const response = await this.fetchImpl(`https://api.github.com/repos/${login}/${encodeURIComponent(repoName)}`, { headers });
    if (!response.ok) throw new Error(`AUTH: GitHub repository lookup failed (${response.status})`);
    return (await response.json()) as { html_url: string; full_name: string };
  }
}
