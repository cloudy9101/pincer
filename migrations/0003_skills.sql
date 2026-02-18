CREATE TABLE skills (
    name TEXT PRIMARY KEY,
    display_name TEXT,
    description TEXT,
    content TEXT NOT NULL,
    auth_type TEXT DEFAULT 'none',
    auth_config TEXT,
    source_url TEXT,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE skill_secrets (
    skill_name TEXT NOT NULL REFERENCES skills(name) ON DELETE CASCADE,
    key TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    PRIMARY KEY (skill_name, key)
);
