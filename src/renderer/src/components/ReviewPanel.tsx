import { useEffect, useState } from 'react';
import type { Job } from '@shared/types';
import { api } from '../lib/api';

interface Report {
  checks?: Array<{ name: string; ok: boolean; output: string }>;
  secrets?: Array<{ file: string; line: number; pattern: string }>;
  dod?: { passed: boolean; failures: string[] };
  readmeIssues?: string[];
}

export default function ReviewPanel({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => { void api.invoke('jobs:get', { projectId }).then(setJob); }, [projectId, refreshKey]);
  if (!job) return null;

  let report: Report = {};
  try {
    report = (JSON.parse(job.stateJson) as { checks?: Report }).checks ?? {};
  } catch { /* state lama */ }

  return (
    <section className="card">
      <h3>Review</h3>
      <p>Definition of Done: {report.dod?.passed ? 'lulus' : 'belum lulus'}</p>
      {report.dod?.failures?.map((failure) => <p key={failure} role="alert">{failure}</p>)}
      {report.checks?.map((check) => (
        <details key={check.name}>
          <summary>{check.name}: {check.ok ? 'lulus' : 'gagal'}</summary>
          <pre>{check.output}</pre>
        </details>
      ))}
      {report.secrets?.length ? <p role="alert">{report.secrets.length} potensi secret ditemukan.</p> : null}
      {report.readmeIssues?.length ? <p role="alert">README kurang: {report.readmeIssues.join(', ')}</p> : null}
    </section>
  );
}
