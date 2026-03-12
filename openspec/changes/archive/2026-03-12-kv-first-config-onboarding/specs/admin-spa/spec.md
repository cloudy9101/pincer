## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: First visit prompts for token
**Reason**: Static admin token authentication is removed; replaced by Telegram Login session tokens.
**Migration**: Clear any stored admin token from localStorage. Use Telegram Login to authenticate.
