## ADDED Requirements

### Requirement: SPA served under /dashboard/ sub-path
The system SHALL serve the admin SPA at `/dashboard/` and all its sub-routes via the existing Pincer Worker using the Workers static assets binding.

#### Scenario: Root dashboard route loads app
- **WHEN** a user navigates to `/dashboard/`
- **THEN** the Worker returns `index.html` with HTTP 200

#### Scenario: SPA client-side route loads app
- **WHEN** a user navigates to a SPA route such as `/dashboard/agents`
- **THEN** the Worker returns `index.html` with HTTP 200 (React Router handles client-side routing)

#### Scenario: Static asset served directly
- **WHEN** a browser requests `/dashboard/assets/app-[hash].js`
- **THEN** the asset layer serves the file directly without invoking Worker code

#### Scenario: Worker routes unaffected
- **WHEN** a request arrives at `/admin/*`, `/telegram/*`, or any other Worker-handled route
- **THEN** the Worker handles it normally — the SPA sub-path does not interfere

### Requirement: Auth gate
The SPA SHALL use a Telegram Login session token (not a static admin bearer token) to authenticate. On first visit with no session, if setup is not complete the SPA routes to the onboarding wizard; if setup is complete it routes to the Telegram Login page.

#### Scenario: No session and setup incomplete — show onboarding
- **WHEN** a user visits `/dashboard/` with no session token in localStorage and the setup state indicates `onboarded: false`
- **THEN** the SPA routes to `/dashboard/onboarding` to begin the setup wizard

#### Scenario: No session and setup complete — show login
- **WHEN** a user visits `/dashboard/` with no session token in localStorage and the setup state indicates `onboarded: true`
- **THEN** the SPA displays a Telegram Login page (Login with Telegram widget)

#### Scenario: Valid session token grants access
- **WHEN** a user visits `/dashboard/` with a valid session token in localStorage and any API call returns HTTP 200
- **THEN** the SPA renders the admin dashboard normally

#### Scenario: Expired or revoked token redirects to login
- **WHEN** any API call returns HTTP 401 during an authenticated session
- **THEN** the SPA clears localStorage and redirects to the Telegram Login page

#### Scenario: Telegram Login widget submits to onboarding endpoint
- **WHEN** a user completes Telegram Login on the login page (post-onboarding)
- **THEN** the SPA POSTs to `/onboarding/telegram-login`, stores the returned `sessionToken` in localStorage, and redirects to `/dashboard/`

### Requirement: Responsive navigation shell
The SPA SHALL provide a persistent navigation shell that is mobile-first and responsive.

#### Scenario: Sidebar visible on desktop
- **WHEN** the viewport width is 768px or wider (`md:` breakpoint)
- **THEN** a sidebar is displayed with links to all pages

#### Scenario: Sidebar collapses on mobile
- **WHEN** the viewport width is less than 768px
- **THEN** the sidebar is replaced by a top bar with a hamburger menu that opens a drawer

#### Scenario: Active page highlighted
- **WHEN** the user is on a page (e.g., `/dashboard/agents`)
- **THEN** the corresponding nav link is visually highlighted as active

### Requirement: Shared typed API client
The SPA SHALL use a single `api.ts` module for all requests to `/admin/*` endpoints.

#### Scenario: Bearer token sent on every request
- **WHEN** the API client makes any request
- **THEN** the `Authorization: Bearer <token>` header is included automatically

#### Scenario: 401 response triggers logout
- **WHEN** the API client receives a 401 response
- **THEN** it clears the stored token and redirects to the login screen

#### Scenario: Network error surfaces to caller
- **WHEN** a fetch request fails due to a network error
- **THEN** the API client throws an error that the calling component can display
