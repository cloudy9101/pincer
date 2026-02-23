## ADDED Requirements

### Requirement: System prompt contains a compact skill index, not full bodies
The system SHALL inject only skill names and descriptions into the system prompt (Tier 1), replacing the previous full-body injection. The index SHALL include an explicit directive for the LLM to call `skill_read` before using a skill.

#### Scenario: Active skills appear as an index in the system prompt
- **WHEN** one or more skills are active
- **THEN** the system prompt section contains each skill's name and description as a compact list
- **AND** the full body of no skill is included in the system prompt

#### Scenario: Index includes skill_read directive
- **WHEN** the skill index section is generated
- **THEN** it includes an instruction telling the LLM to call `skill_read` with the skill name before using any skill

#### Scenario: No active skills produces no index section
- **WHEN** there are no active skills
- **THEN** no skills section is added to the system prompt

### Requirement: `skill_read` tool returns the full body of a skill
The system SHALL provide an LLM-callable `skill_read` tool that accepts a skill name and returns the full markdown body of the skill from D1.

#### Scenario: skill_read returns body for a known skill
- **WHEN** the LLM calls `skill_read` with a valid skill name
- **THEN** the tool returns the full markdown body of that skill

#### Scenario: skill_read returns an error for an unknown skill
- **WHEN** the LLM calls `skill_read` with a name that does not match any installed skill
- **THEN** the tool returns an error message indicating the skill was not found

#### Scenario: skill_read does not expose auth config
- **WHEN** the LLM calls `skill_read` for a skill with `auth` configured
- **THEN** the response contains only the markdown body, not the auth configuration or secrets
