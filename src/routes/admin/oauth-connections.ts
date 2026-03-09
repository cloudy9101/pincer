import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { revokeConnection } from '../../oauth/tokens.ts';

type HonoEnv = { Bindings: Env };

export const oauthConnectionsRouter = new Hono<HonoEnv>();

oauthConnectionsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, user_id, provider, scopes, provider_user_id, provider_email, created_at, updated_at FROM oauth_connections ORDER BY created_at DESC'
  ).all();
  return c.json(results);
});

oauthConnectionsRouter.delete('/:id', async (c) => {
  const connectionId = c.req.param('id');
  const removed = await revokeConnection(c.env, connectionId);
  return c.json({ ok: removed });
});
