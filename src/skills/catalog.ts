import type { SkillAuthType } from './types.ts';

export interface CatalogSecretField {
  key: string;
  label: string;
  placeholder: string;
}

export interface CatalogEntry {
  name: string;
  displayName: string;
  description: string;
  authType: SkillAuthType;
  /** Secret fields the user must supply at install time. Empty for oauth/none. */
  secretFields: CatalogSecretField[];
  /** OAuth provider name, for authType === 'oauth' */
  oauthProvider?: string;
  /** Link to API docs / key signup page */
  setupUrl?: string;
  /** Full SKILL.md content (frontmatter + body) */
  content: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    name: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'Create events, list agenda, and check availability on Google Calendar.',
    authType: 'oauth',
    secretFields: [],
    oauthProvider: 'google',
    setupUrl: 'https://developers.google.com/calendar',
    content: `---
name: google-calendar
description: Create events, list agenda, and check availability on Google Calendar.
auth:
  type: oauth
  provider: google
  scopes: https://www.googleapis.com/auth/calendar
version: 1.0.0
---

# Google Calendar

Base URL: \`https://www.googleapis.com/calendar/v3\`

Auth is injected automatically — always pass \`skill: "google-calendar"\` to the fetch tool.

## List upcoming events

\`\`\`
GET /calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin={RFC3339_NOW}
\`\`\`

\`timeMin\` must be an RFC3339 timestamp (e.g. \`2025-01-01T00:00:00Z\`). Use the current date/time.

## Create an event

\`\`\`
POST /calendars/primary/events
Content-Type: application/json

{
  "summary": "Meeting title",
  "start": { "dateTime": "2025-06-01T10:00:00+01:00" },
  "end":   { "dateTime": "2025-06-01T11:00:00+01:00" },
  "description": "Optional notes"
}
\`\`\`

## Check free/busy

\`\`\`
POST /freeBusy
Content-Type: application/json

{
  "timeMin": "2025-06-01T00:00:00Z",
  "timeMax": "2025-06-01T23:59:59Z",
  "items": [{ "id": "primary" }]
}
\`\`\`

## Delete an event

\`\`\`
DELETE /calendars/primary/events/{eventId}
\`\`\`

Always confirm the date/time and timezone with the user before creating events.
`,
  },

  {
    name: 'gmail',
    displayName: 'Gmail',
    description: 'Read, send, and search Gmail messages.',
    authType: 'oauth',
    secretFields: [],
    oauthProvider: 'google',
    setupUrl: 'https://developers.google.com/gmail/api',
    content: `---
name: gmail
description: Read, send, and search Gmail messages.
auth:
  type: oauth
  provider: google
  scopes: https://www.googleapis.com/auth/gmail.modify
version: 1.0.0
---

# Gmail

Base URL: \`https://gmail.googleapis.com/gmail/v1/users/me\`

Always pass \`skill: "gmail"\` to the fetch tool.

## List recent messages

\`\`\`
GET /messages?maxResults=10&q={optional_search_query}
\`\`\`

Returns message IDs only. Fetch individual messages for content.

## Get a message

\`\`\`
GET /messages/{id}?format=full
\`\`\`

Headers and body parts are base64url-encoded. Decode the payload parts to read content.

## Search messages

Use the \`q\` parameter with Gmail search syntax:
- \`from:alice@example.com\` — from sender
- \`subject:invoice\` — subject contains word
- \`is:unread\` — unread only
- \`after:2025/01/01\` — after date

## Send a message

\`\`\`
POST /messages/send
Content-Type: application/json

{
  "raw": "{base64url_encoded_RFC2822_message}"
}
\`\`\`

Build the RFC 2822 message string:
\`\`\`
To: recipient@example.com
Subject: Hello
Content-Type: text/plain; charset=UTF-8

Message body here.
\`\`\`
Then base64url-encode it (replace + with -, / with _, strip =).

## Mark as read

\`\`\`
POST /messages/{id}/modify
Content-Type: application/json

{ "removeLabelIds": ["UNREAD"] }
\`\`\`

Always ask before sending emails. Show a preview first.
`,
  },

  {
    name: 'weather',
    displayName: 'Weather',
    description: 'Get current weather and forecasts via OpenWeatherMap.',
    authType: 'query',
    secretFields: [
      { key: 'OPENWEATHER_API_KEY', label: 'OpenWeatherMap API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    setupUrl: 'https://openweathermap.org/api',
    content: `---
name: weather
description: Get current weather and forecasts via OpenWeatherMap.
auth:
  type: query
  secret: OPENWEATHER_API_KEY
  param_name: appid
version: 1.0.0
---

# Weather (OpenWeatherMap)

Base URL: \`https://api.openweathermap.org/data/2.5\`

Always pass \`skill: "weather"\` — the API key is injected automatically as \`?appid=...\`.

## Current weather

\`\`\`
GET /weather?q={city}&units=metric
\`\`\`

For geo coordinates: \`?lat={lat}&lon={lon}&units=metric\`

Units: \`metric\` (°C, m/s) | \`imperial\` (°F, mph) | \`standard\` (K)

Key response fields:
- \`weather[0].description\` — e.g. "light rain"
- \`main.temp\` / \`main.feels_like\`
- \`main.humidity\`
- \`wind.speed\`

## 5-day forecast (3-hour intervals)

\`\`\`
GET /forecast?q={city}&units=metric
\`\`\`

Returns a \`list\` array. Group by day (\`dt_txt\` date portion) to summarise the forecast.

If the user doesn't specify units, use metric and mention °C.
`,
  },

  {
    name: 'news',
    displayName: 'News',
    description: 'Fetch top headlines by topic or country via NewsAPI.',
    authType: 'bearer',
    secretFields: [
      { key: 'NEWSAPI_KEY', label: 'NewsAPI Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    setupUrl: 'https://newsapi.org',
    content: `---
name: news
description: Fetch top headlines by topic or country via NewsAPI.
auth:
  type: bearer
  secret: NEWSAPI_KEY
version: 1.0.0
---

# News (NewsAPI)

Base URL: \`https://newsapi.org/v2\`

Always pass \`skill: "news"\` — the Bearer token is injected automatically.

## Top headlines

\`\`\`
GET /top-headlines?country={code}&category={cat}&pageSize=10
\`\`\`

- \`country\`: \`us\`, \`gb\`, \`au\`, \`ca\`, \`de\`, \`fr\`, etc.
- \`category\`: \`business\`, \`entertainment\`, \`health\`, \`science\`, \`sports\`, \`technology\`

## Search all articles

\`\`\`
GET /everything?q={keywords}&language=en&sortBy=publishedAt&pageSize=10
\`\`\`

- \`sortBy\`: \`relevancy\`, \`popularity\`, \`publishedAt\`
- \`from\` / \`to\`: ISO 8601 date range (e.g. \`2025-01-01\`)

Key response fields: \`articles[].title\`, \`articles[].description\`, \`articles[].url\`, \`articles[].publishedAt\`, \`articles[].source.name\`

Summarise the headlines concisely. Include source names and links.
`,
  },

  {
    name: 'web-search',
    displayName: 'Web Search',
    description: 'Search the web via Brave Search API.',
    authType: 'header',
    secretFields: [
      { key: 'BRAVE_API_KEY', label: 'Brave Search API Key', placeholder: 'BSAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    setupUrl: 'https://brave.com/search/api/',
    content: `---
name: web-search
description: Search the web via Brave Search API.
auth:
  type: header
  secret: BRAVE_API_KEY
  header_name: X-Subscription-Token
version: 1.0.0
---

# Web Search (Brave)

Base URL: \`https://api.search.brave.com/res/v1\`

Always pass \`skill: "web-search"\` — the API key header is injected automatically.

## Web search

\`\`\`
GET /web/search?q={query}&count=10
Headers:
  Accept: application/json
\`\`\`

- \`count\`: 1–20 results
- \`offset\`: pagination (0-based)
- \`freshness\`: \`pd\` (past day), \`pw\` (week), \`pm\` (month), \`py\` (year)

Key response fields:
- \`web.results[].title\`
- \`web.results[].url\`
- \`web.results[].description\`

Summarise the most relevant results. Include URLs so the user can follow up.
`,
  },

  {
    name: 'github',
    displayName: 'GitHub',
    description: 'Interact with GitHub repos, issues, and pull requests.',
    authType: 'bearer',
    secretFields: [
      { key: 'GITHUB_TOKEN', label: 'GitHub Personal Access Token', placeholder: 'ghp_...' },
    ],
    setupUrl: 'https://github.com/settings/tokens',
    content: `---
name: github
description: Interact with GitHub repos, issues, and pull requests.
auth:
  type: bearer
  secret: GITHUB_TOKEN
version: 1.0.0
---

# GitHub

Base URL: \`https://api.github.com\`

Always pass \`skill: "github"\` and include \`Accept: application/vnd.github+json\` in headers.

## List user repos

\`\`\`
GET /user/repos?sort=updated&per_page=20
\`\`\`

## List issues

\`\`\`
GET /repos/{owner}/{repo}/issues?state=open&per_page=20
\`\`\`

## Create an issue

\`\`\`
POST /repos/{owner}/{repo}/issues
Content-Type: application/json

{
  "title": "Bug: something is broken",
  "body": "Steps to reproduce...",
  "labels": ["bug"]
}
\`\`\`

## List pull requests

\`\`\`
GET /repos/{owner}/{repo}/pulls?state=open&per_page=20
\`\`\`

## Get PR details

\`\`\`
GET /repos/{owner}/{repo}/pulls/{pull_number}
\`\`\`

## Search issues/PRs

\`\`\`
GET /search/issues?q={query}+repo:{owner}/{repo}&per_page=10
\`\`\`

Ask the user for owner/repo if not provided. Default to \`state=open\`.
`,
  },

  {
    name: 'todoist',
    displayName: 'Todoist',
    description: 'Create, list, and complete Todoist tasks.',
    authType: 'bearer',
    secretFields: [
      { key: 'TODOIST_API_TOKEN', label: 'Todoist API Token', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    setupUrl: 'https://app.todoist.com/app/settings/integrations/developer',
    content: `---
name: todoist
description: Create, list, and complete Todoist tasks.
auth:
  type: bearer
  secret: TODOIST_API_TOKEN
version: 1.0.0
---

# Todoist

Base URL: \`https://api.todoist.com/rest/v2\`

Always pass \`skill: "todoist"\` — Bearer token is injected automatically.

## List active tasks

\`\`\`
GET /tasks
\`\`\`

Optional filters:
- \`?project_id={id}\` — tasks in a project
- \`?filter=today\` — due today
- \`?filter=overdue\` — overdue

Key fields: \`id\`, \`content\`, \`due.date\`, \`priority\` (1=normal … 4=urgent), \`project_id\`

## Create a task

\`\`\`
POST /tasks
Content-Type: application/json

{
  "content": "Buy milk",
  "due_string": "tomorrow",
  "priority": 2
}
\`\`\`

- \`due_string\`: natural language date e.g. \`"every monday"\`, \`"next friday"\`
- \`priority\`: 1 (normal), 2 (medium), 3 (high), 4 (urgent)

## Complete a task

\`\`\`
POST /tasks/{id}/close
\`\`\`

## Delete a task

\`\`\`
DELETE /tasks/{id}
\`\`\`

## List projects

\`\`\`
GET /projects
\`\`\`

Confirm task content with the user before creating. Use due_string for natural dates.
`,
  },

  {
    name: 'currency-exchange',
    displayName: 'Currency Exchange',
    description: 'Convert currencies and get live exchange rates (no API key needed).',
    authType: 'none',
    secretFields: [],
    setupUrl: 'https://www.exchangerate-api.com',
    content: `---
name: currency-exchange
description: Convert currencies and get live exchange rates (no API key needed).
auth:
  type: none
version: 1.0.0
---

# Currency Exchange (ExchangeRate-API)

Base URL: \`https://open.er-api.com/v6\`

No auth required. Always pass \`skill: "currency-exchange"\`.

## Get all rates for a base currency

\`\`\`
GET /latest/{BASE}
\`\`\`

Example: \`GET /latest/USD\`

Response key fields:
- \`result\`: "success"
- \`base_code\`: the base currency
- \`rates\`: object mapping currency codes to rates
- \`time_last_update_utc\`

## Convert an amount

There's no dedicated convert endpoint — use the rate:

\`amount_in_target = amount * rates[TARGET]\`

Example: Convert 100 USD to EUR:
1. Fetch \`/latest/USD\`
2. Multiply: \`100 * rates["EUR"]\`

Supported currencies include: USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, INR, and 150+ more.

Always show the rate source date and note that rates are indicative.
`,
  },

  {
    name: 'world-time',
    displayName: 'World Time',
    description: 'Get the current time in any timezone (no API key needed).',
    authType: 'none',
    secretFields: [],
    setupUrl: 'https://worldtimeapi.org',
    content: `---
name: world-time
description: Get the current time in any timezone (no API key needed).
auth:
  type: none
version: 1.0.0
---

# World Time (worldtimeapi.org)

Base URL: \`https://worldtimeapi.org/api\`

No auth required. Always pass \`skill: "world-time"\`.

## Get time for a timezone

\`\`\`
GET /timezone/{Area}/{Location}
\`\`\`

Examples:
- \`/timezone/Europe/London\`
- \`/timezone/America/New_York\`
- \`/timezone/Asia/Tokyo\`
- \`/timezone/Australia/Sydney\`

Key response fields:
- \`datetime\` — ISO 8601 with offset e.g. \`2025-06-01T14:30:00+01:00\`
- \`timezone\` — e.g. \`Europe/London\`
- \`utc_offset\` — e.g. \`+01:00\`
- \`day_of_week\` — 0=Sunday … 6=Saturday

## List available timezones

\`\`\`
GET /timezone
\`\`\`

Returns an array of all valid timezone strings.

If unsure of the exact timezone string, list timezones and match to the user's city.
`,
  },

  {
    name: 'spotify',
    displayName: 'Spotify',
    description: 'Control Spotify playback, search tracks, and see what\'s playing.',
    authType: 'oauth',
    secretFields: [],
    oauthProvider: 'spotify',
    setupUrl: 'https://developer.spotify.com',
    content: `---
name: spotify
description: Control Spotify playback, search tracks, and see what's playing.
auth:
  type: oauth
  provider: spotify
  scopes: user-read-playback-state user-modify-playback-state user-read-currently-playing streaming
version: 1.0.0
---

# Spotify

Base URL: \`https://api.spotify.com/v1\`

Always pass \`skill: "spotify"\` — Bearer token is injected automatically.

## Now playing

\`\`\`
GET /me/player/currently-playing
\`\`\`

Returns \`null\` body (204) if nothing is playing.
Key fields: \`item.name\`, \`item.artists[].name\`, \`item.album.name\`, \`is_playing\`, \`progress_ms\`

## Search

\`\`\`
GET /search?q={query}&type=track,album,artist&limit=10
\`\`\`

Key fields: \`tracks.items[].name\`, \`tracks.items[].artists[].name\`, \`tracks.items[].uri\`

## Play a track

\`\`\`
PUT /me/player/play
Content-Type: application/json

{ "uris": ["spotify:track:{id}"] }
\`\`\`

## Pause

\`\`\`
PUT /me/player/pause
\`\`\`

## Skip to next

\`\`\`
POST /me/player/next
\`\`\`

## Get queue

\`\`\`
GET /me/player/queue
\`\`\`

Spotify requires an active device. If 404, tell the user to open Spotify on a device first.
`,
  },
];

export function getCatalogEntry(name: string): CatalogEntry | undefined {
  return CATALOG.find(e => e.name === name);
}
