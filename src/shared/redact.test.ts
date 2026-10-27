import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('removes openrouter and github tokens', () => {
    const text = 'key sk-or-v1-abcdefghijklmnopqrstuvwxyz token ghp_abcdefghijklmnopqrstuvwxyz012345';
    const out = redact(text);
    expect(out).not.toContain('sk-or-v1-abcdefghijklmnopqrstuvwxyz');
    expect(out).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
  });

  it('removes private keys and bearer headers', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----\nAuthorization: Bearer abc.def';
    const out = redact(text);
    expect(out).not.toContain('secret');
    expect(out).not.toContain('abc.def');
  });
});
