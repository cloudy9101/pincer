## ADDED Requirements

### Requirement: System status panel
The Dashboard page SHALL display current system health by calling `GET /admin/status`.

#### Scenario: Status loads and displays
- **WHEN** the user navigates to `/dashboard/`
- **THEN** the page displays Worker status, active session count, and uptime

#### Scenario: Status fetch failure shown
- **WHEN** the `GET /admin/status` call fails
- **THEN** the panel displays an error state with a retry button

### Requirement: Usage summary panel
The Dashboard page SHALL display aggregate token usage by calling `GET /admin/usage`.

#### Scenario: Usage stats displayed
- **WHEN** the page loads successfully
- **THEN** total tokens used, cost estimate, and a per-model breakdown are displayed

#### Scenario: Usage displayed responsively
- **WHEN** the viewport is mobile-sized
- **THEN** usage stats stack vertically as full-width cards

### Requirement: Recent sessions list
The Dashboard page SHALL display the most recent 5 sessions.

#### Scenario: Recent sessions shown
- **WHEN** the page loads
- **THEN** up to 5 sessions are listed with session key, last active time, and agent name

#### Scenario: Session links to sessions page
- **WHEN** the user taps a session entry
- **THEN** they are navigated to the Sessions page filtered to that session
