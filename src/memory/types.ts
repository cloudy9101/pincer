export type MemoryScope = 'user' | 'group' | 'agent';

export type MemoryCategory = 'fact' | 'preference' | 'instruction' | 'context' | 'decision';

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  scopeId: string;
  content: string;
  category: MemoryCategory | null;
  tags: string[] | null;
  source: 'explicit' | 'auto';
  sourceSessionKey: string | null;
  supersededBy: string | null;
  createdAt: number;
}

export interface MemoryInput {
  content: string;
  scope: MemoryScope;
  scopeId: string;
  category?: MemoryCategory;
  tags?: string[];
  source?: 'explicit' | 'auto';
  sourceSessionKey?: string;
}

export interface ScoredMemory {
  entry: MemoryEntry;
  score: number;
}

export interface MemoryContext {
  sessionKey: string;
  userId: string;
  agentId: string;
}
