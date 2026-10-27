import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { loadMessages } from '../db/repositories';
import { ProjectsService } from '../projects-service';
import { WorkspaceService } from '../workspace/workspace-service';
import { ToolRouter } from '../tools/tool-router';
import { BudgetService } from '../providers/budget';
import { Orchestrator, type ModelGateway } from './orchestrator';
import type { ChatResponse } from '../providers/openrouter';

let db: DatabaseSync;
let projects: ProjectsService;
let orchestrator: Orchestrator;
let workspace: string;
let responses: ChatResponse[];

const brief = {
  problem: 'Membantu kasir mencatat transaksi.', targetUsers: 'Pemilik warung',
  mvpFeatures: ['catat transaksi'], constraints: [], stack: ['typescript'],
  acceptanceCriteria: ['transaksi tersimpan'],
};

const tool = (name: string, args: unknown): ChatResponse['toolCalls'][number] => ({
  id: `call_${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) },
});

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  const root = await mkdtemp(join(tmpdir(), 'r3x-orch-'));
  const workspaces = new WorkspaceService(root);
  projects = new ProjectsService(db, workspaces);
  const project = await projects.create({ name: 'Demo', brief, mode: 'supervised' });
  workspace = project.workspacePath;
  responses = [];
  const gateway: ModelGateway = {
    chat: async () => responses.shift() ?? {
      id: 'x', model: 'm', provider: null, content: 'done', toolCalls: [], usage: null, finishReason: 'stop',
    },
  };
  orchestrator = new Orchestrator({
    db, projects, gateway, tools: new ToolRouter(workspaces),
    budget: new BudgetService(db, { dailyRequestCap: 20, repairReservePct: 20 }),
    events: () => {}, model: () => 'test/model', maxSteps: 3,
  });
});

describe('Orchestrator', () => {
  it('executes a file tool and advances the stage', async () => {
    const project = projects.list()[0]!;
    responses.push(
      { id: '1', model: 'm', provider: null, content: '', toolCalls: [tool('write_file', { path: 'index.js', content: 'console.log(1)' })], usage: null, finishReason: 'tool_calls' },
      { id: '2', model: 'm', provider: null, content: '', toolCalls: [tool('update_stage', { stage: 'PAUSED', summary: 'test checkpoint' })], usage: null, finishReason: 'tool_calls' },
    );
    const jobId = orchestrator.start(project.id);
    await orchestrator.waitForIdle(jobId);
    expect(await readFile(join(workspace, 'index.js'), 'utf8')).toContain('console.log');
    expect(projects.get(project.id).status).toBe('PAUSED');
  });

  it('records an invalid stage transition without rejecting the loop', async () => {
    const project = projects.list()[0]!;
    responses.push(
      { id: '1', model: 'm', provider: null, content: '', toolCalls: [tool('update_stage', { stage: 'BUILDING', summary: 'skip ahead' })], usage: null, finishReason: 'tool_calls' },
      { id: '2', model: 'm', provider: null, content: '', toolCalls: [tool('update_stage', { stage: 'PAUSED', summary: 'checkpoint' })], usage: null, finishReason: 'tool_calls' },
    );
    const jobId = orchestrator.start(project.id);
    await orchestrator.waitForIdle(jobId);
    expect(projects.get(project.id).status).toBe('PAUSED');
    expect(loadMessages(db, jobId).some((message) => message.role === 'tool' && message.content?.includes('POLICY: invalid transition'))).toBe(true);
  });

  it('pauses immediately and resumes from checkpoint', async () => {
    const project = projects.list()[0]!;
    const jobId = orchestrator.start(project.id);
    orchestrator.pause(jobId);
    await orchestrator.waitForIdle(jobId);
    expect(projects.get(project.id).status).toBe('PAUSED');

    responses.push({
      id: 'resume', model: 'm', provider: null, content: '',
      toolCalls: [tool('update_stage', { stage: 'FAILED', summary: 'resume test terminal state' })],
      usage: null, finishReason: 'tool_calls',
    });
    await orchestrator.resume(jobId);
    await orchestrator.waitForIdle(jobId);
    expect(projects.get(project.id).status).toBe('FAILED');
  });

  it('moves to NEEDS_REPAIR when the quality gate fails', async () => {
    const project = projects.list()[0]!;
    const quality = {
      run: async () => ({ dod: { passed: false, failures: ['check: test failed'] }, checks: { dod: { passed: false } } }),
    };
    const gated = new Orchestrator({
      db, projects, gateway: { chat: async () => responses.shift()! },
      tools: new ToolRouter(new WorkspaceService(workspace)),
      budget: new BudgetService(db, { dailyRequestCap: 20, repairReservePct: 20 }),
      events: () => {}, model: () => 'm', maxSteps: 8, quality,
    });
    const stages = ['READY', 'BUILDING', 'TESTING', 'DOCUMENTING', 'REVIEW_REQUIRED'];
    for (const stage of stages) {
      responses.push({
        id: stage, model: 'm', provider: null, content: '',
        toolCalls: [tool('update_stage', { stage, summary: stage })],
        usage: null, finishReason: 'tool_calls',
      });
    }
    const jobId = gated.start(project.id);
    await gated.waitForIdle(jobId);
    expect(projects.get(project.id).status).toBe('NEEDS_REPAIR');
  });

  it('pauses when the budget is exhausted', async () => {
    const project = projects.list()[0]!;
    const tight = new Orchestrator({
      db, projects, gateway: { chat: async () => responses.shift()! },
      tools: new ToolRouter(new WorkspaceService(workspace)),
      budget: new BudgetService(db, { dailyRequestCap: 1, repairReservePct: 20 }),
      events: () => {}, model: () => 'm', maxSteps: 3,
    });
    responses.push({ id: '1', model: 'm', provider: null, content: '', toolCalls: [tool('write_file', { path: 'a.txt', content: 'a' })], usage: null, finishReason: 'tool_calls' });
    const jobId = tight.start(project.id);
    await tight.waitForIdle(jobId);
    expect(projects.get(project.id).status).toBe('PAUSED');
  });
});
