## ADDED Requirements

### Requirement: List skills
The Skills page SHALL display all installed skills by calling `GET /admin/skills`.

#### Scenario: Skills listed
- **WHEN** the user navigates to `/dashboard/skills`
- **THEN** all skills are displayed with name, description, auth type, and version

#### Scenario: Empty state shown
- **WHEN** no skills are installed
- **THEN** the page displays an empty state with a prompt to install the first skill

#### Scenario: Skills list responsive
- **WHEN** the viewport is mobile-sized
- **THEN** skills are displayed as stacked cards rather than a table

### Requirement: Install skill
The Skills page SHALL allow installing a skill by name or URL via `POST /admin/skills`.

#### Scenario: Install form accepts name or URL
- **WHEN** the user taps "Install Skill"
- **THEN** a form opens with a single input that accepts a skill name or SKILL.md URL

#### Scenario: Skill installed successfully
- **WHEN** the user submits a valid skill name or URL
- **THEN** the API is called and the new skill appears in the list

#### Scenario: Install error shown
- **WHEN** the API returns an error (e.g., skill not found, invalid format)
- **THEN** the error message is displayed inline in the form

### Requirement: Remove skill
The Skills page SHALL allow removing a skill via `DELETE /admin/skills/:name`.

#### Scenario: Remove requires confirmation
- **WHEN** the user taps "Remove" on a skill
- **THEN** a confirmation dialog is shown before the API call is made

#### Scenario: Skill removed from list
- **WHEN** the user confirms removal
- **THEN** the skill is removed from the list without a full page reload

### Requirement: Manage skill secrets
The Skills page SHALL allow viewing secret names and setting secret values via `GET /admin/skills/:name/secrets` and `PUT /admin/skills/:name/secrets`.

#### Scenario: Secret names listed (values hidden)
- **WHEN** the user opens the secrets panel for a skill
- **THEN** configured secret names are listed but values are never displayed

#### Scenario: Secret value set
- **WHEN** the user enters a value for a secret and saves
- **THEN** `PUT /admin/skills/:name/secrets` is called with the new value

#### Scenario: Secrets panel accessible on mobile
- **WHEN** the viewport is mobile-sized
- **THEN** the secrets panel is accessible via a full-screen modal or bottom sheet
