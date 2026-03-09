import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { verifyAdminAuth } from '../../security/admin-auth.ts';
import { log } from '../../utils/logger.ts';
import { agentsRouter } from './agents.ts';
import { allowlistRouter, pairingRouter } from './allowlist.ts';
import { bindingsRouter } from './bindings.ts';
import { sessionsRouter } from './sessions.ts';
import { configRouter, usageRouter } from './config.ts';
import { memoryRouter } from './memory.ts';
import { skillsRouter } from './skills.ts';
import { mcpRouter } from './mcp.ts';
import { oauthConnectionsRouter } from './oauth-connections.ts';
import { cronsRouter } from './crons.ts';
import { telegramRouter, onboardingRouter } from './telegram.ts';
import { connectorsRouter } from './connectors.ts';
import { statusRouter, setupRouter } from './status.ts';

type HonoEnv = { Bindings: Env };

export const adminApp = new Hono<HonoEnv>();

adminApp.use('*', async (c, next) => {
  if (!await verifyAdminAuth(c.req.raw, c.env)) {
    return c.text('Unauthorized', 401);
  }
  await next();
});

adminApp.onError((err, c) => {
  log('error', 'Admin route error', { error: String(err), path: c.req.path });
  return c.json({ error: String(err) }, 500);
});

adminApp.route('/status', statusRouter);
adminApp.route('/agents', agentsRouter);
adminApp.route('/allowlist', allowlistRouter);
adminApp.route('/pairing', pairingRouter);
adminApp.route('/bindings', bindingsRouter);
adminApp.route('/sessions', sessionsRouter);
adminApp.route('/config', configRouter);
adminApp.route('/usage', usageRouter);
adminApp.route('/memories', memoryRouter);
adminApp.route('/skills', skillsRouter);
adminApp.route('/mcp', mcpRouter);
adminApp.route('/oauth', oauthConnectionsRouter);
adminApp.route('/crons', cronsRouter);
adminApp.route('/telegram', telegramRouter);
adminApp.route('/onboarding', onboardingRouter);
adminApp.route('/connectors', connectorsRouter);
adminApp.route('/setup', setupRouter);
