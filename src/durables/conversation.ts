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

export class ConversationDO extends DurableObject<Env> {
  private history: ModelMessage[] = [];
  private state_: SessionState | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.history = (await this.ctx.storage.get<ModelMessage[]>('history')) ?? [];
    this.state_ = (await this.ctx.storage.get<SessionState>('metadata')) ?? null;
    this.initialized = true;
  }

  override async fetch(request: Request): Promise<Response> {
    await this.initialize();

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
        return json(this.history);
      case '/metadata':
        if (request.method !== 'GET') return methodNotAllowed();
        return json(this.state_);
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
    };

    // Initialize state if first message
    if (!this.state_) {
      this.state_ = {
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

    // Migrate legacy state: backfill fields added after initial deployment
    if (!this.state_.userId) this.state_.userId = body.userId;
    if (!this.state_.agentId) this.state_.agentId = body.agentId;

    // Add user message to history
    this.history.push({ role: 'user', content: body.text });
    this.state_.messageCount++;

    // Build tools
    const toolCtx: ToolCallContext = {
      env: this.env,
      sessionKey: body.sessionKey,
      userId: this.state_.userId,
    };
    const tools = await buildToolSet(toolCtx);

    // Get the AI SDK model
    const model = getModel(this.state_.model, this.env);

    // Build memory context
    const memoryCtx: MemoryContext = {
      sessionKey: body.sessionKey,
      userId: this.state_.userId,
      agentId: this.state_.agentId,
    };

    // Retrieve relevant memories and augment system prompt
    let systemPrompt = this.state_.systemPrompt;
    const memorySection = await retrieveMemories(this.env, body.text, memoryCtx);
    if (memorySection) {
      systemPrompt = systemPrompt + memorySection;
    }

    // Build provider options for thinking
    const providerOptions = buildProviderOptions(this.state_);

    // Call generateText with automatic tool loop
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

    // Append the generated messages to history
    this.history.push(...result.response.messages);
    this.state_.messageCount += result.response.messages.length;

    await this.persist();

    // Log usage
    const inputTokens = result.totalUsage.inputTokens ?? 0;
    const outputTokens = result.totalUsage.outputTokens ?? 0;
    await this.logUsage(body.sessionKey, this.state_.model, inputTokens, outputTokens);

    // Auto-extract memories in background
    if (DEFAULTS.memoryAutoExtractEnabled && result.text) {
      this.ctx.waitUntil(
        extractAndStoreMemories(this.env, model, body.text, result.text, memoryCtx)
      );
    }

    const stepCount = result.response.messages.length;
    const toolCallCount = result.toolCalls?.length ?? 0;

    return json({ text: result.text, toolCallCount, steps: stepCount });
  }

  private async handleReset(): Promise<Response> {
    this.history = [];
    if (this.state_) {
      this.state_.messageCount = 0;
    }
    await this.persist();
    return json({ ok: true });
  }

  private async handleCompact(): Promise<Response> {
    if (this.history.length < DEFAULTS.compactionThreshold) {
      return json({ ok: true, message: 'No compaction needed' });
    }

    const keepRecent = this.history.slice(-DEFAULTS.compactionKeepRecent);
    const toSummarize = this.history.slice(0, -DEFAULTS.compactionKeepRecent);

    // Create a summary using the LLM
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

    // Replace history with summary + recent messages
    this.history = [
      { role: 'user', content: '[Previous conversation summary]' },
      { role: 'assistant', content: summaryResult.text },
      ...keepRecent,
    ];

    await this.persist();
    return json({ ok: true, summarizedMessages: toSummarize.length, remainingMessages: this.history.length });
  }

  private async handleConfigure(request: Request): Promise<Response> {
    const updates = (await request.json()) as Partial<SessionState>;

    if (!this.state_) {
      return new Response('Session not initialized', { status: 400 });
    }

    if (updates.model) this.state_.model = updates.model;
    if (updates.systemPrompt) this.state_.systemPrompt = updates.systemPrompt;
    if (updates.thinkingLevel) this.state_.thinkingLevel = updates.thinkingLevel;
    if (updates.temperature !== undefined) this.state_.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) this.state_.maxTokens = updates.maxTokens;

    await this.persist();
    return json({ ok: true, state: this.state_ });
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('history', this.history);
    if (this.state_) {
      await this.ctx.storage.put('metadata', this.state_);
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
