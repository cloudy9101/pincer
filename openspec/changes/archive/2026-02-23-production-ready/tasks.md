## 1. Wrangler Config

- [x] 1.1 Add `[triggers]` section to `wrangler.toml` with `crons = ["0 * * * *"]`

## 2. Cron Runner Module

- [x] 2.1 Add `croner` to `package.json` (`bun add croner`)
- [x] 2.2 Create `src/cron/runner.ts` with `runCronJobs(env, scheduledTime: number)` function
- [x] 2.3 Query all `cron_jobs WHERE enabled = 1`, then for each row call `Cron(schedule).isMatching(new Date(scheduledTime))` — skip if false
- [x] 2.4 For matching jobs: build session key `agent:<agentId>:cron:<jobId>`, get DO stub via `env.CONVERSATION_DO.idFromName(sessionKey)`, call `stub.fetch(POST /message)` with job prompt
- [x] 2.4 After DO call: update `last_run_at = unixepoch()` for the job regardless of outcome
- [x] 2.5 If `reply_channel = "telegram"` and `reply_chat_id` is set: call `sendTelegramMessage` with response text
- [x] 2.6 If `reply_channel = "discord"` and `reply_chat_id` is set: call `sendDiscordChannelMessage` with response text
- [x] 2.7 Wrap each job's execution in try/catch — log error with job ID and continue to next job

## 3. Worker Scheduled Export

- [x] 3.1 Add `scheduled(controller, env, ctx)` export to `src/index.ts`
- [x] 3.2 Inside handler: call `ctx.waitUntil(runCronJobs(env, controller.scheduledTime))` to dispatch all matched jobs concurrently

## 4. Admin Cron Routes

- [x] 4.1 Add `GET /admin/crons` — query all rows from `cron_jobs`, return as JSON array
- [x] 4.2 Add `GET /admin/crons/:id` — return single row or 404
- [x] 4.3 Add `POST /admin/crons` — insert new row with `{ id, name, schedule, agent_id, prompt, reply_channel?, reply_chat_id? }`, default `enabled = 1`
- [x] 4.4 Add `PATCH /admin/crons/:id` — update only provided fields from `{ name, schedule, prompt, reply_channel, reply_chat_id, enabled }`
- [x] 4.5 Add `DELETE /admin/crons/:id` — delete row, return `{ ok: true }`

## 5. Webhook Error Boundaries

- [x] 5.1 Wrap the Telegram webhook handler body in try/catch — on error: log with request URL + error message, return `new Response('', { status: 200 })`
- [x] 5.2 Wrap the Discord webhook handler body in try/catch — same pattern: log and return 200
- [x] 5.3 Wrap admin route dispatch in a top-level try/catch — on error: return `json({ error: err.message }, 500)`
