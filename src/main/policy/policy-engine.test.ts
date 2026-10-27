import { describe, expect, it } from 'vitest';
import { classifyCommand } from './policy-engine';

const workspace = 'C:/projects/demo';
const classify = (executable: string, args: string[] = [], cwd = workspace) =>
  classifyCommand({ executable, args, cwd, workspace });

describe('classifyCommand', () => {
  it('allows read-only git commands', () => {
    expect(classify('git', ['status'])).toMatchObject({ action: 'allow', risk: 'low' });
    expect(classify('git', ['diff', '--stat'])).toMatchObject({ action: 'allow', risk: 'low' });
  });

  it('requires explicit approval for git push', () => {
    expect(classify('git', ['push', 'origin', 'main'])).toMatchObject({
      action: 'approval', risk: 'high', needsNetwork: true,
    });
  });

  it('blocks shell interpreters', () => {
    for (const shell of ['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'wscript', 'mshta']) {
      expect(classify(shell, ['/c', 'whoami'])).toMatchObject({ action: 'block', risk: 'critical' });
    }
  });

  it('blocks executables specified by path', () => {
    expect(classify('C:/Windows/System32/calc.exe')).toMatchObject({ action: 'block', risk: 'critical' });
    expect(classify('../evil.exe')).toMatchObject({ action: 'block', risk: 'critical' });
  });

  it('blocks cwd outside the workspace', () => {
    expect(classify('git', ['status'], 'C:/Windows')).toMatchObject({ action: 'block', risk: 'critical' });
  });

  it('blocks absolute arguments outside the workspace', () => {
    expect(classify('node', ['C:/Windows/win.ini'])).toMatchObject({ action: 'block', risk: 'critical' });
    expect(classify('node', ['../outside.js'])).toMatchObject({ action: 'block', risk: 'critical' });
  });

  it('requires approval for installs and unknown executables', () => {
    expect(classify('npm', ['install'])).toMatchObject({ action: 'approval', risk: 'medium', needsNetwork: true });
    expect(classify('some-random-tool', ['--do-it'])).toMatchObject({ action: 'approval', risk: 'medium' });
  });

  it('normalizes .exe and uppercase', () => {
    expect(classify('GIT.EXE', ['status'])).toMatchObject({ action: 'allow' });
  });
});
