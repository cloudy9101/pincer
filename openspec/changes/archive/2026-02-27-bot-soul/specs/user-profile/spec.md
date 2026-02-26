## ADDED Requirements

### Requirement: User profile storage
The system SHALL store per-user structured profile data in a D1 table `user_profiles` with columns `user_id`, `key`, `value`, and `updated_at`. The primary key SHALL be `(user_id, key)`.

#### Scenario: Profile key stored
- **WHEN** a profile key-value pair is saved for a user
- **THEN** it is upserted into `user_profiles` with `updated_at = unixepoch()`

#### Scenario: Profile key updated
- **WHEN** the same key is saved again for the same user
- **THEN** the value is updated and `updated_at` is refreshed

### Requirement: Profile injected into system prompt
The system SHALL load the user's full profile from `user_profiles` and inject it as a `## About <name>` section into the system prompt on every request, before the episodic memory section.

#### Scenario: Profile section present when profile has data
- **WHEN** a user with a saved profile sends a message
- **THEN** the assembled system prompt contains a `## About <name>` section listing their profile fields

#### Scenario: Profile section absent when profile is empty
- **WHEN** a user with no saved profile sends a message
- **THEN** no profile section is added to the system prompt

#### Scenario: Profile always injected regardless of message content
- **WHEN** the user asks something unrelated to their profile (e.g., "what is 2+2?")
- **THEN** the profile section is still present in the system prompt

### Requirement: Local time computed from timezone
The system SHALL compute the user's current local time from their `timezone` profile key and include it in the profile section.

#### Scenario: Local time shown when timezone is set
- **WHEN** the user has `timezone: Asia/Hong_Kong` in their profile
- **THEN** the profile section shows their current local time formatted as `HH:MM, Day` (e.g., `2:30 PM, Thursday`)

#### Scenario: Location fields distinguished when traveling
- **WHEN** the user has both `home_location` and `location` keys and they differ
- **THEN** the profile section shows both: `Home: Hong Kong` and `Currently in: Tokyo`

#### Scenario: Single location shown when not traveling
- **WHEN** the user has only `location` or both match
- **THEN** only one location line is shown
