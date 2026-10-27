import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../../shared/ids';
import { redact } from '../../shared/redact';
import type { AgentEvent, AgentMessage, ProjectStatus, ToolDefinition } from '../../shared/types';
import {
  appendAudit, appendMessage, createJob, getJob, getProject, loadMessages,
  updateJob, updateProjectStatus,
} from '../db/repositories';
import { OpenRouterError, type ChatResponse } from '../providers/openrouter';
import type { BudgetService } from '../providers/budget';
import { assertTransition, isTerminal } from './state-machine';
import { buildStagePrompt, buildSystemPrompt } from './prompts';
import { loadCheckpoint, saveCheckpoint } from './checkpoint';
import { COMMAND_TOOLS, FILE_TOOLS, STAGE_TOOL } from '../tools/tool-defs';
import type { ToolRouter } from '../tools/tool-router';
import type { ProjectsService } from '../projects-service';
import type { QualityGate } from '../quality/quality-service';

export interface ModelGateway {
  chat(input: { model: string; messages: AgentMessage[]; tools: ToolDefinition[] }): Promise<ChatResponse>;
}

export interface OrchestratorDeps {
  db: DatabaseSync;
  projects: ProjectsService;
  tools: ToolRouter;
  gateway: ModelGateway;
  budget: BudgetService;
  events: (event: AgentEvent) => void;
  model: () => string;
  maxSteps?: number;
  quality?: QualityGate;
}

const TOOLS: ToolDefinition[] = [...FILE_TOOLS, ...COMMAND_TOOLS, STAGE_TOOL];

export class Orchestrator {
  private readonly running = new Map<string, Promise<void>>();
  private readonly paused = new Set<string>();

  constructor(private readonly deps: OrchestratorDeps) {}

  start(projectId: string, skillInstructions: string[] = []): string {
    const project = this.deps.projects.get(projectId);
    assertTransition(project.status, 'PLANNING');
    updateProjectStatus(this.deps.db, projectId, 'PLANNING');
    const job = createJob(this.deps.db, projectId, 'PLANNING');
    appendMessage(this.deps.db, job.id, { role: 'system', content: buildSystemPrompt(project, skillInstructions) });
    appendMessage(this.deps.db, job.id, { role: 'user', content: buildStagePrompt('PLANNING', 'Mulai proyek.') });
    saveCheckpoint(this.deps.db, job.id, { stage: 'PLANNING', lastTool: null, summary: 'job started' });
    appendAudit(this.deps.db, { actor: 'user', eventType: 'job.start', target: job.id, result: 'ok' });
    this.launch(job.id);
    return job.id;
  }

  pause(jobId: string): void {
    this.paused.add(jobId);
  }

  async resume(jobId: string): Promise<void> {
    const job = getJob(this.deps.db, jobId);
    const project = getProject(this.deps.db, job.projectId);
    this.paused.delete(jobId);
    const state = JSON.parse(job.stateJson) as { stage?: ProjectStatus };
    const stage = state.stage ?? 'BUILDING';
    updateJob(this.deps.db, jobId, { currentStage: stage, endedAt: null });
    updateProjectStatus(this.deps.db, project.id, stage);
    appendAudit(this.deps.db, { actor: 'user', eventType: 'job.resume', target: jobId, result: 'ok' });
    this.launch(jobId);
  }

  waitForIdle(jobId: string): Promise<void> {
    return this.running.get(jobId) ?? Promise.resolve();
  }

  private launch(jobId: string): void {
    const promise = this.loop(jobId).finally(() => this.running.delete(jobId));
    this.running.set(jobId, promise);
  }

  private async loop(jobId: string): Promise<void> {
    const maxSteps = this.deps.maxSteps ?? 40;
    for (let step = 0; step < maxSteps; step += 1) {
      const job = getJob(this.deps.db, jobId);
      const project = getProject(this.deps.db, job.projectId);

      if (this.paused.has(jobId)) {
        updateJob(this.deps.db, jobId, { currentStage: 'PAUSED' });
        updateProjectStatus(this.deps.db, project.id, 'PAUSED');
        this.deps.events({ type: 'stage', projectId: project.id, jobId, stage: 'PAUSED', summary: 'paused by user' });
        return;
      }
      if (isTerminal(job.currentStage)) return;

      try {
        this.deps.budget.beforeRequest(job.currentStage);
      } catch (error) {
        this.fail(jobId, 'PAUSED', error instanceof Error ? error.message : String(error));
        return;
      }

      let response: ChatResponse | null = null;
      for (let attempt = 0; attempt <= 2 && !response; attempt += 1) {
        try {
          response = await this.deps.gateway.chat({
            model: this.deps.model(),
            messages: loadMessages(this.deps.db, jobId),
            tools: TOOLS,
          });
          this.deps.budget.record({
            projectId: project.id, model: response.model, status: 'ok', httpStatus: 200,
            tokenUsage: response.usage, cost: null, errorCode: null,
          });
        } catch (error) {
          const status = error instanceof OpenRouterError ? error.status : null;
          this.deps.budget.record({
            projectId: project.id, model: this.deps.model(), status: 'error', httpStatus: status,
            tokenUsage: null, cost: null, errorCode: error instanceof OpenRouterError ? error.code : 'unknown',
          });
          const retryable = status === 429 || (status !== null && status >= 500);
          if (!retryable || attempt === 2) {
            this.fail(jobId, status === 429 || status === 402 ? 'PAUSED' : 'FAILED', error instanceof Error ? error.message : String(error));
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt + 1)));
        }
      }
      if (!response) return;

      appendMessage(this.deps.db, jobId, {
        role: 'assistant',
        content: response.content || null,
        ...(response.toolCalls.length ? { tool_calls: response.toolCalls } : {}),
      });

      if (response.toolCalls.length === 0) {
        appendMessage(this.deps.db, jobId, {
          role: 'user',
          content: 'Lanjutkan dengan memanggil tool. Gunakan update_stage jika tahap selesai.',
        });
        saveCheckpoint(this.deps.db, jobId, {
          stage: getJob(this.deps.db, jobId).currentStage, lastTool: null, summary: 'no tool call',
          checks: loadCheckpoint(this.deps.db, jobId)?.checks,
        });
        continue;
      }

      for (const call of response.toolCalls) {
        if (call.function.name === 'update_stage') {
          await this.handleStage(jobId, call.id, call.function.arguments);
          continue;
        }
        const result = await this.deps.tools.execute(project.workspacePath, call, {
          projectId: project.id, workspaceRoot: project.workspacePath,
        });
        appendMessage(this.deps.db, jobId, { role: 'tool', tool_call_id: call.id, content: result.output });
        this.deps.events({
          type: 'tool', projectId: project.id, tool: call.function.name,
          command: call.function.arguments, status: result.ok ? 'ok' : 'error', exitCode: result.exitCode,
        });
      }

      const current = getJob(this.deps.db, jobId);
      const previous = loadCheckpoint(this.deps.db, jobId);
      saveCheckpoint(this.deps.db, jobId, {
        stage: current.currentStage,
        lastTool: response.toolCalls.at(-1)?.function.name ?? null,
        summary: response.content ?? '',
        checks: previous?.checks,
      });
      if (['REVIEW_REQUIRED', 'COMPLETED', 'FAILED', 'NEEDS_REPAIR', 'BLOCKED', 'PAUSED'].includes(current.currentStage)) return;
    }
    this.fail(jobId, 'BLOCKED', 'Batas langkah agen tercapai');
  }

  private async handleStage(jobId: string, toolCallId: string, rawArgs: string): Promise<void> {
    let args: { stage: ProjectStatus; summary?: string };
    try {
      args = JSON.parse(rawArgs) as { stage: ProjectStatus; summary?: string };
      if (typeof args.stage !== 'string') throw new Error('stage is required');
    } catch (error) {
      appendMessage(this.deps.db, jobId, { role: 'tool', tool_call_id: toolCallId, content: `VALIDATION: ${redact(error instanceof Error ? error.message : String(error))}` });
      return;
    }
    const job = getJob(this.deps.db, jobId);
    const project = getProject(this.deps.db, job.projectId);

    if (args.stage === 'REVIEW_REQUIRED' && this.deps.quality) {
      let report: { dod: { passed: boolean; failures: string[] }; checks?: unknown };
      try {
        report = await this.deps.quality.run(project);
      } catch (error) {
        appendMessage(this.deps.db, jobId, { role: 'tool', tool_call_id: toolCallId, content: `QUALITY: ${redact(error instanceof Error ? error.message : String(error))}` });
        return;
      }
      saveCheckpoint(this.deps.db, jobId, {
        stage: job.currentStage, lastTool: 'quality_gate', summary: 'quality gate result', checks: report,
      });
      if (!report.dod.passed) {
        assertTransition(job.currentStage, 'NEEDS_REPAIR');
        updateJob(this.deps.db, jobId, { currentStage: 'NEEDS_REPAIR' });
        updateProjectStatus(this.deps.db, project.id, 'NEEDS_REPAIR');
        appendMessage(this.deps.db, jobId, { role: 'tool', tool_call_id: toolCallId, content: `quality_gate failed: ${report.dod.failures.join('; ')}` });
        appendAudit(this.deps.db, {
          actor: 'system', eventType: 'quality.fail', target: project.id, result: 'denied',
          metadata: { failures: report.dod.failures },
        });
        this.deps.events({ type: 'error', projectId: project.id, message: `Quality gate gagal: ${report.dod.failures.join('; ')}` });
        return;
      }
    }

    try {
      assertTransition(job.currentStage, args.stage);
    } catch (error) {
      appendMessage(this.deps.db, jobId, { role: 'tool', tool_call_id: toolCallId, content: `POLICY: ${redact(error instanceof Error ? error.message : String(error))}` });
      return;
    }
    updateJob(this.deps.db, jobId, { currentStage: args.stage });
    updateProjectStatus(this.deps.db, project.id, args.stage);
    appendMessage(this.deps.db, jobId, { role: 'tool', tool_call_id: toolCallId, content: `stage=${args.stage}` });
    appendAudit(this.deps.db, {
      actor: 'agent', eventType: 'stage.change', target: project.id, result: 'ok',
      metadata: { from: job.currentStage, to: args.stage, summary: args.summary ?? '' },
    });
    this.deps.events({ type: 'stage', projectId: project.id, jobId, stage: args.stage, summary: args.summary ?? '' });
  }

  private fail(jobId: string, stage: ProjectStatus, message: string): void {
    const job = getJob(this.deps.db, jobId);
    updateJob(this.deps.db, jobId, { currentStage: stage, endedAt: nowIso() });
    updateProjectStatus(this.deps.db, job.projectId, stage);
    appendAudit(this.deps.db, {
      actor: 'system', eventType: 'job.fail', target: jobId, result: 'error',
      metadata: { stage, message: redact(message) },
    });
    this.deps.events({ type: 'error', projectId: job.projectId, message: redact(message) });
  }
}
