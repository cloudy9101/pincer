# Deployment Guide

This guide walks through deploying a new Pincer instance from a blank Cloudflare account.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) v3+ (`npm install -g wrangler`)
- [Bun](https://bun.sh) v1.3+
- Telegram bot token — create one with [@BotFather](https://t.me/BotFather)
- Anthropic API key — obtain from [console.anthropic.com](https://console.anthropic.com)

---

## Step 1: Authenticate Wrangler

```bash
wrangler login
```

This opens a browser window to authorise Wrangler with your Cloudflare account.

---

## Step 2: Create Cloudflare Resources

### D1 Database

```bash
wrangler d1 create pincer-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "pincer-db"
database_id = "<your-database-id>"
migrations_dir = "migrations"
```

### KV Namespace

```bash
wrangler kv namespace create CACHE
```

Copy the `id` and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "<your-kv-id>"
```

### R2 Bucket

```bash
wrangler r2 bucket create pincer-media
```

The bucket name is already set in `wrangler.toml` (`pincer-media`). No ID needed.

### Vectorize Index

```bash
wrangler vectorize create pincer-memory --dimensions=1536 --metric=cosine
```

The index name is already configured in `wrangler.toml` as `pincer-memory`.

---

## Step 3: Apply Database Migrations

```bash
wrangler d1 migrations apply DB --remote
```

> Use the binding name `DB` (not the database name), so the command works regardless of what name was given to the database during creation.

This runs all files in `migrations/` in order, creating all tables.

---

## Step 4: Set Secrets

Use `wrangler secret put <NAME>` for each secret listed below. You will be prompted to paste the value.

### Required Secrets

| Secret | Description | Where to obtain |
|--------|-------------|-----------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | [console.anthropic.com → API Keys](https://console.anthropic.com) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | [@BotFather](https://t.me/BotFather) → `/newbot` |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret for webhook verification | Generate with `openssl rand -hex 32` |
| `DISCORD_PUBLIC_KEY` | Discord app Ed25519 public key | [Discord Developer Portal](https://discord.com/developers/applications) → your app → General Information |
| `DISCORD_BOT_TOKEN` | Discord bot token | Discord Developer Portal → your app → Bot → Reset Token |
| `DISCORD_APP_ID` | Discord application ID | Discord Developer Portal → your app → General Information |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting skill secrets and OAuth tokens | Generate with `openssl rand -hex 32` |
| `ADMIN_AUTH_TOKEN` | Bearer token for the admin API and dashboard | Generate with `openssl rand -hex 32` |
| `CF_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare dashboard → right sidebar, or `wrangler whoami` |

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_APP_ID
wrangler secret put ENCRYPTION_KEY
wrangler secret put ADMIN_AUTH_TOKEN
wrangler secret put CF_ACCOUNT_ID
```

### Optional Secrets

| Secret | Description | Where to obtain |
|--------|-------------|-----------------|
| `OPENAI_API_KEY` | OpenAI API key (for GPT models) | [platform.openai.com → API Keys](https://platform.openai.com/api-keys) |
| `GOOGLE_AI_API_KEY` | Google AI API key (for Gemini models) | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `AI_GATEWAY_ENDPOINT` | Cloudflare AI Gateway URL for LLM proxying | Cloudflare dashboard → AI Gateway |
| `CF_API_TOKEN` | Cloudflare API token (for Cloudflare-specific tools) | Cloudflare dashboard → My Profile → API Tokens |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token ID | Cloudflare dashboard → Zero Trust → Access → Service Tokens |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token secret | Same as above |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth 2.0 client ID | [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth 2.0 client secret | Same as above |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth app client ID | [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers) |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app client secret | Same as above |
| `MICROSOFT_OAUTH_CLIENT_ID` | Microsoft Entra app client ID | [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | Microsoft Entra app client secret | Same as above |

---

## Step 5: Build and Deploy

Install dependencies and build the admin SPA, then deploy:

```bash
bun install
cd admin && bun install && cd ..
bun run deploy
```

The `deploy` script builds the admin SPA into `admin/dist/` and runs `wrangler deploy`.

Your Worker will be live at `https://pincer-gateway.<your-subdomain>.workers.dev`.

---

## Step 6: Register Webhooks

### Telegram

Set the Telegram webhook to point to your Worker. Replace the placeholders:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://pincer-gateway.<your-subdomain>.workers.dev/webhook/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

### Discord

Register the Discord slash commands via the admin API (requires your Worker to be deployed):

```bash
curl -X POST "https://pincer-gateway.<your-subdomain>.workers.dev/admin/discord/commands" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>"
```

Then configure your Discord application's **Interactions Endpoint URL** in the [Discord Developer Portal](https://discord.com/developers/applications):

```
https://pincer-gateway.<your-subdomain>.workers.dev/webhook/discord
```

---

## Step 7: Verify

1. Open `https://pincer-gateway.<your-subdomain>.workers.dev/health` — should return `{"status":"ok","service":"pincer-gateway"}`
2. Open `https://pincer-gateway.<your-subdomain>.workers.dev/dashboard/` and log in with your `ADMIN_AUTH_TOKEN`
3. Send a message to your Telegram bot or use a Discord slash command

---

## Updating

To redeploy after code changes:

```bash
bun run deploy
```

To apply new database migrations:

```bash
wrangler d1 migrations apply DB --remote
```
