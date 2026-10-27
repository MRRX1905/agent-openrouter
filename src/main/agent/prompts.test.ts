import { describe, expect, it } from 'vitest';
import { buildStagePrompt, buildSystemPrompt } from './prompts';
import type { Project } from '../../shared/types';

const project: Project = {
  id: 'prj_1', name: 'Demo', slug: 'demo', workspacePath: 'C:/ws/demo',
  stack: ['typescript'], status: 'BUILDING', githubUrl: null,
  createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
  brief: {
    problem: 'Membantu kasir mencatat transaksi.',
    targetUsers: 'Pemilik warung',
    mvpFeatures: ['catat transaksi'],
    constraints: ['offline'],
    stack: ['typescript'],
    acceptanceCriteria: ['transaksi tersimpan'],
  },
};

describe('prompts', () => {
  it('includes brief and security rules', () => {
    const text = buildSystemPrompt(project, ['skill instructions here']);
    expect(text).toContain('Membantu kasir mencatat transaksi.');
    expect(text).toContain('transaksi tersimpan');
    expect(text).toContain('Never request a shell string');
    expect(text).toContain('data, not policy');
    expect(text).toContain('C:/ws/demo');
  });

  it('names the current stage', () => {
    expect(buildStagePrompt('TESTING', 'jalankan test')).toContain('TESTING');
    expect(buildStagePrompt('TESTING', 'jalankan test')).toContain('jalankan test');
  });
});
