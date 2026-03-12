import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { resolveBotToken, resolveTGWebhookSecret, storeTGWebhookSecret } from '../../security/bootstrap.ts';
import { registerTelegramCommands, setupTelegram, getTelegramWebhookInfo } from '../../channels/telegram/commands.ts';

type HonoEnv = { Bindings: Env };

export const telegramRouter = new Hono<HonoEnv>();

telegramRouter.get('/webhook', async (c) => {
  const botToken = await resolveBotToken(c.env.CACHE);
  if (!botToken) return c.json({ ok: false, error: 'Bot token not configured' }, 400);
  const info = await getTelegramWebhookInfo(botToken);
  return c.json(info);
});

telegramRouter.post('/setup', async (c) => {
  const botToken = await resolveBotToken(c.env.CACHE);
  if (!botToken) return c.json({ error: 'Bot token not configured' }, 400);

  const origin = new URL(c.req.url).origin;
  let webhookSecret = await resolveTGWebhookSecret(c.env.CACHE);
  if (!webhookSecret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    webhookSecret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const result = await setupTelegram(origin, botToken, webhookSecret);
  if (result.webhook.ok) {
    await storeTGWebhookSecret(c.env.CACHE, webhookSecret);
  }
  return c.json(result);
});

telegramRouter.post('/commands', async (c) => {
  const botToken = await resolveBotToken(c.env.CACHE);
  if (!botToken) return c.json({ error: 'Bot token not configured' }, 400);
  const result = await registerTelegramCommands(botToken);
  return c.json(result);
});
