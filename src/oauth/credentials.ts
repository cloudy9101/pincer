import type { Env } from '../env.ts';
import { decrypt } from '../security/encryption.ts';
import { ensureEncryptionKey } from '../security/bootstrap.ts';

/**
 * Resolve OAuth client credentials — checks D1 oauth_provider_config first,
 * then falls back to wrangler secrets (env vars).
 */
export async function getClientCredentials(
  env: Env,
  provider: string,
  clientIdKey: string,
  clientSecretKey: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  // Try D1 first
  const row = await env.DB.prepare(
    'SELECT client_id, encrypted_client_secret FROM oauth_provider_config WHERE provider = ?'
  ).bind(provider).first();

  if (row?.client_id && row?.encrypted_client_secret) {
    const clientSecret = await decrypt(
      new Uint8Array(row.encrypted_client_secret as ArrayBuffer),
      await ensureEncryptionKey(env.CACHE),
    );
    return { clientId: row.client_id as string, clientSecret };
  }

  // Fall back to env vars
  const clientId = (env as unknown as Record<string, unknown>)[clientIdKey] as string | undefined;
  const clientSecret = (env as unknown as Record<string, unknown>)[clientSecretKey] as string | undefined;
  if (clientId && clientSecret) return { clientId, clientSecret };

  return null;
}
