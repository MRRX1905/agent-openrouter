import { useEffect, useState } from 'react';
import type { Job, Project } from '@shared/types';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import TerminalPanel from '../components/TerminalPanel';
import ApprovalModal from '../components/ApprovalModal';
import ReviewPanel from '../components/ReviewPanel';

export default function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');

  const reload = async () => {
    setProject(await api.invoke('projects:get', { projectId }));
    setJob(await api.invoke('jobs:get', { projectId }));
  };

  useEffect(() => { void reload().catch((cause) => setError(String(cause))); }, [projectId]);
  useEffect(() => api.onAgentEvent((event) => {
    if (event.type === 'stage' && event.projectId === projectId) {
      setRefreshKey((value) => value + 1);
      void reload();
    }
    if (event.type === 'error' && event.projectId === projectId) setError(event.message);
  }), [projectId]);

  if (error) return <p role="alert">{error}</p>;
  if (!project) return <p>Memuat proyek…</p>;

  const start = async () => {
    await api.invoke('jobs:start', { projectId });
    await reload();
  };
  const pause = async () => { if (job) { await api.invoke('jobs:pause', { jobId: job.id }); await reload(); } };
  const resume = async () => { if (job) { await api.invoke('jobs:resume', { jobId: job.id }); await reload(); } };

  return (
    <section>
      <div className="row">
        <h2>{project.name}</h2>
        <StatusBadge status={project.status} />
      </div>
      <p>{project.brief.problem}</p>
      <small>{project.workspacePath}</small>
      <div className="row">
        <button disabled={project.status !== 'IDEA'} onClick={() => void start()}>Start</button>
        <button disabled={!job || (project.status !== 'PLANNING' && project.status !== 'BUILDING' && project.status !== 'TESTING')} onClick={() => void pause()}>Pause</button>
        <button disabled={project.status !== 'PAUSED'} onClick={() => void resume()}>Resume</button>
      </div>
      <ApprovalModal projectId={project.id} />
      {(project.status === 'REVIEW_REQUIRED' || project.status === 'NEEDS_REPAIR') && (
        <ReviewPanel projectId={project.id} refreshKey={refreshKey} />
      )}
      <TerminalPanel projectId={project.id} />
    </section>
  );
}
