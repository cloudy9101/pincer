## ADDED Requirements

### Requirement: ToolCallContext carries optional replyTo
The `ToolCallContext` interface SHALL include an optional `replyTo` field containing `channel` and `chatId`, populated when tools are called from an interactive message context.

#### Scenario: replyTo set in message context
- **WHEN** `buildToolSet()` is called from `ConversationDO.message()`
- **THEN** `ctx.replyTo` is set to `{ channel: input.replyTo.channel, chatId: input.replyTo.chatId }`

#### Scenario: replyTo absent in task context
- **WHEN** `buildToolSet()` is called from `ConversationDO.runTask()`
- **THEN** `ctx.replyTo` is `undefined`
