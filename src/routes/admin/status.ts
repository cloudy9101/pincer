import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { resolveBotToken, isOnboarded } from '../../security/bootstrap.ts';
import { listProviders } from '../../oauth/providers.ts';
import { getConfigValue } from '../../config/loader.ts';

type HonoEnv = { Bindings: Env };

export const statusRouter = new Hono<HonoEnv>();

statusRouter.get('/', async (c) => {
  const [agentCount, sessionCount, allowlistCount, onboarded] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM agents').first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM session_metadata').first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM allowlist').first(),
    isOnboarded(c.env.CACHE),
  ]);
  return c.json({
    status: 'ok',
    agents: agentCount?.cnt,
    sessions: sessionCount?.cnt,
    allowlistEntries: allowlistCount?.cnt,
    onboarded,
  });
});

export const setupRouter = new Hono<HonoEnv>();

setupRouter.get('/check', async (c) => {
  const botToken = await resolveBotToken(c.env.CACHE);
  const { results: connectorRows } = await c.env.DB.prepare('SELECT provider FROM oauth_provider_config').all();
  const configuredProviders = connectorRows.map(r => r.provider as string);

  const storedOwnerId = await getConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_id');

  return c.json({
    secrets: {
      TELEGRAM_BOT_TOKEN: !!botToken,
      ENCRYPTION_KEY: !!(await c.env.CACHE.get('__encryption_key')),
    },
    telegram: {
      ownerId: storedOwnerId ?? '',
    },
    connectors: listProviders().map(id => ({
      id,
      configured: configuredProviders.includes(id) ||
        !!(c.env as unknown as Record<string, string>)[`${id.toUpperCase()}_OAUTH_CLIENT_ID`],
    })),
  });
});
