import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { getConfigValue, setConfigValue } from '../../config/loader.ts';
import { resolveBotToken, ensureEncryptionKey, storeBotToken, createAdminSession } from '../../security/bootstrap.ts';
import { verifyTelegramLogin } from '../../security/telegram-login.ts';
import type { TelegramLoginData } from '../../security/telegram-login.ts';
import { registerTelegramCommands, setupTelegram, getTelegramWebhookInfo } from '../../channels/telegram/commands.ts';
import { sendTelegramMessage } from '../../channels/telegram/send.ts';
import { addToAllowlist } from '../../security/allowlist.ts';
import { encrypt } from '../../security/encryption.ts';

type HonoEnv = { Bindings: Env };

export const telegramRouter = new Hono<HonoEnv>();

telegramRouter.get('/webhook', async (c) => {
  const botToken = await resolveBotToken(c.env);
  if (!botToken) return c.json({ ok: false, error: 'Bot token not configured' }, 400);
  const info = await getTelegramWebhookInfo(botToken, c.env.TELEGRAM_API_BASE);
  return c.json(info);
});

telegramRouter.post('/setup', async (c) => {
  const botToken = await resolveBotToken(c.env);
  if (!botToken) return c.json({ error: 'Bot token not configured' }, 400);
  const origin = new URL(c.req.url).origin;
  let webhookSecret = await getConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret') ?? c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    webhookSecret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const result = await setupTelegram(origin, botToken, webhookSecret, c.env.TELEGRAM_API_BASE);
  if (result.webhook.ok) {
    await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret', webhookSecret);
  }
  return c.json(result);
});

telegramRouter.post('/commands', async (c) => {
  const botToken = await resolveBotToken(c.env);
  if (!botToken) return c.json({ error: 'Bot token not configured' }, 400);
  const result = await registerTelegramCommands(botToken, c.env.TELEGRAM_API_BASE);
  return c.json(result);
});

export const onboardingRouter = new Hono<HonoEnv>();

onboardingRouter.get('/status', async (c) => {
  const botToken = await resolveBotToken(c.env);
  const [storedBotUsername, storedOwnerId, setupCompleted, ownerUsername, telegramLoginDone] = await Promise.all([
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_username'),
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_id'),
    getConfigValue(c.env.DB, c.env.CACHE, 'setup_completed'),
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_username'),
    getConfigValue(c.env.DB, c.env.CACHE, 'telegram_login_done'),
  ]);
  const [agents, pendingLogin] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM agents').first(),
    c.env.CACHE.get('__pending_tg_login'),
  ]);

  return c.json({
    ownerUsername: ownerUsername ?? '',
    hasBotToken: !!botToken,
    botUsername: storedBotUsername ?? '',
    workerDomain: new URL(c.req.url).hostname,
    telegramLoginDone: telegramLoginDone === 'true',
    telegramLoginPending: !!pendingLogin,
    hasAgent: (agents?.cnt as number) > 0,
    setupCompleted: setupCompleted === 'true',
  });
});

onboardingRouter.post('/bot-token', async (c) => {
  const { token } = await c.req.json() as { token: string };
  if (!token?.trim()) return c.json({ error: 'Token is required' }, 400);

  const apiBase = (c.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org') + '/bot';
  const meResp = await fetch(`${apiBase}${token.trim()}/getMe`);
  if (!meResp.ok) return c.json({ error: 'Invalid bot token — getMe failed' }, 400);
  const meData = (await meResp.json()) as { ok: boolean; result?: { id: number; username: string; first_name: string } };
  if (!meData.ok || !meData.result) return c.json({ error: 'Invalid bot token' }, 400);

  await storeBotToken(c.env.CACHE, token.trim());

  const encKey = await ensureEncryptionKey(c.env);
  const encryptedToken = await encrypt(token.trim(), encKey);
  const b64 = btoa(String.fromCharCode(...encryptedToken));
  await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_token_enc', b64);

  await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_username', meData.result.username);
  await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_bot_id', String(meData.result.id));

  let sessionToken: string | undefined;
  let webhookOk = false;
  let welcomeSent = false;

  const pendingLoginRaw = await c.env.CACHE.get('__pending_tg_login');
  if (pendingLoginRaw) {
    try {
      const pendingLogin = JSON.parse(pendingLoginRaw) as TelegramLoginData;

      const valid = await verifyTelegramLogin(pendingLogin, token.trim());
      if (valid) {
        sessionToken = await createAdminSession(c.env.CACHE, {
          telegramId: pendingLogin.id,
          username: pendingLogin.username,
        });

        await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_id', String(pendingLogin.id));
        await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_username', pendingLogin.username ?? '');
        await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_login_done', 'true');

        await addToAllowlist(c.env.DB, 'telegram', String(pendingLogin.id), pendingLogin.first_name);

        await c.env.CACHE.delete('__pending_tg_login');

        const origin = new URL(c.req.url).origin;
        let webhookSecret = await getConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret') ?? c.env.TELEGRAM_WEBHOOK_SECRET;
        if (!webhookSecret) {
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          webhookSecret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
        }
        const setupResult = await setupTelegram(origin, token.trim(), webhookSecret, c.env.TELEGRAM_API_BASE);
        if (setupResult.webhook.ok) {
          await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret', webhookSecret);
          webhookOk = true;
        }

        try {
          await sendTelegramMessage(
            {
              channel: 'telegram',
              chatId: String(pendingLogin.id),
              text: 'Welcome to Pincer! Your bot is set up and ready to go. Send /help to see available commands.',
            },
            token.trim(),
            c.env.TELEGRAM_API_BASE,
          );
          welcomeSent = true;
        } catch {
          // Best effort
        }

        await setConfigValue(c.env.DB, c.env.CACHE, 'setup_completed', 'true');
      }
    } catch {
      // If pending-login processing fails, token was still stored — caller can retry login
    }
  }

  return c.json({
    ok: true,
    botUsername: meData.result.username,
    botId: meData.result.id,
    ...(sessionToken ? { sessionToken } : {}),
    webhookOk,
    welcomeSent,
    setupCompleted: !!sessionToken,
  });
});

onboardingRouter.post('/telegram-login', async (c) => {
  const loginData = await c.req.json() as TelegramLoginData;

  const botToken = await resolveBotToken(c.env);

  const expectedUsername = c.env.TELEGRAM_OWNER_USERNAME?.toLowerCase() ?? '';
  const loginUsername = (loginData.username ?? '').toLowerCase();
  if (expectedUsername && loginUsername !== expectedUsername) {
    return c.json({ error: `Login rejected: expected @${expectedUsername}` }, 403);
  }

  if (botToken) {
    const valid = await verifyTelegramLogin(loginData, botToken);
    if (!valid) return c.json({ error: 'Invalid Telegram login data' }, 401);

    const sessionToken = await createAdminSession(c.env.CACHE, {
      telegramId: loginData.id,
      username: loginData.username,
    });

    await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_id', String(loginData.id));
    await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_owner_username', loginData.username ?? '');
    await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_login_done', 'true');
    await addToAllowlist(c.env.DB, 'telegram', String(loginData.id), loginData.first_name);

    const alreadyDone = await getConfigValue(c.env.DB, c.env.CACHE, 'setup_completed');
    if (alreadyDone !== 'true') {
      const origin = new URL(c.req.url).origin;
      let webhookSecret = await getConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret') ?? c.env.TELEGRAM_WEBHOOK_SECRET;
      if (!webhookSecret) {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        webhookSecret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      }
      const setupResult = await setupTelegram(origin, botToken, webhookSecret, c.env.TELEGRAM_API_BASE);
      if (setupResult.webhook.ok) {
        await setConfigValue(c.env.DB, c.env.CACHE, 'telegram_webhook_secret', webhookSecret);
      }
      try {
        await sendTelegramMessage(
          {
            channel: 'telegram',
            chatId: String(loginData.id),
            text: 'Welcome to Pincer! Your bot is set up and ready to go. Send /help to see available commands.',
          },
          botToken,
          c.env.TELEGRAM_API_BASE,
        );
      } catch {
        // Best effort
      }
      await setConfigValue(c.env.DB, c.env.CACHE, 'setup_completed', 'true');
    }

    return c.json({ ok: true, sessionToken, username: loginData.username });
  }

  await c.env.CACHE.put('__pending_tg_login', JSON.stringify(loginData), { expirationTtl: 60 * 60 * 2 });

  return c.json({ ok: true, pending: true, username: loginData.username });
});
