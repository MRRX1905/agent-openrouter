export type ProjectStatus =
  | 'IDEA' | 'PLANNING' | 'READY' | 'BUILDING' | 'TESTING' | 'REPAIRING'
  | 'DOCUMENTING' | 'REVIEW_REQUIRED' | 'PUBLISHING' | 'COMPLETED'
  | 'PAUSED' | 'NEEDS_REPAIR' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export interface ProjectBrief {
  problem: string;
  targetUsers: string;
  mvpFeatures: string[];
  constraints: string[];
  stack: string[];
  acceptanceCriteria: string[];
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  workspacePath: string;
  stack: string[];
  status: ProjectStatus;
  brief: ProjectBrief;
  githubUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  currentStage: ProjectStatus;
  stateJson: string;
  retryCount: number;
  lastCheckpoint: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}
