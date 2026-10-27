import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { getSetting } from '../db/repositories';
import { SecretBox, type CryptoPort } from './secrets';

const xor: CryptoPort = {
  isAvailable: () => true,
  encrypt: (value) => Buffer.from(value.split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 7)).join('')),
  decrypt: (buffer) => buffer.toString().split('').map((c) => String.fromCharCode(c.charCodeAt(0) ^ 7)).join(''),
};

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
});

describe('SecretBox', () => {
  it('stores ciphertext, not plaintext', () => {
    const box = new SecretBox(db, xor);
    box.set('secret:openrouter', 'sk-or-v1-plain-secret');
    const stored = getSetting(db, 'secret:openrouter');
    expect(stored).not.toContain('plain-secret');
    expect(box.get('secret:openrouter')).toBe('sk-or-v1-plain-secret');
    expect(box.has('secret:openrouter')).toBe(true);
  });

  it('refuses to store when OS encryption is unavailable', () => {
    const box = new SecretBox(db, { ...xor, isAvailable: () => false });
    expect(() => box.set('secret:openrouter', 'x')).toThrow('SECRET:');
  });

  it('clears a secret', () => {
    const box = new SecretBox(db, xor);
    box.set('secret:openrouter', 'x');
    box.clear('secret:openrouter');
    expect(box.get('secret:openrouter')).toBeNull();
  });
});
