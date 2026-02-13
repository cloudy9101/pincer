import type { AllowlistEntry, PairingCode } from '../config/types.ts';
import { generatePairingCode } from '../utils/crypto.ts';
import { DEFAULTS } from '../config/defaults.ts';

export async function isAllowed(db: D1Database, channel: string, senderId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM allowlist WHERE channel = ? AND sender_id = ? AND status = ?')
    .bind(channel, senderId, 'active')
    .first();
  return row !== null;
}

export async function checkAllowlistEmpty(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT COUNT(*) as cnt FROM allowlist').first();
  return (row?.cnt as number) === 0;
}

export async function addToAllowlist(
  db: D1Database,
  channel: string,
  senderId: string,
  displayName?: string
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO allowlist (channel, sender_id, display_name) VALUES (?, ?, ?) ON CONFLICT(channel, sender_id) DO UPDATE SET status = ?, display_name = COALESCE(?, display_name)'
    )
    .bind(channel, senderId, displayName ?? null, 'active', displayName ?? null)
    .run();
}

export async function createPairingCode(
  db: D1Database,
  channel: string,
  senderId: string,
  senderName?: string
): Promise<string> {
  const code = generatePairingCode();
  const expiresAt = Math.floor(Date.now() / 1000) + DEFAULTS.pairingCodeTtlSeconds;

  await db
    .prepare('INSERT OR REPLACE INTO pairing_codes (code, channel, sender_id, sender_name, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(code, channel, senderId, senderName ?? null, expiresAt)
    .run();

  return code;
}

export async function approvePairingCode(db: D1Database, code: string): Promise<PairingCode | null> {
  const row = await db.prepare('SELECT * FROM pairing_codes WHERE code = ? AND used = 0').bind(code).first();
  if (!row) return null;

  const now = Math.floor(Date.now() / 1000);
  if ((row.expires_at as number) < now) return null;

  await db.prepare('UPDATE pairing_codes SET used = 1 WHERE code = ?').bind(code).run();

  await addToAllowlist(db, row.channel as string, row.sender_id as string, row.sender_name as string | undefined);

  return {
    code: row.code as string,
    channel: row.channel as string,
    senderId: row.sender_id as string,
    senderName: row.sender_name as string | null,
    expiresAt: row.expires_at as number,
    used: 1,
  };
}

export async function getAllowlist(db: D1Database): Promise<AllowlistEntry[]> {
  const { results } = await db.prepare('SELECT * FROM allowlist ORDER BY created_at DESC').all();
  return results.map((r) => ({
    id: r.id as number,
    channel: r.channel as string,
    senderId: r.sender_id as string,
    displayName: r.display_name as string | null,
    status: r.status as string,
  }));
}

export async function removeFromAllowlist(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM allowlist WHERE id = ?').bind(id).run();
  return result.meta.changes > 0;
}
