## ADDED Requirements

### Requirement: List config values
The Settings page SHALL display all configuration key/value pairs by calling `GET /admin/config`.

#### Scenario: Config values listed
- **WHEN** the user navigates to `/dashboard/settings`
- **THEN** all config keys and their current values are displayed

#### Scenario: Empty state shown
- **WHEN** no config values are set
- **THEN** the page displays an empty state

#### Scenario: Settings list responsive
- **WHEN** the viewport is mobile-sized
- **THEN** config entries are displayed as stacked rows with key above value

### Requirement: Edit config value
The Settings page SHALL allow updating a config value via `PUT /admin/config/:key`.

#### Scenario: Inline edit activated
- **WHEN** the user taps a config value
- **THEN** the value becomes an editable input field in place

#### Scenario: Value saved on confirm
- **WHEN** the user confirms the edit (Enter key or save button)
- **THEN** `PUT /admin/config/:key` is called with the new value and the row returns to read-only display

#### Scenario: Edit cancelled on dismiss
- **WHEN** the user presses Escape or taps cancel
- **THEN** the original value is restored and no API call is made

### Requirement: Add config value
The Settings page SHALL allow adding a new config key/value pair via `PUT /admin/config/:key`.

#### Scenario: New key/value form shown
- **WHEN** the user taps "Add Setting"
- **THEN** a form with key and value fields is shown

#### Scenario: New config entry created
- **WHEN** the user submits a new key/value pair
- **THEN** the API is called and the new entry appears in the list
