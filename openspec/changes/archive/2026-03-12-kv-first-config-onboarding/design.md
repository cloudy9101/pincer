## Context

The gateway currently mixes two approaches for runtime secrets: some live as Cloudflare environment variables/secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `ADMIN_AUTH_TOKEN`), and others are stored in KV. Several secrets are duplicated — the bot token is stored in KV for fast access *and* encrypted in D1 as `telegram_bot_token_enc`. Admin authentication has a "bootstrap mode" that bypasses all auth when no bot token is present, which is a broad bypass with no audit trail. The onboarding API is buried under `/admin/onboarding` behind the auth middleware (though bootstrap mode lets it through), which is conceptually inconsistent.

## Goals / Non-Goals

**Goals:**
- KV is the single source of truth for all runtime secrets (bot token, webhook secret, encryption key)
- `TELEGRAM_OWNER_USERNAME` is the only env var required at deploy time
- Admin auth is session-only (Telegram Login → KV session token)
- First-run gate (`__onboarded` KV flag) redirects all non-onboarding traffic until setup completes
- `/onboarding/*` is a clean public route with no auth dependency
- Encryption key is resolved via `ensureEncryptionKey(env.CACHE)` at each call site — no env var, no middleware injection

**Non-Goals:**
- Multi-user admin support (stays single-owner)
- OAuth connector secrets (those remain encrypted in D1 — that's correct for user data)
- Changing the admin SPA URL from `/dashboard`
- Skill/MCP secret storage model (stays encrypted in D1, just key resolution changes)

## Decisions

### D1: `__onboarded` KV key vs `setup_completed` D1 config key
Using KV for the setup gate (not D1) because the gate is checked on *every* request via middleware — KV is faster and doesn't require a D1 query. The `setup_completed` D1 key is removed; `__onboarded` in KV is the replacement.

### Encryption key: call-site resolution vs middleware injection
Each caller that needs the encryption key calls `await ensureEncryptionKey(env.CACHE)` directly, rather than a single middleware that injects it into `env.ENCRYPTION_KEY`. The middleware approach is the exact "cache in env" anti-pattern being eliminated. Workers KV reads within the same isolate are served from the colocated data store — the overhead of multiple reads per request is negligible for a single-user gateway.

`ensureEncryptionKey(env.CACHE)` keeps its current semantics: check KV, generate-and-persist if missing. Callers that previously used `env.ENCRYPTION_KEY` are updated to call this function. The function signature stays `(cache: KVNamespace)`.

**Migration note**: Existing deployments that set `ENCRYPTION_KEY` via `wrangler secret put` have D1 data encrypted with that key. On upgrade, `ensureEncryptionKey` will generate a *new* random key and existing encrypted data will fail to decrypt. Migration path: before removing the env var secret, operators should run `wrangler kv key put __encryption_key "$ENCRYPTION_KEY" --namespace-id <id>` to seed KV with the existing key, then remove the secret.

### Pending-login pattern: drop
The pending-login flow (store Telegram login data in KV, complete when bot token arrives later) is removed. The new sequential onboarding flow makes this impossible: bot token must be submitted (step 2) before the Telegram Login widget is shown (step 4). The pattern added significant complexity for an edge case that the sequential UI now prevents.

### Bot token: KV only
The encrypted D1 copy (`telegram_bot_token_enc`) is removed. `storeBotToken(env.CACHE, token)` remains the write path. `resolveBotToken(env.CACHE)` remains the read path. No D1 fallback.

### `ADMIN_AUTH_TOKEN` and bootstrap mode: remove both
Bootstrap mode (`isBootstrapMode`) is replaced by the `__onboarded` gate. `ADMIN_AUTH_TOKEN` is removed because it was a convenience escape hatch that bypasses the session model — session-only auth is simpler and sufficient for a single-user gateway. `verifyAdminAuth` becomes: extract Bearer token → validate against KV `session:<token>` → done.

### Onboarding as a public Worker route
`/onboarding/*` is registered directly on the root Hono app (not under `adminApp`). The `onboardingRouter` is extracted from `src/routes/admin/telegram.ts` into `src/routes/onboarding.ts`. No auth middleware wraps it.

### `__onboarded` gate placement
A middleware on the root Hono app runs before all routes. If `__onboarded` is not `"true"` in KV, requests to any path *other than* `/onboarding/*`, `/health`, and `/webhook/*` receive a `302` redirect to `/dashboard/onboarding` (the SPA's onboarding page). Webhook and health routes are excluded so the bot can still receive messages and health checks work during any post-onboarding reconfiguration.

## Risks / Trade-offs

- **KV data loss wipes encryption key** → All encrypted D1 data (skill secrets, MCP headers) becomes unreadable. Mitigation: document that `__encryption_key` KV value should be backed up, or operators can keep `ENCRYPTION_KEY` env var as a belt-and-suspenders measure (though it won't be read by code after this change).

- **Multiple `ensureEncryptionKey` calls per request** → Minor KV overhead. Mitigation: Workers KV is colocated with the isolate; reads are fast. Acceptable for a single-user gateway.

- **`__onboarded` gate on root app** → A KV read on every request. Same mitigation — fast enough, and could add short in-memory cache if it ever becomes a concern.

- **Existing deployments: encryption key migration** → Described above. Manual step required for existing installs with `ENCRYPTION_KEY` env var.

## Migration Plan

**For new deployments:** No action needed. `ensureEncryptionKey` auto-generates on first request.

**For existing deployments upgrading from env var `ENCRYPTION_KEY`:**
1. Note the current key value: `wrangler secret list` (value not shown — retrieve from your records)
2. Seed KV before deploying: `wrangler kv key put __encryption_key "<key>" --namespace-id <KV_ID>`
3. Deploy the new code
4. Remove the env var: `wrangler secret delete ENCRYPTION_KEY`
5. Verify skill/MCP secrets still decrypt by testing a skill fetch

**Rollback:** Restore env var secrets and revert deployment. No D1 migrations involved.

## Open Questions

- Should the SPA at `/dashboard/onboarding` be a new page in the React app, or served via a redirect to `/onboarding` (pure Worker HTML)? (Assume SPA page for now — consistent with existing dashboard.)
- Should `ensureEncryptionKey` accept optional env var as seed (to ease migration automatically)? Keeping it simple for now — manual migration step documented above.
