import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { getApproval } from '../db/repositories';
import { ApprovalService } from './approval-service';

let db: DatabaseSync;
let service: ApprovalService;
let events: unknown[];
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  events = [];
  service = new ApprovalService(db, (event) => events.push(event), 120_000);
});

const request = () => service.request({
  projectId: 'prj_1',
  actionType: 'command',
  commandSummary: 'git push origin main',
  workingDirectory: 'C:/ws/demo',
  riskLevel: 'high',
  payload: { executable: 'git', args: ['push', 'origin', 'main'], cwd: 'C:/ws/demo' },
});

describe('ApprovalService', () => {
  it('creates a pending approval and emits an event', () => {
    const approval = request();
    expect(approval.decision).toBe('pending');
    expect(events).toHaveLength(1);
    expect(approval.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves true only after approval', async () => {
    const approval = request();
    const waiting = service.wait(approval.id);
    service.decide(approval.id, 'approved');
    await expect(waiting).resolves.toBe(true);
    expect(getApproval(db, approval.id).decision).toBe('approved');
  });

  it('resolves false when rejected', async () => {
    const approval = request();
    const waiting = service.wait(approval.id);
    service.decide(approval.id, 'rejected');
    await expect(waiting).resolves.toBe(false);
  });

  it('expires pending approvals', async () => {
    const short = new ApprovalService(db, () => {}, 20);
    const approval = short.request({
      projectId: 'prj_1', actionType: 'command', commandSummary: 'x',
      workingDirectory: 'C:/ws', riskLevel: 'medium', payload: {},
    });
    await expect(short.wait(approval.id)).resolves.toBe(false);
    expect(getApproval(db, approval.id).decision).toBe('expired');
  });

  it('consumes an approved payload exactly once', () => {
    const approval = request();
    service.decide(approval.id, 'approved');
    expect(service.consume(approval.id)).toMatchObject({ executable: 'git' });
    expect(() => service.consume(approval.id)).toThrow('POLICY:');
  });
});
