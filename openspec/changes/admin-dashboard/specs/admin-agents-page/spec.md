## ADDED Requirements

### Requirement: List agents
The Agents page SHALL display all agents by calling `GET /admin/agents`.

#### Scenario: Agents listed
- **WHEN** the user navigates to `/dashboard/agents`
- **THEN** all agents are displayed with name, model, and created date

#### Scenario: Empty state shown
- **WHEN** no agents exist
- **THEN** the page displays an empty state with a prompt to create the first agent

#### Scenario: Agent list responsive
- **WHEN** the viewport is mobile-sized
- **THEN** agents are displayed as stacked cards rather than a table

### Requirement: Create agent
The Agents page SHALL allow creating a new agent via `POST /admin/agents`.

#### Scenario: Create form opens
- **WHEN** the user taps the "New Agent" button
- **THEN** a form or modal opens with fields: name, model, system prompt, max steps

#### Scenario: Agent created successfully
- **WHEN** the user submits valid agent data
- **THEN** the API is called, the form closes, and the new agent appears in the list

#### Scenario: Validation error shown
- **WHEN** the user submits with a missing required field (name or model)
- **THEN** inline validation errors are shown and the form is not submitted

### Requirement: Edit agent
The Agents page SHALL allow editing an existing agent via `PATCH /admin/agents/:id`.

#### Scenario: Edit form pre-populated
- **WHEN** the user taps "Edit" on an agent
- **THEN** a form opens pre-filled with the agent's current values

#### Scenario: Agent updated successfully
- **WHEN** the user saves changes
- **THEN** the API is called and the updated values are reflected in the list

### Requirement: Delete agent
The Agents page SHALL allow deleting an agent via `DELETE /admin/agents/:id`.

#### Scenario: Delete requires confirmation
- **WHEN** the user taps "Delete" on an agent
- **THEN** a confirmation dialog is shown before the API call is made

#### Scenario: Agent removed from list after deletion
- **WHEN** the user confirms deletion
- **THEN** the agent is removed from the list without a full page reload
