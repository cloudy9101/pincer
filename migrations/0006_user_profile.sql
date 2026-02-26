CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, key)
);
