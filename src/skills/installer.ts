import type { Env } from '../env.ts';
import type { Skill, SkillInstallInput } from './types.ts';
import { parseSkillContent } from './parser.ts';
import { getSkill, invalidateSkillsCache } from './loader.ts';
import { encrypt } from '../security/encryption.ts';
import { ensureEncryptionKey } from '../security/bootstrap.ts';

/**
 * Install a skill from raw content or URL. Parses frontmatter,
 * validates, and upserts into D1.
 */
export async function installSkill(env: Env, input: SkillInstallInput): Promise<Skill> {
  let content: string;
  let sourceUrl: string | null = null;

  if (input.url) {
    sourceUrl = input.url;
    const resp = await fetch(input.url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch skill from ${input.url}: ${resp.status} ${resp.statusText}`);
    }
    content = await resp.text();
  } else if (input.content) {
    content = input.content;
  } else {
    throw new Error('Either "content" or "url" must be provided');
  }

  const { frontmatter } = parseSkillContent(content);

  const authConfig = frontmatter.auth ?? null;
  const authType = authConfig?.type ?? 'none';

  await env.DB.prepare(
    `INSERT INTO skills (name, display_name, description, content, auth_type, auth_config, source_url, version, license, compatibility, metadata, allowed_tools, status, installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
     ON CONFLICT (name) DO UPDATE SET
       display_name = excluded.display_name,
       description = excluded.description,
       content = excluded.content,
       auth_type = excluded.auth_type,
       auth_config = excluded.auth_config,
       source_url = excluded.source_url,
       version = excluded.version,
       license = excluded.license,
       compatibility = excluded.compatibility,
       metadata = excluded.metadata,
       allowed_tools = excluded.allowed_tools,
       status = excluded.status,
       updated_at = unixepoch()`
  ).bind(
    frontmatter.name,
    frontmatter.name, // display_name defaults to name
    frontmatter.description ?? null,
    content,
    authType,
    authConfig ? JSON.stringify(authConfig) : null,
    sourceUrl,
    frontmatter.version ?? null,
    frontmatter.license ?? null,
    frontmatter.compatibility ?? null,
    frontmatter.metadata ? JSON.stringify(frontmatter.metadata) : null,
    frontmatter.allowedTools ?? null,
  ).run();

  await invalidateSkillsCache(env);

  // Return the installed skill
  const skill = await getSkill(env, frontmatter.name);
  return skill!;
}

/**
 * Remove a skill and its secrets (CASCADE handles skill_secrets).
 */
export async function removeSkill(env: Env, name: string): Promise<boolean> {
  const result = await env.DB.prepare('DELETE FROM skills WHERE name = ?').bind(name).run();
  await invalidateSkillsCache(env);
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Encrypt and upsert secrets for a skill.
 */
export async function updateSkillSecrets(
  env: Env,
  skillName: string,
  secrets: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(secrets)) {
    const encrypted = await encrypt(value, await ensureEncryptionKey(env.CACHE));
    // D1 accepts ArrayBuffer for BLOB columns
    await env.DB.prepare(
      `INSERT INTO skill_secrets (skill_name, key, encrypted_value)
       VALUES (?, ?, ?)
       ON CONFLICT (skill_name, key) DO UPDATE SET encrypted_value = excluded.encrypted_value`
    ).bind(skillName, key, encrypted).run();
  }
}

/**
 * List secret key names (not values) for a skill.
 */
export async function listSkillSecretKeys(env: Env, skillName: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT key FROM skill_secrets WHERE skill_name = ?'
  ).bind(skillName).all();
  return results.map(r => r.key as string);
}
