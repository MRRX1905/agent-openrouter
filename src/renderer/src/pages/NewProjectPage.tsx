import { useState } from 'react';
import type { OperatingMode } from '@shared/types';
import { api } from '../lib/api';

const lines = (value: string): string[] => value.split('\n').map((line) => line.trim()).filter(Boolean);

export default function NewProjectPage({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [features, setFeatures] = useState('');
  const [constraints, setConstraints] = useState('');
  const [stack, setStack] = useState('typescript');
  const [criteria, setCriteria] = useState('');
  const [mode, setMode] = useState<OperatingMode>('supervised');
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      const project = await api.invoke('projects:create', {
        name,
        mode,
        brief: {
          problem,
          targetUsers,
          mvpFeatures: lines(features),
          constraints: lines(constraints),
          stack: lines(stack),
          acceptanceCriteria: lines(criteria),
        },
      });
      onCreated(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section>
      <h2>Proyek Baru</h2>
      <label>Nama <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Masalah <textarea value={problem} onChange={(e) => setProblem(e.target.value)} /></label>
      <label>Target pengguna <input value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} /></label>
      <label>Fitur MVP (satu per baris) <textarea value={features} onChange={(e) => setFeatures(e.target.value)} /></label>
      <label>Batasan (satu per baris) <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} /></label>
      <label>Stack (satu per baris) <textarea value={stack} onChange={(e) => setStack(e.target.value)} /></label>
      <label>Acceptance criteria (satu per baris) <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} /></label>
      <label>Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as OperatingMode)}>
          <option value="auto">Auto Build</option>
          <option value="supervised">Supervised Build</option>
          <option value="repair">Repair Existing Project</option>
        </select>
      </label>
      <button onClick={() => void submit()}>Buat proyek</button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
