import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface CheckCommand { name: string; executable: string; args: string[] }
export interface CheckResult { name: string; ok: boolean; exitCode: number | null; output: string }
export interface CheckRunner {
  run(input: { executable: string; args: string[]; cwd: string }): Promise<{ exitCode: number | null; stdout: string; stderr: string }>;
}

const exists = async (target: string): Promise<boolean> => {
  try { await stat(target); return true; } catch { return false; }
};

export async function detectChecks(workspace: string): Promise<CheckCommand[]> {
  const commands: CheckCommand[] = [];
  try {
    const pkg = JSON.parse(await readFile(path.join(workspace, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    for (const name of ['test', 'lint', 'build']) {
      if (pkg.scripts?.[name]) commands.push({ name, executable: 'npm', args: ['run', name] });
    }
  } catch { /* bukan proyek node */ }

  if (
    await exists(path.join(workspace, 'pyproject.toml')) ||
    await exists(path.join(workspace, 'pytest.ini')) ||
    await exists(path.join(workspace, 'tests'))
  ) {
    commands.push({ name: 'pytest', executable: 'python', args: ['-m', 'pytest', '-q'] });
  }

  try {
    const composer = JSON.parse(await readFile(path.join(workspace, 'composer.json'), 'utf8')) as { scripts?: Record<string, string> };
    if (composer.scripts?.test) commands.push({ name: 'composer-test', executable: 'composer', args: ['run-script', 'test'] });
  } catch { /* bukan proyek php */ }

  return commands;
}

export async function runChecks(workspace: string, runner: CheckRunner, commands?: CheckCommand[]): Promise<CheckResult[]> {
  const planned = commands ?? await detectChecks(workspace);
  const results: CheckResult[] = [];
  for (const command of planned) {
    const result = await runner.run({ executable: command.executable, args: command.args, cwd: workspace });
    results.push({
      name: command.name,
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      output: `${result.stdout}${result.stderr}`.slice(0, 5_000),
    });
  }
  return results;
}
