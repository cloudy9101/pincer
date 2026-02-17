import type { Env } from '../env.ts';
import type { MemoryInput, MemoryEntry } from './types.ts';
import { generateId } from '../utils/crypto.ts';
import { embedText } from './embed.ts';
import { searchByVector } from './search.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { log } from '../utils/logger.ts';

export async function storeMemory(env: Env, input: MemoryInput): Promise<MemoryEntry | null> {
  const vector = await embedText(env, input.content);

  // Deduplication: check for similar existing memories in same scope
  const similar = await searchByVector(env, vector, {
    scope: input.scope,
    scopeId: input.scopeId,
    topK: 3,
  });

  const threshold = DEFAULTS.memoryDeduplicationThreshold;
  const duplicate = similar.find((s) => s.score >= threshold);

  if (duplicate) {
    // Auto-extracted duplicates are silently skipped
    if (input.source === 'auto') {
      return null;
    }
    // Explicit saves supersede the old memory
    return supersede(env, duplicate.entry, input, vector);
  }

  const id = generateId();
  const entry: MemoryEntry = {
    id,
    scope: input.scope,
    scopeId: input.scopeId,
    content: input.content,
    category: input.category ?? null,
    tags: input.tags ?? null,
    source: input.source ?? 'explicit',
    sourceSessionKey: input.sourceSessionKey ?? null,
    supersededBy: null,
    createdAt: Math.floor(Date.now() / 1000),
  };

  await Promise.all([
    env.DB.prepare(
      `INSERT INTO memory_entries (id, scope, scope_id, content, category, tags, source, source_session_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.id,
        entry.scope,
        entry.scopeId,
        entry.content,
        entry.category,
        entry.tags ? JSON.stringify(entry.tags) : null,
        entry.source,
        entry.sourceSessionKey
      )
      .run(),

    env.MEMORY.upsert([
      {
        id: entry.id,
        values: vector,
        metadata: { scope: entry.scope, scope_id: entry.scopeId },
      },
    ]),
  ]);

  log('info', 'Memory stored', { id: entry.id, scope: entry.scope, source: entry.source });
  return entry;
}

async function supersede(
  env: Env,
  old: MemoryEntry,
  input: MemoryInput,
  vector: number[]
): Promise<MemoryEntry> {
  const id = generateId();
  const entry: MemoryEntry = {
    id,
    scope: input.scope,
    scopeId: input.scopeId,
    content: input.content,
    category: input.category ?? old.category,
    tags: input.tags ?? old.tags,
    source: input.source ?? 'explicit',
    sourceSessionKey: input.sourceSessionKey ?? null,
    supersededBy: null,
    createdAt: Math.floor(Date.now() / 1000),
  };

  await Promise.all([
    env.DB.prepare('UPDATE memory_entries SET superseded_by = ? WHERE id = ?')
      .bind(id, old.id)
      .run(),

    env.DB.prepare(
      `INSERT INTO memory_entries (id, scope, scope_id, content, category, tags, source, source_session_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.id,
        entry.scope,
        entry.scopeId,
        entry.content,
        entry.category,
        entry.tags ? JSON.stringify(entry.tags) : null,
        entry.source,
        entry.sourceSessionKey
      )
      .run(),

    env.MEMORY.upsert([
      {
        id: entry.id,
        values: vector,
        metadata: { scope: entry.scope, scope_id: entry.scopeId },
      },
    ]),

    env.MEMORY.deleteByIds([old.id]),
  ]);

  log('info', 'Memory superseded', { oldId: old.id, newId: entry.id });
  return entry;
}

export async function deleteMemory(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id FROM memory_entries WHERE id = ?').bind(id).first();
  if (!row) return false;

  await Promise.all([
    env.DB.prepare('DELETE FROM memory_entries WHERE id = ?').bind(id).run(),
    env.MEMORY.deleteByIds([id]),
  ]);

  return true;
}
