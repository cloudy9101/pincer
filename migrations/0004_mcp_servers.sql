CREATE TABLE mcp_servers (
    name TEXT PRIMARY KEY,
    display_name TEXT,
    description TEXT,
    url TEXT NOT NULL,
    transport_type TEXT NOT NULL DEFAULT 'http',
    tool_schemas TEXT,           -- JSON: cached [{name, description, inputSchema}]
    tool_whitelist TEXT,         -- JSON array of tool names to expose (null = all)
    status TEXT NOT NULL DEFAULT 'active',
    discovered_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE mcp_server_headers (
    server_name TEXT NOT NULL REFERENCES mcp_servers(name) ON DELETE CASCADE,
    key TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    PRIMARY KEY (server_name, key)
);
