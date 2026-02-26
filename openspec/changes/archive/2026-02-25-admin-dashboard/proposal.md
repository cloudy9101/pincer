## Why

All configuration for Pincer — agents, skills, bindings, allowlist, MCP servers, OAuth connections, sessions — is currently managed through raw API calls. A web UI makes the gateway usable by non-technical users and dramatically reduces operational friction for day-to-day management.

## What Changes

- New `admin/` directory: CF Pages SPA (React + Tailwind)
- New navigation shell with sidebar linking all management pages
- Dashboard page: system status, usage summary, recent sessions
- Channels page: view/manage Telegram and Discord channel bindings
- Agents page: CRUD for agents (name, model, system prompt, config)
- Skills page: list/install/remove skills, view secrets (names only), set secrets
- Connections page: OAuth connection status, revoke connections
- Sessions page: list active sessions, view history, reset
- Bindings page: create/edit/delete channel-to-agent bindings
- Allowlist page: add/remove allowed users + pairing code generation
- Settings page: global config key/value editor
- Auth: admin bearer token sent with every API request (stored in localStorage); no CF Access dependency

## Capabilities

### New Capabilities

- `admin-spa`: The CF Pages single-page application shell — routing, layout, auth gate, API client wrapper
- `admin-dashboard-page`: Dashboard page showing system health, usage stats, and recent activity
- `admin-agents-page`: Agents CRUD UI (list, create, edit, delete agents)
- `admin-skills-page`: Skills management UI (list skills, install by name/URL, remove, manage secrets)
- `admin-sessions-page`: Sessions viewer (list sessions, inspect history, reset)
- `admin-allowlist-page`: Allowlist manager (add/remove users, generate pairing codes)
- `admin-settings-page`: Config key/value editor (view and update global config values)

### Modified Capabilities

## Impact

- New `admin/` directory alongside `src/` (CF Pages project, separate deploy)
- Consumes existing admin REST API endpoints (`/admin/*`) — no new backend routes needed
- `wrangler.toml`: add `[pages]` or separate `wrangler-pages.toml` for CF Pages deploy
- Dependencies: React, React Router, Tailwind CSS (CF Pages build)
- No changes to the Worker source; all admin API endpoints already exist
