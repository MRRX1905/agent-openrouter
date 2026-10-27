import type { TerminalResult, TerminalRunner } from './terminal-runner';

export class GitService {
  constructor(private readonly terminal: TerminalRunner) {}

  init(workspace: string): Promise<TerminalResult> {
    return this.terminal.run({ executable: 'git', args: ['init'], cwd: workspace });
  }

  status(workspace: string): Promise<TerminalResult> {
    return this.terminal.run({
      executable: 'git',
      args: ['-c', 'core.fsmonitor=false', 'status', '--porcelain'],
      cwd: workspace,
    });
  }

  diff(workspace: string): Promise<TerminalResult> {
    return this.terminal.run({ executable: 'git', args: ['diff', '--stat'], cwd: workspace });
  }

  async commitAll(workspace: string, message: string): Promise<TerminalResult> {
    await this.terminal.run({ executable: 'git', args: ['add', '-A'], cwd: workspace });
    return this.terminal.run({
      executable: 'git',
      args: ['-c', 'user.name=R3X Agent', '-c', 'user.email=r3x@localhost', 'commit', '-m', message],
      cwd: workspace,
    });
  }
}
