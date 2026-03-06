/**
 * Bootstrap utilities — auto-generate encryption key, resolve bot token,
 * and manage admin sessions. Used during first-run onboarding when
 * secrets are not yet configured via environment variables.
 */

import type { Env } from '../env.ts';

const KV_ENCRYPTION_KEY = '__encryption_key';
const KV_BOT_TOKEN = '__telegram_bot_token';
const SESSION_PREFIX = 'session:';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Resolve the AES-256-GCM encryption key.
 * Priority: env var → KV → auto-generate and persist to KV.
 */
export async function ensureEncryptionKey(env: Env): Promise<string> {
  if (env.ENCRYPTION_KEY) return env.ENCRYPTION_KEY;

  const cached = await env.CACHE.get(KV_ENCRYPTION_KEY);
  if (cached) return cached;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.CACHE.put(KV_ENCRYPTION_KEY, key);
  return key;
}

/**
 * Resolve the Telegram bot token.
 * Priority: env var → KV (set during onboarding).
 */
export async function resolveBotToken(env: Env): Promise<string | null> {
  if (env.TELEGRAM_BOT_TOKEN) return env.TELEGRAM_BOT_TOKEN;
  return await env.CACHE.get(KV_BOT_TOKEN);
}

/**
 * Store the bot token in KV for fast runtime access.
 * The encrypted copy in D1 is handled separately by the onboarding endpoint.
 */
export async function storeBotToken(cache: KVNamespace, token: string): Promise<void> {
  await cache.put(KV_BOT_TOKEN, token);
}

/**
 * True when no ADMIN_AUTH_TOKEN env var is set (first-run / Telegram-Login-only mode).
 */
export function isBootstrapMode(env: Env): boolean {
  return !env.ADMIN_AUTH_TOKEN;
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
