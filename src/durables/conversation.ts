import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.ts';
import type { LLMMessage, LLMContentBlock } from '../llm/providers/types.ts';
import type { ToolRegistryEntry } from '../llm/tool-registry.ts';
import { callLLM } from '../llm/gateway.ts';
import { buildToolList, getToolDefinitions } from '../llm/tool-registry.ts';
import { executeTool, type ToolCallContext } from '../llm/tool-executor.ts';
import {
  userMessage,
  assistantMessage,
  toolResultMessage,
  extractTextContent,
  extractToolCalls,
} from '../llm/message-formatter.ts';
import { DEFAULTS } from '../config/defaults.ts';

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

const MAX_TOOL_LOOPS = 20;

export class ConversationDO extends DurableObject<Env> {
  private history: LLMMessage[] = [];
  private state_: SessionState | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.history = (await this.ctx.storage.get<LLMMessage[]>('history')) ?? [];
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

    // Add user message
    this.history.push(userMessage(body.text));
    this.state_.messageCount++;

    // Build tools
    const tools = await buildToolList(this.env.DB, this.env.CACHE);
    const toolDefs = getToolDefinitions(tools);

    const toolCtx: ToolCallContext = {
      env: this.env,
      sessionKey: body.sessionKey,
      userId: this.state_.userId,
    };

    // LLM loop
    let loopCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalModel = this.state_.model;

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      const response = await callLLM(this.env, {
        model: this.state_.model,
        messages: this.history,
        systemPrompt: this.state_.systemPrompt,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        maxTokens: this.state_.maxTokens,
        temperature: this.state_.temperature,
        thinkingLevel: this.state_.thinkingLevel,
      });

      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;
      finalModel = response.model;

      // Add assistant response to history
      this.history.push(assistantMessage(response.content));
      this.state_.messageCount++;

      // Check if we have tool calls
      const toolCalls = extractToolCalls(response.content);

      if (response.stopReason !== 'tool_use' || toolCalls.length === 0) {
        // Done - extract text response
        const text = extractTextContent(response.content);
        await this.persist();

        // Log usage
        await this.logUsage(body.sessionKey, finalModel, totalInputTokens, totalOutputTokens);

        return json({ text, toolCallCount: loopCount - 1 });
      }

      // Execute tool calls
      for (const call of toolCalls) {
        const result = await executeTool(call.name, call.input, tools, toolCtx);
        this.history.push(toolResultMessage(call.id, result));
        this.state_.messageCount++;
      }
    }

    // Max loops hit
    await this.persist();
    return json({ text: 'I reached the maximum number of tool calls. Please try again.', toolCallCount: loopCount });
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
    const summaryPrompt = `Summarize the following conversation history in a concise way, preserving key facts, decisions, and context that would be needed to continue the conversation:\n\n${toSummarize.map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : extractTextContent(m.content as LLMContentBlock[])}`).join('\n\n')}`;

    const summaryResponse = await callLLM(this.env, {
      model: this.state_?.model ?? DEFAULTS.model,
      messages: [userMessage(summaryPrompt)],
      maxTokens: 2048,
      temperature: 0.3,
    });

    const summaryText = extractTextContent(summaryResponse.content);

    // Replace history with summary + recent messages
    this.history = [
      { role: 'system', content: `[Previous conversation summary]: ${summaryText}` },
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
    const { provider } = parseModelForLogging(model);
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

function parseModelForLogging(model: string): { provider: string; model: string } {
  const slash = model.indexOf('/');
  if (slash === -1) return { provider: 'unknown', model };
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
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
