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

  // Secrets - Telegram
  // Only TELEGRAM_OWNER_USERNAME is required at deploy time. Bot token and webhook secret
  // are collected during onboarding and stored in KV.
  TELEGRAM_OWNER_USERNAME?: string;

  // Secrets - Discord
  DISCORD_APP_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;

  // Secrets - OAuth providers
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  MICROSOFT_OAUTH_CLIENT_ID?: string;
  MICROSOFT_OAUTH_CLIENT_SECRET?: string;

  // Static Assets (admin SPA)
  ASSETS: Fetcher;

  // Test / CI overrides (set in .dev.vars for local testing)
  /** When set, bypasses Workers AI and returns this string as the LLM response. */
  MOCK_AI_RESPONSE?: string;
  /** Override the Telegram Bot API base URL (e.g. http://localhost:9999 for tests). */
  TELEGRAM_API_BASE?: string;

}
