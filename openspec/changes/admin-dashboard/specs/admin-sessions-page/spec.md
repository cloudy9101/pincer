## ADDED Requirements

### Requirement: List sessions
The Sessions page SHALL display all sessions by calling `GET /admin/sessions`.

#### Scenario: Sessions listed
- **WHEN** the user navigates to `/dashboard/sessions`
- **THEN** all sessions are displayed with session key, agent name, and last active time

#### Scenario: Sessions list responsive
- **WHEN** the viewport is mobile-sized
- **THEN** sessions are displayed as stacked cards with truncated session keys

### Requirement: View session history
The Sessions page SHALL allow viewing a session's message history via `GET /admin/sessions/:key`.

#### Scenario: History panel opens
- **WHEN** the user taps a session entry
- **THEN** the message history for that session is displayed in a scrollable panel

#### Scenario: History displayed as conversation
- **WHEN** the session history is shown
- **THEN** messages are displayed in chronological order with role (user/assistant) clearly distinguished

#### Scenario: History panel responsive
- **WHEN** the viewport is mobile-sized
- **THEN** the history panel opens as a full-screen view rather than a side panel

### Requirement: Reset session
The Sessions page SHALL allow resetting a session's history via `POST /admin/sessions/:key/reset`.

#### Scenario: Reset requires confirmation
- **WHEN** the user taps "Reset" on a session
- **THEN** a confirmation dialog is shown before the API call is made

#### Scenario: Session cleared after reset
- **WHEN** the user confirms the reset
- **THEN** the session's message count updates to zero in the list
