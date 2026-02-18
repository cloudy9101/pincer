import type { Env } from '../env.ts';
import type { MemoryContext, MemoryScope, ScoredMemory } from './types.ts';
import type { SearchFilter } from './search.ts';
import { embedText } from './embed.ts';
import { searchMultiScope } from './search.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { log } from '../utils/logger.ts';

/**
 * Determine which scopes to query based on session context.
 * DM: user + agent scopes.  Group: group + agent scopes.
 */
export function resolveScopes(ctx: MemoryContext): SearchFilter[] {
  const topK = DEFAULTS.memoryRetrievalTopK;
  const isDM = ctx.sessionKey.includes(':direct:');

  const filters: SearchFilter[] = [];

  if (isDM) {
    filters.push({ scope: 'user', scopeId: ctx.userId, topK });
  } else {
    filters.push({ scope: 'group', scopeId: ctx.sessionKey, topK });
  }

  filters.push({ scope: 'agent', scopeId: ctx.agentId, topK });

  return filters;
}

/**
 * Retrieve relevant memories for the current user message.
 * Returns formatted text to append to the system prompt, or null if no memories.
 */
export async function retrieveMemories(
  env: Env,
  userMessage: string,
  ctx: MemoryContext
): Promise<string | null> {
  try {
    const vector = await embedText(env, userMessage);
    const filters = resolveScopes(ctx);
    const memories = await searchMultiScope(env, vector, filters);
    log('error', `MEMORIES ${memories} ${memories.length === 0}`)

    if (memories.length === 0) return null;

    return formatMemories(memories);
  } catch (error) {
    log('error', 'Memory retrieval failed', { error: String(error) });
    return null;
  }
}

function formatMemories(memories: ScoredMemory[]): string {
  const lines = memories.map((m) => {
    const prefix = scopeLabel(m.entry.scope);
    const cat = m.entry.category ? ` [${m.entry.category}]` : '';
    return `- ${prefix}${cat}: ${m.entry.content}`;
  });

  return `\n\n## Memories\nThe following are relevant memories from previous conversations. Use them to personalize your responses, but do not explicitly mention that you are recalling memories unless asked.\n\n${lines.join('\n')}`;
}

function scopeLabel(scope: MemoryScope): string {
  switch (scope) {
    case 'user': return '[User]';
    case 'group': return '[Group]';
    case 'agent': return '[Global]';
  }
}
