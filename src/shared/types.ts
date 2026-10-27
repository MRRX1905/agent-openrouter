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

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PolicyAction = 'allow' | 'approval' | 'block';
export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'expired';
export type OperatingMode = 'auto' | 'supervised' | 'repair';
export type SkillReviewStatus = 'pending' | 'approved' | 'rejected';

export interface TokenUsage { prompt: number; completion: number; total: number }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolResult { ok: boolean; output: string; exitCode?: number | null }
export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ApiRequestRecord {
  id: string; projectId: string; provider: string; model: string;
  status: 'ok' | 'error'; httpStatus: number | null; timestamp: string;
  tokenUsage: TokenUsage | null; cost: number | null; errorCode: string | null;
}
export interface ApprovalRecord {
  id: string; projectId: string; actionType: 'command' | 'publish' | 'skill_script';
  commandSummary: string; workingDirectory: string; riskLevel: RiskLevel;
  decision: ApprovalDecision; tokenHash: string; payloadJson: string;
  expiresAt: string; decidedAt: string | null; consumedAt: string | null;
}
export interface ToolRunRecord {
  id: string; projectId: string; tool: string; command: string;
  exitCode: number | null; startedAt: string; endedAt: string | null; outputLogPath: string | null;
}
export interface SkillRecord {
  id: string; name: string; source: string; versionOrCommit: string;
  checksum: string; reviewStatus: SkillReviewStatus; enabled: boolean;
}
export interface AuditEventRecord {
  id: string; actor: 'user' | 'agent' | 'system'; eventType: string; target: string;
  result: 'ok' | 'denied' | 'error'; timestamp: string; metadataJson: string;
}
export interface AppSettings {
  model: string; dailyRequestCap: number; repairReservePct: number;
  workspaceRoot: string; mode: OperatingMode; githubClientId: string;
  hasOpenRouterKey: boolean; hasGithubToken: boolean;
}
export interface SkillSearchResult {
  id: string; source: string; skillId: string; name: string; installs: number;
}

export type AgentEvent =
  | { type: 'stage'; projectId: string; jobId: string; stage: ProjectStatus; summary: string }
  | { type: 'token'; projectId: string; text: string }
  | { type: 'tool'; projectId: string; tool: string; command: string; status: 'start' | 'ok' | 'error'; exitCode?: number | null }
  | { type: 'terminal'; runId: string; stream: 'stdout' | 'stderr' | 'exit'; data: string; exitCode?: number | null }
  | { type: 'approval'; approval: ApprovalRecord }
  | { type: 'budget'; projectId: string; used: number; cap: number; reservePct: number }
  | { type: 'error'; projectId: string; message: string };
