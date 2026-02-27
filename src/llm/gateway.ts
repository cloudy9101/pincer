import type { LanguageModel } from 'ai';
import { createAiGateway } from 'ai-gateway-provider';
import { createAnthropic } from 'ai-gateway-provider/providers/anthropic';
import { createUnified } from 'ai-gateway-provider/providers/unified';
import type { Env } from '../env.ts';

export function parseModelString(model: string): { provider: string; model: string } {
  const slash = model.indexOf('/');
  if (slash === -1) return { provider: 'anthropic', model };
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

export function getModel(modelString: string, env: Env): LanguageModel {
  const { provider, model } = parseModelString(modelString);

  const aigateway = createAiGateway({
    accountId: env.CF_ACCOUNT_ID,
    gateway: env.CF_AIG_GATEWAY,
    apiKey: env.CF_AIG_TOKEN,
  });

  if (provider === 'anthropic') {
    // Use native Anthropic backend — preserves extended thinking providerOptions
    return aigateway(createAnthropic()(model)) as LanguageModel;
  }

  // All other providers (openai, google, etc.) via unified OpenAI-compat endpoint
  return aigateway(createUnified()(`${provider}/${model}`)) as LanguageModel;
}
