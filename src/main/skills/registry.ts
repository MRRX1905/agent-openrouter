import { createHash } from 'node:crypto';
import type { SkillSearchResult } from '../../shared/types';

const SEARCH_URL = 'https://skills.sh/api/search';
const GITHUB_API = 'https://api.github.com';

export interface ResolvedSkillFile { path: string; content: string }
export interface ResolvedSkill {
  source: string;
  skillId: string;
  name: string;
  commit: string;
  checksum: string;
  files: ResolvedSkillFile[];
}

const assertSource = (source: string): void => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source)) throw new Error('VALIDATION: invalid source');
  if (source.split('/').some((part) => part === '.' || part === '..')) throw new Error('VALIDATION: invalid source');
};
const assertSkillId = (skillId: string): void => {
  if (!/^[A-Za-z0-9_.-]+$/.test(skillId)) throw new Error('VALIDATION: invalid skill id');
};

export async function searchSkills(query: string, fetchImpl: typeof fetch = fetch): Promise<SkillSearchResult[]> {
  if (query.trim().length < 2) throw new Error('VALIDATION: query must be at least 2 characters');
  const response = await fetchImpl(`${SEARCH_URL}?q=${encodeURIComponent(query.trim())}&limit=20`);
  if (!response.ok) throw new Error(`NOT_FOUND: skills.sh search failed (${response.status})`);
  const data = (await response.json()) as { skills?: Array<{ id: string; source: string; skillId: string; name: string; installs: number }> };
  return (data.skills ?? []).map((skill) => ({
    id: skill.id, source: skill.source, skillId: skill.skillId,
    name: skill.name, installs: skill.installs ?? 0,
  }));
}

const github = async <T>(url: string, fetchImpl: typeof fetch): Promise<T> => {
  const response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'r3x-agent-studio' } });
  if (!response.ok) throw new Error(`NOT_FOUND: GitHub API ${response.status} for ${url}`);
  return (await response.json()) as T;
};

const rawFile = async (source: string, commit: string, filePath: string, fetchImpl: typeof fetch): Promise<string> => {
  const response = await fetchImpl(`${GITHUB_API}/repos/${source}/contents/${filePath}?ref=${commit}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'r3x-agent-studio' },
  });
  if (!response.ok) throw new Error(`NOT_FOUND: cannot fetch ${filePath}`);
  const data = (await response.json()) as { content?: string; encoding?: string };
  return Buffer.from(data.content ?? '', 'base64').toString('utf8');
};

const frontmatterName = (content: string): string | null => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const line = match[1]?.split(/\r?\n/).find((item) => item.startsWith('name:'));
  return line ? line.slice(5).trim().replace(/^['"]|['"]$/g, '') : null;
};

export async function resolveSkill(
  source: string,
  skillId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedSkill> {
  assertSource(source);
  assertSkillId(skillId);

  const repo = await github<{ default_branch: string }>(`${GITHUB_API}/repos/${source}`, fetchImpl);
  const branch = repo.default_branch;
  const tree = await github<{ tree: Array<{ path: string; type: string }> }>(
    `${GITHUB_API}/repos/${source}/git/trees/${encodeURIComponent(branch)}?recursive=1`, fetchImpl,
  );
  const commit = await github<{ sha: string }>(`${GITHUB_API}/repos/${source}/commits/${encodeURIComponent(branch)}`, fetchImpl);

  const candidates = tree.tree
    .filter((entry) => entry.type === 'blob' && (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md')))
    .slice(0, 20);

  let selected: string | null = null;
  let selectedName = skillId;
  for (const candidate of candidates) {
    const content = await rawFile(source, commit.sha, candidate.path, fetchImpl);
    const directory = candidate.path === 'SKILL.md' ? '' : candidate.path.slice(0, -'SKILL.md'.length);
    const basename = directory.split('/').filter(Boolean).at(-1) ?? '';
    const name = frontmatterName(content) ?? basename;
    if (basename === skillId || name === skillId || name.toLowerCase() === skillId.toLowerCase()) {
      selected = candidate.path;
      selectedName = name;
      break;
    }
  }
  if (!selected) throw new Error(`NOT_FOUND: skill ${skillId} not found in ${source}`);

  const directory = selected === 'SKILL.md' ? '' : selected.slice(0, -'SKILL.md'.length);
  const files = tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(directory))
    .filter((entry) => entry.path.split('/').length - directory.split('/').filter(Boolean).length <= 3)
    .slice(0, 100);

  const resolvedFiles: ResolvedSkillFile[] = [];
  for (const file of files) {
    resolvedFiles.push({ path: file.path, content: await rawFile(source, commit.sha, file.path, fetchImpl) });
  }
  const checksum = createHash('sha256')
    .update(resolvedFiles.map((file) => `${file.path}\0${file.content}`).sort().join('\0'))
    .digest('hex');

  return { source, skillId, name: selectedName, commit: commit.sha, checksum, files: resolvedFiles };
}
