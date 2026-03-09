import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { getConfigValue, setConfigValue } from '../../config/loader.ts';
import { isBootstrapMode, resolveBotToken } from '../../security/bootstrap.ts';
import { listProviders } from '../../oauth/providers.ts';

type HonoEnv = { Bindings: Env };

export const statusRouter = new Hono<HonoEnv>();

statusRouter.get('/', async (c) => {
  const [agentCount, sessionCount, allowlistCount, setupCompleted] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM agents').first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM session_metadata').first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM allowlist').first(),
    getConfigValue(c.env.DB, c.env.CACHE, 'setup_completed'),
  ]);
  return c.json({
    status: 'ok',
    agents: agentCount?.cnt,
    sessions: sessionCount?.cnt,
    allowlistEntries: allowlistCount?.cnt,
    setupCompleted: setupCompleted === 'true',
    bootstrapMode: isBootstrapMode(c.env),
  });
});

export const setupRouter = new Hono<HonoEnv>();

setupRouter.get('/check', async (c) => {
  const botToken = await resolveBotToken(c.env);
  const { results: connectorRows } = await c.env.DB.prepare('SELECT provider FROM oauth_provider_config').all();
  const configuredProviders = connectorRows.map(r => r.provider as string);

  const [storedWebhookSecret, storedOwnerId] = await Promise.all([
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret'),
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_id'),
  ]);

  return c.json({
    secrets: {
      ADMIN_AUTH_TOKEN: !!c.env.ADMIN_AUTH_TOKEN,
      ENCRYPTION_KEY: !!(c.env.ENCRYPTION_KEY || await c.env.CACHE.get('__encryption_key')),
      TELEGRAM_BOT_TOKEN: !!botToken,
    },
    telegram: {
      webhookSecretConfigured: !!(storedWebhookSecret ?? c.env.TELEGRAM_WEBHOOK_SECRET),
      ownerId: storedOwnerId ?? '',
    },
    connectors: listProviders().map(id => ({
      id,
      configured: configuredProviders.includes(id) ||
        !!(c.env as unknown as Record<string, string>)[`${id.toUpperCase()}_OAUTH_CLIENT_ID`],
    })),
  });
});

setupRouter.post('/complete', async (c) => {
  await setConfigValue(c.env.DB, c.env.CACHE, 'setup_completed', 'true');
  return c.json({ ok: true });
});
