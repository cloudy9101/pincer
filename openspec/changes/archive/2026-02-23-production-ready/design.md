## Context

Phases 1–4a are complete. The gateway runs Telegram + Discord, multi-LLM, skills, memory, MCP, and OAuth. The remaining production readiness gap is the cron trigger system: the `cron_jobs` D1 table exists but there's no `scheduled()` Worker export to execute it.

The existing send functions (`sendTelegramMessage`, `sendDiscordChannelMessage`) and the ConversationDO RPC pattern are already in place — the runner is primarily wiring.

## Goals / Non-Goals

**Goals:**
- Implement `scheduled()` Worker export that fires cron jobs from D1
- Admin CRUD routes for `cron_jobs` management
- Error boundary hardening at webhook entry points

**Non-Goals:**
- Sub-hourly scheduling (Workers free plan: 5 crons max, paid: 5 also — no point going finer)
- Cron job failure retries or dead-letter queuing
- Cron job history / audit log (last_run_at is sufficient for now)

## Decisions

### 1. One Worker trigger, per-job cron expression evaluation

**Decision:** `wrangler.toml` registers a single hourly cron (`"0 * * * *"`). Each `cron_jobs` row stores its own cron expression in the `schedule` field. At each trigger, the runner loads all enabled jobs and evaluates `doesCronMatch(schedule, scheduledTime)` to decide whether each job should fire at that moment.

**Why one trigger over multiple:** Adding a second Worker trigger (e.g., `"0 0 * * *"`) for daily jobs would require a wrangler.toml change + redeploy every time a new schedule granularity is needed. With expression evaluation, users set any valid cron expression (`"0 9 * * 1-5"`, `"0 1,2 * * *"`, `"0 0 * * 0"`) without touching infrastructure.

**Cron expression evaluation:** Uses `croner` — a tiny (~5KB), pure-JS cron library with no Node.js dependencies, compatible with Cloudflare Workers. `Cron(expression).isMatching(new Date(scheduledTime))` returns true if the expression matches that timestamp.

```typescript
import { Cron } from 'croner';
function shouldRunAt(expression: string, ts: number): boolean {
  return Cron(expression).isMatching(new Date(ts));
}
```

**Runner signature changes:** `runCronJobs(env, scheduledTime: number)` — queries all enabled jobs, filters by expression match, dispatches matching ones.

### 2. Isolated session key per cron job

**Decision:** `agent:<agentId>:cron:<jobId>` as the session key for each cron job execution.

**Why not reuse `agent:<agentId>:main`:** Cron outputs would pollute the main conversation history. Isolated sessions keep cron context separate and allow per-job history.

**Why not `agent:<agentId>:cron:<jobId>:<date>`:** Reusing the same DO per job lets cron jobs accumulate context across runs (e.g., a daily summary that references yesterday's). That's intentional.

### 3. Direct DO stub dispatch (no internal HTTP)

**Decision:** The runner obtains a DO stub via `env.CONVERSATION_DO.idFromName(sessionKey)` and calls `stub.fetch()` directly — same pattern the main webhook handler uses.

**Why not `/webhook/telegram` or internal loopback:** The DO stub call is zero-latency (same datacenter, no network hop) and doesn't require auth headers.

### 4. Reply delivery via existing channel send functions

**Decision:** After DO returns a response text, deliver based on `reply_channel`:
- `"telegram"` → `sendTelegramMessage({ chatId: reply_chat_id, text })`
- `"discord"` → `sendDiscordChannelMessage({ channelId: reply_chat_id, text })`
- `null` → fire-and-forget (no reply, just run the prompt)

Both functions already exist. No new send primitives needed.

### 5. Error handling: 200-always for webhooks, JSON errors for admin

**Decision:**
- Telegram webhook: outer try/catch returns `200 OK` with empty body on any error (Telegram retries on non-200)
- Discord webhook: same — 200 on error to prevent interaction timeouts
- Admin routes: try/catch returns `500 { error: message }` JSON
- Cron runner: per-job try/catch, log error, continue remaining jobs

**Why not propagate errors up in webhooks:** Telegram and Discord will retry on non-200, causing duplicate messages or infinite retry loops.

## Risks / Trade-offs

- **[Risk] Cron job takes >30s** → The `scheduled()` handler wall-clock limit is 30s (CPU: 30s). Each DO message call could be slow if the LLM loop is long. **Mitigation:** Use `ctx.waitUntil()` to dispatch all jobs concurrently rather than sequentially. Each job runs independently.

- **[Risk] `croner` bundle size** → Adds ~5KB to the Worker bundle (~1.7MB currently). Negligible. Verify it doesn't pull in Node.js polyfills at build time.

- **[Risk] Discord proactive messages require bot token + channel ID** → `sendDiscordChannelMessage` needs `DISCORD_BOT_TOKEN` in env, which is already a secret. If the channel ID is wrong, message fails silently. **Mitigation:** Validate `reply_chat_id` is non-null before attempting delivery.

## Migration Plan

1. Add `[triggers]` to `wrangler.toml` — no redeploy side effects on existing routes
2. Add `scheduled()` export — new export, additive
3. Add admin cron routes — new routes, no existing route changes
4. Harden webhook error boundaries — wraps existing handlers, no behavior change on success path
5. Deploy with `wrangler deploy`

No D1 migrations needed. No rollback complexity — removing `scheduled()` export is safe.

## Open Questions

- Should `GET /admin/crons/:id/run` (manual trigger) be included? Could be useful for testing. Deferred unless needed.
- Should cron job output be stored somewhere (beyond ConversationDO history)? Not in scope — DO history is sufficient.
