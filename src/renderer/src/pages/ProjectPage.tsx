import { useEffect, useState } from 'react';
import type { Project } from '@shared/types';
import { api } from '../lib/api';
import ApprovalModal from '../components/ApprovalModal';
import StatusBadge from '../components/StatusBadge';
import TerminalPanel from '../components/TerminalPanel';

export default function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api.invoke('projects:get', { projectId }).then(setProject).catch((cause) => setError(String(cause)));
  }, [projectId]);

  if (error) return <p role="alert">{error}</p>;
  if (!project) return <p>Memuat proyek…</p>;

  return (
    <section>
      <div className="row">
        <h2>{project.name}</h2>
        <StatusBadge status={project.status} />
      </div>
      <p>{project.brief.problem}</p>
      <small>{project.workspacePath}</small>
      <ApprovalModal projectId={project.id} />
      <TerminalPanel projectId={project.id} />
    </section>
  );
}
