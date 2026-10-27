import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveInWorkspace } from '../security/path-guard';

const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES = 2_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', '.next', 'coverage']);
const DEFAULT_GITIGNORE = `node_modules/\ndist/\nout/\n.env\n.env.*\n*.log\n*.sqlite\n*.db\n.DS_Store\n`;

const assertSize = (content: string): void => {
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('VALIDATION: file exceeds 1 MiB limit');
  }
};

export class WorkspaceService {
  constructor(private readonly root: string) {}

  async createProjectDir(slug: string): Promise<string> {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) throw new Error('VALIDATION: invalid project slug');
    const dir = path.join(this.root, slug);
    await mkdir(dir, { recursive: true });
    const gitignore = path.join(dir, '.gitignore');
    try {
      await stat(gitignore);
    } catch {
      await writeFile(gitignore, DEFAULT_GITIGNORE, 'utf8');
    }
    return dir;
  }

  async writeFile(workspace: string, relative: string, content: string): Promise<void> {
    assertSize(content);
    const target = await resolveInWorkspace(workspace, relative);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.tmp-${process.pid}`;
    await writeFile(temp, content, 'utf8');
    await rename(temp, target);
  }

  async readFile(workspace: string, relative: string): Promise<string> {
    const target = await resolveInWorkspace(workspace, relative);
    const info = await stat(target);
    if (!info.isFile()) throw new Error('VALIDATION: not a file');
    if (info.size > MAX_FILE_BYTES) throw new Error('VALIDATION: file exceeds 1 MiB limit');
    return readFile(target, 'utf8');
  }

  async listFiles(workspace: string, relative = '.'): Promise<string[]> {
    const start = await resolveInWorkspace(workspace, relative);
    const results: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (results.length >= MAX_FILES) return;
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_FILES) return;
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        else results.push(path.relative(workspace, absolute).replaceAll('\\', '/'));
      }
    };
    await walk(start);
    return results.sort();
  }

  async deleteFile(workspace: string, relative: string): Promise<void> {
    const target = await resolveInWorkspace(workspace, relative);
    const info = await stat(target);
    if (!info.isFile()) throw new Error('VALIDATION: only files can be deleted');
    await unlink(target);
  }
}
