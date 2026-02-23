## ADDED Requirements

### Requirement: Install validates name before persisting
The system SHALL run name validation as part of the install flow and reject skills with non-conforming names before any D1 write occurs.

#### Scenario: Install fails fast on invalid name
- **WHEN** a skill with an invalid name (e.g. uppercase, consecutive hyphens) is submitted for installation
- **THEN** the install operation throws an error with a descriptive message
- **AND** no record is written to D1

#### Scenario: Install succeeds with a valid name
- **WHEN** a skill with a conforming name is submitted for installation
- **THEN** the skill is stored in D1 with all fields populated

### Requirement: Install stores new spec fields
The system SHALL persist `license`, `compatibility`, `metadata`, and `allowed_tools` from parsed frontmatter into the corresponding D1 columns during install and upsert.

#### Scenario: New fields are stored on first install
- **WHEN** a skill with `license`, `compatibility`, `metadata`, and `allowed-tools` is installed for the first time
- **THEN** all four columns are populated in D1

#### Scenario: New fields are updated on re-install
- **WHEN** a skill is re-installed (upsert) with different values for `license` or `metadata`
- **THEN** the D1 row is updated to reflect the new values
