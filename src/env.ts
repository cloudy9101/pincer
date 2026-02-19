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

  // Secrets - LLM providers
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;

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

  // Secrets - Cloudflare
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;

  // AI Gateway
  AI_GATEWAY_ENDPOINT?: string;
}
