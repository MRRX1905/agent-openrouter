import { useEffect, useState } from 'react';
import type { SkillRecord, SkillSearchResult } from '@shared/types';
import { api } from '../lib/api';

export default function SkillsPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [installed, setInstalled] = useState<SkillRecord[]>([]);
  const [error, setError] = useState('');

  const loadInstalled = () => { void api.invoke('skills:list').then(setInstalled); };
  useEffect(() => {
    loadInstalled();
    void api.invoke('skills:search', { query: 'react' }).then(setResults).catch(() => {});
  }, []);

  const search = async () => {
    try { setResults(await api.invoke('skills:search', { query })); }
    catch (cause) { setError(String(cause)); }
  };
  const install = async (skill: SkillSearchResult) => {
    try { await api.invoke('skills:install', { source: skill.source, skillId: skill.skillId }); loadInstalled(); }
    catch (cause) { setError(String(cause)); }
  };

  return (
    <section>
      <h2>Skills</h2>
      <div className="row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="cari skill" />
        <button onClick={() => void search()}>Cari</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {results.map((skill) => (
        <article key={skill.id} className="card">
          <strong>{skill.name}</strong>
          <small>{skill.source} · {skill.installs} installs</small>
          <button onClick={() => void install(skill)}>Install (review dulu)</button>
        </article>
      ))}
      <h3>Terpasang</h3>
      {installed.map((skill) => (
        <article key={skill.id} className="card">
          <p>{skill.name} · {skill.reviewStatus} · {skill.enabled ? 'aktif' : 'nonaktif'}</p>
          <button onClick={() => void api.invoke('skills:review', { skillId: skill.id, status: 'approved' }).then(loadInstalled)}>Approve</button>
          <button onClick={() => void api.invoke('skills:review', { skillId: skill.id, status: 'rejected' }).then(loadInstalled)}>Reject</button>
          <button
            disabled={skill.reviewStatus !== 'approved'}
            onClick={() => void api.invoke('skills:setEnabled', { skillId: skill.id, enabled: !skill.enabled }).then(loadInstalled)}
          >
            {skill.enabled ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </article>
      ))}
    </section>
  );
}
