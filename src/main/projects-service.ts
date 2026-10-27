import type { DatabaseSync } from 'node:sqlite';
import { slugify } from '../shared/slug';
import type { OperatingMode, Project, ProjectBrief } from '../shared/types';
import { appendAudit, createProject, getProject, listProjects } from './db/repositories';
import type { WorkspaceService } from './workspace/workspace-service';

const MODES: OperatingMode[] = ['auto', 'supervised', 'repair'];

const validateBrief = (brief: ProjectBrief): void => {
  if (!brief.problem || brief.problem.trim().length < 10) throw new Error('VALIDATION: problem must be at least 10 characters');
  if (!brief.targetUsers || brief.targetUsers.trim().length < 3) throw new Error('VALIDATION: targetUsers is required');
  if (!Array.isArray(brief.mvpFeatures) || brief.mvpFeatures.length === 0) throw new Error('VALIDATION: at least one MVP feature is required');
  if (!Array.isArray(brief.acceptanceCriteria) || brief.acceptanceCriteria.length === 0) throw new Error('VALIDATION: at least one acceptance criterion is required');
  if (!Array.isArray(brief.stack) || !Array.isArray(brief.constraints)) throw new Error('VALIDATION: invalid brief arrays');
};

export class ProjectsService {
  constructor(private readonly db: DatabaseSync, private readonly workspaces: WorkspaceService) {}

  list(): Project[] {
    return listProjects(this.db);
  }

  get(id: string): Project {
    return getProject(this.db, id);
  }

  async create(input: { name: string; brief: ProjectBrief; mode: OperatingMode }): Promise<Project> {
    const name = input.name.trim();
    if (name.length < 3 || name.length > 80) throw new Error('VALIDATION: name must be 3..80 characters');
    if (!MODES.includes(input.mode)) throw new Error('VALIDATION: invalid mode');
    validateBrief(input.brief);

    const base = slugify(name);
    let slug = base;
    let suffix = 2;
    while (this.db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    const workspacePath = await this.workspaces.createProjectDir(slug);
    const project = createProject(this.db, {
      name,
      slug,
      workspacePath,
      stack: input.brief.stack,
      brief: input.brief,
    });
    appendAudit(this.db, { actor: 'user', eventType: 'project.create', target: project.id, result: 'ok', metadata: { mode: input.mode } });
    return project;
  }
}
