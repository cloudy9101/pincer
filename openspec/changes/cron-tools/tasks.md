## 1. Extend ToolCallContext

- [x] 1.1 Add `replyTo?: { channel: string; chatId: string }` field to `ToolCallContext` in `src/llm/tool-registry.ts`
- [x] 1.2 In `ConversationDO.message()`, update the `buildToolSet()` call to pass `replyTo: { channel: input.replyTo.channel, chatId: input.replyTo.chatId }`

## 2. cron_schedule Tool

- [x] 2.1 Add `cron_schedule` tool to registry with input schema: `{ name: string, schedule: string, prompt: string, reply: boolean }`
- [x] 2.2 In execute: validate `schedule` with `new Cron(schedule)` — return error string if invalid
- [x] 2.3 If `reply: true` and `ctx.replyTo` is undefined, return error: "Cannot schedule a reply-enabled cron from a background task"
- [x] 2.4 Generate job ID with `generateId()`, insert into `cron_jobs` with `agent_id = extractAgentId(ctx.sessionKey)`
- [x] 2.5 Return `{ id, name, schedule, next_run }` where `next_run` is `new Cron(schedule).nextRun()?.toISOString()`

## 3. cron_list Tool

- [x] 3.1 Add `cron_list` tool with no required inputs
- [x] 3.2 Query `cron_jobs WHERE agent_id = ? ORDER BY created_at DESC`, scoped to current agent
- [x] 3.3 For each row, compute `next_run` from `new Cron(schedule).nextRun()?.toISOString()`
- [x] 3.4 Return array of `{ id, name, schedule, enabled, last_run_at, next_run }`

## 4. cron_cancel Tool

- [x] 4.1 Add `cron_cancel` tool with input schema: `{ id: string }`
- [x] 4.2 Delete row only if `agent_id = extractAgentId(ctx.sessionKey)` — return `{ ok: false, error: "Job not found" }` if no row deleted
- [x] 4.3 Return `{ ok: true }` on success

## 5. cron_update Tool

- [x] 5.1 Add `cron_update` tool with input schema: `{ id: string, name?: string, schedule?: string, prompt?: string, reply?: boolean }`
- [x] 5.2 If `schedule` provided: validate with `new Cron(schedule)` — return error if invalid
- [x] 5.3 If `reply: true` provided and `ctx.replyTo` undefined, return error
- [x] 5.4 Build UPDATE statement from only provided fields; include `reply_channel`/`reply_chat_id` update if `reply` is in input
- [x] 5.5 Scope update to current agent: `WHERE id = ? AND agent_id = ?` — return `{ ok: false }` if no row matched
- [x] 5.6 Return `{ ok: true, next_run }` on success
