import { describe, expect, it } from 'vitest';
import { TerminalRunner, type TerminalEvent } from './terminal-runner';

const waitForExit = (events: TerminalEvent[], timeoutMs = 8_000): Promise<TerminalEvent> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const exit = events.find((event) => event.stream === 'exit');
      if (exit) { clearInterval(timer); resolve(exit); }
      else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 20);
  });

describe('TerminalRunner', () => {
  it('streams stdout, stderr, and exit code', async () => {
    const events: TerminalEvent[] = [];
    const runner = new TerminalRunner((event) => events.push(event));
    runner.start({
      runId: 'r1', executable: process.execPath,
      args: ['-e', 'console.log("out"); console.error("err")'], cwd: process.cwd(),
    });
    const exit = await waitForExit(events);
    expect(exit.exitCode).toBe(0);
    expect(events.some((event) => event.stream === 'stdout' && event.data.includes('out'))).toBe(true);
    expect(events.some((event) => event.stream === 'stderr' && event.data.includes('err'))).toBe(true);
  });

  it('stops a long-running process', async () => {
    const events: TerminalEvent[] = [];
    const runner = new TerminalRunner((event) => events.push(event));
    runner.start({
      runId: 'r2', executable: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 60000)'], cwd: process.cwd(),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    runner.stop('r2');
    const exit = await waitForExit(events);
    expect(exit.exitCode).not.toBe(0);
  });
});
