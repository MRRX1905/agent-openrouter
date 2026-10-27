import { describe, expect, it } from 'vitest';
import { canTransition, assertTransition, isTerminal } from './state-machine';

describe('state machine', () => {
  it('allows the happy path', () => {
    const path = ['IDEA', 'PLANNING', 'READY', 'BUILDING', 'TESTING', 'DOCUMENTING', 'REVIEW_REQUIRED', 'COMPLETED'] as const;
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('allows repair loops and pause', () => {
    expect(canTransition('TESTING', 'REPAIRING')).toBe(true);
    expect(canTransition('REPAIRING', 'TESTING')).toBe(true);
    expect(canTransition('BUILDING', 'PAUSED')).toBe(true);
    expect(canTransition('PAUSED', 'BUILDING')).toBe(true);
  });

  it('rejects skipping stages and terminal transitions', () => {
    expect(canTransition('IDEA', 'BUILDING')).toBe(false);
    expect(canTransition('COMPLETED', 'BUILDING')).toBe(false);
    expect(() => assertTransition('IDEA', 'BUILDING')).toThrow('POLICY:');
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('PAUSED')).toBe(false);
  });
});
