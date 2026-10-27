import { useEffect, useState } from 'react';
import type { ApprovalRecord } from '@shared/types';
import { api } from '../lib/api';

export default function ApprovalModal({ projectId }: { projectId: string }) {
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);

  const reload = () => { void api.invoke('approvals:list', { projectId }).then(setApprovals); };
  useEffect(reload, [projectId]);
  useEffect(() => api.onAgentEvent((event) => {
    if (event.type === 'approval') reload();
  }), [projectId]);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    await api.invoke('approvals:decide', { approvalId: id, decision });
    reload();
  };

  const pending = approvals.filter((approval) => approval.decision === 'pending');
  if (pending.length === 0) return null;

  return (
    <section className="approval">
      <h3>Persetujuan Diperlukan</h3>
      {pending.map((approval) => (
        <article key={approval.id} className="card">
          <strong>{approval.riskLevel.toUpperCase()}</strong>
          <pre>{approval.commandSummary}</pre>
          <p>cwd: {approval.workingDirectory}</p>
          {(() => {
            try {
              const payload = JSON.parse(approval.payloadJson) as { reason?: string; needsNetwork?: boolean; writesFiles?: boolean };
              return (
                <>
                  {payload.reason && <p>Alasan: {payload.reason}</p>}
                  <p>Jaringan: {payload.needsNetwork ? 'ya' : 'tidak'} · Perubahan file: {payload.writesFiles ? 'ya' : 'tidak'}</p>
                </>
              );
            } catch { return null; }
          })()}
          <p>Berlaku sampai: {new Date(approval.expiresAt).toLocaleTimeString()}</p>
          <button onClick={() => void decide(approval.id, 'approved')}>Approve</button>
          <button onClick={() => void decide(approval.id, 'rejected')}>Reject</button>
        </article>
      ))}
    </section>
  );
}
