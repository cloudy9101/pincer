# Pincer Gateway

A serverless AI messaging gateway built on Cloudflare Workers. Connect Telegram and Discord to large language models — with conversation memory, installable skill plugins, MCP server support, OAuth connections, and a React admin dashboard — all running at the edge with zero cold-start latency.

**No external LLM API key required.** Inference runs through the [Workers AI](https://developers.cloudflare.com/workers-ai/) binding.

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

## Deploy with one click

Click the button above. Cloudflare will:

1. Fork this repo to your GitHub account
2. Automatically provision the D1 database, KV namespace, R2 bucket, and Vectorize index
3. Build and deploy the Worker with CI/CD set up on your fork

After deployment, two manual steps remain:

### Set secrets

In your Worker's Settings → Variables, add the secrets from `.dev.vars.example`.
Or use Wrangler:

```bash
wrangler secret put ADMIN_AUTH_TOKEN       # openssl rand -hex 32
wrangler secret put ENCRYPTION_KEY         # openssl rand -hex 32
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

### Register webhooks

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

Open `https://pincer-gateway.<subdomain>.workers.dev/dashboard/` and log in with your `ADMIN_AUTH_TOKEN`.

---

## Manual deployment (CLI)

<details>
<summary>Expand for CLI instructions</summary>

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) v4.45+
- [Bun](https://bun.sh) v1.3+

### Steps

```bash
# 1. Clone and install
git clone https://github.com/cloudy9101/pincer.git
cd pincer
bun install && cd admin && bun install && cd ..

# 2. Authenticate
wrangler login

# 3. Deploy — Wrangler auto-provisions D1, KV, R2, and Vectorize on first run
bun run deploy
```

`bun run deploy` builds the admin SPA, applies D1 migrations, and deploys the Worker. Wrangler automatically creates any missing resources and updates `wrangler.toml` with the generated IDs.

Then set secrets and register webhooks as described above.

</details>

---

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in your secrets
wrangler dev
```

---

## Documentation

- **[Deployment Guide](docs/deployment.md)** — detailed setup reference
- **[Skill Authoring Guide](docs/skill-authoring.md)** — how to write and publish SKILL.md plugins

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
├── wrangler.toml         # Cloudflare Workers config
├── .dev.vars.example     # Secret template for local dev
└── docs/                 # Guides
```

---

## License

MIT
