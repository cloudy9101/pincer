### Requirement: cron_schedule tool
The LLM SHALL have access to a `cron_schedule` tool that creates a new cron job in D1, validates the cron expression, and optionally sets reply delivery to the current chat.

#### Scenario: Valid schedule created with reply
- **WHEN** the AI calls `cron_schedule({ name: "Morning reminder", schedule: "0 9 * * *", prompt: "...", reply: true })`
- **AND** `ctx.replyTo` is set (called from an interactive message)
- **THEN** a row is inserted into `cron_jobs` with `reply_channel` and `reply_chat_id` from `ctx.replyTo`
- **AND** the tool returns `{ id, name, schedule, next_run }`

#### Scenario: Valid schedule created without reply
- **WHEN** the AI calls `cron_schedule({ name: "Nightly task", schedule: "0 0 * * *", prompt: "...", reply: false })`
- **THEN** a row is inserted with `reply_channel = null` and `reply_chat_id = null`

#### Scenario: Invalid cron expression rejected
- **WHEN** the AI calls `cron_schedule` with an expression that fails `croner` parsing (e.g., `"every morning"`)
- **THEN** the tool returns an error string describing the problem
- **AND** no row is inserted into D1

#### Scenario: reply=true but no replyTo context
- **WHEN** the AI calls `cron_schedule({ reply: true })` from within a `runTask` context (no replyTo)
- **THEN** the tool returns an error: "Cannot schedule a reply-enabled cron from a background task"

### Requirement: cron_list tool
The LLM SHALL have access to a `cron_list` tool that returns all cron jobs for the current agent, including their schedule, status, and next run time.

#### Scenario: List returns agent-scoped jobs
- **WHEN** the AI calls `cron_list()`
- **THEN** only `cron_jobs` rows with `agent_id` matching the current session's agent are returned
- **AND** each result includes `id`, `name`, `schedule`, `enabled`, `last_run_at`, and `next_run` (computed from expression)

#### Scenario: Empty list
- **WHEN** no cron jobs exist for the current agent
- **THEN** the tool returns an empty array

### Requirement: cron_cancel tool
The LLM SHALL have access to a `cron_cancel` tool that deletes a cron job by ID.

#### Scenario: Successful cancellation
- **WHEN** the AI calls `cron_cancel({ id: "<job-id>" })`
- **AND** the job exists and belongs to the current agent
- **THEN** the row is deleted from `cron_jobs` and the tool returns `{ ok: true }`

#### Scenario: Job not found or wrong agent
- **WHEN** the AI calls `cron_cancel` with an ID that doesn't exist or belongs to a different agent
- **THEN** the tool returns `{ ok: false, error: "Job not found" }`

### Requirement: cron_update tool
The LLM SHALL have access to a `cron_update` tool that modifies an existing cron job's name, schedule, prompt, or reply setting without recreating it.

#### Scenario: Schedule updated
- **WHEN** the AI calls `cron_update({ id: "<job-id>", schedule: "0 8 * * *" })`
- **AND** the new expression is valid
- **THEN** `cron_jobs.schedule` is updated in place and the tool returns `{ ok: true, next_run }`

#### Scenario: Invalid new expression rejected
- **WHEN** the AI calls `cron_update` with an invalid cron expression
- **THEN** the tool returns an error and the existing schedule is unchanged

#### Scenario: reply updated to true
- **WHEN** the AI calls `cron_update({ id: "<job-id>", reply: true })`
- **AND** `ctx.replyTo` is available
- **THEN** `reply_channel` and `reply_chat_id` are updated to the current chat's values
