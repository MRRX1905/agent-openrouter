import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('normalizes names', () => {
    expect(slugify('  Aplikasi Kasir Café!  ')).toBe('aplikasi-kasir-cafe');
    expect(slugify('API-Test_v2')).toBe('api-test-v2');
  });

  it('rejects names without enough letters', () => {
    expect(() => slugify('!!!')).toThrow('VALIDATION:');
  });
});
