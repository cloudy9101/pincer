import { Hono } from 'hono';
import type { Env } from '../../env.ts';

type HonoEnv = { Bindings: Env };

export const sessionsRouter = new Hono<HonoEnv>();

sessionsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM session_metadata ORDER BY last_activity DESC LIMIT 100'
  ).all();
  return c.json(results);
});

sessionsRouter.get('/:key/history', async (c) => {
  const sessionKey = c.req.param('key');
  const stub = c.env.CONVERSATION_DO.get(c.env.CONVERSATION_DO.idFromName(sessionKey));
  return c.json(await stub.getHistory());
});

sessionsRouter.post('/:key/reset', async (c) => {
  const sessionKey = c.req.param('key');
  const stub = c.env.CONVERSATION_DO.get(c.env.CONVERSATION_DO.idFromName(sessionKey));
  await stub.reset();
  return c.json({ ok: true });
});

sessionsRouter.post('/:key/compact', async (c) => {
  const sessionKey = c.req.param('key');
  const stub = c.env.CONVERSATION_DO.get(c.env.CONVERSATION_DO.idFromName(sessionKey));
  return c.json(await stub.compact());
});
