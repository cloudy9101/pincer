## ADDED Requirements

### Requirement: List allowed users
The Allowlist page SHALL display all allowed users by calling `GET /admin/allowlist`.

#### Scenario: Allowed users listed
- **WHEN** the user navigates to `/dashboard/allowlist`
- **THEN** all allowed users are displayed with channel, user ID, and added date

#### Scenario: Empty state shown
- **WHEN** the allowlist is empty
- **THEN** the page displays an empty state with a prompt to add the first user

#### Scenario: Allowlist responsive
- **WHEN** the viewport is mobile-sized
- **THEN** users are displayed as stacked cards rather than a table

### Requirement: Add allowed user
The Allowlist page SHALL allow adding a user via `POST /admin/allowlist`.

#### Scenario: Add form accepts channel and user ID
- **WHEN** the user taps "Add User"
- **THEN** a form opens with fields for channel (telegram/discord) and user ID

#### Scenario: User added successfully
- **WHEN** the user submits valid data
- **THEN** the API is called and the new entry appears in the list

### Requirement: Remove allowed user
The Allowlist page SHALL allow removing a user via `DELETE /admin/allowlist/:id`.

#### Scenario: Remove requires confirmation
- **WHEN** the user taps "Remove" on an allowlist entry
- **THEN** a confirmation dialog is shown before the API call is made

#### Scenario: Entry removed from list
- **WHEN** the user confirms removal
- **THEN** the entry is removed from the list without a full page reload

### Requirement: Generate pairing code
The Allowlist page SHALL allow generating a pairing code via `POST /admin/pairing`.

#### Scenario: Pairing code generated and displayed
- **WHEN** the user taps "Generate Pairing Code"
- **THEN** a short-lived code is displayed that can be sent to a new user to self-register

#### Scenario: Pairing code copyable
- **WHEN** the pairing code is displayed
- **THEN** a copy-to-clipboard button is shown next to the code
