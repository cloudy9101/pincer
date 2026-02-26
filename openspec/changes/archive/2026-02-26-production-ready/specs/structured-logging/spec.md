## ADDED Requirements

### Requirement: Structured JSON log format
Every log entry emitted by the Worker SHALL be a single-line JSON object with the fields `level`, `message`, `timestamp`, and optionally `traceId`, `handler`, and `data`.

#### Scenario: Basic log entry
- **WHEN** `log('info', 'webhook received')` is called
- **THEN** a JSON object is written to stdout with `level: "info"`, `message: "webhook received"`, and `timestamp` in ISO 8601 format

#### Scenario: Log entry with trace context
- **WHEN** `log('info', 'webhook received', {}, { traceId: 'abc', handler: 'telegram' })` is called
- **THEN** the JSON output includes `traceId: "abc"` and `handler: "telegram"`

#### Scenario: Log entry with data
- **WHEN** `log('error', 'DO call failed', { sessionKey: 'x', error: 'timeout' }, ctx)` is called
- **THEN** the JSON output includes a `data` object containing `sessionKey` and `error`

### Requirement: Request trace ID
Each incoming HTTP request to the Worker SHALL be assigned a unique `traceId` (UUID v4) at the start of the `fetch()` handler.

#### Scenario: Trace ID generated per request
- **WHEN** a request arrives at any Worker route
- **THEN** a UUID is generated and threaded through all `log()` calls for that request

#### Scenario: Trace IDs are unique across requests
- **WHEN** two concurrent requests arrive
- **THEN** each request has a distinct `traceId` in its log entries

### Requirement: Key lifecycle events logged
The Worker SHALL log the following events at `info` level with the request trace ID:

#### Scenario: Incoming webhook logged
- **WHEN** a Telegram or Discord webhook is received
- **THEN** an info log is emitted with `handler`, `method`, and `path`

#### Scenario: DO dispatch logged
- **WHEN** the Worker forwards a message to a ConversationDO
- **THEN** an info log is emitted with `handler: "do-dispatch"` and the `sessionKey`

#### Scenario: Outbound message logged
- **WHEN** the Worker sends a message via Telegram or Discord
- **THEN** an info log is emitted with `handler`, `channel`, and `chatId`

### Requirement: Errors logged with trace context
All caught errors in Worker handlers SHALL be logged at `error` level including the trace ID and the error message.

#### Scenario: Handler error logged
- **WHEN** a handler catches an unhandled error
- **THEN** an error log is emitted with `traceId`, `handler`, `error` (message string), and the original request `path`
