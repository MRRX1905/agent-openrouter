import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { recordApiRequest } from '../db/repositories';
import { BudgetService, canSpend } from './budget';

describe('canSpend', () => {
  it('reserves part of the cap outside repair', () => {
    expect(canSpend({ used: 39, cap: 50, reservePct: 20 }, 'BUILDING').allowed).toBe(true);
    expect(canSpend({ used: 40, cap: 50, reservePct: 20 }, 'BUILDING').allowed).toBe(false);
    expect(canSpend({ used: 40, cap: 50, reservePct: 20 }, 'REPAIRING').allowed).toBe(true);
    expect(canSpend({ used: 50, cap: 50, reservePct: 20 }, 'REPAIRING').allowed).toBe(false);
  });
});

describe('BudgetService', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    migrate(db);
  });

  it('blocks when the effective cap is reached', () => {
    const service = new BudgetService(db, { dailyRequestCap: 5, repairReservePct: 20 }, '2026-10-28T10:00:00.000Z');
    for (let i = 0; i < 4; i += 1) {
      recordApiRequest(db, {
        id: `r${i}`, projectId: 'p', provider: 'openrouter', model: 'm', status: 'ok',
        httpStatus: 200, timestamp: '2026-10-28T09:00:00.000Z', tokenUsage: null, cost: null, errorCode: null,
      });
    }
    expect(() => service.beforeRequest('BUILDING')).toThrow('BUDGET:');
    expect(service.beforeRequest('REPAIRING').effectiveCap).toBe(5);
  });

  it('records every attempt, including errors', () => {
    const service = new BudgetService(db, { dailyRequestCap: 10, repairReservePct: 20 }, '2026-10-28T10:00:00.000Z');
    service.record({ projectId: 'p', model: 'm', status: 'error', httpStatus: 429, tokenUsage: null, cost: null, errorCode: '429' });
    expect(service.snapshot().used).toBe(1);
  });
});
