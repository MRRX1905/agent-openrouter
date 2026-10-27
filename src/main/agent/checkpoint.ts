import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../../shared/ids';
import type { ProjectStatus } from '../../shared/types';
import { getJob, updateJob } from '../db/repositories';

export interface CheckpointState {
  stage: ProjectStatus;
  lastTool: string | null;
  summary: string;
  checks?: unknown;
}

export function saveCheckpoint(db: DatabaseSync, jobId: string, state: CheckpointState): void {
  updateJob(db, jobId, {
    currentStage: state.stage,
    stateJson: JSON.stringify(state),
    lastCheckpoint: nowIso(),
  });
}

export function loadCheckpoint(db: DatabaseSync, jobId: string): CheckpointState | null {
  try {
    return JSON.parse(getJob(db, jobId).stateJson) as CheckpointState;
  } catch {
    return null;
  }
}
