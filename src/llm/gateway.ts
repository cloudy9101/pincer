import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { Env } from '../env.ts';

export function parseModelString(model: string): { provider: string; model: string } {
  const slash = model.indexOf('/');
  if (slash === -1) return { provider: 'anthropic', model };
  return { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

export function getModel(modelString: string, env: Env): LanguageModel {
  const { provider, model } = parseModelString(modelString);

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      });
      return anthropic(model);
    }
    case 'openai': {
      const openai = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
      return openai(model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: env.GOOGLE_AI_API_KEY,
      });
      return google(model);
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
