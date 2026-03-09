import { Hono } from 'hono';
import type { Env } from './env.ts';
import { ensureEncryptionKey } from './security/bootstrap.ts';
import { runCronJobs } from './cron/runner.ts';
import { webhookRouter } from './routes/webhook.ts';
import { mediaRouter } from './routes/media.ts';
import { oauthRouter } from './routes/oauth.ts';
import { adminApp } from './routes/admin/index.ts';

export { ConversationSqlDO } from './durables/conversation.ts';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  if (!c.env.ENCRYPTION_KEY) {
    (c.env as unknown as Record<string, unknown>).ENCRYPTION_KEY = await ensureEncryptionKey(c.env);
  }
  await next();
});

app.route('/webhook', webhookRouter);
app.route('/media', mediaRouter);
app.route('/', oauthRouter);
app.route('/admin', adminApp);

app.get('/', (c) => c.json({ status: 'ok', service: 'pincer-gateway' }));
app.get('/health', (c) => c.json({ status: 'ok', service: 'pincer-gateway' }));

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
    if (!env.ENCRYPTION_KEY) {
      (env as unknown as Record<string, unknown>).ENCRYPTION_KEY = await ensureEncryptionKey(env);
    }
    ctx.waitUntil(runCronJobs(env, controller.scheduledTime));
  },
};
