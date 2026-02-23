import type { Env } from '../env.ts';
import type { Skill } from './types.ts';
import { getRequiredSecretKeys } from './auth.ts';

/**
 * Format active skills as a compact index in the system prompt (Tier 1).
 * Full skill bodies are loaded on demand via the `skill_read` tool.
 * Returns null if there are no active skills.
 */
export async function formatSkillsPrompt(skills: Skill[], env: Env, userId?: string): Promise<string | null> {
  if (skills.length === 0) return null;

  const lines: string[] = [];

  for (const skill of skills) {
    const name = skill.name;
    const description = skill.description ?? '(no description)';
    let note = '';

    // Auth setup warnings — still useful in the index so the user knows before trying
    const requiredKeys = getRequiredSecretKeys(skill.authConfig);
    if (requiredKeys.length > 0) {
      const configuredKeys = await getConfiguredSecretKeys(env, name);
      const missing = requiredKeys.filter(k => !configuredKeys.includes(k));
      if (missing.length > 0) {
        note = ` ⚠️ Missing secrets: ${missing.join(', ')}`;
      }
    }

    if (skill.authType === 'oauth' && skill.authConfig?.provider) {
      const provider = skill.authConfig.provider;
      if (userId) {
        const hasConnection = await checkOAuthConnection(env, userId, provider);
        if (!hasConnection) {
          note = ` ⚠️ Requires OAuth — call \`oauth_connect\` for ${provider} first`;
        }
      } else {
        note = ` ⚠️ Requires OAuth — call \`oauth_connect\` for ${provider} first`;
      }
    }

    lines.push(`- **${name}** — ${description}${note}`);
  }

  return (
    '\n\n## Available Skills\n\n' +
    'The following skills are available. Call `skill_read` with the skill name to load its full instructions before using it.\n\n' +
    lines.join('\n')
  );
}

async function checkOAuthConnection(env: Env, userId: string, provider: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM oauth_connections WHERE user_id = ? AND provider = ?'
  ).bind(userId, provider).first();
  return !!row;
}

async function getConfiguredSecretKeys(env: Env, skillName: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT key FROM skill_secrets WHERE skill_name = ?'
  ).bind(skillName).all();

  return results.map(r => r.key as string);
}
