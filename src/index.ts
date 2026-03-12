import { Hono } from 'hono';
import type { Env } from './env.ts';
import { runCronJobs } from './cron/runner.ts';
import { webhookRouter } from './routes/webhook.ts';
import { mediaRouter } from './routes/media.ts';
import { oauthRouter } from './routes/oauth.ts';
import { adminApp } from './routes/admin/index.ts';
import { onboardingRouter } from './routes/onboarding.ts';
import { isOnboarded } from './security/bootstrap.ts';

export { ConversationSqlDO } from './durables/conversation.ts';

const app = new Hono<{ Bindings: Env }>();

// Onboarded gate — redirect to setup wizard until onboarding is complete.
// Exempt: /onboarding/*, /health, /webhook/* (bot must still receive messages).
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const exempt =
    path === '/health' ||
    path.startsWith('/webhook/') ||
    path.startsWith('/onboarding/') ||
    path === '/onboarding' ||
    path === '/dashboard/setup';

  if (!exempt && !(await isOnboarded(c.env.CACHE))) {
    return c.redirect('/dashboard/setup', 302);
  }
  await next();
});

app.get('/', (c) => c.json({ status: 'ok', service: 'pincer-gateway' }));
app.get('/health', (c) => c.json({ status: 'ok', service: 'pincer-gateway' }));

app.route('/onboarding', onboardingRouter);
app.route('/webhook', webhookRouter);
app.route('/media', mediaRouter);
app.route('/oauth', oauthRouter);
app.route('/admin', adminApp);

app.get('/dashboard', (c) => c.env.ASSETS.fetch(c.req.raw));
app.get('/dashboard/*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    return c.env.ASSETS.fetch(new Request(new URL('/dashboard/index.html', c.req.url).href));
  }
  return res;
});

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronJobs(env, controller.scheduledTime));
  },
};
