import type { ConversationSqlDO } from './durables/conversation.ts';

export interface Env {
  // Durable Objects
  CONVERSATION_DO: DurableObjectNamespace<ConversationSqlDO>;

  // D1 Database
  DB: D1Database;

  // KV Namespace
  CACHE: KVNamespace;

  // R2 Bucket
  MEDIA: R2Bucket;

  // Workers AI
  AI: Ai;

  // Vectorize
  MEMORY: VectorizeIndex;

  // Secrets - Telegram (optional — can be provided during onboarding instead)
  TELEGRAM_BOT_TOKEN?: string;
  /** @deprecated — now stored in D1 config and auto-generated during setup. Env var is a fallback. */
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Secrets - Discord
  DISCORD_APP_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;
  // Telegram user ID of the bot owner. Set this when deploying so that user is
  // automatically approved as owner on first contact. When unset, the first
  // user to send a message is auto-approved (original behaviour).
  TELEGRAM_OWNER_ID?: string;

  // Telegram username of the deploying user. Provided at deploy time so the
  // onboarding flow can verify identity via the Telegram Login Widget.
  TELEGRAM_OWNER_USERNAME?: string;

  // Secrets - Security
  // ENCRYPTION_KEY: auto-generated and stored in KV on first dashboard visit if not set via env var.
  // At request start the worker resolves it from KV and injects it here so all downstream code works.
  ENCRYPTION_KEY: string;
  // ADMIN_AUTH_TOKEN: optional — when unset, bootstrap mode allows unauthenticated admin access
  // until Telegram Login creates a session.
  ADMIN_AUTH_TOKEN?: string;

  // Secrets - OAuth providers
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  MICROSOFT_OAUTH_CLIENT_ID?: string;
  MICROSOFT_OAUTH_CLIENT_SECRET?: string;

  // Static Assets (admin SPA)
  ASSETS: Fetcher;

  // Secrets - Cloudflare
  CF_API_TOKEN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;

  // Test / CI overrides (set in .dev.vars for local testing)
  /** When set, bypasses Workers AI and returns this string as the LLM response. */
  MOCK_AI_RESPONSE?: string;
  /** Override the Telegram Bot API base URL (e.g. http://localhost:9999 for tests). */
  TELEGRAM_API_BASE?: string;

}
