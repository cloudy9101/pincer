import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { verifyTelegramWebhook } from '../security/webhook-verify.ts';
import { parseTelegramWebhook } from '../channels/telegram/webhook.ts';
import { sendTelegramMessage, sendTelegramChatAction } from '../channels/telegram/send.ts';
import { resolveRoute } from '../routing/resolve-route.ts';
import { buildSessionKeyFromMessage } from '../routing/session-key.ts';
import { isAllowed, checkAllowlistEmpty, addToAllowlist, createPairingCode } from '../security/allowlist.ts';
import { checkRateLimit } from '../security/rate-limit.ts';
import { getAgent, getConfigValue } from '../config/loader.ts';
import { getCanonicalId } from '../routing/identity-links.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { log } from '../utils/logger.ts';
import { ensureCommandsRegistered } from '../channels/telegram/commands.ts';
import type { IncomingMessage } from '../channels/types.ts';
import { downloadTelegramFile } from '../channels/telegram/files.ts';
import type { InlineImage } from '../durables/conversation.ts';
import { resolveBotToken, resolveTGWebhookSecret } from '../security/bootstrap.ts';

type HonoEnv = { Bindings: Env };

export const webhookRouter = new Hono<HonoEnv>();

webhookRouter.post('/telegram', async (c) => {
  const { req, env } = c;
  const traceId = crypto.randomUUID();
  try {
    const botToken = await resolveBotToken(env.CACHE);
    if (!botToken) {
      log('error', 'Bot token not configured', {}, { traceId, handler: 'telegram' });
      return c.text('Bot not configured', 500);
    }

    const webhookSecret = await resolveTGWebhookSecret(env.CACHE) ?? '';
    if (!webhookSecret || !await verifyTelegramWebhook(req.raw, webhookSecret)) {
      return c.text('Unauthorized', 401);
    }

    const body = await req.json();
    const msg = parseTelegramWebhook(body as import('../channels/telegram/types.ts').TelegramUpdate);
    if (!msg) {
      return c.text('OK');
    }

    log('info', 'Webhook received', { method: req.method, path: req.path }, { traceId, handler: 'telegram' });

    c.executionCtx.waitUntil(ensureCommandsRegistered(env.CACHE, botToken));
    c.executionCtx.waitUntil(processTelegramMessage(msg, env, botToken, traceId));
    return c.text('OK');
  } catch (error) {
    log('error', 'Telegram webhook error', { error: String(error) }, { traceId, handler: 'telegram' });
    return c.text('', 200);
  }
});

async function processTelegramMessage(msg: IncomingMessage, env: Env, botToken: string, traceId: string): Promise<void> {
  try {
    const isCommand = msg.text.startsWith('/');

    if (!isCommand) {
      const allowlistEmpty = await checkAllowlistEmpty(env.DB);
      const senderAllowed = !allowlistEmpty && await isAllowed(env.DB, msg.channel, msg.senderId);

      const ownerId = await getConfigValue(env.DB, env.CACHE, 'telegram_owner_id');
      const isOwner = ownerId
        ? msg.senderId === ownerId
        : allowlistEmpty;

      if (!senderAllowed && !isOwner) {
        const code = await createPairingCode(env.DB, msg.channel, msg.senderId, msg.senderName);
        await sendTelegramMessage(
          {
            channel: 'telegram',
            chatId: msg.chatId,
            text: `You're not on the allowlist. Your pairing code is: ${code}\nAsk the owner to approve it.`,
            replyToMessageId: msg.channelMessageId,
          },
          botToken,
          env.TELEGRAM_API_BASE,
        );
        return;
      }

      if (!senderAllowed && isOwner) {
        await addToAllowlist(env.DB, msg.channel, msg.senderId, msg.senderName);
      }

      const rateCheck = await checkRateLimit(env.CACHE, msg.channel, msg.senderId);
      if (!rateCheck.allowed) {
        await sendTelegramMessage(
          {
            channel: 'telegram',
            chatId: msg.chatId,
            text: 'You are being rate limited. Please wait a moment.',
            replyToMessageId: msg.channelMessageId,
          },
          botToken,
          env.TELEGRAM_API_BASE,
        );
        return;
      }

      await sendTelegramChatAction(msg.chatId, 'typing', botToken, env.TELEGRAM_API_BASE);
    }

    const route = await resolveRoute(env.DB, msg);
    const agent = await getAgent(env.DB, env.CACHE, route.agentId);
    if (!agent) {
      log('error', 'Agent not found', { agentId: route.agentId });
      return;
    }

    const sessionKey = buildSessionKeyFromMessage(msg, route.agentId, route.accountId);
    const userId = await getCanonicalId(env.DB, msg.channel, msg.senderId);

    const doId = env.CONVERSATION_DO.idFromName(sessionKey);
    const stub = env.CONVERSATION_DO.get(doId);

    log('info', 'DO dispatch', { sessionKey }, { traceId, handler: 'do-dispatch' });

    let messageText = msg.text;
    const images: InlineImage[] = [];

    if (msg.mediaAttachments && msg.mediaAttachments.length > 0) {
      for (const attachment of msg.mediaAttachments) {
        if (attachment.type === 'image') {
          const file = await downloadTelegramFile(attachment.fileId, botToken, attachment.mimeType);
          if (file) {
            const base64 = arrayBufferToBase64(file.data);
            images.push({ data: base64, mimeType: file.mimeType });
          }
        } else if (attachment.type === 'audio') {
          const file = await downloadTelegramFile(attachment.fileId, botToken, attachment.mimeType);
          if (file) {
            try {
              const audioBytes = new Uint8Array(file.data);
              const result = await env.AI.run(
                '@cf/openai/whisper-large-v3-turbo' as Parameters<typeof env.AI.run>[0],
                { audio: [...audioBytes] },
              ) as { text?: string };
              if (result.text?.trim()) {
                const prefix = messageText ? '\n' : '';
                messageText = messageText + prefix + `[Voice message]: ${result.text.trim()}`;
              }
            } catch (e) {
              log('warn', 'Whisper transcription failed', { error: String(e) });
              const prefix = messageText ? '\n' : '';
              messageText = messageText + prefix + '[Voice message: transcription unavailable]';
            }
          }
        }
      }
    }

    await stub.message({
      text: messageText,
      sessionKey,
      agentId: route.agentId,
      userId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      model: agent.model,
      systemPrompt: agent.systemPrompt ?? DEFAULTS.systemPrompt,
      thinkingLevel: agent.thinkingLevel ?? DEFAULTS.thinkingLevel,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      replyTo: {
        channel: msg.channel,
        chatId: msg.chatId,
        chatType: msg.chatType,
        channelMessageId: msg.channelMessageId,
      },
      images: images.length > 0 ? images : undefined,
    });
  } catch (error) {
    log('error', 'Error processing message', { error: String(error), senderId: msg.senderId }, { traceId, handler: 'telegram' });
    try {
      await sendTelegramMessage(
        {
          channel: 'telegram',
          chatId: msg.chatId,
          text: 'An error occurred. Please try again.',
        },
        botToken,
        env.TELEGRAM_API_BASE,
      );
    } catch {
      // Best effort
    }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
