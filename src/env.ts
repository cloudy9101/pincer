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

  // Secrets - AI Gateway (BYOK — provider keys stored in AI Gateway dashboard)
  CF_AIG_TOKEN: string;
  CF_AIG_GATEWAY: string;

  // Secrets - Telegram
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  // Secrets - Discord
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APP_ID: string;

  // Secrets - Security
  ENCRYPTION_KEY: string;
  ADMIN_AUTH_TOKEN: string;

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
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;

}
