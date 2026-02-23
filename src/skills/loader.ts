import type { Env } from '../env.ts';
import type { Skill, SkillAuthConfig, SkillAuthType } from './types.ts';
import { parseSkillContent } from './parser.ts';

const SKILLS_CACHE_KEY = 'skills:active';
const SKILLS_CACHE_TTL = 60; // seconds

export async function loadActiveSkills(env: Env): Promise<Skill[]> {
  const cached = await env.CACHE.get(SKILLS_CACHE_KEY, 'json');
  if (cached) return cached as Skill[];

  const { results } = await env.DB.prepare(
    "SELECT * FROM skills WHERE status = 'active' ORDER BY name"
  ).all();

  const skills = results.map(rowToSkill);

  await env.CACHE.put(SKILLS_CACHE_KEY, JSON.stringify(skills), { expirationTtl: SKILLS_CACHE_TTL });
  return skills;
}

export async function getSkill(env: Env, name: string): Promise<Skill | null> {
  const row = await env.DB.prepare('SELECT * FROM skills WHERE name = ?').bind(name).first();
  if (!row) return null;
  return rowToSkill(row);
}

export async function invalidateSkillsCache(env: Env): Promise<void> {
  await env.CACHE.delete(SKILLS_CACHE_KEY);
}

function rowToSkill(row: Record<string, unknown>): Skill {
  const content = row.content as string;
  let body = content;
  try {
    const parsed = parseSkillContent(content);
    body = parsed.body;
  } catch {
    // If parsing fails, use full content as body
  }

  return {
    name: row.name as string,
    displayName: row.display_name as string | null,
    description: row.description as string | null,
    content,
    body,
    authType: (row.auth_type as SkillAuthType) ?? 'none',
    authConfig: row.auth_config ? JSON.parse(row.auth_config as string) as SkillAuthConfig : null,
    sourceUrl: row.source_url as string | null,
    version: row.version as string | null,
    license: row.license as string | null,
    compatibility: row.compatibility as string | null,
    metadata: row.metadata ? JSON.parse(row.metadata as string) as Record<string, string> : null,
    allowedTools: row.allowed_tools as string | null,
    status: row.status as string,
  };
}
