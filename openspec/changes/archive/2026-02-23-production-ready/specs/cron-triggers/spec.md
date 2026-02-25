## ADDED Requirements

### Requirement: Schedule-matched job dispatch
The Worker `scheduled()` handler SHALL query D1 for all enabled `cron_jobs` rows where `schedule` matches the firing cron expression (`controller.cron`) and dispatch each as a prompt to the corresponding `ConversationDO`.

#### Scenario: Hourly job fires
- **WHEN** the `"0 * * * *"` cron fires
- **THEN** all `cron_jobs` rows with `schedule = "0 * * * *"` and `enabled = 1` are dispatched to their respective ConversationDO

#### Scenario: No matching jobs
- **WHEN** a cron fires and no `cron_jobs` rows match that schedule expression
- **THEN** the handler exits silently with no error

#### Scenario: Disabled job is skipped
- **WHEN** a cron fires and a matching `cron_jobs` row has `enabled = 0`
- **THEN** that job is NOT dispatched

### Requirement: Isolated cron session key
Each cron job SHALL use the session key `agent:<agentId>:cron:<jobId>`, scoped to that job's agent and job ID, distinct from any user-facing session.

#### Scenario: Cron session is independent of main session
- **WHEN** a cron job runs for `agent_id = "main"` and `id = "daily-summary"`
- **THEN** the DO is addressed at key `agent:main:cron:daily-summary`
- **AND** the main chat session at `agent:main:main` is unaffected

### Requirement: Reply delivery on completion
If a cron job has a non-null `reply_channel` and `reply_chat_id`, the system SHALL deliver the ConversationDO response text to that channel after execution.

#### Scenario: Telegram delivery
- **WHEN** a cron job has `reply_channel = "telegram"` and a valid `reply_chat_id`
- **THEN** the response text is sent to that Telegram chat ID using `sendTelegramMessage`

#### Scenario: Discord delivery
- **WHEN** a cron job has `reply_channel = "discord"` and a valid `reply_chat_id`
- **THEN** the response text is sent to that Discord channel ID using `sendDiscordChannelMessage`

#### Scenario: Fire-and-forget (no reply)
- **WHEN** a cron job has `reply_channel = null`
- **THEN** the prompt is dispatched and the response is discarded after being stored in the DO history

### Requirement: Per-job error isolation
A failure in one cron job's execution SHALL NOT prevent other jobs in the same scheduled run from executing.

#### Scenario: One job errors, others continue
- **WHEN** three cron jobs match a schedule and the second throws an error
- **THEN** the first and third jobs complete normally
- **AND** the error is logged with the job ID

### Requirement: last_run_at timestamp update
After dispatching a cron job (regardless of outcome), the system SHALL update the `last_run_at` column in `cron_jobs` to the current Unix timestamp.

#### Scenario: Timestamp updated after run
- **WHEN** a cron job is dispatched
- **THEN** `cron_jobs SET last_run_at = unixepoch() WHERE id = <jobId>` is executed

### Requirement: Admin CRUD for cron jobs
The admin API SHALL expose routes to create, list, read, update, and delete cron jobs.

#### Scenario: List all cron jobs
- **WHEN** `GET /admin/crons` is called with a valid admin token
- **THEN** all rows from `cron_jobs` are returned as JSON

#### Scenario: Create a cron job
- **WHEN** `POST /admin/crons` is called with `{ id, name, schedule, agent_id, prompt, reply_channel?, reply_chat_id? }`
- **THEN** a new row is inserted into `cron_jobs` with `enabled = 1`

#### Scenario: Update a cron job
- **WHEN** `PATCH /admin/crons/:id` is called with any subset of `{ name, schedule, prompt, reply_channel, reply_chat_id, enabled }`
- **THEN** only the provided fields are updated in the matching `cron_jobs` row

#### Scenario: Delete a cron job
- **WHEN** `DELETE /admin/crons/:id` is called
- **THEN** the matching row is removed from `cron_jobs`

#### Scenario: Get a single cron job
- **WHEN** `GET /admin/crons/:id` is called
- **THEN** the matching `cron_jobs` row is returned, or 404 if not found

### Requirement: Webhook error boundaries
Telegram and Discord webhook handlers SHALL catch all unhandled errors and return `200 OK`, logging the error without leaking internal details to the caller.

#### Scenario: Unhandled error in Telegram webhook
- **WHEN** an unhandled exception occurs during Telegram webhook processing
- **THEN** the handler returns `200 OK` with an empty body
- **AND** the error is logged with request context

#### Scenario: Unhandled error in Discord webhook
- **WHEN** an unhandled exception occurs during Discord webhook processing
- **THEN** the handler returns `200 OK` with an empty body
- **AND** the error is logged with request context

#### Scenario: Admin route error
- **WHEN** an unhandled exception occurs in an admin route handler
- **THEN** the handler returns `500 { "error": "<message>" }` as JSON
