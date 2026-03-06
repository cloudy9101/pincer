import type { Env } from './env.ts';
import { verifyTelegramWebhook } from './security/webhook-verify.ts';
import { parseTelegramWebhook } from './channels/telegram/webhook.ts';
import { sendTelegramMessage, sendTelegramChatAction } from './channels/telegram/send.ts';
import { resolveRoute } from './routing/resolve-route.ts';
import { buildSessionKeyFromMessage } from './routing/session-key.ts';
import { isAllowed, checkAllowlistEmpty, addToAllowlist, createPairingCode, approvePairingCode, getAllowlist, removeFromAllowlist } from './security/allowlist.ts';
import { checkRateLimit } from './security/rate-limit.ts';
import { verifyAdminAuth } from './security/admin-auth.ts';
import { getAgent, getConfigValue, setConfigValue } from './config/loader.ts';
import { getMedia } from './media/store.ts';
import { getCanonicalId } from './routing/identity-links.ts';
import { deleteMemory } from './memory/store.ts';
import { DEFAULTS } from './config/defaults.ts';
import { log } from './utils/logger.ts';
import { installSkill, removeSkill, updateSkillSecrets, listSkillSecretKeys } from './skills/installer.ts';
import { CATALOG, getCatalogEntry } from './skills/catalog.ts';
import { registerMCPServer, removeMCPServer, updateMCPServer, updateMCPServerHeaders, listMCPServerHeaderKeys } from './mcp/installer.ts';
import { getMCPServer } from './mcp/loader.ts';
import { discoverMCPTools } from './mcp/client.ts';
import type { IncomingMessage } from './channels/types.ts';
import { downloadTelegramFile } from './channels/telegram/files.ts';
import { registerTelegramCommands, ensureCommandsRegistered, setupTelegram, getTelegramWebhookInfo } from './channels/telegram/commands.ts';
import type { InlineImage } from './durables/conversation.ts';
import { handleConnect, handleCallback } from './oauth/flow.ts';
import { revokeConnection } from './oauth/tokens.ts';
import { runCronJobs } from './cron/runner.ts';
import { encrypt, decrypt } from './security/encryption.ts';
import { listProviders } from './oauth/providers.ts';

export { ConversationSqlDO } from './durables/conversation.ts';

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCronJobs(env, controller.scheduledTime));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const traceId = crypto.randomUUID();

    try {
      // Webhook routes
      if (path === '/webhook/telegram' && request.method === 'POST') {
        log('info', 'Webhook received', { method: request.method, path }, { traceId, handler: 'telegram' });
        return handleTelegramWebhook(request, env, ctx, traceId);
      }
      // Media serving
      if (path.startsWith('/media/') && request.method === 'GET') {
        return handleMediaServe(path, env);
      }

      // OAuth connect/callback (public — auth is via state token)
      if (path.startsWith('/connect/') && request.method === 'GET') {
        return handleConnect(request, env);
      }
      if (path.startsWith('/callback/') && request.method === 'GET') {
        return handleCallback(request, env);
      }

      // Admin routes
      if (path.startsWith('/admin/')) {
        if (!verifyAdminAuth(request, env.ADMIN_AUTH_TOKEN)) {
          return new Response('Unauthorized', { status: 401 });
        }
        try {
          return await handleAdminRoute(request, path, env);
        } catch (error) {
          log('error', 'Admin route error', { error: String(error), path });
          return json({ error: String(error) }, 500);
        }
      }

      // Admin SPA (static assets)
      // Try the exact asset first; fall back to the SPA shell for client-side routes.
      if (path.startsWith('/dashboard/') || path === '/dashboard') {
        const res = await env.ASSETS.fetch(request);
        if (res.status === 404) {
          return env.ASSETS.fetch(new Request(new URL('/dashboard/index.html', request.url).href));
        }
        return res;
      }

      // Health check
      if (path === '/' || path === '/health') {
        return json({ status: 'ok', service: 'pincer-gateway' });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      log('error', 'Unhandled error', { error: String(error), path }, { traceId, handler: 'fetch' });
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

// ─── Telegram Webhook ────────────────────────────────────────

async function handleTelegramWebhook(request: Request, env: Env, ctx: ExecutionContext, traceId: string): Promise<Response> {
  try {
    // Resolve webhook secret: D1 config first, then env var fallback
    const webhookSecret = await getConfigValue(env.DB, env.CACHE, 'telegram_webhook_secret') ?? env.TELEGRAM_WEBHOOK_SECRET ?? '';
    if (!webhookSecret || !await verifyTelegramWebhook(request, webhookSecret)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const msg = parseTelegramWebhook(body as import('./channels/telegram/types.ts').TelegramUpdate);
    if (!msg) {
      return new Response('OK'); // Not a message we handle
    }

    // Register bot commands lazily (single KV read; no-op after first success)
    ctx.waitUntil(ensureCommandsRegistered(env.CACHE, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE));
    // Handle in background so we can return 200 immediately
    ctx.waitUntil(processTelegramMessage(msg, env, traceId));
    return new Response('OK');
  } catch (error) {
    log('error', 'Telegram webhook error', { error: String(error) }, { traceId, handler: 'telegram' });
    return new Response('', { status: 200 });
  }
}

async function processTelegramMessage(msg: IncomingMessage, env: Env, traceId: string): Promise<void> {
  try {
    // Commands skip allowlist/rate-limit checks
    const isCommand = msg.text.startsWith('/');

    if (!isCommand) {
      // Check allowlist
      const allowlistEmpty = await checkAllowlistEmpty(env.DB);
      const senderAllowed = !allowlistEmpty && await isAllowed(env.DB, msg.channel, msg.senderId);

      // Determine if sender is the owner:
      // - If telegram_owner_id is configured (D1 or env var), only that user ID is the owner.
      // - Otherwise, fall back to auto-approving the very first user (empty allowlist).
      const ownerId = await getConfigValue(env.DB, env.CACHE, 'telegram_owner_id') ?? env.TELEGRAM_OWNER_ID;
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
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_API_BASE,
        );
        return;
      }

      // Auto-add owner to allowlist if not already there
      if (!senderAllowed && isOwner) {
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
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_API_BASE,
        );
        return;
      }

      // Send typing indicator
      await sendTelegramChatAction(msg.chatId, 'typing', env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE);
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

    log('info', 'DO dispatch', { sessionKey }, { traceId, handler: 'do-dispatch' });

    // Resolve any media attachments before dispatching to the DO
    let messageText = msg.text;
    const images: InlineImage[] = [];

    if (msg.mediaAttachments && msg.mediaAttachments.length > 0) {
      for (const attachment of msg.mediaAttachments) {
        if (attachment.type === 'image') {
          const file = await downloadTelegramFile(attachment.fileId, env.TELEGRAM_BOT_TOKEN, attachment.mimeType);
          if (file) {
            const base64 = arrayBufferToBase64(file.data);
            images.push({ data: base64, mimeType: file.mimeType });
          }
        } else if (attachment.type === 'audio') {
          // Transcribe audio using Workers AI Whisper
          const file = await downloadTelegramFile(attachment.fileId, env.TELEGRAM_BOT_TOKEN, attachment.mimeType);
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

    // DO sends the reply directly — await ensures RPC is dispatched
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
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_API_BASE,
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
    const [agentCount, sessionCount, allowlistCount, setupCompleted] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM agents').first(),
      env.DB.prepare('SELECT COUNT(*) as cnt FROM session_metadata').first(),
      env.DB.prepare('SELECT COUNT(*) as cnt FROM allowlist').first(),
      getConfigValue(env.DB, env.CACHE, 'setup_completed'),
    ]);
    return json({
      status: 'ok',
      agents: agentCount?.cnt,
      sessions: sessionCount?.cnt,
      allowlistEntries: allowlistCount?.cnt,
      setupCompleted: setupCompleted === 'true',
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
    const { results } = await env.DB.prepare('SELECT id, display_name as name, model, system_prompt, max_tokens as max_steps, created_at, updated_at FROM agents ORDER BY id').all();
    return json(results);
  }

  if (path === '/admin/agents' && request.method === 'POST') {
    const agent = await request.json() as {
      id: string;
      name?: string;
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
      agent.display_name ?? agent.name ?? null,
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

  if (path.startsWith('/admin/agents/') && request.method === 'DELETE') {
    const agentId = path.split('/').pop()!;

    await env.DB.prepare(`DELETE FROM agents WHERE id = ?`).bind(agentId).run();
    await env.CACHE.delete(`agent:${agentId}`);
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

  // Skill catalog — must be before /admin/skills/:name catch-all
  if (path === '/admin/skills/catalog' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT name FROM skills').all();
    const installedNames = new Set(results.map(r => r.name as string));
    return json(CATALOG.map(e => ({
      name: e.name,
      displayName: e.displayName,
      description: e.description,
      authType: e.authType,
      secretFields: e.secretFields,
      oauthProvider: e.oauthProvider ?? null,
      setupUrl: e.setupUrl ?? null,
      installed: installedNames.has(e.name),
    })));
  }

  if (path.match(/^\/admin\/skills\/catalog\/[^/]+\/install$/) && request.method === 'POST') {
    const skillName = path.split('/')[4]!;
    const entry = getCatalogEntry(skillName);
    if (!entry) return json({ error: 'Catalog skill not found' }, 404);
    const body = await request.json() as { secrets?: Record<string, string> };
    try {
      const skill = await installSkill(env, { content: entry.content });
      if (body.secrets && Object.keys(body.secrets).length > 0) {
        await updateSkillSecrets(env, skill.name, body.secrets);
      }
      return json({ ok: true, name: skill.name });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
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

  // MCP Servers
  if (path === '/admin/mcp') {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT name, display_name, description, url, transport_type, tool_schemas, tool_whitelist, status, discovered_at, created_at, updated_at FROM mcp_servers ORDER BY name"
      ).all();
      return json(results.map(r => ({
        ...r,
        tool_schemas: r.tool_schemas ? JSON.parse(r.tool_schemas as string) : null,
        tool_whitelist: r.tool_whitelist ? JSON.parse(r.tool_whitelist as string) : null,
      })));
    }
    if (request.method === 'POST') {
      const input = await request.json() as {
        name: string;
        url: string;
        displayName?: string;
        description?: string;
        transportType?: 'sse' | 'http';
        toolWhitelist?: string[];
      };
      try {
        const server = await registerMCPServer(env, input);
        return json({
          ok: true,
          name: server.name,
          url: server.url,
          tools: server.toolSchemas?.map(t => t.name) ?? [],
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }
  }

  if (path.match(/^\/admin\/mcp\/[^/]+\/headers$/) && request.method === 'PUT') {
    const serverName = decodeURIComponent(path.split('/')[3]!);
    const headers = await request.json() as Record<string, string>;
    await updateMCPServerHeaders(env, serverName, headers);
    return json({ ok: true });
  }

  if (path.match(/^\/admin\/mcp\/[^/]+\/headers$/) && request.method === 'GET') {
    const serverName = decodeURIComponent(path.split('/')[3]!);
    const keys = await listMCPServerHeaderKeys(env, serverName);
    return json({ keys });
  }

  if (path.match(/^\/admin\/mcp\/[^/]+\/discover$/) && request.method === 'POST') {
    const serverName = decodeURIComponent(path.split('/')[3]!);
    try {
      const schemas = await discoverMCPTools(env, serverName);
      return json({ ok: true, tools: schemas });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  if (path.match(/^\/admin\/mcp\/[^/]+$/) && request.method === 'GET') {
    const serverName = decodeURIComponent(path.split('/').pop()!);
    const server = await getMCPServer(env, serverName);
    if (!server) return json({ error: 'Not found' }, 404);
    return json(server);
  }

  if (path.match(/^\/admin\/mcp\/[^/]+$/) && request.method === 'PATCH') {
    const serverName = decodeURIComponent(path.split('/').pop()!);
    const updates = await request.json() as Record<string, unknown>;
    const updated = await updateMCPServer(env, serverName, {
      url: updates.url as string | undefined,
      displayName: updates.displayName as string | undefined,
      description: updates.description as string | undefined,
      transportType: updates.transportType as 'sse' | 'http' | undefined,
      toolWhitelist: updates.toolWhitelist as string[] | undefined,
      status: updates.status as string | undefined,
    });
    return json({ ok: updated });
  }

  if (path.match(/^\/admin\/mcp\/[^/]+$/) && request.method === 'DELETE') {
    const serverName = decodeURIComponent(path.split('/').pop()!);
    const removed = await removeMCPServer(env, serverName);
    return json({ ok: removed });
  }

  // OAuth connections
  if (path === '/admin/oauth' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, user_id, provider, scopes, provider_user_id, provider_email, created_at, updated_at FROM oauth_connections ORDER BY created_at DESC'
    ).all();
    return json(results);
  }

  if (path.match(/^\/admin\/oauth\/[^/]+$/) && request.method === 'DELETE') {
    const connectionId = path.split('/').pop()!;
    const removed = await revokeConnection(env, connectionId);
    return json({ ok: removed });
  }

  // Cron jobs
  if (path === '/admin/crons' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id, enabled, last_run_at, created_at FROM cron_jobs ORDER BY created_at DESC'
    ).all();
    return json(results);
  }

  if (path === '/admin/crons' && request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const { id, name, schedule, agent_id, prompt, reply_channel = null, reply_chat_id = null } = body;
    await env.DB.prepare(
      'INSERT INTO cron_jobs (id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(id, name, schedule, agent_id, prompt, reply_channel, reply_chat_id).run();
    return json({ ok: true });
  }

  if (path.match(/^\/admin\/crons\/[^/]+$/) && request.method === 'GET') {
    const jobId = path.split('/').pop()!;
    const row = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(jobId).first();
    if (!row) return new Response('Not Found', { status: 404 });
    return json(row);
  }

  if (path.match(/^\/admin\/crons\/[^/]+$/) && request.method === 'PATCH') {
    const jobId = path.split('/').pop()!;
    const body = await request.json() as Record<string, unknown>;
    const allowed = ['name', 'schedule', 'prompt', 'reply_channel', 'reply_chat_id', 'enabled'] as const;
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const key of allowed) {
      if (key in body) { sets.push(`${key} = ?`); vals.push(body[key]); }
    }
    if (sets.length === 0) return json({ ok: true });
    vals.push(jobId);
    await env.DB.prepare(`UPDATE cron_jobs SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  if (path.match(/^\/admin\/crons\/[^/]+$/) && request.method === 'DELETE') {
    const jobId = path.split('/').pop()!;
    await env.DB.prepare('DELETE FROM cron_jobs WHERE id = ?').bind(jobId).run();
    return json({ ok: true });
  }

  // Mark setup as completed
  if (path === '/admin/setup/complete' && request.method === 'POST') {
    await setConfigValue(env.DB, env.CACHE, 'setup_completed', 'true');
    return json({ ok: true });
  }

  // Telegram webhook info — check if webhook is registered
  if (path === '/admin/telegram/webhook' && request.method === 'GET') {
    const info = await getTelegramWebhookInfo(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE);
    return json(info);
  }

  // Telegram setup — register webhook + bot commands in one call
  // Auto-generates webhook secret if not already stored in D1 config
  if (path === '/admin/telegram/setup' && request.method === 'POST') {
    const origin = new URL(request.url).origin;
    // Resolve or generate webhook secret
    let webhookSecret = await getConfigValue(env.DB, env.CACHE, 'telegram_webhook_secret') ?? env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // Auto-generate a 32-byte hex secret
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      webhookSecret = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const result = await setupTelegram(origin, env.TELEGRAM_BOT_TOKEN, webhookSecret, env.TELEGRAM_API_BASE);
    // Persist webhook secret in D1 on successful registration
    if (result.webhook.ok) {
      await setConfigValue(env.DB, env.CACHE, 'telegram_webhook_secret', webhookSecret);
    }
    return json(result);
  }

  // Telegram command registration only
  if (path === '/admin/telegram/commands' && request.method === 'POST') {
    const result = await registerTelegramCommands(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE);
    return json(result);
  }

  // Setup check — verify which required env vars are present and which connectors are configured
  if (path === '/admin/setup/check' && request.method === 'GET') {
    const { results: connectorRows } = await env.DB.prepare('SELECT provider FROM oauth_provider_config').all();
    const configuredProviders = connectorRows.map(r => r.provider as string);

    const [storedWebhookSecret, storedOwnerId] = await Promise.all([
      getConfigValue(env.DB, env.CACHE, 'telegram_webhook_secret'),
      getConfigValue(env.DB, env.CACHE, 'telegram_owner_id'),
    ]);

    return json({
      secrets: {
        ADMIN_AUTH_TOKEN: !!env.ADMIN_AUTH_TOKEN,
        ENCRYPTION_KEY: !!env.ENCRYPTION_KEY,
        TELEGRAM_BOT_TOKEN: !!env.TELEGRAM_BOT_TOKEN,
      },
      telegram: {
        webhookSecretConfigured: !!(storedWebhookSecret ?? env.TELEGRAM_WEBHOOK_SECRET),
        ownerId: storedOwnerId ?? env.TELEGRAM_OWNER_ID ?? '',
      },
      connectors: listProviders().map(id => ({
        id,
        configured: configuredProviders.includes(id) ||
          !!(env as unknown as Record<string, string>)[`${id.toUpperCase()}_OAUTH_CLIENT_ID`],
      })),
    });
  }

  // List configured connectors
  if (path === '/admin/connectors' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT provider, client_id, created_at, updated_at FROM oauth_provider_config ORDER BY provider'
    ).all();
    return json(results);
  }

  // Save connector credentials
  if (path.match(/^\/admin\/connectors\/[^/]+$/) && request.method === 'PUT') {
    const provider = path.split('/').pop()!;
    const { client_id, client_secret } = await request.json() as { client_id: string; client_secret: string };
    if (!client_id || !client_secret) return json({ error: 'client_id and client_secret required' }, 400);

    const encryptedSecret = await encrypt(client_secret, env.ENCRYPTION_KEY);
    await env.DB.prepare(
      `INSERT INTO oauth_provider_config (provider, client_id, encrypted_client_secret)
       VALUES (?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET client_id = excluded.client_id,
         encrypted_client_secret = excluded.encrypted_client_secret, updated_at = unixepoch()`
    ).bind(provider, client_id, encryptedSecret).run();
    return json({ ok: true });
  }

  // Delete connector
  if (path.match(/^\/admin\/connectors\/[^/]+$/) && request.method === 'DELETE') {
    const provider = path.split('/').pop()!;
    await env.DB.prepare('DELETE FROM oauth_provider_config WHERE provider = ?').bind(provider).run();
    return json({ ok: true });
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
