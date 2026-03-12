## Why

Operational secrets (bot token, webhook secret, encryption key) are scattered across environment variables and D1, creating unnecessary duplication and complexity. The gateway currently has no clean first-run experience — admin access relies on a fragile "bootstrap mode" that bypasses authentication. This change establishes KV as the single source of truth for all runtime secrets and replaces bootstrap mode with a proper setup wizard.

## What Changes

- **Remove** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_AUTH_TOKEN` from `env.ts` and `.dev.vars.example`; `TELEGRAM_OWNER_USERNAME` remains as the only required env var
- **Remove** encrypted bot token copy from D1 (`telegram_bot_token_enc`); bot token lives in KV only
- **Remove** bootstrap mode (`isBootstrapMode`) and `ADMIN_AUTH_TOKEN` bearer-token fallback; admin auth is session-only
- **Remove** pending-login pattern (storing login data in KV while awaiting bot token)
- **Add** `__onboarded` KV flag as the single gate: unset/false → redirect to `/onboarding`; `"true"` → normal operation
- **Add** `/onboarding/*` as a public route (not under `/admin`) with its own Hono router **BREAKING**
- **Move** onboarding API from `/admin/onboarding/*` to `/onboarding/*` **BREAKING**
- **Change** `ENCRYPTION_KEY` resolution: auto-generated on first access via `ensureEncryptionKey(env.CACHE)`; callers use KV directly instead of `env.ENCRYPTION_KEY`
- **Change** onboarding to 4 steps: (1) create bot guide, (2) submit bot token + auto-set webhook, (3) set login domain guide, (4) Telegram Login → verify → welcome → complete
- **Remove** `setup_completed` D1 config key; replaced by `__onboarded` KV key

## Capabilities

### New Capabilities

- `gateway-setup`: First-run setup wizard — the `/onboarding/*` API and `__onboarded` gate that guides a new deployment through bot token submission, webhook registration, and Telegram Login to establish an admin session

### Modified Capabilities

- `admin-spa`: Onboarding route moves from `/admin/onboarding` to `/onboarding`; SPA must check setup state and route accordingly

## Impact

- `src/env.ts` — remove 4 fields
- `src/security/bootstrap.ts` — remove `isBootstrapMode`; update `ensureEncryptionKey` signature
- `src/security/admin-auth.ts` — remove bootstrap bypass and `ADMIN_AUTH_TOKEN` path
- `src/routes/admin/telegram.ts` — `onboardingRouter` extracted to new public route file
- `src/routes/admin/index.ts` — remove `onboardingRouter` registration
- `src/index.ts` — add `/onboarding` public route; add `__onboarded` gate middleware
- `src/oauth/tokens.ts`, `src/skills/auth.ts`, `src/skills/installer.ts`, `src/mcp/client.ts`, `src/mcp/installer.ts`, `src/oauth/credentials.ts` — replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)`
- `.dev.vars.example` — already correct (only `TELEGRAM_OWNER_USERNAME`)
