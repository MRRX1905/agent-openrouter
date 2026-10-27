import type { DatabaseSync } from 'node:sqlite';
import { newId, nowIso } from '../../shared/ids';
import { redact } from '../../shared/redact';
import type { ToolCall, ToolResult } from '../../shared/types';
import { recordToolRun } from '../db/repositories';
import type { ApprovalService } from '../policy/approval-service';
import type { CommandRequest, PolicyDecision } from '../policy/policy-engine';
import type { GitService } from '../workspace/git-service';
import type { TerminalRunner } from '../workspace/terminal-runner';
import type { WorkspaceService } from '../workspace/workspace-service';

const requireString = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`VALIDATION: ${key} must be a string`);
  return value;
};

export interface ToolRouterRuntime {
  db: DatabaseSync;
  policy: (input: CommandRequest) => PolicyDecision;
  approvals: ApprovalService;
  terminal: TerminalRunner;
  git: GitService;
}

export interface ToolContext { projectId: string; workspaceRoot: string }

export class ToolRouter {
  constructor(private readonly workspaces: WorkspaceService, private readonly runtime?: ToolRouterRuntime) {}

  async execute(workspace: string, call: ToolCall, context?: ToolContext): Promise<ToolResult> {
    try {
      const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      switch (call.function.name) {
        case 'read_file':
          return { ok: true, output: await this.workspaces.readFile(workspace, requireString(args, 'path')) };
        case 'write_file':
          await this.workspaces.writeFile(workspace, requireString(args, 'path'), requireString(args, 'content'));
          return { ok: true, output: 'written' };
        case 'list_files': {
          const path = typeof args.path === 'string' ? args.path : '.';
          return { ok: true, output: (await this.workspaces.listFiles(workspace, path)).join('\n') };
        }
        case 'delete_file':
          await this.workspaces.deleteFile(workspace, requireString(args, 'path'));
          return { ok: true, output: 'deleted' };
        case 'run_command': {
          if (!this.runtime || !context) return { ok: false, output: 'POLICY: command execution is not configured' };
          const executable = requireString(args, 'executable');
          if (!Array.isArray(args.args) || args.args.some((arg) => typeof arg !== 'string')) {
            throw new Error('VALIDATION: args must be an array of strings');
          }
          const commandArgs = args.args as string[];
          const decision = this.runtime.policy({ executable, args: commandArgs, cwd: workspace, workspace });
          if (decision.action === 'block') return { ok: false, output: decision.reason };

          let finalExecutable = executable;
          let finalArgs = commandArgs;
          if (decision.action === 'approval') {
            const approval = this.runtime.approvals.request({
              projectId: context.projectId,
              actionType: 'command',
              commandSummary: decision.normalizedCommand,
              workingDirectory: workspace,
              riskLevel: decision.risk,
              payload: {
                executable, args: commandArgs, cwd: workspace,
                reason: decision.reason, needsNetwork: decision.needsNetwork, writesFiles: decision.writesFiles,
              },
            });
            const approved = await this.runtime.approvals.wait(approval.id);
            if (!approved) return { ok: false, output: 'POLICY: command rejected or expired' };
            const payload = this.runtime.approvals.consume(approval.id) as { executable: string; args: string[]; cwd: string };
            finalExecutable = payload.executable;
            finalArgs = payload.args;
          }

          const runId = newId('tool');
          const startedAt = nowIso();
          const result = await this.runtime.terminal.run({ executable: finalExecutable, args: finalArgs, cwd: workspace });
          recordToolRun(this.runtime.db, {
            id: runId, projectId: context.projectId, tool: 'run_command',
            command: [finalExecutable, ...finalArgs].join(' '), exitCode: result.exitCode,
            startedAt, endedAt: nowIso(), outputLogPath: null,
          });
          const output = `${result.stdout}${result.stderr}`.slice(0, 20_000);
          return { ok: result.exitCode === 0, output, exitCode: result.exitCode };
        }
        case 'git_status':
          if (!this.runtime) return { ok: false, output: 'POLICY: git is not configured' };
          return { ok: true, output: (await this.runtime.git.status(workspace)).stdout };
        case 'git_diff':
          if (!this.runtime) return { ok: false, output: 'POLICY: git is not configured' };
          return { ok: true, output: (await this.runtime.git.diff(workspace)).stdout };
        default:
          return { ok: false, output: `POLICY: unknown tool ${call.function.name}` };
      }
    } catch (error) {
      return { ok: false, output: redact(error instanceof Error ? error.message : String(error)) };
    }
  }
}
