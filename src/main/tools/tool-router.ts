import { redact } from '../../shared/redact';
import type { ToolCall, ToolResult } from '../../shared/types';
import type { WorkspaceService } from '../workspace/workspace-service';

const requireString = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`VALIDATION: ${key} must be a string`);
  return value;
};

export class ToolRouter {
  constructor(private readonly workspaces: WorkspaceService) {}

  async execute(workspace: string, call: ToolCall): Promise<ToolResult> {
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
        default:
          return { ok: false, output: `POLICY: unknown tool ${call.function.name}` };
      }
    } catch (error) {
      return { ok: false, output: redact(error instanceof Error ? error.message : String(error)) };
    }
  }
}
