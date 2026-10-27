import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { SkillService } from './skill-service';
import type { ResolvedSkill } from './registry';

let db: DatabaseSync;
let service: SkillService;
const resolved: ResolvedSkill = {
  source: 'owner/repo', skillId: 'demo', name: 'Demo', commit: 'abc123', checksum: 'a'.repeat(64),
  files: [
    { path: 'skills/demo/SKILL.md', content: '---\nname: demo\n---\nDo the thing' },
    { path: 'skills/demo/helper.js', content: 'console.log(1)' },
  ],
};

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  service = new SkillService(db, await mkdtemp(join(tmpdir(), 'r3x-skills-')));
});

describe('SkillService', () => {
  it('installs pending and requires approval before enabling', async () => {
    const record = await service.install(resolved);
    expect(record).toMatchObject({ reviewStatus: 'pending', enabled: false });
    expect(() => service.setEnabled(record.id, true)).toThrow('POLICY:');
    service.review(record.id, 'approved');
    service.setEnabled(record.id, true);
    expect(service.list()[0]).toMatchObject({ reviewStatus: 'approved', enabled: true });
  });

  it('rejects path traversal in skill files', async () => {
    await expect(service.install({ ...resolved, files: [{ path: '../evil.js', content: 'x' }] }))
      .rejects.toThrow('POLICY:');
  });

  it('loads enabled instructions only', async () => {
    const record = await service.install(resolved);
    service.review(record.id, 'approved');
    service.setEnabled(record.id, true);
    expect(await service.enabledInstructions()).toEqual(['---\nname: demo\n---\nDo the thing']);
  });
});
