## ADDED Requirements

### Requirement: Rich default system prompt
The system SHALL replace the bare `"You are a helpful AI assistant."` default with a rich persona and behavioral rules that make the bot act as a natural personal assistant out of the box.

#### Scenario: Default persona applied when no agent system_prompt is set
- **WHEN** an agent has no custom system_prompt configured
- **THEN** the rich default persona is used

#### Scenario: Agent system_prompt overrides the default persona
- **WHEN** an agent has a custom system_prompt set (e.g., "You are Pincer, Ray's assistant")
- **THEN** the agent's system_prompt is used as the persona, not the default

### Requirement: Behavioral directives included in default prompt
The default system prompt SHALL include behavioral directives for natural personal assistant behavior: acting before explaining, avoiding AI disclaimers, treating the user's time as precious, and detecting location changes.

#### Scenario: Bot does not use AI disclaimers
- **WHEN** the user asks for an opinion or preference
- **THEN** the bot responds with a direct answer, not "As an AI I don't have opinions"

#### Scenario: Location change instruction present
- **WHEN** the default or agent system prompt is assembled
- **THEN** it contains instructions to call `profile_update` when the user mentions being in a new location (present tense, first person, not future or third party)
