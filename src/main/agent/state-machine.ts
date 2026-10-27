import type { ProjectStatus } from '../../shared/types';

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  IDEA: ['PLANNING', 'CANCELLED'],
  PLANNING: ['READY', 'PAUSED', 'FAILED', 'CANCELLED'],
  READY: ['BUILDING', 'PAUSED', 'CANCELLED'],
  BUILDING: ['TESTING', 'REPAIRING', 'PAUSED', 'NEEDS_REPAIR', 'BLOCKED', 'FAILED', 'CANCELLED'],
  TESTING: ['DOCUMENTING', 'REPAIRING', 'PAUSED', 'NEEDS_REPAIR', 'BLOCKED', 'FAILED', 'CANCELLED'],
  REPAIRING: ['TESTING', 'PAUSED', 'NEEDS_REPAIR', 'BLOCKED', 'FAILED', 'CANCELLED'],
  DOCUMENTING: ['REVIEW_REQUIRED', 'REPAIRING', 'PAUSED', 'NEEDS_REPAIR', 'BLOCKED', 'FAILED', 'CANCELLED'],
  REVIEW_REQUIRED: ['PUBLISHING', 'COMPLETED', 'NEEDS_REPAIR', 'PAUSED', 'CANCELLED'],
  PUBLISHING: ['COMPLETED', 'PAUSED', 'BLOCKED', 'FAILED', 'CANCELLED'],
  PAUSED: ['PLANNING', 'READY', 'BUILDING', 'TESTING', 'REPAIRING', 'DOCUMENTING', 'REVIEW_REQUIRED', 'CANCELLED'],
  NEEDS_REPAIR: ['REPAIRING', 'PAUSED', 'CANCELLED'],
  BLOCKED: ['PAUSED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

const TERMINAL = new Set<ProjectStatus>(['COMPLETED', 'FAILED', 'CANCELLED']);

export const isTerminal = (status: ProjectStatus): boolean => TERMINAL.has(status);

export const canTransition = (from: ProjectStatus, to: ProjectStatus): boolean =>
  TRANSITIONS[from].includes(to);

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) throw new Error(`POLICY: invalid transition ${from} -> ${to}`);
}
