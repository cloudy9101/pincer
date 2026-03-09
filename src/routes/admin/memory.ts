import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { deleteMemory } from '../../memory/store.ts';

type HonoEnv = { Bindings: Env };

export const memoryRouter = new Hono<HonoEnv>();

memoryRouter.get('/stats', async (c) => {
  const total = await c.env.DB.prepare(
    'SELECT scope, COUNT(*) as count FROM memory_entries WHERE superseded_by IS NULL GROUP BY scope'
  ).all();
  const superseded = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM memory_entries WHERE superseded_by IS NOT NULL'
  ).first();
  return c.json({ active: total.results, superseded: (superseded?.count as number) ?? 0 });
});

memoryRouter.get('/', async (c) => {
  const scope = c.req.query('scope');
  const scopeId = c.req.query('scope_id');
  const limit = parseInt(c.req.query('limit') ?? '50');

  let query = 'SELECT * FROM memory_entries WHERE superseded_by IS NULL';
  const binds: unknown[] = [];

  if (scope) {
    query += ' AND scope = ?';
    binds.push(scope);
  }
  if (scopeId) {
    query += ' AND scope_id = ?';
    binds.push(scopeId);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  binds.push(limit);

  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});

memoryRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM memory_entries WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

memoryRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await deleteMemory(c.env, id);
  return c.json({ ok: deleted });
});
