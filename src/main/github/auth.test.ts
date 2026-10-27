import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { SecretBox } from '../security/secrets';
import { GitHubAuth } from './auth';

let secrets: SecretBox;
let auth: GitHubAuth;
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  secrets = new SecretBox(db, {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
});

describe('GitHubAuth', () => {
  it('starts and completes the device flow', async () => {
    let step = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/login/device/code')) {
        return json({ device_code: 'dev', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
      }
      if (href.endsWith('/login/oauth/access_token')) {
        step += 1;
        return step === 1 ? json({ error: 'authorization_pending' }) : json({ access_token: 'gho_testtoken1234567890' });
      }
      if (href.endsWith('/user')) return json({ login: 'octocat' });
      return json({}, 404);
    }) as typeof fetch;

    auth = new GitHubAuth({ clientId: () => 'client', secrets, fetchImpl });
    const start = await auth.start();
    expect(start).toMatchObject({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' });
    await expect(auth.poll()).resolves.toEqual({ status: 'pending' });
    await expect(auth.poll()).resolves.toEqual({ status: 'connected', login: 'octocat' });
    expect(secrets.get('secret:github')).toBe('gho_testtoken1234567890');
  });

  it('requires a client id', async () => {
    auth = new GitHubAuth({ clientId: () => '', secrets, fetchImpl: (async () => json({})) as typeof fetch });
    await expect(auth.start()).rejects.toThrow('AUTH:');
  });
});
