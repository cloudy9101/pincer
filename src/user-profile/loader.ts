import type { D1Database } from '@cloudflare/workers-types';
import { PROFILE_KEYS, type UserProfile, type ProfileKey } from './types.ts';

export async function loadProfile(db: D1Database, userId: string): Promise<UserProfile> {
  const { results } = await db
    .prepare('SELECT key, value FROM user_profiles WHERE user_id = ?')
    .bind(userId)
    .all<{ key: string; value: string }>();

  const profile: UserProfile = {};
  for (const row of results) {
    if ((PROFILE_KEYS as readonly string[]).includes(row.key)) {
      profile[row.key as ProfileKey] = row.value;
    }
  }
  return profile;
}

export async function saveProfile(db: D1Database, userId: string, fields: UserProfile): Promise<void> {
  const entries = Object.entries(fields).filter(
    ([key]) => (PROFILE_KEYS as readonly string[]).includes(key)
  );
  if (entries.length === 0) return;

  const stmts = entries.map(([key, value]) =>
    db
      .prepare(
        'INSERT INTO user_profiles (user_id, key, value, updated_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
      .bind(userId, key, value)
  );

  await db.batch(stmts);
}
