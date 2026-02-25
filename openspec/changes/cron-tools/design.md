## Context

Cron jobs execute on schedule but users cannot create or manage them conversationally. The `cron_jobs` D1 table is fully functional (created in the `production-ready` change). The LLM tool registry (`src/llm/tool-registry.ts`) is the integration point — adding tools there makes them available in every conversation.

The key structural gap: `ToolCallContext` doesn't carry the current chat destination (`channel` + `chatId`), which is needed for `cron_schedule` to default reply delivery to the current chat.

## Goals / Non-Goals

**Goals:**
- Add 4 cron tools to the LLM tool registry: `cron_schedule`, `cron_list`, `cron_cancel`, `cron_update`
- Extend `ToolCallContext` with optional `replyTo` and pass it from `message()`
- Validate cron expressions at scheduling time so the AI can self-correct bad inputs

**Non-Goals:**
- Timezone conversion (AI handles this via user memory or by asking)
- Sub-hourly scheduling (Worker trigger is hourly — not possible)
- Cron job history or execution logs

## Decisions

### 1. Extend ToolCallContext with optional replyTo

**Decision:** Add `replyTo?: { channel: string; chatId: string }` to `ToolCallContext`. `message()` passes `input.replyTo` (channel + chatId only — not interactionToken). `runTask()` leaves it undefined.

**Why not parse from sessionKey:** Session keys don't always encode channel or chatId (e.g., `agent:main:main`). Explicit passing is unambiguous.

**Why optional:** `runTask()` has no reply destination (it returns text directly). Tools called from `runTask()` — e.g., during a cron job itself — won't have `replyTo` and should gracefully handle it.

### 2. cron_schedule defaults reply to current chat when reply=true

**Decision:** When `reply: true`, the tool uses `ctx.replyTo.channel` and `ctx.replyTo.chatId`. If `ctx.replyTo` is undefined (called from `runTask`), the tool returns an error: "Cannot schedule a reply-enabled cron from a background task."

**Why not let the AI specify channel/chatId explicitly:** The AI doesn't have access to raw chatIds — they're not surfaced in the system prompt for security. Defaulting to current chat is both safer and more ergonomic.

### 3. Validate cron expression using croner before inserting

**Decision:** `cron_schedule` and `cron_update` call `new Cron(schedule)` to validate before writing to D1. If the expression throws, return an error string to the AI so it can self-correct.

**Why:** The runner silently skips invalid expressions — the user would never see an error. Catching it at schedule time surfaces the problem immediately.

### 4. cron_update as a separate tool (not cancel + reschedule)

**Decision:** Provide `cron_update({ id, name?, schedule?, prompt?, reply? })` rather than forcing the AI to cancel + recreate.

**Why:** Recreating loses the job's history (DO session key is based on job ID). Updating in place preserves the cron session's conversation history across reschedules.

### 5. Agent defaults to current session's agent

**Decision:** `cron_schedule` sets `agent_id` from `extractAgentId(ctx.sessionKey)` — same agent the user is currently talking to.

**Why:** Natural default. Users talking to "main" expect cron jobs to run on "main". An advanced user can specify a different agent via the admin API.

## Risks / Trade-offs

- **[Risk] replyTo.chatId exposed to tool context** → The chatId is only used internally in the tool execute function, never returned to the AI in responses. The AI sees `{ id, name, schedule, next_run }` back — not the chatId.

- **[Risk] Cron job created from a group chat** → `replyTo.chatId` would be the group's chat ID. The cron job would reply to the group. This is probably fine but may be unexpected. Mitigation: document it; advanced users can use admin API for more control.

## Migration Plan

1. Extend `ToolCallContext` — additive, no breaking change
2. Update `message()` call site — one line change
3. Add tools to registry — additive
4. Deploy

No migrations, no rollback concerns.
