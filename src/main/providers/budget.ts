import type { DatabaseSync } from 'node:sqlite';
import { newId, nowIso } from '../../shared/ids';
import type { ProjectStatus, TokenUsage } from '../../shared/types';
import { countRequestsToday, recordApiRequest } from '../db/repositories';

export interface BudgetConfig { dailyRequestCap: number; repairReservePct: number }

export interface BudgetCheck { allowed: boolean; used: number; effectiveCap: number; reason?: string }

export function effectiveCap(config: BudgetConfig, stage: ProjectStatus): number {
  if (stage === 'REPAIRING') return config.dailyRequestCap;
  const reserve = Math.ceil((config.dailyRequestCap * config.repairReservePct) / 100);
  return Math.max(0, config.dailyRequestCap - reserve);
}

export function canSpend(
  input: { used: number; cap: number; reservePct: number },
  stage: ProjectStatus,
): BudgetCheck {
  const cap = effectiveCap({ dailyRequestCap: input.cap, repairReservePct: input.reservePct }, stage);
  if (input.used >= cap) {
    return { allowed: false, used: input.used, effectiveCap: cap, reason: `BUDGET: daily cap reached (${input.used}/${cap})` };
  }
  return { allowed: true, used: input.used, effectiveCap: cap };
}

export class BudgetService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly config: BudgetConfig,
    // Spec's tests pass a fixed timestamp string; production default stays a clock.
    private readonly now: string | (() => string) = nowIso,
  ) {}

  private timestamp(): string {
    return typeof this.now === 'string' ? this.now : this.now();
  }

  snapshot(): { used: number; cap: number; reservePct: number } {
    return {
      used: countRequestsToday(this.db, this.timestamp()),
      cap: this.config.dailyRequestCap,
      reservePct: this.config.repairReservePct,
    };
  }

  beforeRequest(stage: ProjectStatus): BudgetCheck {
    const { used, cap, reservePct } = this.snapshot();
    const check = canSpend({ used, cap, reservePct }, stage);
    if (!check.allowed) throw new Error(check.reason);
    return check;
  }

  record(input: {
    projectId: string; model: string; status: 'ok' | 'error'; httpStatus: number | null;
    tokenUsage: TokenUsage | null; cost: number | null; errorCode: string | null;
  }): void {
    recordApiRequest(this.db, {
      id: newId('req'),
      provider: 'openrouter',
      timestamp: this.timestamp(),
      ...input,
    });
  }
}
