export async function getCanonicalId(db: D1Database, channel: string, peerId: string): Promise<string> {
  const row = await db
    .prepare('SELECT canonical_id FROM identity_links WHERE channel = ? AND peer_id = ?')
    .bind(channel, peerId)
    .first();
  return row ? (row.canonical_id as string) : `${channel}:${peerId}`;
}

export async function linkIdentity(
  db: D1Database,
  canonicalId: string,
  channel: string,
  peerId: string
): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO identity_links (canonical_id, channel, peer_id) VALUES (?, ?, ?)')
    .bind(canonicalId, channel, peerId)
    .run();
}

export async function getLinkedIdentities(
  db: D1Database,
  canonicalId: string
): Promise<Array<{ channel: string; peerId: string }>> {
  const { results } = await db
    .prepare('SELECT channel, peer_id FROM identity_links WHERE canonical_id = ?')
    .bind(canonicalId)
    .all();
  return results.map((r) => ({ channel: r.channel as string, peerId: r.peer_id as string }));
}
