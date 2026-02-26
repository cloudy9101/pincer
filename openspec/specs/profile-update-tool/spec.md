## ADDED Requirements

### Requirement: profile_update LLM tool
The system SHALL expose a `profile_update` tool to the LLM that saves one or more key-value pairs to the current user's profile in `user_profiles`.

#### Scenario: Tool saves single field
- **WHEN** the LLM calls `profile_update` with `{ name: "Ray" }`
- **THEN** the key `name` is upserted in `user_profiles` for the current user and a confirmation is returned

#### Scenario: Tool saves multiple fields at once
- **WHEN** the LLM calls `profile_update` with `{ name: "Ray", location: "Hong Kong", timezone: "Asia/Hong_Kong" }`
- **THEN** all three keys are upserted in a single operation

#### Scenario: Tool available in all conversations
- **WHEN** any conversation is active (onboarding or normal)
- **THEN** `profile_update` is present in the tool set available to the LLM

### Requirement: Supported profile keys
The `profile_update` tool SHALL accept the following keys: `name`, `home_location`, `location`, `timezone`, `communication_style`. Other keys SHALL be silently ignored.

#### Scenario: Known key accepted
- **WHEN** the LLM calls `profile_update` with `{ timezone: "Europe/London" }`
- **THEN** the key is saved

#### Scenario: Unknown key ignored
- **WHEN** the LLM calls `profile_update` with `{ favorite_color: "blue" }`
- **THEN** the key is not saved and no error is returned

### Requirement: Dynamic location updates via conversation
The system prompt SHALL instruct the LLM to detect when the user mentions being in a new location and proactively call `profile_update` to update `location` and `timezone`.

#### Scenario: Current location updated from conversation
- **WHEN** the user says "I'm in Tokyo for a conference"
- **THEN** the LLM calls `profile_update({ location: "Tokyo", timezone: "Asia/Tokyo" })` without being explicitly asked

#### Scenario: Home location preserved during travel
- **WHEN** the user's location is updated to a travel destination
- **THEN** `home_location` is not changed (only `location` and `timezone` are updated)

#### Scenario: Location not updated for third-party mentions
- **WHEN** the user says "my client is in New York"
- **THEN** the LLM does NOT call `profile_update` for location

#### Scenario: Future travel not treated as current location
- **WHEN** the user says "I'm going to Berlin next week"
- **THEN** the LLM does NOT call `profile_update` for location until the user is actually there
