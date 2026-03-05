# Pincer Gateway — Dev Guide

## Runtime

This is a **Cloudflare Workers** project, not a Bun server. Worker source code runs in the Workers runtime, not in Bun. Do not use Bun-specific APIs (`Bun.serve`, `bun:sqlite`, `Bun.file`, etc.) in `src/`. Those APIs are unavailable in the Workers environment.

Bun is used as the **local toolchain** (package manager, test runner, script runner).

## Commands

```bash
bun run dev              # wrangler dev (local Worker)
bun run deploy           # apply D1 migrations + wrangler deploy
bun run typecheck        # tsc --noEmit (type-check Worker source)
bun run migrate:local    # apply D1 migrations locally only
bun run test:e2e         # Playwright end-to-end tests
```

Install dependencies: `bun install` (root) and `cd admin && bun install` (admin SPA).

## Project Structure

```
src/           # Cloudflare Worker source (TypeScript)
admin/         # Admin SPA — React + Vite + Tailwind (built to admin/dist/)
migrations/    # D1 SQL migrations (applied by wrangler)
wrangler.toml  # Worker config — D1, KV, R2, Vectorize, AI bindings
```

The admin SPA is built by `cd admin && bun run build` (Vite), which runs automatically before `wrangler deploy` via the `[build]` hook in `wrangler.toml`. Serve it locally with `cd admin && bun run dev`.

## Cloudflare Bindings (from `src/env.ts`)

| Binding | Type | Purpose |
|---------|------|---------|
| `CONVERSATION_DO` | Durable Object | Per-session SQLite-backed conversation state |
| `DB` | D1 | Agents, skills, MCP servers, OAuth, sessions, memory, cron jobs |
| `CACHE` | KV | Short-lived cache + rate limiting |
| `MEDIA` | R2 | Uploaded media files |
| `AI` | Workers AI | LLM inference, Whisper transcription, text embeddings |
| `MEMORY` | Vectorize | Semantic memory index |
| `ASSETS` | Fetcher | Admin SPA static files |

## LLM / Workers AI

All LLM calls go through the Workers AI binding via `workers-ai-provider`. Do **not** add `@ai-sdk/anthropic`, `@ai-sdk/openai`, or other provider SDKs — everything runs through Workers AI.

Model string format: `workers-ai/<model-id>` (e.g. `workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Use `workers-ai/auto` to enable the Granite-based complexity router.

The AI SDK (`ai` package v6) is used for the LLM loop. Key patterns:
- `streamText()` for conversational responses
- `generateText()` for one-shot tasks and compaction
- `stopWhen: stepCountIs(N)` for the tool-calling loop (max 20 steps)
- `result.response.messages` to get messages to append to history
- `result.totalUsage` for aggregate token counts

## Durable Object Patterns

`ConversationSqlDO` in `src/durables/conversation.ts`:

- Extend `DurableObject` from `cloudflare:workers`; use `override` keyword on `fetch()` and `alarm()`
- `ctx.storage.sql.exec()` is **synchronous** — no `await`; cursor has `.toArray()`, `.one()`, iterator
- `ctx.blockConcurrencyWhile(async () => { ... })` for initialization in the constructor
- Messages arrive via `stub.message()` RPC; the DO schedules an alarm immediately and returns
- The alarm handler does the actual LLM call and sends the reply

## TypeScript

- Types: `@cloudflare/workers-types` (imported via `tsconfig.json` — no explicit import needed in source)
- No `node:` imports in Worker source unless covered by `nodejs_compat` flag
- Run `bun run typecheck` before committing

## D1 Migrations

Add new migrations in `migrations/` as `000N_description.sql`. Apply locally with `bun run migrate:local`. They are applied to production automatically by `bun run deploy`.

Do not edit existing migration files — always add a new one.

## Security Conventions

- Secrets stored in D1 are AES-256-GCM encrypted via `src/security/encryption.ts`
- Admin routes require `Authorization: Bearer <ADMIN_AUTH_TOKEN>`
- Never log secret values or encryption keys
