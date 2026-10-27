import type { Project } from '../../shared/types';
import type { WorkspaceService } from '../workspace/workspace-service';
import type { TerminalRunner } from '../workspace/terminal-runner';
import { scanWorkspace, type SecretFinding } from '../security/secret-scan';
import { detectChecks, runChecks, type CheckResult } from './checks';
import { evaluateDod, type DodResult } from './dod';
import { generateReadme, validateReadme } from './readme';

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
  ) {}

  async run(project: Project): Promise<QualityReport> {
    const files = await this.workspaces.listFiles(project.workspacePath);
    const commands = await detectChecks(project.workspacePath);
    const checks = await runChecks(project.workspacePath, {
      run: (input) => this.terminal.run(input),
    });
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
}
