import type { CheckResult } from './checks';
import type { SecretFinding } from '../security/secret-scan';
import { validateReadme } from './readme';

export interface DodInput {
  files: string[];
  checks: CheckResult[];
  secrets: SecretFinding[];
  readme: string;
  hasGitignore: boolean;
}

export interface DodResult { passed: boolean; failures: string[] }

export function evaluateDod(input: DodInput): DodResult {
  const failures: string[] = [];
  const sourceFiles = input.files.filter((file) => !file.toLowerCase().endsWith('.md') && !file.split('/').at(-1)?.startsWith('.'));
  if (sourceFiles.length === 0) failures.push('source: no source files found');
  if (input.checks.length === 0) failures.push('check: no local checks were run');
  if (input.checks.some((check) => !check.ok)) failures.push('check: at least one check failed');
  if (input.secrets.length > 0) failures.push(`secret: ${input.secrets.length} potential secret(s) found`);
  if (!input.hasGitignore) failures.push('gitignore: .gitignore is missing');
  for (const missing of validateReadme(input.readme)) failures.push(`readme: missing ${missing}`);
  return { passed: failures.length === 0, failures };
}
