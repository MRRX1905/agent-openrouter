import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { SkillRecord, SkillReviewStatus } from '../../shared/types';
import {
  getSkill, listSkills, setSkillEnabled, setSkillReview, upsertSkill,
} from '../db/repositories';
import { resolveInWorkspace } from '../security/path-guard';
import { resolveSkill, type ResolvedSkill } from './registry';

export class SkillService {
  constructor(private readonly db: DatabaseSync, private readonly root: string) {}

  resolve(source: string, skillId: string): Promise<ResolvedSkill> {
    return resolveSkill(source, skillId);
  }

  async install(resolved: ResolvedSkill): Promise<SkillRecord> {
    const id = `${resolved.source}/${resolved.skillId}`;
    const targetRoot = path.join(this.root, resolved.source, resolved.skillId, resolved.commit);
    await mkdir(targetRoot, { recursive: true });
    for (const file of resolved.files) {
      const target = await resolveInWorkspace(targetRoot, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
    const skillFile = resolved.files.find((file) => file.path.endsWith('/SKILL.md') || file.path === 'SKILL.md');
    if (skillFile) await writeFile(path.join(targetRoot, 'SKILL.md'), skillFile.content, 'utf8');
    return upsertSkill(this.db, {
      id, name: resolved.name, source: resolved.source,
      versionOrCommit: resolved.commit, checksum: resolved.checksum,
    });
  }

  list(): SkillRecord[] {
    return listSkills(this.db);
  }

  review(id: string, status: SkillReviewStatus): void {
    getSkill(this.db, id);
    setSkillReview(this.db, id, status);
  }

  setEnabled(id: string, enabled: boolean): void {
    const skill = getSkill(this.db, id);
    if (enabled && skill.reviewStatus !== 'approved') throw new Error('POLICY: skill must be approved before enabling');
    setSkillEnabled(this.db, id, enabled);
  }

  async enabledInstructions(): Promise<string[]> {
    const enabled = this.list().filter((skill) => skill.enabled).slice(0, 3);
    const instructions: string[] = [];
    for (const skill of enabled) {
      const skillId = skill.id.split('/').at(-1) ?? '';
      const candidates = [
        path.join(this.root, skill.source, skillId, skill.versionOrCommit, 'SKILL.md'),
        path.join(this.root, skill.source, skillId, skill.versionOrCommit, 'skills', skillId, 'SKILL.md'),
      ];
      for (const candidate of candidates) {
        try {
          instructions.push((await readFile(candidate, 'utf8')).slice(0, 8_000));
          break;
        } catch { /* coba kandidat berikutnya */ }
      }
    }
    return instructions;
  }
}
