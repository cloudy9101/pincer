# Skill Authoring Guide

Skills extend Pincer's LLM with tools that call external APIs. A skill is a single `SKILL.md` file containing YAML frontmatter (metadata and auth config) followed by a markdown body (instructions injected into the system prompt).

## SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does
version: 1.0.0
auth:
  type: bearer
  secret: MY_SKILL_API_KEY
---

## My Skill

You have access to the My Skill API. Use the `fetch` tool to call it.

Base URL: https://api.example.com/v1

### Endpoints

- `GET /items` — list items
- `POST /items` — create an item

Always include the Authorization header (handled automatically).
```

---

## Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | Unique skill identifier. Lowercase letters, numbers, and hyphens only (1–64 chars, no leading/trailing/consecutive hyphens). |
| `description` | No | One-line description shown in the admin UI and to the LLM. |
| `version` | No | Semantic version string (e.g., `1.2.0`). |
| `license` | No | License identifier (e.g., `MIT`). |
| `auth` | No | Authentication configuration. See [Auth Types](#auth-types) below. |
| `allowed-tools` | No | Comma-separated list of built-in tools this skill may use (e.g., `fetch,skill_install`). If omitted, all tools are allowed. |
| `metadata` | No | Arbitrary key-value pairs for display or compatibility hints. |

---

## Markdown Body

The body (everything after the closing `---`) is appended to the LLM's system prompt when the skill is active. Write it as concise API documentation:

- Describe what the API does and when to use it
- List the relevant endpoints with method, path, and brief description
- Document required query parameters, request body fields, and response shapes
- Note any pagination patterns, rate limits, or error codes the LLM should handle

The `fetch` built-in tool handles making HTTP requests. Auth credentials are injected automatically — do not instruct the LLM to set `Authorization` headers manually when auth is configured.

---

## Auth Types

### `none` (default)

No authentication. Use when the API is public or you handle auth in the skill body instructions.

```yaml
auth:
  type: none
```

### `bearer`

Injects `Authorization: Bearer <secret>` on every `fetch` call to the skill's domain.

```yaml
auth:
  type: bearer
  secret: MY_SKILL_API_KEY
```

Set the secret value with:
```bash
curl -X PUT "https://<worker>/admin/skills/my-skill/secrets" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"MY_SKILL_API_KEY": "sk-actual-value-here"}'
```

### `header`

Injects a custom header (e.g., `X-API-Key`) on every fetch call.

```yaml
auth:
  type: header
  header_name: X-API-Key
  secret: MY_SKILL_API_KEY
```

### `query`

Appends a query parameter (e.g., `?api_key=...`) to every fetch URL.

```yaml
auth:
  type: query
  param_name: api_key
  secret: MY_SKILL_API_KEY
```

### `basic`

Injects an `Authorization: Basic <base64(user:pass)>` header.

```yaml
auth:
  type: basic
  username_secret: MY_SKILL_USERNAME
  password_secret: MY_SKILL_PASSWORD
```

Set both secrets:
```bash
curl -X PUT "https://<worker>/admin/skills/my-skill/secrets" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"MY_SKILL_USERNAME": "myuser", "MY_SKILL_PASSWORD": "mypass"}'
```

### `oauth`

Uses a stored OAuth 2.0 connection (Google, GitHub, or Microsoft). The access token is injected as a bearer token for the request.

```yaml
auth:
  type: oauth
  provider: google
  scopes: https://www.googleapis.com/auth/drive.readonly
```

The user connects their account via the `/connect/google` flow (initiated by the `oauth_connect` LLM tool or directly). Pincer automatically refreshes tokens when needed. No secret management required.

---

## Secret Management

Skill secrets are encrypted at rest using AES-256-GCM with the `ENCRYPTION_KEY` worker secret.

### Via Admin API

**Set secrets** (creates or replaces):
```bash
curl -X PUT "https://<worker>/admin/skills/<skill-name>/secrets" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"SECRET_KEY_NAME": "secret-value"}'
```

**List secret key names** (values are never returned):
```bash
curl "https://<worker>/admin/skills/<skill-name>/secrets" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>"
```

### Via Admin Dashboard

1. Open `https://<worker>/dashboard/`
2. Navigate to **Skills**
3. Click on the skill name
4. Use the **Secrets** section to add or update secrets

---

## Installing Skills

### Via Admin API

**From raw content:**
```bash
curl -X POST "https://<worker>/admin/skills" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content": "---\nname: my-skill\n...\n---\n\n## My Skill\n..."}'
```

**From a URL:**
```bash
curl -X POST "https://<worker>/admin/skills" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://raw.githubusercontent.com/example/skills/main/my-skill.md"}'
```

### Via LLM (in conversation)

Ask the agent to install a skill:
> "Install the skill from https://example.com/my-skill.md"

The agent uses the built-in `skill_install` tool. This requires the agent to have `skill_install` in its allowed tools (it is allowed by default).

### Removing a Skill

```bash
curl -X DELETE "https://<worker>/admin/skills/<skill-name>" \
  -H "Authorization: Bearer <ADMIN_AUTH_TOKEN>"
```

---

## Example: Weather Skill (no auth)

```markdown
---
name: weather
description: Get current weather for any location
version: 1.0.0
---

## Weather

You can fetch current weather data using the Open-Meteo API (no auth required).

Base URL: https://api.open-meteo.com/v1

To get weather for a location, first geocode the location name using the geocoding API:
- GET https://geocoding-api.open-meteo.com/v1/search?name=<city>&count=1

Then fetch weather:
- GET https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current_weather=true

Report temperature, wind speed, and weather condition to the user.
```

## Example: GitHub Skill (bearer auth)

```markdown
---
name: github
description: Read GitHub repos, issues, and pull requests for the authenticated user
version: 1.0.0
auth:
  type: bearer
  secret: GITHUB_TOKEN
---

## GitHub

You have access to the GitHub REST API v3. Base URL: https://api.github.com

The Authorization header is injected automatically.

### Common endpoints

- `GET /user` — authenticated user profile
- `GET /user/repos` — list repos (use `?per_page=20` for pagination)
- `GET /repos/{owner}/{repo}/issues` — list issues
- `GET /repos/{owner}/{repo}/pulls` — list pull requests

Always set `Accept: application/vnd.github.v3+json`.
```
