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
import { loadActiveSkills } from '../skills/loader.ts';
import { formatSkillsPrompt } from '../skills/prompt.ts';
import { sendTelegramMessage, sendTelegramChatAction } from '../channels/telegram/send.ts';
import { editDiscordInteractionResponse } from '../channels/discord/send.ts';
import { getAgent } from '../config/loader.ts';
import { getCanonicalId } from '../routing/identity-links.ts';
import { isAllowed } from '../security/allowlist.ts';

export interface ReplyDestination {
  channel: string;
  chatId: string;
  chatType: string;
  channelMessageId?: string;
  interactionToken?: string;
}

export interface MessageInput {
  text: string;
  sessionKey: string;
  agentId: string;
  userId: string;
  senderId: string;
  senderName: string;
  model?: string;
  systemPrompt?: string;
  thinkingLevel?: string;
  temperature?: number;
  maxTokens?: number;
  replyTo: ReplyDestination;
}

export interface MessageResult {
  accepted: boolean;
  /** Only set for synchronous command responses */
  text?: string;
}

export interface TaskInput {
  text: string;
  agentId: string;
  userId: string;
  sessionKey: string;
  model?: string;
  systemPrompt?: string;
  thinkingLevel?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TaskResult {
  text: string;
  toolCallCount: number;
}

export interface CompactResult {
  ok: boolean;
  message?: string;
  summarizedMessages?: number;
  remainingMessages?: number;
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

type SessionStateRow = {
  agent_id: string;
  user_id: string;
  model: string;
  system_prompt: string;
  thinking_level: string;
  temperature: number;
  max_tokens: number;
  message_count: number;
};

const MAX_TOOL_STEPS = 20;

export class ConversationSqlDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  private history: ModelMessage[] = [];
  private state_: SessionState | null = null;

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

    ctx.blockConcurrencyWhile(async () => {
      this.history = this.sql.exec<{ data: string }>('SELECT data FROM messages ORDER BY idx')
        .toArray()
        .map((row) => JSON.parse(row.data) as ModelMessage);

      const rows = this.sql.exec<SessionStateRow>('SELECT * FROM session_state WHERE id = 1').toArray();
      if (rows.length > 0) {
        const r = rows[0]!;
        this.state_ = {
          agentId: r.agent_id,
          userId: r.user_id,
          model: r.model,
          systemPrompt: r.system_prompt,
          thinkingLevel: r.thinking_level,
          temperature: r.temperature,
          maxTokens: r.max_tokens,
          messageCount: r.message_count,
        };
      }
    });
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
    this.state_ = state;
  }

  private appendMessages(messages: ModelMessage[]): void {
    for (const msg of messages) {
      this.sql.exec('INSERT INTO messages (data) VALUES (?)', JSON.stringify(msg));
    }
    this.history.push(...messages);
  }

  // ─── RPC Methods ───────────────────────────────────────────

  async message(input: MessageInput): Promise<MessageResult> {
    // Commands are fast — handle synchronously
    if (input.text.startsWith('/')) {
      const reply = await this.handleCommand(input);
      if (reply !== null) {
        try {
          await this.sendReply(input.replyTo, reply);
        } catch (e) {
          console.error('Failed to send command reply:', e);
        }
        return { accepted: true, text: reply };
      }
      return { accepted: true };
    }

    // Initialize state on first message
    if (!this.state_) {
      this.state_ = {
        agentId: input.agentId,
        model: input.model ?? DEFAULTS.model,
        systemPrompt: input.systemPrompt ?? DEFAULTS.systemPrompt,
        thinkingLevel: input.thinkingLevel ?? DEFAULTS.thinkingLevel,
        temperature: input.temperature ?? DEFAULTS.temperature,
        maxTokens: input.maxTokens ?? DEFAULTS.maxTokens,
        messageCount: 0,
        userId: input.userId,
      };
    }

    // Add user message, stash replyTo for the alarm
    this.appendMessages([{ role: 'user', content: input.text }]);
    this.state_.messageCount++;
    this.saveState(this.state_);

    await this.ctx.storage.put('pendingReplyTo', input.replyTo);
    await this.ctx.storage.put('pendingSessionKey', input.sessionKey);
    await this.ctx.storage.setAlarm(Date.now());

    return { accepted: true };
  }

  async runTask(input: TaskInput): Promise<TaskResult> {
    const agentId = input.agentId;
    const model = input.model ?? DEFAULTS.model;
    const systemPromptBase = input.systemPrompt ?? DEFAULTS.systemPrompt;
    const thinkingLevel = input.thinkingLevel ?? DEFAULTS.thinkingLevel;
    const temperature = input.temperature ?? DEFAULTS.temperature;
    const maxTokens = input.maxTokens ?? DEFAULTS.maxTokens;

    const toolCtx: ToolCallContext = {
      env: this.env,
      sessionKey: input.sessionKey,
      userId: input.userId,
    };
    const tools = await buildToolSet(toolCtx);
    const llmModel = getModel(model, this.env);

    // Build system prompt with memories and skills
    let systemPrompt = systemPromptBase;

    const memoryCtx: MemoryContext = {
      sessionKey: input.sessionKey,
      userId: input.userId,
      agentId,
    };
    const memorySection = await retrieveMemories(this.env, input.text, memoryCtx);
    if (memorySection) {
      systemPrompt = systemPrompt + memorySection;
    }

    const skills = await loadActiveSkills(this.env);
    const skillsSection = await formatSkillsPrompt(skills, this.env, input.userId);
    if (skillsSection) {
      systemPrompt = systemPrompt + skillsSection;
    }

    const sessionState: SessionState = {
      agentId,
      userId: input.userId,
      model,
      systemPrompt: systemPromptBase,
      thinkingLevel,
      temperature,
      maxTokens,
      messageCount: 0,
    };
    const providerOptions = buildProviderOptions(sessionState);

    const result = await generateText({
      model: llmModel,
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: input.text }],
      tools,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      maxOutputTokens: maxTokens,
      temperature: thinkingLevel !== 'none' ? undefined : temperature,
      providerOptions,
    });

    // Count tool calls across all steps
    let toolCallCount = 0;
    for (const msg of result.response.messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (typeof part === 'object' && 'type' in part && part.type === 'tool-call') {
            toolCallCount++;
          }
        }
      }
    }

    // Log usage but don't persist history (ephemeral)
    const inputTokens = result.totalUsage.inputTokens ?? 0;
    const outputTokens = result.totalUsage.outputTokens ?? 0;
    await this.logUsage(input.sessionKey, model, inputTokens, outputTokens);

    return { text: result.text, toolCallCount };
  }

  override async alarm(): Promise<void> {
    const replyTo = await this.ctx.storage.get<ReplyDestination>('pendingReplyTo');
    const sessionKey = await this.ctx.storage.get<string>('pendingSessionKey');
    await this.ctx.storage.delete('pendingReplyTo');
    await this.ctx.storage.delete('pendingSessionKey');
    if (!replyTo || !sessionKey || !this.state_) return;

    // Extract the user's text from the last history message
    const lastMsg = this.history[this.history.length - 1];
    const userText = lastMsg && lastMsg.role === 'user' && typeof lastMsg.content === 'string'
      ? lastMsg.content : '';

    // Start typing indicator for Telegram
    const typingInterval = this.startTypingIndicator(replyTo);

    try {
      const toolCtx: ToolCallContext = {
        env: this.env,
        sessionKey,
        userId: this.state_.userId,
      };
      const tools = await buildToolSet(toolCtx);
      const model = getModel(this.state_.model, this.env);

      const memoryCtx: MemoryContext = {
        sessionKey,
        userId: this.state_.userId,
        agentId: this.state_.agentId,
      };

      let systemPrompt = this.state_.systemPrompt;
      const memorySection = await retrieveMemories(this.env, userText, memoryCtx);
      if (memorySection) {
        systemPrompt = systemPrompt + memorySection;
      }

      const skills = await loadActiveSkills(this.env);
      const skillsSection = await formatSkillsPrompt(skills, this.env, this.state_.userId);
      if (skillsSection) {
        systemPrompt = systemPrompt + skillsSection;
      }

      const providerOptions = buildProviderOptions(this.state_);

      const result = await generateText({
        model,
        system: systemPrompt,
        messages: this.history,
        tools,
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        maxOutputTokens: this.state_.maxTokens,
        temperature: this.state_.thinkingLevel !== 'none' ? undefined : this.state_.temperature,
        providerOptions,
      });

      clearInterval(typingInterval);

      // Send reply
      if (result.text) {
        try {
          await this.sendReply(replyTo, result.text);
        } catch (e) {
          console.error('Failed to send reply:', e);
        }
      }

      // Persist
      this.appendMessages(result.response.messages);
      this.state_.messageCount += result.response.messages.length;
      this.saveState(this.state_);

      const inputTokens = result.totalUsage.inputTokens ?? 0;
      const outputTokens = result.totalUsage.outputTokens ?? 0;
      await this.logUsage(sessionKey, this.state_.model, inputTokens, outputTokens);

      if (DEFAULTS.memoryAutoExtractEnabled && result.text) {
        await extractAndStoreMemories(this.env, model, userText, result.text, memoryCtx);
      }
    } catch (e) {
      clearInterval(typingInterval);
      console.error('alarm processMessage failed:', e);
      try {
        await this.sendReply(replyTo, 'An error occurred while processing your message. Please try again.');
      } catch { /* best effort */ }
    }
  }

  async reset(): Promise<{ ok: boolean }> {
    this.sql.exec('DELETE FROM messages');
    this.history = [];
    if (this.state_) {
      this.state_.messageCount = 0;
      this.saveState(this.state_);
    }
    return { ok: true };
  }

  async compact(): Promise<CompactResult> {
    if (this.history.length < DEFAULTS.compactionThreshold) {
      return { ok: true, message: 'No compaction needed' };
    }

    const keepCount = DEFAULTS.compactionKeepRecent;
    const toSummarize = this.history.slice(0, -keepCount);
    const keepRecent = this.history.slice(-keepCount);

    const summaryPrompt = toSummarize
      .map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n\n');

    const model = getModel(this.state_?.model ?? DEFAULTS.model, this.env);

    const summaryResult = await generateText({
      model,
      system: 'Summarize the following conversation history in a concise way, preserving key facts, decisions, and context that would be needed to continue the conversation.',
      prompt: summaryPrompt,
      maxOutputTokens: 2048,
      temperature: 0.3,
    });

    this.sql.exec('DELETE FROM messages');
    this.history = [];
    const newHistory: ModelMessage[] = [
      { role: 'user', content: '[Previous conversation summary]' },
      { role: 'assistant', content: summaryResult.text },
      ...keepRecent,
    ];
    this.appendMessages(newHistory);

    if (this.state_) {
      this.state_.messageCount = newHistory.length;
      this.saveState(this.state_);
    }

    return { ok: true, summarizedMessages: toSummarize.length, remainingMessages: newHistory.length };
  }

  async getHistory(): Promise<unknown[]> {
    return this.history;
  }

  async getMetadata(): Promise<SessionState | null> {
    return this.state_;
  }

  async configure(updates: Partial<SessionState>): Promise<SessionState> {
    if (!this.state_) {
      throw new Error('Session not initialized');
    }

    if (updates.model) this.state_.model = updates.model;
    if (updates.systemPrompt) this.state_.systemPrompt = updates.systemPrompt;
    if (updates.thinkingLevel) this.state_.thinkingLevel = updates.thinkingLevel;
    if (updates.temperature !== undefined) this.state_.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) this.state_.maxTokens = updates.maxTokens;

    this.saveState(this.state_);
    return this.state_;
  }

  // ─── Private helpers ───────────────────────────────────────

  /** Handle a /command. Returns reply text, or null for unknown commands. */
  private async handleCommand(input: MessageInput): Promise<string | null> {
    const parts = input.text.split(/\s+/);
    const cmd = parts[0]!.toLowerCase().replace(/@\w+$/, '');
    const arg = parts.slice(1).join(' ').trim();

    switch (cmd) {
      case '/start':
        return `Hello ${input.senderName}! I'm your AI assistant. Just send me a message to get started.\n\nType /help to see available commands.`;

      case '/help':
        return (
          'Available commands:\n' +
          '/help — Show this message\n' +
          '/reset — Clear conversation history\n' +
          '/compact — Summarize old messages to save context\n' +
          '/model — Show current model\n' +
          '/model <name> — Switch model (e.g. anthropic/claude-sonnet-4-20250514)\n' +
          '/agent — Show current agent\n' +
          '/agent <id> — Switch agent\n' +
          '/whoami — Show your identity info\n' +
          '/status — Show bot status'
        );

      case '/reset': {
        await this.reset();
        return 'Conversation has been reset.';
      }

      case '/compact': {
        const result = await this.compact();
        return result.message ?? `Compacted: ${result.summarizedMessages} messages summarized, ${result.remainingMessages} remaining.`;
      }

      case '/model': {
        if (!arg) {
          const agent = await getAgent(this.env.DB, this.env.CACHE, input.agentId);
          const currentModel = this.state_?.model ?? agent?.model ?? DEFAULTS.model;
          return `Current model: ${currentModel}`;
        }
        try {
          await this.configure({ model: arg });
          return `Model switched to: ${arg}`;
        } catch {
          return 'Failed to switch model. Is the session initialized?';
        }
      }

      case '/agent': {
        if (!arg) {
          const agent = await getAgent(this.env.DB, this.env.CACHE, input.agentId);
          if (agent) {
            return (
              `Current agent: ${agent.id}\n` +
              `Name: ${agent.displayName ?? '(none)'}\n` +
              `Model: ${agent.model}\n` +
              `Thinking: ${agent.thinkingLevel ?? 'none'}`
            );
          }
          return `Current agent: ${input.agentId} (not found in DB)`;
        }
        const agent = await getAgent(this.env.DB, this.env.CACHE, arg);
        if (!agent) {
          const { results } = await this.env.DB.prepare('SELECT id, display_name FROM agents ORDER BY id').all();
          const list = results.map(r => `  ${r.id}${r.display_name ? ` (${r.display_name})` : ''}`).join('\n');
          return `Agent "${arg}" not found. Available agents:\n${list}`;
        }
        return (
          `Agent: ${agent.id}\n` +
          `Name: ${agent.displayName ?? '(none)'}\n` +
          `Model: ${agent.model}\n` +
          `Thinking: ${agent.thinkingLevel ?? 'none'}\n\n` +
          'Note: To route this chat to a different agent, use the admin API to update bindings.'
        );
      }

      case '/whoami': {
        const canonicalId = await getCanonicalId(this.env.DB, input.replyTo.channel, input.senderId);
        const allowed = await isAllowed(this.env.DB, input.replyTo.channel, input.senderId);
        return (
          `Name: ${input.senderName}\n` +
          `Channel: ${input.replyTo.channel}\n` +
          `Sender ID: ${input.senderId}\n` +
          `Canonical ID: ${canonicalId}\n` +
          `Chat: ${input.replyTo.chatId} (${input.replyTo.chatType})\n` +
          `Allowlisted: ${allowed ? 'yes' : 'no'}\n` +
          `Session: ${input.sessionKey}`
        );
      }

      case '/status': {
        const agent = await getAgent(this.env.DB, this.env.CACHE, input.agentId);
        return (
          `Pincer is running.\n` +
          `Agent: ${input.agentId}${agent?.displayName ? ` (${agent.displayName})` : ''}\n` +
          `Model: ${agent?.model ?? DEFAULTS.model}\n` +
          `Channel: ${input.replyTo.channel}\n` +
          `Chat: ${input.replyTo.chatId}`
        );
      }

      default:
        return null;
    }
  }

  private startTypingIndicator(dest: ReplyDestination): ReturnType<typeof setInterval> | null {
    if (dest.channel !== 'telegram') return null;
    const send = () => sendTelegramChatAction(dest.chatId, 'typing', this.env.TELEGRAM_BOT_TOKEN).catch(() => {});
    send();
    return setInterval(send, 4_000);
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
      case 'discord':
        if (dest.interactionToken) {
          await editDiscordInteractionResponse(
            this.env.DISCORD_APP_ID,
            dest.interactionToken,
            text,
            this.env.DISCORD_BOT_TOKEN,
          );
        }
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
