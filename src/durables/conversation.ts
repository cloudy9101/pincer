import { DurableObject } from 'cloudflare:workers';
import { generateText, stepCountIs } from 'ai';
import type { ModelMessage } from 'ai';
import type { Env } from '../env.ts';
import { getModel, parseModelString } from '../llm/gateway.ts';
import { buildToolSet, type ToolCallContext } from '../llm/tool-registry.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { retrieveMemories } from '../memory/retrieve.ts';
import { extractAndStoreMemories } from '../memory/auto-extract.ts';
import type { MemoryContext } from '../memory/types.ts';
import { sendTelegramMessage } from '../channels/telegram/send.ts';

interface ReplyDestination {
  channel: string;
  chatId: string;
  chatType: string;
  channelMessageId?: string;
}

interface SessionState {
  agentId: string;
  model: string;
  systemPrompt: string;
  thinkingLevel: string;
  temperature: number;
  maxTokens: number;
  messageCount: number;
  userId: string;
}

const MAX_TOOL_STEPS = 20;

export class ConversationSqlDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        idx INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        thinking_level TEXT NOT NULL,
        temperature REAL NOT NULL,
        max_tokens INTEGER NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  private loadHistory(): ModelMessage[] {
    const rows = this.sql.exec<{ data: string }>('SELECT data FROM messages ORDER BY idx').toArray();
    return rows.map((row) => JSON.parse(row.data) as ModelMessage);
  }

  private loadState(): SessionState | null {
    const rows = this.sql.exec<{
      agent_id: string;
      user_id: string;
      model: string;
      system_prompt: string;
      thinking_level: string;
      temperature: number;
      max_tokens: number;
      message_count: number;
    }>('SELECT * FROM session_state WHERE id = 1').toArray();

    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      agentId: row.agent_id,
      userId: row.user_id,
      model: row.model,
      systemPrompt: row.system_prompt,
      thinkingLevel: row.thinking_level,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      messageCount: row.message_count,
    };
  }

  private saveState(state: SessionState): void {
    this.sql.exec(
      `INSERT INTO session_state (id, agent_id, user_id, model, system_prompt, thinking_level, temperature, max_tokens, message_count)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         agent_id = excluded.agent_id,
         user_id = excluded.user_id,
         model = excluded.model,
         system_prompt = excluded.system_prompt,
         thinking_level = excluded.thinking_level,
         temperature = excluded.temperature,
         max_tokens = excluded.max_tokens,
         message_count = excluded.message_count`,
      state.agentId,
      state.userId,
      state.model,
      state.systemPrompt,
      state.thinkingLevel,
      state.temperature,
      state.maxTokens,
      state.messageCount,
    );
  }

  private appendMessages(messages: ModelMessage[]): void {
    for (const msg of messages) {
      this.sql.exec('INSERT INTO messages (data) VALUES (?)', JSON.stringify(msg));
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case '/message':
        if (request.method !== 'POST') return methodNotAllowed();
        return this.handleMessage(request);
      case '/reset':
        if (request.method !== 'POST') return methodNotAllowed();
        return this.handleReset();
      case '/compact':
        if (request.method !== 'POST') return methodNotAllowed();
        return this.handleCompact();
      case '/history':
        if (request.method !== 'GET') return methodNotAllowed();
        return json(this.loadHistory());
      case '/metadata':
        if (request.method !== 'GET') return methodNotAllowed();
        return json(this.loadState());
      case '/configure':
        if (request.method !== 'PATCH') return methodNotAllowed();
        return this.handleConfigure(request);
      default:
        return new Response('Not Found', { status: 404 });
    }
  }

  private async handleMessage(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      text: string;
      sessionKey: string;
      agentId: string;
      userId: string;
      model?: string;
      systemPrompt?: string;
      thinkingLevel?: string;
      temperature?: number;
      maxTokens?: number;
      replyTo?: ReplyDestination;
    };

    // Initialize or load state
    let state = this.loadState();
    if (!state) {
      state = {
        agentId: body.agentId,
        model: body.model ?? DEFAULTS.model,
        systemPrompt: body.systemPrompt ?? DEFAULTS.systemPrompt,
        thinkingLevel: body.thinkingLevel ?? DEFAULTS.thinkingLevel,
        temperature: body.temperature ?? DEFAULTS.temperature,
        maxTokens: body.maxTokens ?? DEFAULTS.maxTokens,
        messageCount: 0,
        userId: body.userId,
      };
    }

    // Add user message
    const userMsg: ModelMessage = { role: 'user', content: body.text };
    this.appendMessages([userMsg]);
    state.messageCount++;

    // Load full history for LLM call
    const history = this.loadHistory();

    // Build tools
    const toolCtx: ToolCallContext = {
      env: this.env,
      sessionKey: body.sessionKey,
      userId: state.userId,
    };
    const tools = await buildToolSet(toolCtx);

    // Get the AI SDK model
    const model = getModel(state.model, this.env);

    // Build memory context
    const memoryCtx: MemoryContext = {
      sessionKey: body.sessionKey,
      userId: state.userId,
      agentId: state.agentId,
    };

    // Retrieve relevant memories and augment system prompt
    let systemPrompt = state.systemPrompt;
    const memorySection = await retrieveMemories(this.env, body.text, memoryCtx);
    if (memorySection) {
      systemPrompt = systemPrompt + memorySection;
    }

    // Build provider options for thinking
    const providerOptions = buildProviderOptions(state);

    // Call generateText with automatic tool loop
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: history,
      tools,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      maxOutputTokens: state.maxTokens,
      temperature: state.thinkingLevel !== 'none' ? undefined : state.temperature,
      providerOptions,
    });

    const stepCount = result.response.messages.length;
    const toolCallCount = result.toolCalls?.length ?? 0;

    // Send reply before persisting — user gets the message sooner
    let sent = false;
    if (body.replyTo && result.text) {
      try {
        await this.sendReply(body.replyTo, result.text);
        sent = true;
      } catch (e) {
        console.error('Failed to send reply:', e);
      }
    }

    // Now persist history and state
    this.appendMessages(result.response.messages);
    state.messageCount += result.response.messages.length;
    this.saveState(state);

    // Log usage (D1, async)
    const inputTokens = result.totalUsage.inputTokens ?? 0;
    const outputTokens = result.totalUsage.outputTokens ?? 0;
    await this.logUsage(body.sessionKey, state.model, inputTokens, outputTokens);

    // Auto-extract memories in background
    if (DEFAULTS.memoryAutoExtractEnabled && result.text) {
      this.ctx.waitUntil(
        extractAndStoreMemories(this.env, model, body.text, result.text, memoryCtx)
      );
    }

    return json({ text: result.text, sent, toolCallCount, steps: stepCount });
  }

  private handleReset(): Response {
    this.sql.exec('DELETE FROM messages');
    const state = this.loadState();
    if (state) {
      state.messageCount = 0;
      this.saveState(state);
    }
    return json({ ok: true });
  }

  private async handleCompact(): Promise<Response> {
    const history = this.loadHistory();

    if (history.length < DEFAULTS.compactionThreshold) {
      return json({ ok: true, message: 'No compaction needed' });
    }

    const keepCount = DEFAULTS.compactionKeepRecent;
    const toSummarize = history.slice(0, -keepCount);
    const keepRecent = history.slice(-keepCount);

    // Create a summary using the LLM
    const summaryPrompt = toSummarize
      .map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n\n');

    const state = this.loadState();
    const model = getModel(state?.model ?? DEFAULTS.model, this.env);

    const summaryResult = await generateText({
      model,
      system: 'Summarize the following conversation history in a concise way, preserving key facts, decisions, and context that would be needed to continue the conversation.',
      prompt: summaryPrompt,
      maxOutputTokens: 2048,
      temperature: 0.3,
    });

    // Replace all messages: delete old, insert summary + recent
    this.sql.exec('DELETE FROM messages');
    const newHistory: ModelMessage[] = [
      { role: 'user', content: '[Previous conversation summary]' },
      { role: 'assistant', content: summaryResult.text },
      ...keepRecent,
    ];
    this.appendMessages(newHistory);

    if (state) {
      state.messageCount = newHistory.length;
      this.saveState(state);
    }

    return json({ ok: true, summarizedMessages: toSummarize.length, remainingMessages: newHistory.length });
  }

  private async handleConfigure(request: Request): Promise<Response> {
    const updates = (await request.json()) as Partial<SessionState>;
    const state = this.loadState();

    if (!state) {
      return new Response('Session not initialized', { status: 400 });
    }

    if (updates.model) state.model = updates.model;
    if (updates.systemPrompt) state.systemPrompt = updates.systemPrompt;
    if (updates.thinkingLevel) state.thinkingLevel = updates.thinkingLevel;
    if (updates.temperature !== undefined) state.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) state.maxTokens = updates.maxTokens;

    this.saveState(state);
    return json({ ok: true, state });
  }

  private async sendReply(dest: ReplyDestination, text: string): Promise<void> {
    switch (dest.channel) {
      case 'telegram':
        await sendTelegramMessage(
          {
            channel: 'telegram',
            chatId: dest.chatId,
            text,
            replyToMessageId: dest.chatType === 'group' ? dest.channelMessageId : undefined,
          },
          this.env.TELEGRAM_BOT_TOKEN,
        );
        break;
      default:
        console.error(`Unknown reply channel: ${dest.channel}`);
    }
  }

  private async logUsage(sessionKey: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
    const { provider } = parseModelString(model);
    try {
      await this.env.DB.prepare(
        'INSERT INTO usage_log (session_key, provider, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(sessionKey, provider, model, inputTokens, outputTokens)
        .run();
    } catch (e) {
      console.error('Failed to log usage:', e);
    }
  }
}

function buildProviderOptions(state: SessionState) {
  const { provider } = parseModelString(state.model);

  if (provider === 'anthropic' && state.thinkingLevel && state.thinkingLevel !== 'none') {
    const budgets: Record<string, number> = { low: 2048, medium: 8192, high: 32768 };
    return {
      anthropic: {
        thinking: {
          type: 'enabled' as const,
          budgetTokens: budgets[state.thinkingLevel] ?? budgets.medium!,
        },
      },
    };
  }

  return undefined;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function methodNotAllowed(): Response {
  return new Response('Method Not Allowed', { status: 405 });
}
