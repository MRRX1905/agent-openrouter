import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function TerminalPanel({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [executable, setExecutable] = useState('node');
  const [args, setArgs] = useState('--version');

  useEffect(() => api.onAgentEvent((event) => {
    if (event.type === 'terminal') {
      setLines((current) => [...current, event.stream === 'exit' ? `[exit ${event.exitCode}]` : event.data]);
    }
  }), []);

  const run = async () => {
    const result = await api.invoke('terminal:run', {
      projectId,
      executable,
      args: args.split(' ').filter(Boolean),
    });
    setRunId(result.runId);
  };

  return (
    <section className="terminal">
      <div className="terminal-controls">
        <input value={executable} onChange={(e) => setExecutable(e.target.value)} />
        <input value={args} onChange={(e) => setArgs(e.target.value)} />
        <button onClick={() => void run()}>Run</button>
        <button disabled={!runId} onClick={() => runId && void api.invoke('terminal:stop', { runId })}>Stop</button>
      </div>
      <pre>{lines.join('')}</pre>
    </section>
  );
}
