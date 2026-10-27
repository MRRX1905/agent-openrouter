import { describe, expect, it } from 'vitest';
import { evaluateDod } from './dod';

const base = {
  files: ['index.js', 'README.md', '.gitignore'],
  checks: [{ name: 'test', ok: true, exitCode: 0, output: 'ok' }],
  secrets: [],
  readme: '# Demo\n## Masalah\n## Fitur\n## Tech Stack\n## Instalasi\n## Menjalankan\n## Environment\n## Test\n## Struktur\n## Troubleshooting\n## Lisensi\n',
  hasGitignore: true,
};

describe('evaluateDod', () => {
  it('passes a complete project', () => {
    expect(evaluateDod(base)).toEqual({ passed: true, failures: [] });
  });

  it('fails on secrets, failed checks, and missing files', () => {
    const result = evaluateDod({
      ...base, files: ['README.md'], hasGitignore: false,
      checks: [{ name: 'test', ok: false, exitCode: 1, output: 'fail' }],
      secrets: [{ file: 'a.env', line: 1, pattern: 'openrouter', preview: 'sk-or…' }],
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('secret'), expect.stringContaining('check'),
      expect.stringContaining('gitignore'), expect.stringContaining('source'),
    ]));
  });
});
