import { Hono } from 'hono';
import type { Env } from '../../env.ts';

type HonoEnv = { Bindings: Env };

export const bindingsRouter = new Hono<HonoEnv>();

bindingsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM bindings ORDER BY priority DESC').all();
  return c.json(results);
});

bindingsRouter.post('/', async (c) => {
  const b = await c.req.json() as {
    channel: string;
    agent_id: string;
    account_id?: string;
    peer_kind?: string;
    peer_id?: string;
    guild_id?: string;
    team_id?: string;
    priority?: number;
  };
  await c.env.DB.prepare(
    'INSERT INTO bindings (channel, account_id, peer_kind, peer_id, guild_id, team_id, agent_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    b.channel, b.account_id ?? null, b.peer_kind ?? null, b.peer_id ?? null,
    b.guild_id ?? null, b.team_id ?? null, b.agent_id, b.priority ?? 0
  ).run();
  return c.json({ ok: true });
});

bindingsRouter.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM bindings WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
