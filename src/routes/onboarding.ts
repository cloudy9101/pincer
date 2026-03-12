import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { getConfigValue, setConfigValue } from '../config/loader.ts';
import {
  resolveBotToken,
  storeBotToken,
  resolveTGWebhookSecret,
  storeTGWebhookSecret,
  createAdminSession,
  markOnboarded,
  isOnboarded,
} from '../security/bootstrap.ts';
import { verifyTelegramLogin } from '../security/telegram-login.ts';
import type { TelegramLoginData } from '../security/telegram-login.ts';
import { setupTelegram } from '../channels/telegram/commands.ts';
import { sendTelegramMessage } from '../channels/telegram/send.ts';
import { addToAllowlist } from '../security/allowlist.ts';

type HonoEnv = { Bindings: Env };

export const onboardingRouter = new Hono<HonoEnv>();

onboardingRouter.get('/status', async (c) => {
  const [botToken, botUsername, ownerUsername, onboarded] = await Promise.all([
    resolveBotToken(c.env.CACHE),
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_username'),
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_username'),
    isOnboarded(c.env.CACHE),
  ]);

  const workerDomain = new URL(c.req.url).hostname;

  return c.json({
    onboarded,
    hasBotToken: !!botToken,
    botUsername: botUsername ?? '',
    ownerUsername: ownerUsername ?? c.env.TELEGRAM_OWNER_USERNAME ?? '',
    workerDomain,
  });
});

onboardingRouter.post('/bot-token', async (c) => {
  const { token } = await c.req.json() as { token: string };
  if (!token?.trim()) return c.json({ error: 'Token is required' }, 400);

  const apiBase = (c.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org') + '/bot';
  const meResp = await fetch(`${apiBase}${token.trim()}/getMe`);
  if (!meResp.ok) return c.json({ error: 'Invalid bot token — getMe failed' }, 400);
  const meData = (await meResp.json()) as { ok: boolean; result?: { id: number; username: string } };
  if (!meData.ok || !meData.result) return c.json({ error: 'Invalid bot token' }, 400);

  await storeBotToken(c.env.CACHE, token.trim());
  await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_username', meData.result.username);
  await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_id', String(meData.result.id));

  // Register webhook in the background
  const origin = new URL(c.req.url).origin;
  c.executionCtx.waitUntil((async () => {
    try {
      let webhookSecret = await resolveTGWebhookSecret(c.env.CACHE);
      if (!webhookSecret) {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        webhookSecret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      }
      const result = await setupTelegram(origin, token.trim(), webhookSecret);
      if (result.webhook.ok) {
        await storeTGWebhookSecret(c.env.CACHE, webhookSecret);
      }
    } catch {
      // Best effort
    }
  })());

  return c.json({ ok: true, botUsername: meData.result.username });
});

onboardingRouter.post('/telegram-login', async (c) => {
  const loginData = await c.req.json() as TelegramLoginData;

  const botToken = await resolveBotToken(c.env.CACHE);
  if (!botToken) return c.json({ error: 'Bot token not configured' }, 400);

  // Enforce owner username restriction
  const expectedUsername = c.env.TELEGRAM_OWNER_USERNAME?.toLowerCase() ?? '';
  const loginUsername = (loginData.username ?? '').toLowerCase();
  if (expectedUsername && loginUsername !== expectedUsername) {
    return c.json({ error: `Login rejected: expected @${expectedUsername}` }, 403);
  }

  // Cryptographic verification
  const valid = await verifyTelegramLogin(loginData, botToken);
  if (!valid) return c.json({ error: 'Invalid Telegram login data' }, 401);

  // Create session and complete setup
  const sessionToken = await createAdminSession(c.env.CACHE, {
    telegramId: loginData.id,
    username: loginData.username,
  });

  await Promise.all([
    setConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_id', String(loginData.id)),
    setConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_username', loginData.username ?? ''),
    addToAllowlist(c.env.DB, 'telegram', String(loginData.id), loginData.first_name),
    markOnboarded(c.env.CACHE),
  ]);

  // Send welcome message in the background
  c.executionCtx.waitUntil(
    sendTelegramMessage(
      {
        channel: 'telegram',
        chatId: String(loginData.id),
        text: 'Welcome to Pincer! Your bot is set up and ready to go. Send /help to see available commands.',
      },
      botToken,
      c.env.TELEGRAM_API_BASE,
    ).catch(() => { /* best effort */ }),
  );

  return c.json({ ok: true, sessionToken });
});

// ─── Test/dev helpers (only available when MOCK_AI_RESPONSE is set) ──────────

onboardingRouter.post('/dev-seed', async (c) => {
  if (!c.env.MOCK_AI_RESPONSE) return c.json({ error: 'Not available' }, 403);
  const sessionToken = 'test-admin-token-000';
  await Promise.all([
    c.env.CACHE.put('__onboarded', 'true'),
    c.env.CACHE.put('__telegram_bot_token', 'test_bot_token'),
    c.env.CACHE.put('__telegram_webhook_secret', 'test-webhook-secret'),
    c.env.CACHE.put(`session:${sessionToken}`, JSON.stringify({ created: Date.now(), dev: true }), {
      expirationTtl: 60 * 60,
    }),
  ]);
  return c.json({ ok: true, sessionToken });
});

onboardingRouter.post('/dev-reset', async (c) => {
  if (!c.env.MOCK_AI_RESPONSE) return c.json({ error: 'Not available' }, 403);
  await Promise.all([
    c.env.CACHE.delete('__onboarded'),
    c.env.CACHE.delete('__telegram_bot_token'),
    c.env.CACHE.delete('__telegram_webhook_secret'),
    c.env.CACHE.delete('session:test-admin-token-000'),
  ]);
  return c.json({ ok: true });
});
