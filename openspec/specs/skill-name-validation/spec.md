## ADDED Requirements

### Requirement: Skill name must conform to agentskills.io naming rules
The system SHALL validate a skill's `name` field at parse time and reject any name that does not conform to the agentskills.io specification.

Valid names: 1–64 characters, lowercase alphanumeric and hyphens (`[a-z0-9-]`), must not start or end with a hyphen, must not contain consecutive hyphens.

#### Scenario: Valid name is accepted
- **WHEN** a SKILL.md is parsed with a name matching `[a-z0-9][a-z0-9-]{0,62}[a-z0-9]` or a single character `[a-z0-9]`
- **THEN** parsing succeeds and returns the frontmatter without error

#### Scenario: Name with uppercase letters is rejected
- **WHEN** a SKILL.md is parsed with a name containing uppercase letters (e.g. `MySkill`, `PDF-Tool`)
- **THEN** parsing throws an error describing the naming violation

#### Scenario: Name starting with a hyphen is rejected
- **WHEN** a SKILL.md is parsed with a name that starts with `-`
- **THEN** parsing throws an error describing the naming violation

#### Scenario: Name ending with a hyphen is rejected
- **WHEN** a SKILL.md is parsed with a name that ends with `-`
- **THEN** parsing throws an error describing the naming violation

#### Scenario: Name with consecutive hyphens is rejected
- **WHEN** a SKILL.md is parsed with a name containing `--`
- **THEN** parsing throws an error describing the naming violation

#### Scenario: Name exceeding 64 characters is rejected
- **WHEN** a SKILL.md is parsed with a name longer than 64 characters
- **THEN** parsing throws an error describing the naming violation

#### Scenario: Empty name is rejected
- **WHEN** a SKILL.md is parsed with an empty `name` field or no `name` field
- **THEN** parsing throws an error
