import { describe, expect, it } from 'vitest';
import { newId, nowIso } from './ids';

describe('ids', () => {
  it('prefixes unique ids', () => {
    const a = newId('prj');
    const b = newId('prj');
    expect(a).toMatch(/^prj_[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  it('returns ISO timestamps', () => {
    const value = nowIso();
    expect(new Date(value).toISOString()).toBe(value);
  });
});
