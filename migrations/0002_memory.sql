-- Drop old unused memory table
DROP TABLE IF EXISTS memory_entries;

-- New memory entries table with three-scope support
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,                        -- 'user' | 'group' | 'agent'
    scope_id TEXT NOT NULL,                     -- canonical_id | session_key | agent_id
    content TEXT NOT NULL,
    category TEXT,                              -- 'fact' | 'preference' | 'instruction' | 'context' | 'decision'
    tags TEXT,                                  -- JSON array of strings
    source TEXT NOT NULL DEFAULT 'explicit',    -- 'explicit' | 'auto'
    source_session_key TEXT,
    superseded_by TEXT,                         -- id of newer memory that replaces this
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_memory_scope ON memory_entries(scope, scope_id);
