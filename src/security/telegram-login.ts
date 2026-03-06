/**
 * Telegram Login Widget verification.
 *
 * Implements the HMAC-SHA256 check described at
 * https://core.telegram.org/widgets/login#checking-authorization
 */

export interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_AUTH_AGE_SECONDS = 86400; // 24 hours

/**
 * Verify Telegram Login Widget callback data.
 *
 * Algorithm (Login Widget variant):
 *   1. Build data-check-string — all fields except `hash`, sorted by key, joined with "\n".
 *   2. secret_key = SHA-256(bot_token)
 *   3. expected  = HMAC-SHA-256(secret_key, data-check-string)  → hex
 *   4. Compare expected with received hash.
 *   5. Reject if auth_date is older than 24 h.
 */
export async function verifyTelegramLogin(
  data: TelegramLoginData,
  botToken: string,
): Promise<boolean> {
  // Check freshness
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > MAX_AUTH_AGE_SECONDS) return false;

  // Build data-check-string
  const fields: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'hash' || value === undefined || value === null) continue;
    fields.push(`${key}=${value}`);
  }
  fields.sort();
  const checkString = fields.join('\n');

  // secret_key = SHA-256(bot_token)
  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(botToken);
  const secretKey = await crypto.subtle.digest('SHA-256', tokenBytes);

  // HMAC-SHA-256(secret_key, check_string)
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(checkString));
  const expected = [...new Uint8Array(signature)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return expected === data.hash;
}
