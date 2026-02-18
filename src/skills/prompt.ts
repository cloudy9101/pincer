import type { Env } from '../env.ts';
import type { Skill } from './types.ts';
import { getRequiredSecretKeys } from './auth.ts';

/**
 * Format active skills as a system prompt section.
 * Returns null if there are no active skills.
 */
export async function formatSkillsPrompt(skills: Skill[], env: Env): Promise<string | null> {
  if (skills.length === 0) return null;

  const sections: string[] = [];

  for (const skill of skills) {
    const requiredKeys = getRequiredSecretKeys(skill.authConfig);
    let setupNote = '';

    if (requiredKeys.length > 0) {
      const configuredKeys = await getConfiguredSecretKeys(env, skill.name);
      const missing = requiredKeys.filter(k => !configuredKeys.includes(k));
      if (missing.length > 0) {
        setupNote = `\n\n> **[Requires setup]** Missing secrets: ${missing.join(', ')}. Ask the admin to configure them.`;
      }
    }

    const authNote = skill.authType !== 'none'
      ? `\n\n> Authentication is handled automatically — do NOT include API keys or tokens in requests. Use the \`fetch\` tool with \`skill: "${skill.name}"\` to make authenticated requests.`
      : '';

    sections.push(
      `### ${skill.displayName ?? skill.name}${skill.description ? ` — ${skill.description}` : ''}` +
      authNote +
      setupNote +
      '\n\n' +
      skill.body
    );
  }

  return '\n\n## Available Skills\n\n' + sections.join('\n\n---\n\n');
}

async function getConfiguredSecretKeys(env: Env, skillName: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT key FROM skill_secrets WHERE skill_name = ?'
  ).bind(skillName).all();

  return results.map(r => r.key as string);
}
