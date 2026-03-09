import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { encrypt } from '../../security/encryption.ts';
import { ensureEncryptionKey } from '../../security/bootstrap.ts';

type HonoEnv = { Bindings: Env };

export const connectorsRouter = new Hono<HonoEnv>();

connectorsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT provider, client_id, created_at, updated_at FROM oauth_provider_config ORDER BY provider'
  ).all();
  return c.json(results);
});

connectorsRouter.put('/:provider', async (c) => {
  const provider = c.req.param('provider');
  const { client_id, client_secret } = await c.req.json() as { client_id: string; client_secret: string };
  if (!client_id || !client_secret) return c.json({ error: 'client_id and client_secret required' }, 400);

  const encKey = await ensureEncryptionKey(c.env);
  const encryptedSecret = await encrypt(client_secret, encKey);
  await c.env.DB.prepare(
    `INSERT INTO oauth_provider_config (provider, client_id, encrypted_client_secret)
     VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET client_id = excluded.client_id,
       encrypted_client_secret = excluded.encrypted_client_secret, updated_at = unixepoch()`
  ).bind(provider, client_id, encryptedSecret).run();
  return c.json({ ok: true });
});

connectorsRouter.delete('/:provider', async (c) => {
  const provider = c.req.param('provider');
  await c.env.DB.prepare('DELETE FROM oauth_provider_config WHERE provider = ?').bind(provider).run();
  return c.json({ ok: true });
});
