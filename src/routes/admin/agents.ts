import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { DEFAULTS } from '../../config/defaults.ts';

type HonoEnv = { Bindings: Env };

export const agentsRouter = new Hono<HonoEnv>();

agentsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, display_name as name, model, system_prompt, max_tokens as max_steps, created_at, updated_at FROM agents ORDER BY id'
  ).all();
  return c.json(results);
});

agentsRouter.post('/', async (c) => {
  const agent = await c.req.json() as {
    id: string;
    name?: string;
    display_name?: string;
    model?: string;
    system_prompt?: string;
    thinking_level?: string;
    temperature?: number;
    max_tokens?: number;
  };
  await c.env.DB.prepare(
    'INSERT INTO agents (id, display_name, model, system_prompt, thinking_level, temperature, max_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    agent.id,
    agent.display_name ?? agent.name ?? null,
    agent.model ?? DEFAULTS.model,
    agent.system_prompt ?? null,
    agent.thinking_level ?? DEFAULTS.thinkingLevel,
    agent.temperature ?? DEFAULTS.temperature,
    agent.max_tokens ?? DEFAULTS.maxTokens,
  ).run();
  return c.json({ ok: true });
});

agentsRouter.patch('/:id', async (c) => {
  const agentId = c.req.param('id');
  const updates = await c.req.json() as Record<string, unknown>;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (['display_name', 'model', 'system_prompt', 'thinking_level', 'temperature', 'max_tokens'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length > 0) {
    fields.push('updated_at = unixepoch()');
    values.push(agentId);
    await c.env.DB.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    await c.env.CACHE.delete(`agent:${agentId}`);
  }
  return c.json({ ok: true });
});

agentsRouter.delete('/:id', async (c) => {
  const agentId = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM agents WHERE id = ?').bind(agentId).run();
  await c.env.CACHE.delete(`agent:${agentId}`);
  return c.json({ ok: true });
});
