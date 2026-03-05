# Pincer Gateway

A serverless AI messaging gateway built on Cloudflare Workers. Connect Telegram and Discord to large language models — with conversation memory, installable skill plugins, MCP server support, OAuth connections, and a React admin dashboard — all running at the edge with zero cold-start latency.

**No external LLM API key required.** Inference runs entirely through the [Workers AI](https://developers.cloudflare.com/workers-ai/) binding.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudy9101/pincer)

---

## Features

- **Telegram & Discord** — webhook-driven, responds to messages and slash commands
- **Workers AI** — edge LLM inference, no external API key needed; automatic model routing via Granite
- **Skill plugins** — install SKILL.md files to extend the bot (10 built-in catalog skills: Google Calendar, Gmail, GitHub, Spotify, and more)
- **MCP servers** — connect any Model Context Protocol server (SSE or Streamable HTTP)
- **Conversation memory** — per-user semantic memory via Vectorize
- **OAuth 2.0** — users can link Google, GitHub, or Microsoft accounts
- **Scheduled cron jobs** — DB-driven, hourly trigger
- **Admin dashboard** — React SPA at `/dashboard/` for managing agents, skills, sessions, and more

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                        │
│                                                             │
│  /webhook/telegram ──┐                                      │
│  /webhook/discord  ──┤──▶ ConversationSqlDO (per session)   │
│                      │         │                            │
│  /admin/*         ───┤    LLM loop (AI SDK)                 │
│  /dashboard/      ───┤    + tools + skills + MCP            │
│  /connect/*  ─────┘         │                              │
│  /callback/*                ▼                              │
│                      Telegram / Discord send                 │
└─────────────────────────────────────────────────────────────┘
        │           │          │           │         │
       D1          KV         R2       Vectorize   Workers AI
    (sessions,  (cache,    (media)    (memories)  (LLM inference)
     agents,    rate-limit)
     skills…)
```

**Key components:**

| Component | Description |
|-----------|-------------|
| `src/index.ts` | Worker entry point — routing, tracing, webhook handling |
| `src/durables/conversation.ts` | `ConversationSqlDO` — SQLite-backed Durable Object, owns the LLM loop |
| `src/channels/` | Telegram and Discord adapters (parse, send) |
| `src/skills/` | SKILL.md plugin system with auth injection and built-in catalog |
| `src/mcp/` | MCP server client (SSE and Streamable HTTP) |
| `src/oauth/` | OAuth 2.0 connections (Google, GitHub, Microsoft) |
| `src/cron/` | Scheduled jobs (hourly cron) |
| `admin/` | React + Vite admin SPA served at `/dashboard/` |

---

## Quick Start

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) — free tier is sufficient
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) v3+ (`npm install -g wrangler`)
- [Bun](https://bun.sh) v1.3+
- Telegram bot token from [@BotFather](https://t.me/BotFather) *(optional — Discord also supported)*

### 1. Clone and install

```bash
git clone https://github.com/cloudy9101/pincer.git
cd pincer
bun install
cd admin && bun install && cd ..
```

### 2. Authenticate Wrangler

```bash
wrangler login
```

### 3. Provision Cloudflare resources

Run the setup script to create the D1 database, KV namespace, R2 bucket, and Vectorize index:

```bash
./scripts/setup.sh
```

The script prints the IDs it creates. **Copy them into `wrangler.toml`** where the `YOUR_*_ID` placeholders are.

### 4. Apply database migrations

```bash
wrangler d1 migrations apply pincer-db --remote
```

### 5. Set secrets

Copy `.dev.vars.example` to `.dev.vars` for local development, or set production secrets with Wrangler:

```bash
wrangler secret put ADMIN_AUTH_TOKEN      # openssl rand -hex 32
wrangler secret put ENCRYPTION_KEY        # openssl rand -hex 32
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

See `.dev.vars.example` for the full list of secrets (Discord, OAuth providers, etc.).

### 6. Deploy

```bash
bun run deploy
```

### 7. Register webhooks

**Telegram:**
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://pincer-gateway.<subdomain>.workers.dev/webhook/telegram","secret_token":"<WEBHOOK_SECRET>"}'
```

**Discord:** register slash commands, then set the Interactions Endpoint URL in the [Discord Developer Portal](https://discord.com/developers/applications):
```bash
curl -X POST "https://pincer-gateway.<subdomain>.workers.dev/admin/discord/commands" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>"
```

### 8. Open the dashboard

`https://pincer-gateway.<subdomain>.workers.dev/dashboard/` — log in with your `ADMIN_AUTH_TOKEN`.

---

## Local Development

```bash
# Copy example secrets
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your values, then:
wrangler dev
```

The admin SPA proxies to `http://localhost:8787` in dev mode.

---

## Documentation

- **[Deployment Guide](docs/deployment.md)** — full step-by-step setup from a blank Cloudflare account
- **[Skill Authoring Guide](docs/skill-authoring.md)** — how to write, install, and manage SKILL.md plugins

---

## Project Structure

```
pincer/
├── src/                  # Worker source
│   ├── index.ts          # Entry point & admin API
│   ├── env.ts            # Cloudflare bindings & secrets interface
│   ├── channels/         # Telegram + Discord adapters
│   ├── durables/         # ConversationSqlDO
│   ├── skills/           # Skill plugin system + built-in catalog
│   ├── mcp/              # MCP server client
│   ├── oauth/            # OAuth 2.0 flows
│   ├── cron/             # Scheduled jobs
│   ├── security/         # Auth, allowlist, rate limiting
│   ├── routing/          # Session key & route resolution
│   ├── config/           # Agent & config loader
│   ├── memory/           # Vectorize memory store
│   └── utils/            # Logger and helpers
├── admin/                # Admin SPA (React + Tailwind)
├── migrations/           # D1 SQL migrations
├── scripts/              # setup.sh and helpers
├── wrangler.toml         # Cloudflare Workers config
├── .dev.vars.example     # Secret template for local dev
└── docs/                 # Guides
```

---

## License

MIT
