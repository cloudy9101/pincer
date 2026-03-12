/**
 * Bootstrap utilities — auto-generate encryption key, resolve bot token,
 * and manage admin sessions.
 */

const KV_ENCRYPTION_KEY = '__encryption_key';
const KV_BOT_TOKEN = '__telegram_bot_token';
const KV_TELEGRAM_WEBHOOK_SECRET = '__telegram_webhook_secret';
const KV_ONBOARDED = '__onboarded';
const SESSION_PREFIX = 'session:';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Resolve the AES-256-GCM encryption key.
 * Auto-generates and persists to KV on first access.
 */
export async function ensureEncryptionKey(cache: KVNamespace): Promise<string> {
  const cached = await cache.get(KV_ENCRYPTION_KEY);
  if (cached) return cached;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  await cache.put(KV_ENCRYPTION_KEY, key);
  return key;
}

/**
 * Resolve the Telegram bot token from KV.
 */
export async function resolveBotToken(cache: KVNamespace): Promise<string | null> {
  return await cache.get(KV_BOT_TOKEN);
}

/**
 * Store the Telegram bot token in KV.
 */
export async function storeBotToken(cache: KVNamespace, token: string): Promise<void> {
  await cache.put(KV_BOT_TOKEN, token);
}

export async function resolveTGWebhookSecret(cache: KVNamespace): Promise<string | null> {
  return await cache.get(KV_TELEGRAM_WEBHOOK_SECRET);
}

export async function storeTGWebhookSecret(cache: KVNamespace, secret: string): Promise<void> {
  await cache.put(KV_TELEGRAM_WEBHOOK_SECRET, secret);
}

/**
 * Check whether setup has been completed.
 */
export async function isOnboarded(cache: KVNamespace): Promise<boolean> {
  return (await cache.get(KV_ONBOARDED)) === 'true';
}

/**
 * Mark setup as complete.
 */
export async function markOnboarded(cache: KVNamespace): Promise<void> {
  await cache.put(KV_ONBOARDED, 'true');
}

/**
 * Create a new admin session and persist it in KV.
 * Returns the session token (64-byte hex string).
 */
export async function createAdminSession(cache: KVNamespace, meta?: Record<string, unknown>): Promise<string> {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  await cache.put(
    `${SESSION_PREFIX}${token}`,
    JSON.stringify({ created: Date.now(), ...meta }),
    { expirationTtl: SESSION_TTL },
  );
  return token;
}

/**
 * Check whether a session token is valid (exists in KV).
 */
export async function validateAdminSession(cache: KVNamespace, token: string): Promise<boolean> {
  const val = await cache.get(`${SESSION_PREFIX}${token}`);
  return val !== null;
}
