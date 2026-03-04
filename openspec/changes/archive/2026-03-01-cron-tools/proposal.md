## Why

The cron job system is now live but only accessible via the admin API — users cannot schedule recurring AI tasks through natural conversation. Adding LLM tools for cron management lets users say "remind me every morning at 9am" and have the AI create, list, and cancel scheduled jobs directly.

## What Changes

- Add `replyTo` (channel + chatId) to `ToolCallContext` so tools can know the current chat destination
- Pass `replyTo` from `ConversationDO.message()` into `buildToolSet()`
- Add 4 LLM tools: `cron_schedule`, `cron_list`, `cron_cancel`, `cron_update`

## Capabilities

### New Capabilities
- `cron-llm-tools`: LLM tools for managing cron jobs — schedule, list, cancel, update recurring AI tasks via natural language

### Modified Capabilities
- `cron-triggers`: `ToolCallContext` gains an optional `replyTo` field used by `cron_schedule` to default reply delivery to the current chat

## Impact

- `src/llm/tool-registry.ts`: add 4 tool definitions; extend `ToolCallContext` with optional `replyTo`
- `src/durables/conversation.ts`: pass `replyTo` when calling `buildToolSet()` in `message()`
- No new migrations, no new tables — cron tools write to existing `cron_jobs` table
