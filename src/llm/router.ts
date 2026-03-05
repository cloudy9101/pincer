/**
 * Workers AI routing layer.
 *
 * Uses Granite 4.0 H Micro — an ultra-low-latency model — to classify each
 * request into a complexity tier, then maps that tier to the most appropriate
 * Workers AI model:
 *
 *   simple   → Qwen3-30B-A3B-FP8 (cheapest, MoE, low latency)
 *   agentic  → GLM-4.7 Flash     (agentic-optimised, strong tool use)
 *   complex  → Llama 3.3 70B     (high-capability fallback)
 *
 * The router itself calls env.AI.run() directly (no AI SDK overhead) because
 * it only needs a single classification token, not a streaming LanguageModel.
 */

import type { Env } from '../env.ts';

// ─── Workers AI model identifiers ──────────────────────────────────────────

/** Primary model: cheapest MoE, low latency — good for most requests. */
export const MODEL_PRIMARY = '@cf/qwen/qwen3-30b-a3b-fp8';

/** Agentic model: optimised for multi-step tool-calling tasks. */
export const MODEL_AGENTIC = '@cf/thudm/glm-4-7-flash';

/** Router model: ultra-light classifier, runs before every routed request. */
export const MODEL_ROUTER = '@cf/ibm/granite-4.0-h-micro';

/** Fallback model: highest capability for complex reasoning tasks. */
export const MODEL_FALLBACK = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ─── Public model string for "auto" routing ─────────────────────────────────

/** Pass this model string to getModel() / session config to enable routing. */
export const WORKERS_AI_AUTO = 'workers-ai/auto';

// ─── Tier type ───────────────────────────────────────────────────────────────

export type RouteTier = 'simple' | 'agentic' | 'complex';

export interface RouterContext {
  /** The user's latest message text (will be truncated for the classifier). */
  message: string;
  /** Whether any tools are available in this session. */
  hasTools: boolean;
  /** Number of messages already in conversation history. */
  historyLength: number;
}

// ─── Tier → model mapping ────────────────────────────────────────────────────

export function tierToModel(tier: RouteTier): string {
  switch (tier) {
    case 'simple':  return MODEL_PRIMARY;
    case 'agentic': return MODEL_AGENTIC;
    case 'complex': return MODEL_FALLBACK;
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

/**
 * Classify the request and return the fully-qualified Workers AI model ID
 * (e.g. `@cf/qwen/qwen3-30b-a3b-fp8`).
 *
 * Falls back to MODEL_PRIMARY without throwing if the classifier fails.
 */
export async function routeModel(ctx: RouterContext, env: Env): Promise<string> {
  try {
    const tier = await classify(ctx, env);
    return tierToModel(tier);
  } catch {
    // Classifier failure is non-fatal — use the primary model.
    return MODEL_PRIMARY;
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM = `You are a request complexity classifier. Respond with exactly one word.

Tiers:
- simple   → casual chat, single Q&A, brief factual lookup, short text generation
- agentic  → multi-step tasks, tool/function calls, coding tasks, task automation
- complex  → deep reasoning, long document analysis, research synthesis, hard math

Reply ONLY with: simple | agentic | complex`;

async function classify(ctx: RouterContext, env: Env): Promise<RouteTier> {
  const snippet = ctx.message.slice(0, 400);
  const meta = [
    ctx.hasTools ? 'tools:yes' : 'tools:no',
    `history:${ctx.historyLength}`,
  ].join(' ');

  const userContent = `[${meta}]\n${snippet}`;

  const result = await env.AI.run(MODEL_ROUTER as Parameters<typeof env.AI.run>[0], {
    messages: [
      { role: 'system', content: CLASSIFIER_SYSTEM },
      { role: 'user',   content: userContent },
    ],
    max_tokens: 5,
  }) as { response?: string };

  const raw = (result.response ?? '').trim().toLowerCase();

  if (raw.startsWith('simple'))  return 'simple';
  if (raw.startsWith('agentic')) return 'agentic';
  if (raw.startsWith('complex')) return 'complex';

  // Heuristic fallback: if tools available default to agentic, otherwise simple
  return ctx.hasTools ? 'agentic' : 'simple';
}
