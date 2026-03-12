## 1. Clean Up env.ts

- [x] 1.1 Remove `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_AUTH_TOKEN` fields from `src/env.ts`

## 2. Update Encryption Key Resolution

- [x] 2.1 Update `ensureEncryptionKey` in `src/security/bootstrap.ts` to accept `KVNamespace` only (no env var fallback — already the case; verify signature is clean)
- [x] 2.2 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/oauth/tokens.ts`
- [x] 2.3 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/oauth/flow.ts`
- [x] 2.4 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/oauth/credentials.ts`
- [x] 2.5 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/skills/auth.ts`
- [x] 2.6 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/skills/installer.ts`
- [x] 2.7 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/mcp/client.ts`
- [x] 2.8 Replace `env.ENCRYPTION_KEY` with `await ensureEncryptionKey(env.CACHE)` in `src/mcp/installer.ts`

## 3. Simplify Admin Auth

- [x] 3.1 Remove `isBootstrapMode` from `src/security/bootstrap.ts`
- [x] 3.2 Rewrite `verifyAdminAuth` in `src/security/admin-auth.ts` to check only KV session tokens (drop `ADMIN_AUTH_TOKEN` env var path and bootstrap bypass)

## 4. Add Onboarded Gate Middleware

- [x] 4.1 Add `__onboarded` gate middleware to `src/index.ts` — reads KV, redirects non-exempt routes to `/dashboard/onboarding` if not `"true"`
- [x] 4.2 Exempt `/onboarding/*`, `/health`, `/webhook/*` from the gate

## 5. Extract and Rewrite Onboarding Router

- [x] 5.1 Create `src/routes/onboarding.ts` with a new public Hono router
- [x] 5.2 Implement `GET /onboarding/status` — returns `{ onboarded, hasBotToken, botUsername, ownerUsername }`
- [x] 5.3 Implement `POST /onboarding/bot-token` — validate via `getMe`, store in KV, set webhook via `ctx.waitUntil`, return `{ ok, botUsername }`; remove encrypted D1 copy logic
- [x] 5.4 Implement `POST /onboarding/telegram-login` — verify HMAC, check username vs `TELEGRAM_OWNER_USERNAME`, create session, add to allowlist, set `__onboarded = "true"`, send welcome via `ctx.waitUntil`, return `{ ok, sessionToken }`; remove pending-login pattern entirely
- [x] 5.5 Register `/onboarding` route on root Hono app in `src/index.ts`
- [x] 5.6 Remove `onboardingRouter` from `src/routes/admin/telegram.ts` and its registration from `src/routes/admin/index.ts`

## 6. Clean Up Bootstrap and Status Routes

- [x] 6.1 Remove `setup_completed` writes/reads throughout codebase; replace with `__onboarded` KV key where needed
- [x] 6.2 Update `src/routes/admin/status.ts` — remove `ADMIN_AUTH_TOKEN` and `ENCRYPTION_KEY` from secrets check; update `bootstrapMode` field (or remove it)
- [x] 6.3 Remove `ensureEncryptionKey` import from `src/routes/admin/telegram.ts` (now unused there); clean up any remaining `storeTGWebhookSecret`/`resolveTGWebhookSecret` usage if moved to onboarding router

## 7. Typecheck and Verify

- [x] 7.1 Run `bun run typecheck` — fix all type errors from removed env fields
- [x] 7.2 Run `bun run test:e2e` — verify onboarding flow end-to-end
