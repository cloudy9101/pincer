# Pincer Gateway

A serverless AI messaging gateway built on Cloudflare Workers. Connect Telegram and Discord to large language models — with conversation memory, installable skill plugins, MCP server support, OAuth connections, and a React admin dashboard — all running at the edge with zero cold-start latency.

**No external LLM API key required.** Inference runs through the [Workers AI](https://developers.cloudflare.com/workers-ai/) binding.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudy9101/pincer)

---

## Features

- **Telegram & Discord** — webhook-driven; responds to messages, slash commands, images, and voice notes
- **Voice transcription** — audio messages automatically transcribed via Workers AI Whisper before being sent to the LLM
- **Vision** — inline images passed directly to vision-capable models
- **Workers AI** — all LLM inference through the Workers AI binding; no external API key needed
- **Intelligent routing** — Granite 4.0 classifier picks the right Workers AI model for each request (simple → Qwen3-30B, agentic → GLM-4.7 Flash, complex → Llama 3.3 70B)
- **Streaming responses** — partial replies sent to the user every 1.5 s while the model is still generating
- **Skill plugins** — install SKILL.md files to extend the bot; 10 built-in catalog skills: Google Calendar, Gmail, GitHub, Todoist, Spotify, Weather, News, Web Search, Currency Exchange, and World Time
- **MCP servers** — connect any Model Context Protocol server (SSE or Streamable HTTP) with encrypted per-server auth headers
- **Conversation memory** — per-user semantic memory via Vectorize; auto-extracted and retrieved on every turn
- **Conversation compaction** — history is automatically summarised when it grows too long; also available as `/compact`
- **User profiles** — guided onboarding on first contact; stores name, location, timezone, and communication preference
- **OAuth 2.0** — users can link Google, GitHub, or Microsoft accounts to unlock OAuth-gated skills
- **Scheduled cron jobs** — DB-driven jobs with configurable prompts and reply targets, triggered hourly
- **Admin dashboard** — React SPA at `/dashboard/` for managing agents, bindings, skills, MCP servers, sessions, memory, and more

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       Cloudflare Worker                        │
│                                                                │
│  /webhook/telegram ──▶ auth · allowlist · rate-limit           │
│                              │                                 │
│                     image download (R2)                        │
│                     audio → Whisper (Workers AI)               │
│                              │                                 │
│                    ConversationSqlDO (per session)             │
│                       Durable Object + SQLite                  │
│                              │                                 │
│                    streamText (Workers AI)                     │
│                    + tools · skills · MCP                      │
│                              │                                 │
│                    Telegram / Discord reply                    │
│                                                                │
│  /admin/*  ─────▶ Admin REST API (bearer auth)                 │
│  /dashboard/ ───▶ React SPA (static assets)                   │
│  /connect/ /callback/ ──▶ OAuth flows                         │
└────────────────────────────────────────────────────────────────┘
        │         │         │          │          │
       D1        KV        R2      Vectorize   Workers AI
  (agents,   (cache,   (media)   (memories)  (LLM · Whisper ·
   skills,   rate-lim)                        embeddings)
   sessions…)
```

**Key components:**

| Component | Description |
|-----------|-------------|
| `src/index.ts` | Worker entry point — routing, webhook handling, admin API |
| `src/durables/conversation.ts` | `ConversationSqlDO` — SQLite-backed Durable Object, owns the LLM loop |
| `src/llm/router.ts` | Granite-based complexity classifier for intelligent model routing |
| `src/channels/` | Telegram and Discord adapters (parse, send, voice/image handling) |
| `src/skills/` | SKILL.md plugin system — parser, auth injection, built-in catalog |
| `src/mcp/` | MCP server client (SSE and Streamable HTTP), tool namespacing |
| `src/oauth/` | OAuth 2.0 flows (Google, GitHub, Microsoft) with encrypted token storage |
| `src/memory/` | Vectorize-backed semantic memory — embed, store, retrieve, auto-extract |
| `src/user-profile/` | Per-user profile, onboarding flow, location/timezone tracking |
| `src/cron/` | Scheduled jobs — DB-driven, runs on Cloudflare's cron trigger |
| `src/security/` | Webhook verification, allowlist + pairing codes, rate limiting, AES-256-GCM encryption |
| `admin/` | React + Tailwind admin SPA served at `/dashboard/` |

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
# 1. Clone and install root dependencies
git clone https://github.com/cloudy9101/pincer.git
cd pincer
bun install

# 2. Authenticate
wrangler login

# 3. Deploy — Wrangler runs the [build] step (admin SPA), applies migrations,
#    and auto-provisions D1, KV, R2, and Vectorize on first run
bun run deploy
```

`bun run deploy` runs `wrangler deploy`, which automatically builds the admin SPA via the `[build]` hook, applies D1 migrations, and provisions any missing Cloudflare resources on first run.

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
│   ├── index.ts          # Entry point, admin API & webhook routing
│   ├── env.ts            # Cloudflare bindings & secrets interface
│   ├── channels/         # Telegram + Discord adapters
│   ├── durables/         # ConversationSqlDO (LLM loop, streaming, compaction)
│   ├── llm/              # Workers AI gateway, Granite router, tool registry
│   ├── skills/           # Skill plugin system, auth injection, built-in catalog
│   ├── mcp/              # MCP server client (SSE + Streamable HTTP)
│   ├── oauth/            # OAuth 2.0 flows + encrypted token storage
│   ├── memory/           # Vectorize semantic memory (embed, store, retrieve)
│   ├── user-profile/     # Per-user profiles, onboarding, location tracking
│   ├── cron/             # Scheduled jobs
│   ├── media/            # R2 media store
│   ├── security/         # Auth, allowlist, rate limiting, encryption
│   ├── routing/          # Session key builder & binding resolution
│   ├── config/           # Agent & config loader (D1 + KV cache)
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
