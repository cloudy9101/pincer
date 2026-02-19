import type { Env } from './env.ts';
import { verifyTelegramWebhook, verifyDiscordWebhook } from './security/webhook-verify.ts';
import { parseTelegramWebhook } from './channels/telegram/webhook.ts';
import { sendTelegramMessage, sendTelegramChatAction } from './channels/telegram/send.ts';
import { parseDiscordInteraction } from './channels/discord/webhook.ts';
import { editDiscordInteractionResponse } from './channels/discord/send.ts';
import { registerDiscordCommands } from './channels/discord/commands.ts';
import { InteractionType, InteractionCallbackType, type DiscordInteraction } from './channels/discord/types.ts';
import { resolveRoute } from './routing/resolve-route.ts';
import { buildSessionKeyFromMessage } from './routing/session-key.ts';
import { isAllowed, checkAllowlistEmpty, addToAllowlist, createPairingCode, approvePairingCode, getAllowlist, removeFromAllowlist } from './security/allowlist.ts';
import { checkRateLimit } from './security/rate-limit.ts';
import { verifyAdminAuth } from './security/admin-auth.ts';
import { getAgent, setConfigValue } from './config/loader.ts';
import { getMedia } from './media/store.ts';
import { getCanonicalId } from './routing/identity-links.ts';
import { deleteMemory } from './memory/store.ts';
import { DEFAULTS } from './config/defaults.ts';
import { log } from './utils/logger.ts';
import { installSkill, removeSkill, updateSkillSecrets, listSkillSecretKeys } from './skills/installer.ts';
import type { IncomingMessage } from './channels/types.ts';

export { ConversationSqlDO } from './durables/conversation.ts';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Webhook routes
      if (path === '/webhook/telegram' && request.method === 'POST') {
        return handleTelegramWebhook(request, env, ctx);
      }
      if (path === '/webhook/discord' && request.method === 'POST') {
        return handleDiscordWebhook(request, env, ctx);
      }

      // Media serving
      if (path.startsWith('/media/') && request.method === 'GET') {
        return handleMediaServe(path, env);
      }

      // Admin routes
      if (path.startsWith('/admin/')) {
        if (!verifyAdminAuth(request, env.ADMIN_AUTH_TOKEN)) {
          return new Response('Unauthorized', { status: 401 });
        }
        return handleAdminRoute(request, path, env);
      }

      // Health check
      if (path === '/' || path === '/health') {
        return json({ status: 'ok', service: 'pincer-gateway' });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      log('error', 'Unhandled error', { error: String(error), path });
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

// ─── Telegram Webhook ────────────────────────────────────────

async function handleTelegramWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Verify webhook signature
  if (!await verifyTelegramWebhook(request, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();
  const msg = parseTelegramWebhook(body as import('./channels/telegram/types.ts').TelegramUpdate);
  if (!msg) {
    return new Response('OK'); // Not a message we handle
  }

  // Handle in background so we can return 200 immediately
  ctx.waitUntil(processTelegramMessage(msg, env));
  return new Response('OK');
}

async function processTelegramMessage(msg: IncomingMessage, env: Env): Promise<void> {
  try {
    // Commands skip allowlist/rate-limit checks
    const isCommand = msg.text.startsWith('/');

    if (!isCommand) {
      // Check allowlist
      const allowlistEmpty = await checkAllowlistEmpty(env.DB);
      const allowed = allowlistEmpty || await isAllowed(env.DB, msg.channel, msg.senderId);

      if (!allowed) {
        const code = await createPairingCode(env.DB, msg.channel, msg.senderId, msg.senderName);
        await sendTelegramMessage(
          {
            channel: 'telegram',
            chatId: msg.chatId,
            text: `You're not on the allowlist. Your pairing code is: ${code}\nAsk the owner to approve it.`,
            replyToMessageId: msg.channelMessageId,
          },
          env.TELEGRAM_BOT_TOKEN
        );
        return;
      }

      // Auto-add first user if allowlist is empty
      if (allowlistEmpty) {
        await addToAllowlist(env.DB, msg.channel, msg.senderId, msg.senderName);
      }

      // Rate limit
      const rateCheck = await checkRateLimit(env.CACHE, msg.channel, msg.senderId);
      if (!rateCheck.allowed) {
        await sendTelegramMessage(
          {
            channel: 'telegram',
            chatId: msg.chatId,
            text: 'You are being rate limited. Please wait a moment.',
            replyToMessageId: msg.channelMessageId,
          },
          env.TELEGRAM_BOT_TOKEN
        );
        return;
      }

      // Send typing indicator
      await sendTelegramChatAction(msg.chatId, 'typing', env.TELEGRAM_BOT_TOKEN);
    }

    // Resolve route
    const route = await resolveRoute(env.DB, msg);
    const agent = await getAgent(env.DB, env.CACHE, route.agentId);
    if (!agent) {
      log('error', 'Agent not found', { agentId: route.agentId });
      return;
    }

    // Build session key
    const sessionKey = buildSessionKeyFromMessage(msg, route.agentId, route.accountId);
    const userId = await getCanonicalId(env.DB, msg.channel, msg.senderId);

    // Route to ConversationDO — handles both commands and regular messages
    const doId = env.CONVERSATION_DO.idFromName(sessionKey);
    const stub = env.CONVERSATION_DO.get(doId);

    const result = await stub.message({
      text: msg.text,
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
    });

    // DO sent the reply directly — fallback if it failed
    if (!result.sent && result.text) {
      await sendTelegramMessage(
        {
          channel: 'telegram',
          chatId: msg.chatId,
          text: result.text,
          replyToMessageId: msg.chatType === 'group' ? msg.channelMessageId : undefined,
        },
        env.TELEGRAM_BOT_TOKEN
      );
    }
  } catch (error) {
    log('error', 'Error processing message', { error: String(error), senderId: msg.senderId });
    try {
      await sendTelegramMessage(
        {
          channel: 'telegram',
          chatId: msg.chatId,
          text: 'An error occurred. Please try again.',
        },
        env.TELEGRAM_BOT_TOKEN
      );
    } catch {
      // Best effort
    }
  }
}

// ─── Discord Webhook ─────────────────────────────────────────

async function handleDiscordWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Verify Ed25519 signature
  if (!await verifyDiscordWebhook(request, env.DISCORD_PUBLIC_KEY)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const body = (await request.json()) as DiscordInteraction;

  // Handle PING (used by Discord to verify the endpoint)
  if (body.type === InteractionType.PING) {
    return json({ type: InteractionCallbackType.PONG });
  }

  // Only handle APPLICATION_COMMAND
  if (body.type !== InteractionType.APPLICATION_COMMAND) {
    return new Response('Unhandled interaction type', { status: 400 });
  }

  // Defer the response immediately (shows "thinking...")
  // Then process in the background
  ctx.waitUntil(processDiscordInteraction(body, env));

  return json({ type: InteractionCallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
}

async function processDiscordInteraction(interaction: DiscordInteraction, env: Env): Promise<void> {
  const msg = parseDiscordInteraction(interaction);
  if (!msg) {
    await editDiscordInteractionResponse(
      env.DISCORD_APP_ID, interaction.token, 'Could not parse that interaction.', env.DISCORD_BOT_TOKEN,
    );
    return;
  }

  try {
    // Commands skip allowlist/rate-limit checks
    const isCommand = msg.text.startsWith('/');

    if (!isCommand) {
      // Check allowlist
      const allowlistEmpty = await checkAllowlistEmpty(env.DB);
      const allowed = allowlistEmpty || await isAllowed(env.DB, msg.channel, msg.senderId);

      if (!allowed) {
        const code = await createPairingCode(env.DB, msg.channel, msg.senderId, msg.senderName);
        await editDiscordInteractionResponse(
          env.DISCORD_APP_ID, interaction.token,
          `You're not on the allowlist. Your pairing code is: ${code}\nAsk the owner to approve it.`,
          env.DISCORD_BOT_TOKEN,
        );
        return;
      }

      // Auto-add first user if allowlist is empty
      if (allowlistEmpty) {
        await addToAllowlist(env.DB, msg.channel, msg.senderId, msg.senderName);
      }

      // Rate limit
      const rateCheck = await checkRateLimit(env.CACHE, msg.channel, msg.senderId);
      if (!rateCheck.allowed) {
        await editDiscordInteractionResponse(
          env.DISCORD_APP_ID, interaction.token,
          'You are being rate limited. Please wait a moment.',
          env.DISCORD_BOT_TOKEN,
        );
        return;
      }
    }

    // Resolve route
    const route = await resolveRoute(env.DB, msg);
    const agent = await getAgent(env.DB, env.CACHE, route.agentId);
    if (!agent) {
      log('error', 'Agent not found', { agentId: route.agentId });
      await editDiscordInteractionResponse(
        env.DISCORD_APP_ID, interaction.token, 'Agent not found.', env.DISCORD_BOT_TOKEN,
      );
      return;
    }

    // Build session key
    const sessionKey = buildSessionKeyFromMessage(msg, route.agentId, route.accountId);
    const userId = await getCanonicalId(env.DB, msg.channel, msg.senderId);

    // Route to ConversationDO
    const doId = env.CONVERSATION_DO.idFromName(sessionKey);
    const stub = env.CONVERSATION_DO.get(doId);

    const result = await stub.message({
      text: msg.text,
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
    });

    // DO does not send for Discord — we always edit the deferred response
    if (result.text) {
      await editDiscordInteractionResponse(
        env.DISCORD_APP_ID, interaction.token, result.text, env.DISCORD_BOT_TOKEN,
      );
    } else {
      await editDiscordInteractionResponse(
        env.DISCORD_APP_ID, interaction.token, '(No response)', env.DISCORD_BOT_TOKEN,
      );
    }
  } catch (error) {
    log('error', 'Error processing Discord interaction', { error: String(error), senderId: msg.senderId });
    try {
      await editDiscordInteractionResponse(
        env.DISCORD_APP_ID, interaction.token, 'An error occurred. Please try again.', env.DISCORD_BOT_TOKEN,
      );
    } catch {
      // Best effort
    }
  }
}

// ─── Media Serving ──────────────────────────────────────────

async function handleMediaServe(path: string, env: Env): Promise<Response> {
  const id = path.replace('/media/', '');
  const object = await getMedia(env.MEDIA, id);
  if (!object) return new Response('Not Found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(object.body, { headers });
}

// ─── Admin API ──────────────────────────────────────────────

async function handleAdminRoute(request: Request, path: string, env: Env): Promise<Response> {
  // Status
  if (path === '/admin/status' && request.method === 'GET') {
    const agentCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM agents').first();
    const sessionCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM session_metadata').first();
    const allowlistCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM allowlist').first();
    return json({
      status: 'ok',
      agents: agentCount?.cnt,
      sessions: sessionCount?.cnt,
      allowlistEntries: allowlistCount?.cnt,
    });
  }

  // Allowlist
  if (path === '/admin/allowlist') {
    if (request.method === 'GET') {
      const entries = await getAllowlist(env.DB);
      return json(entries);
    }
    if (request.method === 'POST') {
      const { channel, sender_id, display_name } = await request.json() as {
        channel: string;
        sender_id: string;
        display_name?: string;
      };
      await addToAllowlist(env.DB, channel, sender_id, display_name);
      return json({ ok: true });
    }
  }

  if (path.startsWith('/admin/allowlist/') && request.method === 'DELETE') {
    const id = parseInt(path.split('/').pop()!);
    const removed = await removeFromAllowlist(env.DB, id);
    return json({ ok: removed });
  }

  // Pairing
  if (path.startsWith('/admin/pairing/') && path.endsWith('/ok') && request.method === 'POST') {
    const code = path.split('/')[3]!;
    const result = await approvePairingCode(env.DB, code);
    if (!result) return json({ error: 'Invalid or expired code' }, 400);
    return json({ ok: true, entry: result });
  }

  // Agents
  if (path === '/admin/agents' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM agents ORDER BY id').all();
    return json(results);
  }

  if (path === '/admin/agents' && request.method === 'POST') {
    const agent = await request.json() as {
      id: string;
      display_name?: string;
      model?: string;
      system_prompt?: string;
      thinking_level?: string;
      temperature?: number;
      max_tokens?: number;
    };
    await env.DB.prepare(
      'INSERT INTO agents (id, display_name, model, system_prompt, thinking_level, temperature, max_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      agent.id,
      agent.display_name ?? null,
      agent.model ?? DEFAULTS.model,
      agent.system_prompt ?? null,
      agent.thinking_level ?? DEFAULTS.thinkingLevel,
      agent.temperature ?? DEFAULTS.temperature,
      agent.max_tokens ?? DEFAULTS.maxTokens,
    ).run();
    return json({ ok: true });
  }

  if (path.startsWith('/admin/agents/') && request.method === 'PATCH') {
    const agentId = path.split('/').pop()!;
    const updates = await request.json() as Record<string, unknown>;
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['display_name', 'model', 'system_prompt', 'thinking_level', 'temperature', 'max_tokens'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = unixepoch()');
      values.push(agentId);
      await env.DB.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
      await env.CACHE.delete(`agent:${agentId}`);
    }
    return json({ ok: true });
  }

  // Bindings
  if (path === '/admin/bindings') {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM bindings ORDER BY priority DESC').all();
      return json(results);
    }
    if (request.method === 'POST') {
      const b = await request.json() as {
        channel: string;
        agent_id: string;
        account_id?: string;
        peer_kind?: string;
        peer_id?: string;
        guild_id?: string;
        team_id?: string;
        priority?: number;
      };
      await env.DB.prepare(
        'INSERT INTO bindings (channel, account_id, peer_kind, peer_id, guild_id, team_id, agent_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        b.channel, b.account_id ?? null, b.peer_kind ?? null, b.peer_id ?? null,
        b.guild_id ?? null, b.team_id ?? null, b.agent_id, b.priority ?? 0
      ).run();
      return json({ ok: true });
    }
  }

  if (path.startsWith('/admin/bindings/') && request.method === 'DELETE') {
    const id = parseInt(path.split('/').pop()!);
    await env.DB.prepare('DELETE FROM bindings WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // Sessions
  if (path === '/admin/sessions' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM session_metadata ORDER BY last_activity DESC LIMIT 100'
    ).all();
    return json(results);
  }

  if (path.match(/^\/admin\/sessions\/[^/]+\/history$/) && request.method === 'GET') {
    const sessionKey = decodeURIComponent(path.split('/')[3]!);
    const stub = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(sessionKey));
    return json(await stub.getHistory());
  }

  if (path.match(/^\/admin\/sessions\/[^/]+\/reset$/) && request.method === 'POST') {
    const sessionKey = decodeURIComponent(path.split('/')[3]!);
    const stub = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(sessionKey));
    await stub.reset();
    return json({ ok: true });
  }

  if (path.match(/^\/admin\/sessions\/[^/]+\/compact$/) && request.method === 'POST') {
    const sessionKey = decodeURIComponent(path.split('/')[3]!);
    const stub = env.CONVERSATION_DO.get(env.CONVERSATION_DO.idFromName(sessionKey));
    return json(await stub.compact());
  }

  // Config
  if (path === '/admin/config') {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM config ORDER BY key').all();
      return json(results);
    }
    if (request.method === 'PATCH') {
      const updates = await request.json() as Record<string, string>;
      for (const [key, value] of Object.entries(updates)) {
        await setConfigValue(env.DB, env.CACHE, key, value);
      }
      return json({ ok: true });
    }
  }

  // Usage
  if (path === '/admin/usage' && request.method === 'GET') {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') ?? '7');
    const since = Math.floor(Date.now() / 1000) - days * 86400;

    const { results } = await env.DB.prepare(
      'SELECT provider, model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as call_count FROM usage_log WHERE created_at > ? GROUP BY provider, model'
    ).bind(since).all();

    return json({ days, usage: results });
  }

  // Memory
  if (path === '/admin/memories/stats' && request.method === 'GET') {
    const total = await env.DB.prepare(
      'SELECT scope, COUNT(*) as count FROM memory_entries WHERE superseded_by IS NULL GROUP BY scope'
    ).all();
    const superseded = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM memory_entries WHERE superseded_by IS NOT NULL'
    ).first();
    return json({ active: total.results, superseded: (superseded?.count as number) ?? 0 });
  }

  if (path === '/admin/memories' && request.method === 'GET') {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope');
    const scopeId = url.searchParams.get('scope_id');
    const limit = parseInt(url.searchParams.get('limit') ?? '50');

    let query = 'SELECT * FROM memory_entries WHERE superseded_by IS NULL';
    const binds: unknown[] = [];

    if (scope) {
      query += ' AND scope = ?';
      binds.push(scope);
    }
    if (scopeId) {
      query += ' AND scope_id = ?';
      binds.push(scopeId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    binds.push(limit);

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results);
  }

  if (path.match(/^\/admin\/memories\/[^/]+$/) && request.method === 'GET') {
    const id = path.split('/').pop()!;
    const row = await env.DB.prepare('SELECT * FROM memory_entries WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'Not found' }, 404);
    return json(row);
  }

  if (path.match(/^\/admin\/memories\/[^/]+$/) && request.method === 'DELETE') {
    const id = path.split('/').pop()!;
    const deleted = await deleteMemory(env, id);
    return json({ ok: deleted });
  }

  // Discord commands
  if (path === '/admin/discord/commands' && request.method === 'POST') {
    try {
      const result = await registerDiscordCommands(env.DISCORD_APP_ID, env.DISCORD_BOT_TOKEN);
      return json(result);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // Skills
  if (path === '/admin/skills') {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT name, display_name, description, auth_type, source_url, version, status, installed_at, updated_at FROM skills ORDER BY name"
      ).all();
      return json(results);
    }
    if (request.method === 'POST') {
      const input = await request.json() as { content?: string; url?: string };
      try {
        const skill = await installSkill(env, input);
        return json({ ok: true, name: skill.name, description: skill.description, authType: skill.authType });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }
  }

  if (path.match(/^\/admin\/skills\/[^/]+\/secrets$/) && request.method === 'PUT') {
    const skillName = decodeURIComponent(path.split('/')[3]!);
    const secrets = await request.json() as Record<string, string>;
    await updateSkillSecrets(env, skillName, secrets);
    return json({ ok: true });
  }

  if (path.match(/^\/admin\/skills\/[^/]+\/secrets$/) && request.method === 'GET') {
    const skillName = decodeURIComponent(path.split('/')[3]!);
    const keys = await listSkillSecretKeys(env, skillName);
    return json({ keys });
  }

  if (path.match(/^\/admin\/skills\/[^/]+$/) && request.method === 'GET') {
    const skillName = decodeURIComponent(path.split('/').pop()!);
    const row = await env.DB.prepare('SELECT * FROM skills WHERE name = ?').bind(skillName).first();
    if (!row) return json({ error: 'Not found' }, 404);
    return json(row);
  }

  if (path.match(/^\/admin\/skills\/[^/]+$/) && request.method === 'DELETE') {
    const skillName = decodeURIComponent(path.split('/').pop()!);
    const removed = await removeSkill(env, skillName);
    return json({ ok: removed });
  }

  return new Response('Not Found', { status: 404 });
}

// ─── Helpers ────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
