-- OAuth provider credentials stored via admin dashboard.
-- client_secret is AES-256-GCM encrypted (same as skill_secrets).
CREATE TABLE IF NOT EXISTS oauth_provider_config (
    provider TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    encrypted_client_secret BLOB NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
