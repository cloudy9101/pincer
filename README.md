# Pincer Gateway

A serverless AI messaging gateway built on Cloudflare Workers. It bridges Telegram and Discord to large language models, with conversation memory, skill plugins, MCP server support, and OAuth connections — all running at the edge with zero cold-start latency.

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
       D1          KV         R2       Vectorize   AI Gateway
    (sessions,  (cache,    (media)    (memories)  (LLM proxy)
     agents,    rate-limit)
     skills…)
```

**Key components:**

| Component | Description |
|-----------|-------------|
| `src/index.ts` | Worker entry point — routing, tracing, webhook handling |
| `src/durables/conversation.ts` | `ConversationSqlDO` — SQLite-backed Durable Object, owns the LLM loop |
| `src/channels/` | Telegram and Discord adapters (parse, send) |
| `src/skills/` | SKILL.md plugin system with auth injection |
| `src/mcp/` | MCP server client (SSE and Streamable HTTP) |
| `src/oauth/` | OAuth 2.0 connections (Google, GitHub, Microsoft) |
| `src/cron/` | Scheduled jobs (hourly cron) |
| `admin/` | React + Vite admin SPA served at `/dashboard/` |

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) with Workers, D1, KV, R2, Vectorize, and AI enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) v3+
- [Bun](https://bun.sh) v1.3+
- Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Anthropic API key (required); OpenAI / Google AI keys (optional)

## Quick Start

```bash
# 1. Install dependencies
bun install
cd admin && bun install && cd ..

# 2. Create Cloudflare resources (D1, KV, R2, Vectorize)
#    See docs/deployment.md for exact commands

# 3. Apply database migrations
wrangler d1 migrations apply pincer-db --remote

# 4. Set secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ADMIN_AUTH_TOKEN
# ... (see docs/deployment.md for full list)

# 5. Build admin SPA and deploy
bun run deploy
```

After deployment, visit `https://<your-worker>.workers.dev/dashboard/` to access the admin panel.

## Documentation

- **[Deployment Guide](docs/deployment.md)** — full step-by-step setup from a blank Cloudflare account
- **[Skill Authoring Guide](docs/skill-authoring.md)** — how to write, install, and manage SKILL.md plugins

## Project Structure

```
pincer/
├── src/                  # Worker source
│   ├── index.ts          # Entry point
│   ├── env.ts            # Cloudflare bindings & secrets
│   ├── channels/         # Telegram + Discord adapters
│   ├── durables/         # ConversationSqlDO
│   ├── skills/           # Skill plugin system
│   ├── mcp/              # MCP server client
│   ├── oauth/            # OAuth 2.0 flows
│   ├── cron/             # Scheduled jobs
│   ├── security/         # Auth, allowlist, rate limiting
│   ├── routing/          # Session key & route resolution
│   ├── config/           # Agent & config loader
│   ├── memory/           # Vectorize memory store
│   └── utils/            # Logger and helpers
├── admin/                # Admin SPA (React + Vite)
├── migrations/           # D1 SQL migrations
├── wrangler.toml         # Cloudflare config
└── docs/                 # Guides
```
