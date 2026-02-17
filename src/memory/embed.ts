import type { Env } from '../env.ts';
import { DEFAULTS } from '../config/defaults.ts';

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const result = await env.AI.run(DEFAULTS.memoryEmbeddingModel, {
    text: texts,
  }) as { shape: number[]; data: number[][] };
  return result.data;
}

export async function embedText(env: Env, text: string): Promise<number[]> {
  const results = await embedTexts(env, [text]);
  return results[0]!;
}
