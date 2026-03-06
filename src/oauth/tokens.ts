import type { Env } from '../env.ts';
import type { OAuthTokens, OAuthConnection } from './types.ts';
import { getProvider } from './providers.ts';
import { encrypt, decrypt } from '../security/encryption.ts';
import { getClientCredentials } from './credentials.ts';

export async function encryptTokens(tokens: OAuthTokens, keyHex: string): Promise<Uint8Array> {
  return encrypt(JSON.stringify(tokens), keyHex);
}

export async function decryptTokens(encrypted: Uint8Array, keyHex: string): Promise<OAuthTokens> {
  const json = await decrypt(encrypted, keyHex);
  return JSON.parse(json);
}

/**
 * Get a valid access token for a user+provider. Auto-refreshes if expired.
 * Returns null if no connection exists.
 */
export async function getAccessToken(
  env: Env,
  userId: string,
  provider: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT id, encrypted_tokens FROM oauth_connections WHERE user_id = ? AND provider = ?'
  ).bind(userId, provider).first();

  if (!row) return null;

  const encrypted = new Uint8Array(row.encrypted_tokens as ArrayBuffer);
  const tokens = await decryptTokens(encrypted, env.ENCRYPTION_KEY);

  // Check if token is expired (with 60s buffer)
  if (tokens.expires_at && tokens.expires_at < Math.floor(Date.now() / 1000) + 60) {
    if (!tokens.refresh_token) return null;

    const refreshed = await refreshAccessToken(env, row.id as string, provider, tokens.refresh_token);
    if (!refreshed) return null;
    return refreshed.access_token;
  }

  return tokens.access_token;
}

/**
 * Exchange a refresh token for new tokens, update stored connection.
 */
export async function refreshAccessToken(
  env: Env,
  connectionId: string,
  provider: string,
  refreshToken: string,
): Promise<OAuthTokens | null> {
  const providerConfig = getProvider(provider);
  if (!providerConfig) return null;

  const creds = await getClientCredentials(env, provider, providerConfig.clientIdKey, providerConfig.clientSecretKey);
  if (!creds) return null;

  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json() as Record<string, unknown>;
  const tokens: OAuthTokens = {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) ?? refreshToken, // keep old if not returned
    token_type: (data.token_type as string) ?? 'Bearer',
    scope: data.scope as string | undefined,
  };

  if (data.expires_in) {
    tokens.expires_at = Math.floor(Date.now() / 1000) + (data.expires_in as number);
  }

  const encrypted = await encryptTokens(tokens, env.ENCRYPTION_KEY);
  await env.DB.prepare(
    'UPDATE oauth_connections SET encrypted_tokens = ?, updated_at = unixepoch() WHERE id = ?'
  ).bind(encrypted, connectionId).run();

  return tokens;
}

/**
 * Delete an OAuth connection.
 */
export async function revokeConnection(env: Env, connectionId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    'DELETE FROM oauth_connections WHERE id = ?'
  ).bind(connectionId).run();
  return result.meta.changes > 0;
}

/**
 * Get a user's OAuth connection for a provider.
 */
export async function getConnection(
  env: Env,
  userId: string,
  provider: string,
): Promise<OAuthConnection | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM oauth_connections WHERE user_id = ? AND provider = ?'
  ).bind(userId, provider).first();

  if (!row) return null;

  const encrypted = new Uint8Array(row.encrypted_tokens as ArrayBuffer);
  const tokens = await decryptTokens(encrypted, env.ENCRYPTION_KEY);

  return {
    id: row.id as string,
    userId: row.user_id as string,
    provider: row.provider as string,
    tokens,
    scopes: row.scopes as string,
    providerUserId: row.provider_user_id as string | undefined,
    providerEmail: row.provider_email as string | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
