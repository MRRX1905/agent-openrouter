import type {
  AgentEvent, AppSettings, ApprovalRecord, Job, OperatingMode, Project, ProjectBrief,
  SkillRecord, SkillSearchResult,
} from './types';

export interface IpcContract {
  'app:ping': { req: void; res: { version: string } };
  'settings:get': { req: void; res: AppSettings };
  'settings:update': { req: Partial<Pick<AppSettings, 'model' | 'dailyRequestCap' | 'repairReservePct' | 'workspaceRoot' | 'mode' | 'githubClientId'>>; res: AppSettings };
  'secret:setOpenRouterKey': { req: { apiKey: string }; res: { ok: true } };
  'secret:clearOpenRouterKey': { req: void; res: { ok: true } };
  'projects:list': { req: void; res: Project[] };
  'projects:create': { req: { name: string; brief: ProjectBrief; mode: OperatingMode }; res: Project };
  'projects:get': { req: { projectId: string }; res: Project };
  'jobs:start': { req: { projectId: string }; res: { jobId: string } };
  'jobs:pause': { req: { jobId: string }; res: { ok: true } };
  'jobs:resume': { req: { jobId: string }; res: { ok: true } };
  'jobs:get': { req: { projectId: string }; res: Job | null };
  'terminal:run': { req: { projectId: string; executable: string; args: string[] }; res: { runId: string } };
  'terminal:stop': { req: { runId: string }; res: { ok: true } };
  'approvals:list': { req: { projectId: string }; res: ApprovalRecord[] };
  'approvals:decide': { req: { approvalId: string; decision: 'approved' | 'rejected' }; res: { ok: true } };
  'skills:search': { req: { query: string }; res: SkillSearchResult[] };
  'skills:list': { req: void; res: SkillRecord[] };
  'skills:install': { req: { source: string; skillId: string }; res: SkillRecord };
  'skills:review': { req: { skillId: string; status: 'approved' | 'rejected' }; res: { ok: true } };
  'skills:setEnabled': { req: { skillId: string; enabled: boolean }; res: { ok: true } };
  'github:startDeviceFlow': { req: void; res: { userCode: string; verificationUri: string; expiresIn: number } };
  'github:pollDeviceFlow': { req: void; res: { status: 'pending' | 'connected' | 'expired'; login?: string } };
  'github:disconnect': { req: void; res: { ok: true } };
  'github:preflight': {
    req: { projectId: string };
    res: {
      files: string[]; hasGitignore: boolean; gitAvailable: boolean; authenticated: boolean;
      hasRemote: boolean; dirty: boolean;
      secrets: Array<{ file: string; line: number; pattern: string; preview: string }>;
    };
  };
  'github:publish': { req: { projectId: string; repoName: string; visibility: 'private' | 'public' }; res: { repoUrl: string; commitSha: string } };
  'budget:get': { req: { projectId?: string }; res: { used: number; cap: number; reservePct: number } };
  'backup:create': { req: void; res: { path: string } };
  'stats:get': { req: void; res: { projects: number; requestsToday: number; requestsTotal: number } };
}

export type IpcChannel = keyof IpcContract;

export interface R3xApi {
  invoke<C extends IpcChannel>(channel: C, payload?: IpcContract[C]['req']): Promise<IpcContract[C]['res']>;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
}
