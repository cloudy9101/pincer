import { Hono } from 'hono';
import type { Env } from '../../env.ts';

type HonoEnv = { Bindings: Env };

export const cronsRouter = new Hono<HonoEnv>();

cronsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id, enabled, last_run_at, created_at FROM cron_jobs ORDER BY created_at DESC'
  ).all();
  return c.json(results);
});

cronsRouter.post('/', async (c) => {
  const body = await c.req.json() as Record<string, unknown>;
  const { id, name, schedule, agent_id, prompt, reply_channel = null, reply_chat_id = null } = body;
  await c.env.DB.prepare(
    'INSERT INTO cron_jobs (id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  ).bind(id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id).run();
  return c.json({ ok: true });
});

cronsRouter.get('/:id', async (c) => {
  const jobId = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(jobId).first();
  if (!row) return c.text('Not Found', 404);
  return c.json(row);
});

cronsRouter.patch('/:id', async (c) => {
  const jobId = c.req.param('id');
  const body = await c.req.json() as Record<string, unknown>;
  const allowed = ['name', 'schedule', 'prompt', 'reply_channel', 'reply_chat_id', 'enabled'] as const;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const key of allowed) {
    if (key in body) { sets.push(`${key} = ?`); vals.push(body[key]); }
  }
  if (sets.length === 0) return c.json({ ok: true });
  vals.push(jobId);
  await c.env.DB.prepare(`UPDATE cron_jobs SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

cronsRouter.delete('/:id', async (c) => {
  const jobId = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM cron_jobs WHERE id = ?').bind(jobId).run();
  return c.json({ ok: true });
});
