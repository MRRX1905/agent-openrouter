import { useEffect, useState } from 'react';
import type { Project } from '@shared/types';
import { api } from '../lib/api';
import BudgetBar from '../components/BudgetBar';
import StatusBadge from '../components/StatusBadge';

export default function DashboardPage({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<{ projects: number; requestsToday: number; requestsTotal: number } | null>(null);
  useEffect(() => {
    void api.invoke('projects:list').then(setProjects);
    void api.invoke('stats:get').then(setStats);
  }, []);

  return (
    <section>
      <div className="row">
        <h2>Dashboard</h2>
        <button onClick={onNew}>Proyek baru</button>
      </div>
      <BudgetBar />
      {stats && (
        <p>
          Statistik: {stats.projects} proyek · {stats.requestsToday} request hari ini · {stats.requestsTotal} request total
        </p>
      )}
      {projects.length === 0 && <p>Belum ada proyek.</p>}
      <div className="grid">
        {projects.map((project) => (
          <article key={project.id} className="card">
            <h3>{project.name}</h3>
            <StatusBadge status={project.status} />
            <p>{project.brief.problem}</p>
            <small>{project.stack.join(', ') || 'stack belum dipilih'}</small>
            <button onClick={() => onOpen(project.id)}>Buka</button>
          </article>
        ))}
      </div>
    </section>
  );
}
