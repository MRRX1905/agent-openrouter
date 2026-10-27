import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { newId } from '../../shared/ids';
import type { AgentEvent, ApprovalRecord, RiskLevel } from '../../shared/types';
import {
  appendAudit, createApproval, getApproval, listApprovals,
  markApprovalConsumed, setApprovalDecision,
} from '../db/repositories';

interface Waiter { resolve: (approved: boolean) => void; timer: ReturnType<typeof setTimeout> }

export class ApprovalService {
  private readonly waiters = new Map<string, Waiter>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly emit: (event: AgentEvent) => void,
    private readonly ttlMs = 120_000,
  ) {}

  request(input: {
    projectId: string;
    actionType: ApprovalRecord['actionType'];
    commandSummary: string;
    workingDirectory: string;
    riskLevel: RiskLevel;
    payload: Record<string, unknown>;
  }): ApprovalRecord {
    const payload = { ...input.payload, nonce: newId('nonce') };
    const payloadJson = JSON.stringify(payload);
    const tokenHash = createHash('sha256').update(payloadJson).digest('hex');
    const approval = createApproval(this.db, {
      projectId: input.projectId,
      actionType: input.actionType,
      commandSummary: input.commandSummary,
      workingDirectory: input.workingDirectory,
      riskLevel: input.riskLevel,
      tokenHash,
      payloadJson,
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
    });
    appendAudit(this.db, {
      actor: 'agent', eventType: 'approval.request', target: approval.id,
      result: 'ok', metadata: { risk: input.riskLevel, command: input.commandSummary },
    });
    this.emit({ type: 'approval', approval });
    return approval;
  }

  wait(approvalId: string): Promise<boolean> {
    const approval = getApproval(this.db, approvalId);
    if (approval.decision === 'approved') return Promise.resolve(true);
    if (approval.decision !== 'pending') return Promise.resolve(false);

    return new Promise((resolve) => {
      const delay = Math.max(0, Date.parse(approval.expiresAt) - Date.now());
      const timer = setTimeout(() => {
        this.waiters.delete(approvalId);
        setApprovalDecision(this.db, approvalId, 'expired');
        appendAudit(this.db, { actor: 'system', eventType: 'approval.expire', target: approvalId, result: 'denied' });
        resolve(false);
      }, delay);
      this.waiters.set(approvalId, { resolve, timer });
    });
  }

  decide(approvalId: string, decision: 'approved' | 'rejected'): void {
    const approval = getApproval(this.db, approvalId);
    if (approval.decision !== 'pending') throw new Error('POLICY: approval is not pending');
    if (Date.parse(approval.expiresAt) <= Date.now()) {
      setApprovalDecision(this.db, approvalId, 'expired');
      this.finish(approvalId, false);
      throw new Error('POLICY: approval expired');
    }
    setApprovalDecision(this.db, approvalId, decision);
    appendAudit(this.db, {
      actor: 'user', eventType: `approval.${decision}`, target: approvalId, result: 'ok',
    });
    this.finish(approvalId, decision === 'approved');
  }

  consume(approvalId: string): Record<string, unknown> {
    const approval = getApproval(this.db, approvalId);
    if (approval.decision !== 'approved') throw new Error('POLICY: approval was not granted');
    if (approval.consumedAt) throw new Error('POLICY: approval already consumed');
    if (Date.parse(approval.expiresAt) <= Date.now()) {
      setApprovalDecision(this.db, approvalId, 'expired');
      throw new Error('POLICY: approval expired');
    }
    markApprovalConsumed(this.db, approvalId);
    appendAudit(this.db, { actor: 'system', eventType: 'approval.consume', target: approvalId, result: 'ok' });
    return JSON.parse(approval.payloadJson) as Record<string, unknown>;
  }

  list(projectId: string): ApprovalRecord[] {
    return listApprovals(this.db, projectId);
  }

  private finish(approvalId: string, approved: boolean): void {
    const waiter = this.waiters.get(approvalId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.waiters.delete(approvalId);
    waiter.resolve(approved);
  }
}
