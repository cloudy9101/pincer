import type { Env } from '../env.ts';
import type { OAuthTokens } from './types.ts';
import { getProvider } from './providers.ts';
import { encryptTokens } from './tokens.ts';

const STATE_EXPIRY_SECONDS = 600; // 10 minutes

/**
 * Create an OAuth state token and return a connect URL.
 * The LLM tool calls this to generate a link for the user.
 */
export async function startOAuthFlow(
  env: Env,
  userId: string,
  provider: string,
  scopes?: string[],
  baseUrl?: string,
): Promise<{ connectUrl: string; state: string }> {
  const providerConfig = getProvider(provider);
  if (!providerConfig) throw new Error(`Unknown OAuth provider: ${provider}`);

  const clientId = (env as unknown as Record<string, unknown>)[providerConfig.clientIdKey] as string | undefined;
  if (!clientId) throw new Error(`OAuth not configured: missing ${providerConfig.clientIdKey}`);

  const state = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + STATE_EXPIRY_SECONDS;

  // Store requested scopes in redirect_channel column (repurposed for scope override)
  const scopeOverride = scopes?.join(' ') ?? null;

  await env.DB.prepare(
    'INSERT INTO oauth_state (state, user_id, provider, session_token, redirect_channel, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(state, userId, provider, sessionToken, scopeOverride, expiresAt).run();

  // Build the connect URL — points to our own /connect/:provider endpoint
  const base = baseUrl ?? '';
  const connectUrl = `${base}/connect/${provider}?state=${state}`;

  return { connectUrl, state };
}

/**
 * Handle GET /connect/:provider?state=...
 * Looks up the state, then redirects to the provider's auth URL.
 */
export async function handleConnect(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.pathname.split('/')[2];
  const state = url.searchParams.get('state');

  if (!provider || !state) {
    return new Response('Missing provider or state', { status: 400 });
  }

  const providerConfig = getProvider(provider);
  if (!providerConfig) {
    return new Response('Unknown provider', { status: 400 });
  }

  // Validate state
  const row = await env.DB.prepare(
    'SELECT * FROM oauth_state WHERE state = ? AND provider = ? AND expires_at > ?'
  ).bind(state, provider, Math.floor(Date.now() / 1000)).first();

  if (!row) {
    return new Response('Invalid or expired state. Please request a new connect link.', { status: 400 });
  }

  const clientId = (env as unknown as Record<string, unknown>)[providerConfig.clientIdKey] as string | undefined;
  if (!clientId) {
    return new Response('OAuth not configured for this provider', { status: 500 });
  }

  // Build callback URL
  const callbackUrl = `${url.origin}/callback/${provider}`;

  // Build provider auth URL
  const authUrl = new URL(providerConfig.authUrl);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  const scopeOverride = row.redirect_channel as string | null;
  authUrl.searchParams.set('scope', scopeOverride ?? providerConfig.scopes.join(' '));

  // Google-specific: request offline access for refresh token
  if (provider === 'google') {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
  }

  return Response.redirect(authUrl.toString(), 302);
}

/**
 * Handle GET /callback/:provider?code=...&state=...
 * Validates state, exchanges code for tokens, stores encrypted connection.
 */
export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const provider = url.pathname.split('/')[2];
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return htmlResponse('OAuth Error', `Authorization was denied: ${error}`);
  }

  if (!provider || !code || !state) {
    return htmlResponse('Error', 'Missing required parameters.');
  }

  const providerConfig = getProvider(provider);
  if (!providerConfig) {
    return htmlResponse('Error', 'Unknown provider.');
  }

  // Validate and consume state
  const row = await env.DB.prepare(
    'SELECT * FROM oauth_state WHERE state = ? AND provider = ? AND expires_at > ?'
  ).bind(state, provider, Math.floor(Date.now() / 1000)).first();

  if (!row) {
    return htmlResponse('Error', 'Invalid or expired state. Please request a new connect link.');
  }

  // Delete the state (single use)
  await env.DB.prepare('DELETE FROM oauth_state WHERE state = ?').bind(state).run();

  const userId = row.user_id as string;
  const clientId = (env as unknown as Record<string, unknown>)[providerConfig.clientIdKey] as string | undefined;
  const clientSecret = (env as unknown as Record<string, unknown>)[providerConfig.clientSecretKey] as string | undefined;

  if (!clientId || !clientSecret) {
    return htmlResponse('Error', 'OAuth not configured for this provider.');
  }

  try {
    // Exchange code for tokens
    const callbackUrl = `${url.origin}/callback/${provider}`;
    const tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const responseText = await tokenResponse.text();

    if (!tokenResponse.ok) {
      return htmlResponse('Error', `Token exchange failed (${tokenResponse.status}): ${responseText}`);
    }

    // Parse response — GitHub returns 200 even for errors
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      return htmlResponse('Error', `Invalid token response: ${responseText.slice(0, 200)}`);
    }

    // Check for error in response body (GitHub returns 200 with error JSON)
    if (data.error) {
      const desc = data.error_description ?? data.error;
      return htmlResponse('Error', `OAuth error: ${desc}`);
    }

    if (!data.access_token) {
      return htmlResponse('Error', `No access token in response: ${responseText.slice(0, 200)}`);
    }

    const tokens: OAuthTokens = {
      access_token: data.access_token as string,
      refresh_token: data.refresh_token as string | undefined,
      token_type: (data.token_type as string) ?? 'Bearer',
      scope: data.scope as string | undefined,
    };

    if (data.expires_in) {
      tokens.expires_at = Math.floor(Date.now() / 1000) + (data.expires_in as number);
    }

    // Try to get user info from provider
    let providerUserId: string | undefined;
    let providerEmail: string | undefined;

    try {
      const userinfoRes = await fetch(providerConfig.userinfoUrl, {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      });

      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json() as Record<string, unknown>;
        providerUserId = String(userinfo.id ?? userinfo.sub ?? '');
        providerEmail = (userinfo.email as string) ?? undefined;
      }
    } catch {
      // Best effort — userinfo is optional
    }

    // Encrypt and store
    const encrypted = await encryptTokens(tokens, env.ENCRYPTION_KEY);
    const connectionId = crypto.randomUUID();
    const scopes = tokens.scope ?? providerConfig.scopes.join(' ');

    await env.DB.prepare(
      `INSERT INTO oauth_connections (id, user_id, provider, encrypted_tokens, scopes, provider_user_id, provider_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, provider)
       DO UPDATE SET encrypted_tokens = excluded.encrypted_tokens, scopes = excluded.scopes,
         provider_user_id = excluded.provider_user_id, provider_email = excluded.provider_email,
         updated_at = unixepoch()`
    ).bind(connectionId, userId, provider, encrypted, scopes, providerUserId ?? null, providerEmail ?? null).run();

    // Clean up expired states
    await env.DB.prepare('DELETE FROM oauth_state WHERE expires_at < ?')
      .bind(Math.floor(Date.now() / 1000)).run();

    const displayName = providerEmail ?? providerUserId ?? provider;
    return htmlResponse('Connected!', `Successfully connected your ${provider} account (${displayName}). You can close this window and return to the chat.`);
  } catch (e) {
    return htmlResponse('Error', `Callback failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function htmlResponse(title: string, message: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;border-radius:12px;padding:2rem;max-width:400px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{margin-top:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html' } });
}
