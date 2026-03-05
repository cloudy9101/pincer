import type { LanguageModel } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
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
 * Build a LanguageModel from a `workers-ai/<model-id>` string.
 * All inference runs through the env.AI Workers AI binding — no external keys needed.
 */
export function getModel(modelString: string, env: Env): LanguageModel {
  const { model } = parseModelString(modelString);
  const workersai = createWorkersAI({ binding: env.AI });
  return workersai(model) as LanguageModel;
}
