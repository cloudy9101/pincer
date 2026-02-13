-- agents
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4-20250514',
    system_prompt TEXT,
    thinking_level TEXT DEFAULT 'medium',
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO agents (id, display_name, model) VALUES ('main', 'Main', 'anthropic/claude-sonnet-4-20250514');

-- config (key-value)
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- bindings (agent routing)
CREATE TABLE bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    account_id TEXT,
    peer_kind TEXT,
    peer_id TEXT,
    guild_id TEXT,
    team_id TEXT,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    priority INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_bindings_channel ON bindings(channel);

-- allowlist
CREATE TABLE allowlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX idx_allowlist_unique ON allowlist(channel, sender_id);

-- pairing codes
CREATE TABLE pairing_codes (
    code TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);

-- identity links
CREATE TABLE identity_links (
    canonical_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (channel, peer_id)
);
CREATE INDEX idx_identity_canonical ON identity_links(canonical_id);

-- session metadata
CREATE TABLE session_metadata (
    session_key TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    model_override TEXT,
    thinking_override TEXT,
    last_activity INTEGER,
    message_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- plugins
CREATE TABLE plugins (
    name TEXT PRIMARY KEY,
    display_name TEXT,
    description TEXT,
    version TEXT NOT NULL,
    worker_url TEXT NOT NULL,
    manifest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- plugin secrets
CREATE TABLE plugin_secrets (
    plugin_name TEXT NOT NULL REFERENCES plugins(name),
    key TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    PRIMARY KEY (plugin_name, key)
);

-- oauth connections
CREATE TABLE oauth_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    encrypted_tokens BLOB NOT NULL,
    scopes TEXT NOT NULL,
    provider_user_id TEXT,
    provider_email TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, provider)
);

-- oauth state (CSRF)
CREATE TABLE oauth_state (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    session_token TEXT NOT NULL,
    redirect_channel TEXT,
    redirect_chat_id TEXT,
    expires_at INTEGER NOT NULL
);

-- memory metadata
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    source_session_key TEXT,
    source_channel TEXT,
    tags TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_memory_user ON memory_entries(user_id);

-- cron jobs
CREATE TABLE cron_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    prompt TEXT NOT NULL,
    reply_channel TEXT,
    reply_chat_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- usage tracking
CREATE TABLE usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL,
    duration_ms INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_usage_session ON usage_log(session_key);
CREATE INDEX idx_usage_date ON usage_log(created_at);
