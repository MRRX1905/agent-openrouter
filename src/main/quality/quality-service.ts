import type { Project } from '../../shared/types';
import type { ApprovalService } from '../policy/approval-service';
import type { WorkspaceService } from '../workspace/workspace-service';
import type { TerminalRunner } from '../workspace/terminal-runner';
import { scanWorkspace, type SecretFinding } from '../security/secret-scan';
import { detectChecks, runChecks, type CheckCommand, type CheckResult } from './checks';
import { evaluateDod, type DodResult } from './dod';
import { generateReadme, validateReadme } from './readme';

type QualityApprover = Pick<ApprovalService, 'request' | 'wait' | 'consume'>;

export interface QualityReport {
  checks: CheckResult[];
  secrets: SecretFinding[];
  readme: string;
  readmeIssues: string[];
  dod: DodResult;
}

export interface QualityGate {
  run(project: Project): Promise<{ dod: DodResult; checks?: unknown }>;
}

export class QualityService implements QualityGate {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly terminal: TerminalRunner,
    private readonly approvals?: QualityApprover,
  ) {}

  async run(project: Project): Promise<QualityReport> {
    const files = await this.workspaces.listFiles(project.workspacePath);
    const commands = await detectChecks(project.workspacePath);
    const checks = await this.executeChecks(project, commands);
    if (checks.length === 0) {
      const sourceFiles = files.filter((file) => !file.toLowerCase().endsWith('.md') && !file.split('/').at(-1)?.startsWith('.'));
      checks.push({
        name: 'structure',
        ok: sourceFiles.length > 0,
        exitCode: sourceFiles.length > 0 ? 0 : 1,
        output: sourceFiles.length > 0 ? 'no stack-specific checks; source files present' : 'no source files found',
      });
    }
    const secrets = await scanWorkspace(project.workspacePath);
    const readmeExists = files.some((file) => file.toLowerCase() === 'readme.md');
    const readme = readmeExists
      ? await this.workspaces.readFile(project.workspacePath, 'README.md')
      : generateReadme({ project, scripts: commands.map((command) => command.name), checks });
    if (!readmeExists) await this.workspaces.writeFile(project.workspacePath, 'README.md', readme);
    const allFiles = readmeExists ? files : [...files, 'README.md'];
    const dod = evaluateDod({
      files: allFiles,
      checks,
      secrets,
      readme,
      hasGitignore: files.includes('.gitignore'),
    });
    return { checks, secrets, readme, readmeIssues: validateReadme(readme), dod };
  }

  private async executeChecks(project: Project, commands: CheckCommand[]): Promise<CheckResult[]> {
    const runner = { run: (input: { executable: string; args: string[]; cwd: string }) => this.terminal.run(input) };
    if (commands.length === 0 || !this.approvals) return runChecks(project.workspacePath, runner, commands);

    const approval = this.approvals.request({
      projectId: project.id,
      actionType: 'command',
      commandSummary: commands.map((command) => [command.executable, ...command.args].join(' ')).join(' ; '),
      workingDirectory: project.workspacePath,
      riskLevel: 'medium',
      payload: {
        reason: 'local quality checks',
        needsNetwork: false,
        writesFiles: true,
        checks: commands,
      },
    });
    if (!(await this.approvals.wait(approval.id))) {
      return commands.map((command) => ({
        name: command.name, ok: false, exitCode: null, output: 'POLICY: quality checks rejected',
      }));
    }
    this.approvals.consume(approval.id);
    return runChecks(project.workspacePath, runner, commands);
  }
}
