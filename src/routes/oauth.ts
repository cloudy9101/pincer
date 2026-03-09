import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { handleConnect, handleCallback } from '../oauth/flow.ts';

type HonoEnv = { Bindings: Env };

export const oauthRouter = new Hono<HonoEnv>();

oauthRouter.get('/connect/:provider', async (c) => {
  return handleConnect(c.req.raw, c.env);
});

oauthRouter.get('/callback/:provider', async (c) => {
  return handleCallback(c.req.raw, c.env);
});
