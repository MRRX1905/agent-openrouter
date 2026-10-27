import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { scanWorkspace } from './secret-scan';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'r3x-scan-')); });

describe('scanWorkspace', () => {
  it('finds tokens and private keys', async () => {
    await writeFile(join(dir, 'a.env'), 'OPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwxyz\n');
    await writeFile(join(dir, 'b.txt'), '-----BEGIN RSA PRIVATE KEY-----\nsecret\n');
    const findings = await scanWorkspace(dir);
    expect(findings.map((finding) => finding.pattern)).toEqual(expect.arrayContaining(['openrouter', 'private-key']));
  });

  it('ignores safe files and node_modules', async () => {
    await writeFile(join(dir, 'safe.txt'), 'hello world');
    const findings = await scanWorkspace(dir);
    expect(findings).toEqual([]);
  });
});
