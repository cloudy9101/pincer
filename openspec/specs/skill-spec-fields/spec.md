## ADDED Requirements

### Requirement: Parser accepts agentskills.io optional frontmatter fields
The system SHALL parse and store the optional fields defined by the agentskills.io specification: `license`, `compatibility`, `metadata`, and `allowed-tools`.

#### Scenario: Skill with all optional spec fields is parsed successfully
- **WHEN** a SKILL.md frontmatter includes `license`, `compatibility`, `metadata`, and `allowed-tools`
- **THEN** all fields are extracted and available on the parsed frontmatter object

#### Scenario: Skill without optional fields is parsed successfully
- **WHEN** a SKILL.md frontmatter includes only `name` and `description`
- **THEN** parsing succeeds with optional fields set to null/undefined

### Requirement: `license` field is stored and retrievable
The system SHALL store the `license` string from frontmatter in the `skills` D1 table and return it in skill query results.

#### Scenario: License is stored on install
- **WHEN** a skill with `license: Apache-2.0` is installed
- **THEN** the `license` column in D1 contains `Apache-2.0`

#### Scenario: License is null when absent
- **WHEN** a skill without a `license` field is installed
- **THEN** the `license` column in D1 is NULL

### Requirement: `compatibility` field is stored and retrievable
The system SHALL store the `compatibility` string (max 500 characters) from frontmatter in the `skills` D1 table.

#### Scenario: Compatibility is stored on install
- **WHEN** a skill with a `compatibility` field is installed
- **THEN** the `compatibility` column in D1 contains the field value

### Requirement: `metadata` field is stored as JSON and retrievable
The system SHALL accept a `metadata` map (string keys to string values) from frontmatter and store it as a JSON blob in the `skills` D1 table.

#### Scenario: Metadata map is stored on install
- **WHEN** a skill with `metadata: { author: example-org, version: "1.0" }` is installed
- **THEN** the `metadata` column in D1 contains the JSON-serialized map

#### Scenario: `metadata.version` populates the version field
- **WHEN** a skill has `metadata.version` set and no top-level `version` field
- **THEN** the `version` column in D1 is populated from `metadata.version`

#### Scenario: Top-level `version` takes precedence over `metadata.version`
- **WHEN** a skill has both a top-level `version` field and `metadata.version`
- **THEN** the `version` column in D1 uses the top-level `version` value

### Requirement: `allowed-tools` field is stored and retrievable
The system SHALL store the `allowed-tools` space-delimited string from frontmatter in the `skills` D1 table. The field is stored as-is and not enforced at runtime.

#### Scenario: Allowed-tools is stored on install
- **WHEN** a skill with `allowed-tools: Bash Read` is installed
- **THEN** the `allowed_tools` column in D1 contains `Bash Read`
