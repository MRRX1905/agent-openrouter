import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface SecretFinding { file: string; line: number; pattern: string; preview: string }

const PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'openrouter', pattern: /sk-or-v1-[A-Za-z0-9_-]{16,}/g },
  { name: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'github-pat', pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'aws-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'generic-secret', pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi },
];

const SKIP = new Set(['.git', 'node_modules', 'dist', 'out', '.next', 'coverage']);
const MAX_FILES = 500;
const MAX_BYTES = 262_144;

const walk = async (root: string, dir: string, results: string[]): Promise<void> => {
  if (results.length >= MAX_FILES) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (results.length >= MAX_FILES) return;
    if (entry.isDirectory() && SKIP.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, results);
    else results.push(path.relative(root, absolute).replaceAll('\\', '/'));
  }
};

export async function scanWorkspace(workspace: string): Promise<SecretFinding[]> {
  const files: string[] = [];
  await walk(workspace, workspace, files);
  const findings: SecretFinding[] = [];
  for (const relative of files) {
    const absolute = path.join(workspace, relative);
    const info = await stat(absolute);
    if (info.size > MAX_BYTES) continue;
    const content = await readFile(absolute, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const { name, pattern } of PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(lines[index] ?? '');
        if (!match) continue;
        findings.push({
          file: relative,
          line: index + 1,
          pattern: name,
          preview: `${match[0].slice(0, 8)}…`,
        });
      }
    }
  }
  return findings;
}
