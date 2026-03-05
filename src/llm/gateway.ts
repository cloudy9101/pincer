import type { LanguageModel } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { createAiGateway } from 'ai-gateway-provider';
import { createAnthropic } from 'ai-gateway-provider/providers/anthropic';
import { createUnified } from 'ai-gateway-provider/providers/unified';
import type { Env } from '../env.ts';
import { routeModel, WORKERS_AI_AUTO, type RouterContext } from './router.ts';

export function parseModelString(model: string): { provider: string; model: string } {
  const slash = model.indexOf('/');
  if (slash === -1) return { provider: 'workers-ai', model };
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

/**
 * Resolve a `workers-ai/auto` model string by running the Granite router
 * classifier, then return the LanguageModel for the chosen Workers AI model.
 *
 * Use this instead of `getModel` at the start of every conversation turn so
 * the router can pick the best model for the incoming request.
 */
export async function resolveModel(
  modelString: string,
  ctx: RouterContext,
  env: Env,
): Promise<LanguageModel> {
  if (modelString === WORKERS_AI_AUTO) {
    const resolved = await routeModel(ctx, env);
    return getModel(`workers-ai/${resolved}`, env);
  }
  return getModel(modelString, env);
}

/**
 * Synchronously build a LanguageModel from a fully-resolved model string.
 *
 * Supported prefixes:
 *   `workers-ai/@cf/…`  — Workers AI via the env.AI binding (default)
 *   `anthropic/…`       — Anthropic via Cloudflare AI Gateway (BYOK)
 *   `openai/…`, etc.    — Other providers via AI Gateway unified endpoint
 *
 * Do NOT pass `workers-ai/auto` here — use resolveModel() for that.
 */
export function getModel(modelString: string, env: Env): LanguageModel {
  const { provider, model } = parseModelString(modelString);

  if (provider === 'workers-ai') {
    const workersai = createWorkersAI({ binding: env.AI });
    return workersai(model) as LanguageModel;
  }

  // Legacy external providers routed through Cloudflare AI Gateway (BYOK).
  const aigateway = createAiGateway({
    accountId: env.CF_ACCOUNT_ID,
    gateway: env.CF_AIG_GATEWAY,
    apiKey: env.CF_AIG_TOKEN,
  });

  if (provider === 'anthropic') {
    // Native Anthropic backend — preserves extended thinking providerOptions.
    return aigateway(createAnthropic()(model)) as LanguageModel;
  }

  // openai, google, mistral, etc. via OpenAI-compatible unified endpoint.
  return aigateway(createUnified()(`${provider}/${model}`)) as LanguageModel;
}
