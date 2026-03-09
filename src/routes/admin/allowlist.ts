import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { isAllowed, addToAllowlist, approvePairingCode, getAllowlist, removeFromAllowlist } from '../../security/allowlist.ts';

type HonoEnv = { Bindings: Env };

export const allowlistRouter = new Hono<HonoEnv>();

allowlistRouter.get('/', async (c) => {
  const entries = await getAllowlist(c.env.DB);
  return c.json(entries);
});

allowlistRouter.post('/', async (c) => {
  const { channel, sender_id, display_name } = await c.req.json() as {
    channel: string;
    sender_id: string;
    display_name?: string;
  };
  await addToAllowlist(c.env.DB, channel, sender_id, display_name);
  return c.json({ ok: true });
});

allowlistRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const removed = await removeFromAllowlist(c.env.DB, id);
  return c.json({ ok: removed });
});

export const pairingRouter = new Hono<HonoEnv>();

pairingRouter.post('/:code/ok', async (c) => {
  const code = c.req.param('code');
  const result = await approvePairingCode(c.env.DB, code);
  if (!result) return c.json({ error: 'Invalid or expired code' }, 400);
  return c.json({ ok: true, entry: result });
});

// Re-export isAllowed for any internal use
export { isAllowed };
