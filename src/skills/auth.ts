import type { Env } from '../env.ts';
import type { SkillAuthConfig } from './types.ts';
import { getSkill } from './loader.ts';
import { decrypt } from '../security/encryption.ts';

export interface FetchRequestArgs {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Look up a skill's auth config, decrypt secrets, and mutate request args
 * to inject authentication. The AI never sees the actual secrets.
 */
export async function applySkillAuth(
  skillName: string,
  requestArgs: FetchRequestArgs,
  env: Env,
): Promise<void> {
  const skill = await getSkill(env, skillName);
  if (!skill?.authConfig) return;

  const auth = skill.authConfig;
  requestArgs.headers ??= {};

  switch (auth.type) {
    case 'bearer': {
      if (!auth.secret) break;
      const token = await getDecryptedSecret(env, skillName, auth.secret);
      if (token) {
        requestArgs.headers['Authorization'] = `Bearer ${token}`;
      }
      break;
    }

    case 'header': {
      if (!auth.secret || !auth.header_name) break;
      const value = await getDecryptedSecret(env, skillName, auth.secret);
      if (value) {
        requestArgs.headers[auth.header_name] = value;
      }
      break;
    }

    case 'query': {
      if (!auth.secret || !auth.param_name) break;
      const value = await getDecryptedSecret(env, skillName, auth.secret);
      if (value) {
        const url = new URL(requestArgs.url);
        url.searchParams.set(auth.param_name, value);
        requestArgs.url = url.toString();
      }
      break;
    }

    case 'basic': {
      if (!auth.username_secret || !auth.password_secret) break;
      const username = await getDecryptedSecret(env, skillName, auth.username_secret);
      const password = await getDecryptedSecret(env, skillName, auth.password_secret);
      if (username && password) {
        const encoded = btoa(`${username}:${password}`);
        requestArgs.headers['Authorization'] = `Basic ${encoded}`;
      }
      break;
    }

    case 'none':
    default:
      break;
  }
}

async function getDecryptedSecret(
  env: Env,
  skillName: string,
  secretKey: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT encrypted_value FROM skill_secrets WHERE skill_name = ? AND key = ?'
  ).bind(skillName, secretKey).first();

  if (!row) return null;

  const encrypted = new Uint8Array(row.encrypted_value as ArrayBuffer);
  return decrypt(encrypted, env.ENCRYPTION_KEY);
}

/**
 * Return the list of secret keys required by a skill's auth config.
 */
export function getRequiredSecretKeys(authConfig: SkillAuthConfig | null): string[] {
  if (!authConfig) return [];

  switch (authConfig.type) {
    case 'bearer':
    case 'header':
    case 'query':
      return authConfig.secret ? [authConfig.secret] : [];

    case 'basic':
      const keys: string[] = [];
      if (authConfig.username_secret) keys.push(authConfig.username_secret);
      if (authConfig.password_secret) keys.push(authConfig.password_secret);
      return keys;

    case 'none':
    default:
      return [];
  }
}
