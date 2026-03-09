import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { setConfigValue } from '../../config/loader.ts';

type HonoEnv = { Bindings: Env };

export const configRouter = new Hono<HonoEnv>();

configRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM config ORDER BY key').all();
  return c.json(results);
});

configRouter.patch('/', async (c) => {
  const updates = await c.req.json() as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    await setConfigValue(c.env.DB, c.env.CACHE, key, value);
  }
  return c.json({ ok: true });
});

export const usageRouter = new Hono<HonoEnv>();

usageRouter.get('/', async (c) => {
  const days = parseInt(c.req.query('days') ?? '7');
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const { results } = await c.env.DB.prepare(
    'SELECT provider, model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as call_count FROM usage_log WHERE created_at > ? GROUP BY provider, model'
  ).bind(since).all();

  return c.json({ days, usage: results });
});
