import type { Env } from '../env.ts';
import type { LLMProvider, LLMRequest, LLMResponse } from './providers/types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';

export function getProvider(providerName: string, env: Env): LLMProvider {
  const gatewayEndpoint = env.AI_GATEWAY_ENDPOINT
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ENDPOINT}`
    : undefined;

  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, gatewayEndpoint);
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}

export function parseModelString(model: string): { provider: string; model: string } {
  const slash = model.indexOf('/');
  if (slash === -1) {
    return { provider: 'anthropic', model };
  }
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

export async function callLLM(env: Env, request: LLMRequest): Promise<LLMResponse> {
  const { provider: providerName, model } = parseModelString(request.model);
  const provider = getProvider(providerName, env);

  const { url, headers, body } = provider.formatRequest({ ...request, model });

  const startTime = Date.now();
  console.log("BODY========\n")
  console.log(JSON.stringify(body))
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errorText}`);
  }

  const rawResponse = await response.json();
  const result = provider.parseResponse(rawResponse);
  const durationMs = Date.now() - startTime;

  console.log(
    `LLM call: provider=${providerName} model=${model} input=${result.usage.inputTokens} output=${result.usage.outputTokens} duration=${durationMs}ms`
  );

  return result;
}
