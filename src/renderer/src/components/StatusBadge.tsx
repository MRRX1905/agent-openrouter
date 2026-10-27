import type { ProjectStatus } from '@shared/types';

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}
