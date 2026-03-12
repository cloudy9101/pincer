### Requirement: Onboarded gate redirects unsetup traffic
The system SHALL check the `__onboarded` KV key on every inbound request and redirect non-onboarding traffic to the setup wizard until setup is complete.

#### Scenario: First-run request redirected to onboarding
- **WHEN** `__onboarded` is not set in KV and a request arrives at `/admin/*` or `/dashboard/*`
- **THEN** the Worker responds with HTTP 302 to `/dashboard/onboarding`

#### Scenario: Health and webhook routes exempt from gate
- **WHEN** `__onboarded` is not set in KV and a request arrives at `/health` or `/webhook/*`
- **THEN** the Worker handles the request normally without redirecting

#### Scenario: Onboarding route exempt from gate
- **WHEN** `__onboarded` is not set in KV and a request arrives at `/onboarding/*`
- **THEN** the Worker handles the request normally without redirecting

#### Scenario: Completed setup allows normal routing
- **WHEN** `__onboarded` is `"true"` in KV and any request arrives
- **THEN** the Worker routes normally with no redirect

### Requirement: Public onboarding API at /onboarding
The system SHALL expose the setup wizard API at `/onboarding/*` without any authentication requirement.

#### Scenario: Onboarding status endpoint is public
- **WHEN** a GET request arrives at `/onboarding/status` with no Authorization header
- **THEN** the Worker returns the current setup state (bot token presence, bot username, onboarded flag) with HTTP 200

#### Scenario: Bot token submission is public
- **WHEN** a POST request arrives at `/onboarding/bot-token` with no Authorization header
- **THEN** the Worker processes the request normally

#### Scenario: Telegram login is public
- **WHEN** a POST request arrives at `/onboarding/telegram-login` with no Authorization header
- **THEN** the Worker processes the request normally

### Requirement: Bot token submission stores token in KV and sets webhook
The system SHALL validate the submitted bot token, store it in KV, and immediately register the Telegram webhook in the background.

#### Scenario: Valid token accepted and stored
- **WHEN** POST `/onboarding/bot-token` is called with a valid token
- **THEN** the token is validated via Telegram `getMe`, stored in KV as `__telegram_bot_token`, bot username and ID saved to D1 config, and HTTP 200 returned with `{ ok: true, botUsername }`

#### Scenario: Invalid token rejected
- **WHEN** POST `/onboarding/bot-token` is called with a token that fails `getMe`
- **THEN** the Worker returns HTTP 400 with `{ error: "Invalid bot token" }` and nothing is stored

#### Scenario: Webhook registered in background after token accepted
- **WHEN** a valid bot token is stored
- **THEN** the Worker generates a random webhook secret, registers the webhook with Telegram via `ctx.waitUntil`, and stores the webhook secret in KV as `__telegram_webhook_secret` on success

### Requirement: Telegram Login completes setup and creates admin session
The system SHALL verify the Telegram Login widget data, check the username matches `TELEGRAM_OWNER_USERNAME`, create an admin session, send a welcome message, and mark setup as complete.

#### Scenario: Valid login from owner accepted
- **WHEN** POST `/onboarding/telegram-login` is called with valid Telegram login data for a user whose username matches `TELEGRAM_OWNER_USERNAME`
- **THEN** the login is cryptographically verified, a session token is created in KV, the owner's Telegram ID is stored in D1 config, the user is added to the allowlist, `__onboarded` is set to `"true"` in KV, and HTTP 200 is returned with `{ ok: true, sessionToken }`

#### Scenario: Welcome message sent on setup completion
- **WHEN** setup completes via Telegram Login
- **THEN** the Worker sends "Welcome to Pincer! Your bot is set up and ready to go." to the owner's Telegram chat via best-effort `ctx.waitUntil`

#### Scenario: Login from wrong username rejected
- **WHEN** POST `/onboarding/telegram-login` is called with a username that does not match `TELEGRAM_OWNER_USERNAME`
- **THEN** the Worker returns HTTP 403 with `{ error: "Login rejected: expected @<username>" }` and no session is created

#### Scenario: Login without bot token rejected
- **WHEN** POST `/onboarding/telegram-login` is called but no bot token is in KV
- **THEN** the Worker returns HTTP 400 with `{ error: "Bot token not configured" }` — the user must complete step 2 first

#### Scenario: Cryptographically invalid login data rejected
- **WHEN** POST `/onboarding/telegram-login` is called with data that fails HMAC verification
- **THEN** the Worker returns HTTP 401 with `{ error: "Invalid Telegram login data" }`

### Requirement: Encryption key auto-generated on first use
The system SHALL automatically generate and persist a random AES-256-GCM encryption key in KV on first access, with no manual configuration required.

#### Scenario: Key generated on first request needing encryption
- **WHEN** any operation requires the encryption key and `__encryption_key` is not set in KV
- **THEN** a cryptographically random 32-byte hex key is generated, stored in KV without TTL, and used for the operation

#### Scenario: Existing key reused on subsequent requests
- **WHEN** any operation requires the encryption key and `__encryption_key` exists in KV
- **THEN** the stored key is returned without generating a new one

### Requirement: Admin auth is session-only
The system SHALL require a valid KV-backed session token for all admin API routes; no env-var bearer token fallback and no bootstrap bypass.

#### Scenario: Valid session token grants admin access
- **WHEN** a request to `/admin/*` includes `Authorization: Bearer <token>` and the token exists as `session:<token>` in KV
- **THEN** the request proceeds normally

#### Scenario: Missing or invalid token denied
- **WHEN** a request to `/admin/*` has no Authorization header or an unrecognized token
- **THEN** the Worker returns HTTP 401

#### Scenario: No bootstrap bypass
- **WHEN** no bot token is configured in KV and a request to `/admin/*` arrives without a valid session
- **THEN** the Worker returns HTTP 401 (not 200 — bootstrap mode is removed)
