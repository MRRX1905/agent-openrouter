import { spawn, type ChildProcess } from 'node:child_process';
import { newId } from '../../shared/ids';

const MAX_OUTPUT_CHARS = 1_048_576;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface TerminalEvent {
  runId: string;
  stream: 'stdout' | 'stderr' | 'exit';
  data: string;
  exitCode?: number | null;
}

export interface TerminalInput {
  runId: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

const sanitizedEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(OPENROUTER_API_KEY|GITHUB_TOKEN|GH_TOKEN|R3X_SECRET_)/i.test(key)) delete env[key];
  }
  return env;
};

export class TerminalRunner {
  private readonly children = new Map<string, ChildProcess>();

  constructor(private readonly onEvent: (event: TerminalEvent) => void) {}

  start(input: TerminalInput): void {
    if (!input.executable.trim()) throw new Error('VALIDATION: executable is required');
    if (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== 'string')) {
      throw new Error('VALIDATION: args must be strings');
    }
    const runId = input.runId || newId('run');
    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      shell: false,
      windowsHide: true,
      env: sanitizedEnv(),
    });
    this.children.set(runId, child);

    let sent = 0;
    let exited = false;
    let timer: ReturnType<typeof setTimeout>;
    const emit = (stream: 'stdout' | 'stderr', data: string): void => {
      if (sent >= MAX_OUTPUT_CHARS) return;
      const chunk = data.slice(0, MAX_OUTPUT_CHARS - sent);
      sent += chunk.length;
      if (chunk) this.onEvent({ runId, stream, data: chunk });
    };
    const finish = (code: number | null): void => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      this.children.delete(runId);
      this.onEvent({ runId, stream: 'exit', data: '', exitCode: code });
    };

    child.stdout?.on('data', (data: Buffer) => emit('stdout', data.toString('utf8')));
    child.stderr?.on('data', (data: Buffer) => emit('stderr', data.toString('utf8')));
    child.on('error', (error) => {
      emit('stderr', `${error.message}\n`);
      finish(-1);
    });
    child.on('close', (code) => finish(code));

    timer = setTimeout(() => this.stop(runId), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  stop(runId: string): void {
    const child = this.children.get(runId);
    if (!child || child.killed) return;
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false });
    } else {
      child.kill('SIGTERM');
    }
  }
}
