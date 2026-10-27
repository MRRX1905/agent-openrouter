import { describe, expect, it } from 'vitest';
import { resolveSkill, searchSkills } from './registry';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('searchSkills', () => {
  it('maps the public skills.sh search response', async () => {
    const fetchImpl = (async () => json({
      skills: [
        { id: 'vercel-labs/agent-skills/vercel-react-best-practices', source: 'vercel-labs/agent-skills', skillId: 'vercel-react-best-practices', name: 'vercel-react-best-practices', installs: 844260 },
      ],
    })) as typeof fetch;
    const results = await searchSkills('react', fetchImpl);
    expect(results).toEqual([{
      id: 'vercel-labs/agent-skills/vercel-react-best-practices',
      source: 'vercel-labs/agent-skills',
      skillId: 'vercel-react-best-practices',
      name: 'vercel-react-best-practices',
      installs: 844260,
    }]);
  });

  it('rejects queries shorter than 2 characters', async () => {
    await expect(searchSkills('a', (async () => json({})) as typeof fetch)).rejects.toThrow('VALIDATION:');
  });
});

describe('resolveSkill', () => {
  it('resolves files and pins the commit', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const href = String(url);
      if (href.endsWith('/repos/owner/repo')) return json({ default_branch: 'main' });
      if (href.includes('/git/trees/main')) return json({
        sha: 'tree-sha',
        tree: [
          { path: 'skills/demo/SKILL.md', type: 'blob', sha: 'a' },
          { path: 'skills/demo/helper.js', type: 'blob', sha: 'b' },
        ],
      });
      if (href.includes('/commits/main')) return json({ sha: 'commit-sha' });
      if (href.includes('/contents/skills/demo/SKILL.md')) return json({ content: Buffer.from('---\nname: demo\n---\nUse me').toString('base64') });
      if (href.includes('/contents/skills/demo/helper.js')) return json({ content: Buffer.from('console.log(1)').toString('base64') });
      return json({}, 404);
    }) as typeof fetch;

    const resolved = await resolveSkill('owner/repo', 'demo', fetchImpl);
    expect(resolved.commit).toBe('commit-sha');
    expect(resolved.files.map((file) => file.path)).toEqual(['skills/demo/SKILL.md', 'skills/demo/helper.js']);
    expect(resolved.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects unsafe source identifiers', async () => {
    await expect(resolveSkill('../evil', 'demo', (async () => json({})) as typeof fetch)).rejects.toThrow('VALIDATION:');
  });
});
