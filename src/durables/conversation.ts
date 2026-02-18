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
import { sendTelegramMessage } from '../channels/telegram/send.ts';
import { getAgent } from '../config/loader.ts';
import { getCanonicalId } from '../routing/identity-links.ts';
import { isAllowed } from '../security/allowlist.ts';

export interface ReplyDestination {
  channel: string;
  chatId: string;
  chatType: string;
  channelMessageId?: string;
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
  text: string;
  sent: boolean;
  toolCallCount: number;
  steps: number;
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
    // Commands: handle and reply, no LLM
    if (input.text.startsWith('/')) {
      const reply = await this.handleCommand(input);
      if (reply !== null) {
        let sent = false;
        try {
          await this.sendReply(input.replyTo, reply);
          sent = true;
        } catch (e) {
          console.error('Failed to send command reply:', e);
        }
        return { text: reply, sent, toolCallCount: 0, steps: 0 };
      }
      // Unknown command — ignore
      return { text: '', sent: false, toolCallCount: 0, steps: 0 };
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

    // Add user message
    this.appendMessages([{ role: 'user', content: input.text }]);
    this.state_.messageCount++;

    // Build tools
    const toolCtx: ToolCallContext = {
      env: this.env,
      sessionKey: input.sessionKey,
      userId: this.state_.userId,
    };
    const tools = await buildToolSet(toolCtx);

    const model = getModel(this.state_.model, this.env);

    const memoryCtx: MemoryContext = {
      sessionKey: input.sessionKey,
      userId: this.state_.userId,
      agentId: this.state_.agentId,
    };

    let systemPrompt = this.state_.systemPrompt;
    const memorySection = await retrieveMemories(this.env, input.text, memoryCtx);
    if (memorySection) {
      systemPrompt = systemPrompt + memorySection;
    }

    const skills = await loadActiveSkills(this.env);
    const skillsSection = await formatSkillsPrompt(skills, this.env);
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

    const stepCount = result.response.messages.length;
    const toolCallCount = result.toolCalls?.length ?? 0;

    // Send reply before persisting
    let sent = false;
    if (result.text) {
      try {
        await this.sendReply(input.replyTo, result.text);
        sent = true;
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
    await this.logUsage(input.sessionKey, this.state_.model, inputTokens, outputTokens);

    if (DEFAULTS.memoryAutoExtractEnabled && result.text) {
      this.ctx.waitUntil(
        extractAndStoreMemories(this.env, model, input.text, result.text, memoryCtx)
      );
    }

    return { text: result.text, sent, toolCallCount, steps: stepCount };
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
