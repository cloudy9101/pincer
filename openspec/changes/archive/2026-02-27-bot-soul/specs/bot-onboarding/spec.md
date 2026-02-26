## ADDED Requirements

### Requirement: Onboarding triggered for new users
The system SHALL trigger onboarding when a user sends their first non-command message or `/start` and their profile has no `name` key.

#### Scenario: Onboarding triggers on first message
- **WHEN** a user sends their first non-command message and no `name` exists in their profile
- **THEN** the bot responds with a warm greeting and asks for their name and location instead of processing the original message normally

#### Scenario: Onboarding triggers on /start with no profile
- **WHEN** a user sends `/start` and no `name` exists in their profile
- **THEN** the bot responds with the onboarding greeting

#### Scenario: Onboarding skipped when profile exists
- **WHEN** a user who already has a `name` in their profile sends any message
- **THEN** the bot responds normally without onboarding

### Requirement: Onboarding is skippable
The user SHALL be able to skip onboarding by sending "skip" or `/start skip`.

#### Scenario: User skips onboarding
- **WHEN** a user in onboarding mode sends "skip" or `/start skip`
- **THEN** the bot acknowledges the skip and proceeds to normal conversation without collecting profile data

#### Scenario: Skipped user is not re-prompted
- **WHEN** a user who previously skipped onboarding sends a new message
- **THEN** the bot does not re-trigger onboarding

### Requirement: Onboarding collects name, location, and communication style
The onboarding flow SHALL collect exactly three fields across two warm conversational turns using the same agent model.

#### Scenario: Turn 1 — greeting and location question
- **WHEN** onboarding starts
- **THEN** the bot sends one message that warmly introduces itself and asks for the user's name and where they are based

#### Scenario: Turn 2 — communication style question
- **WHEN** the user has responded with name and location (extracted and saved via `profile_update`)
- **THEN** the bot asks a single natural question about communication preference (e.g., detailed vs. concise)

#### Scenario: Turn 2 completes onboarding
- **WHEN** the user responds to the communication style question (extracted and saved via `profile_update`)
- **THEN** the bot confirms it is ready to help and transitions to normal conversation

### Requirement: Onboarding uses a special system prompt
During onboarding the system SHALL replace the normal system prompt with an onboarding-specific prompt that instructs the LLM to collect profile fields and call `profile_update` as it learns them.

#### Scenario: Onboarding prompt used during onboarding turns
- **WHEN** the bot is in onboarding mode
- **THEN** the LLM receives the onboarding system prompt, not the agent's normal system prompt

#### Scenario: Normal prompt restored after onboarding
- **WHEN** onboarding completes (all three fields saved)
- **THEN** subsequent messages use the agent's normal system prompt with profile injected
