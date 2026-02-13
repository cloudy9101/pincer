import type { Env } from '../env.ts';
import type { AgentConfig } from './types.ts';
import { DEFAULTS } from './defaults.ts';

const CONFIG_CACHE_TTL = 60; // seconds

export async function getAgent(db: D1Database, cache: KVNamespace, agentId: string): Promise<AgentConfig | null> {
  const cacheKey = `agent:${agentId}`;
  const cached = await cache.get(cacheKey, 'json');
  if (cached) return cached as AgentConfig;

  const row = await db.prepare('SELECT * FROM agents WHERE id = ?').bind(agentId).first();
  if (!row) return null;

  const agent: AgentConfig = {
    id: row.id as string,
    displayName: row.display_name as string | null,
    model: row.model as string,
    systemPrompt: row.system_prompt as string | null,
    thinkingLevel: row.thinking_level as string | null,
    temperature: row.temperature as number,
    maxTokens: row.max_tokens as number,
  };

  await cache.put(cacheKey, JSON.stringify(agent), { expirationTtl: CONFIG_CACHE_TTL });
  return agent;
}

export async function getConfigValue(db: D1Database, cache: KVNamespace, key: string): Promise<string | null> {
  const cacheKey = `config:${key}`;
  const cached = await cache.get(cacheKey);
  if (cached !== null) return cached;

  const row = await db.prepare('SELECT value FROM config WHERE key = ?').bind(key).first();
  if (!row) return null;

  const value = row.value as string;
  await cache.put(cacheKey, value, { expirationTtl: CONFIG_CACHE_TTL });
  return value;
}

export async function setConfigValue(db: D1Database, cache: KVNamespace, key: string, value: string): Promise<void> {
  await db.prepare(
    'INSERT INTO config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).bind(key, value).run();
  await cache.delete(`config:${key}`);
}
