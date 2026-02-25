## Why

The gateway is functionally complete through Phase 4a (OAuth) but has never been hardened for reliable daily use. The `cron_jobs` D1 table is defined and ready but the `scheduled` Worker export and cron runner are unimplemented — scheduled AI tasks are dead-on-arrival. This change ships the production readiness work from Phase 4c.

## What Changes

- Add `scheduled()` export to the Worker with a cron dispatcher
- Implement cron runner that reads enabled `cron_jobs` rows, dispatches prompts to `ConversationDO`, and optionally delivers replies back to a channel
- Add `[triggers]` section to `wrangler.toml` (hourly + daily crons)
- Add admin CRUD routes for `cron_jobs` (`GET/POST /admin/crons`, `GET/PATCH/DELETE /admin/crons/:id`)
- Harden error boundaries at webhook entry points (catch-all try/catch, structured error responses, no raw 500s)

## Capabilities

### New Capabilities
- `cron-triggers`: Scheduled job runner — reads `cron_jobs` from D1, dispatches prompts to ConversationDO on cron schedule, delivers replies to Telegram/Discord if configured

### Modified Capabilities
(none)

## Impact

- `src/index.ts`: adds `scheduled()` export and admin cron routes
- `wrangler.toml`: adds `[triggers]` with `crons`
- New `src/cron/runner.ts` module
- `src/channels/telegram/send.ts`, `src/channels/discord/send.ts`: reused for cron reply delivery
- No schema migration needed — `cron_jobs` table already exists in `migrations/0001_initial.sql`
