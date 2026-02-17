import type { Env } from '../env.ts';
import type { MemoryEntry, MemoryScope, ScoredMemory } from './types.ts';
import { embedText } from './embed.ts';

export interface SearchFilter {
  scope: MemoryScope;
  scopeId: string;
  topK: number;
}

export async function searchByVector(
  env: Env,
  vector: number[],
  filter: SearchFilter
): Promise<ScoredMemory[]> {
  const results = await env.MEMORY.query(vector, {
    topK: filter.topK,
    filter: { scope: filter.scope, scope_id: filter.scopeId },
    returnMetadata: 'all',
  });

  if (results.matches.length === 0) return [];

  return hydrateMatches(env, results.matches);
}

export async function searchMemories(
  env: Env,
  query: string,
  filter: SearchFilter
): Promise<ScoredMemory[]> {
  const vector = await embedText(env, query);
  return searchByVector(env, vector, filter);
}

export async function searchMultiScope(
  env: Env,
  vector: number[],
  filters: SearchFilter[]
): Promise<ScoredMemory[]> {
  const results = await Promise.all(
    filters.map((f) => searchByVector(env, vector, f))
  );

  const all = results.flat();
  all.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  return all.filter((s) => {
    if (seen.has(s.entry.id)) return false;
    seen.add(s.entry.id);
    return true;
  });
}

async function hydrateMatches(
  env: Env,
  matches: VectorizeMatch[]
): Promise<ScoredMemory[]> {
  const ids = matches.map((m) => m.id);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const { results } = await env.DB.prepare(
    `SELECT * FROM memory_entries WHERE id IN (${placeholders}) AND superseded_by IS NULL`
  )
    .bind(...ids)
    .all();

  const rowMap = new Map<string, typeof results[number]>();
  for (const row of results) {
    rowMap.set(row.id as string, row);
  }

  const scored: ScoredMemory[] = [];
  for (const match of matches) {
    const row = rowMap.get(match.id);
    if (!row) continue;

    scored.push({
      entry: rowToEntry(row),
      score: match.score,
    });
  }

  return scored;
}

export function rowToEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: row.id as string,
    scope: row.scope as MemoryScope,
    scopeId: row.scope_id as string,
    content: row.content as string,
    category: (row.category as MemoryEntry['category']) ?? null,
    tags: row.tags ? JSON.parse(row.tags as string) : null,
    source: row.source as MemoryEntry['source'],
    sourceSessionKey: (row.source_session_key as string) ?? null,
    supersededBy: (row.superseded_by as string) ?? null,
    createdAt: row.created_at as number,
  };
}
