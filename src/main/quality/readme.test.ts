import { describe, expect, it } from 'vitest';
import { generateReadme, validateReadme } from './readme';
import type { Project } from '../../shared/types';

const project: Project = {
  id: 'prj_1', name: 'Demo', slug: 'demo', workspacePath: 'C:/ws/demo',
  stack: ['typescript'], status: 'REVIEW_REQUIRED', githubUrl: null,
  createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
  brief: {
    problem: 'Membantu kasir mencatat transaksi.', targetUsers: 'Pemilik warung',
    mvpFeatures: ['catat transaksi'], constraints: ['offline'], stack: ['typescript'],
    acceptanceCriteria: ['transaksi tersimpan'],
  },
};

describe('readme', () => {
  it('generates all required headings', () => {
    const markdown = generateReadme({ project, scripts: ['test', 'build'], checks: [] });
    expect(validateReadme(markdown)).toEqual([]);
    expect(markdown).toContain('Membantu kasir mencatat transaksi.');
    expect(markdown).toContain('npm run test');
  });

  it('reports missing headings', () => {
    expect(validateReadme('# Demo\n')).toContain('## Instalasi');
  });
});
