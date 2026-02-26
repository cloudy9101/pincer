## 1. Worker: Static Assets Integration

- [x] 1.1 Add `[assets]` block to `wrangler.toml` with `directory = "./admin/dist"`, `not_found_handling = "single-page-application"`, and `binding = "ASSETS"`
- [x] 1.2 Add `ASSETS: Fetcher` to `Env` interface in `src/env.ts`
- [x] 1.3 Add `/dashboard/` handler to the Worker fetch router (`src/index.ts`) that calls `env.ASSETS.fetch(request)` for any path starting with `/dashboard/`

## 2. SPA Scaffold

- [x] 2.1 Create `admin/` directory with `package.json` (React, React Router, Tailwind CSS, Vite, TypeScript)
- [x] 2.2 Create `admin/vite.config.ts` with `base: '/dashboard/'` and `build.outDir: './dist/dashboard'`
- [x] 2.3 Create `admin/tsconfig.json` targeting modern browsers
- [x] 2.4 Create `admin/tailwind.config.ts` with content paths covering `admin/src/**`
- [x] 2.5 Create `admin/index.html` entry point importing `src/main.tsx`
- [x] 2.6 Add deploy script to root `package.json`: `"deploy": "cd admin && vite build && cd .. && wrangler deploy"`

## 3. Auth Gate

- [x] 3.1 Create `admin/src/auth.ts` — helpers to get/set/clear the bearer token from `localStorage`
- [x] 3.2 Create `admin/src/api.ts` — typed fetch wrapper that injects `Authorization: Bearer <token>` on every request and redirects to `/dashboard/login` on 401
- [x] 3.3 Create `admin/src/pages/Login.tsx` — form that accepts the admin token, calls `GET /admin/status` to validate, stores token on success, shows error on 401
- [x] 3.4 Create `admin/src/components/AuthGuard.tsx` — wrapper component that redirects unauthenticated users to `/dashboard/login`

## 4. App Shell & Navigation

- [x] 4.1 Create `admin/src/main.tsx` — React entry point with `<BrowserRouter basename="/dashboard">`
- [x] 4.2 Create `admin/src/App.tsx` — top-level router with routes for all pages, wrapped in `<AuthGuard>`
- [x] 4.3 Create `admin/src/components/Sidebar.tsx` — desktop sidebar with nav links to all pages, active link highlighting; hidden below `md:` breakpoint
- [x] 4.4 Create `admin/src/components/MobileHeader.tsx` — top bar with hamburger button, visible below `md:` breakpoint
- [x] 4.5 Create `admin/src/components/Drawer.tsx` — slide-in nav drawer for mobile with same links as sidebar
- [x] 4.6 Create `admin/src/components/Layout.tsx` — shell that composes sidebar + mobile header + drawer + `<Outlet>`

## 5. Shared UI Components

- [x] 5.1 Create `admin/src/components/Card.tsx` — reusable card container for mobile list views
- [x] 5.2 Create `admin/src/components/ConfirmDialog.tsx` — reusable confirmation modal for destructive actions
- [x] 5.3 Create `admin/src/components/EmptyState.tsx` — reusable empty state with message and optional CTA
- [x] 5.4 Create `admin/src/components/ErrorBanner.tsx` — inline error display with retry button

## 6. Dashboard Page

- [x] 6.1 Create `admin/src/pages/Dashboard.tsx` — page component that fetches `GET /admin/status` and `GET /admin/usage`
- [x] 6.2 Implement status panel showing Worker status and active session count
- [x] 6.3 Implement usage summary panel with total tokens and per-model breakdown; full-width cards on mobile
- [x] 6.4 Implement recent sessions list (up to 5 entries) with links to the Sessions page

## 7. Agents Page

- [x] 7.1 Create `admin/src/pages/Agents.tsx` — fetches `GET /admin/agents`, renders card list on mobile / table on desktop
- [x] 7.2 Implement create agent form/modal with fields: name, model, system prompt, max steps; calls `POST /admin/agents`
- [x] 7.3 Implement edit agent form pre-populated with existing values; calls `PATCH /admin/agents/:id`
- [x] 7.4 Implement delete agent with `<ConfirmDialog>`; calls `DELETE /admin/agents/:id`

## 8. Skills Page

- [x] 8.1 Create `admin/src/pages/Skills.tsx` — fetches `GET /admin/skills`, renders card list on mobile / table on desktop
- [x] 8.2 Implement install skill form with name/URL input; calls `POST /admin/skills`
- [x] 8.3 Implement remove skill with `<ConfirmDialog>`; calls `DELETE /admin/skills/:name`
- [x] 8.4 Implement secrets panel — fetches `GET /admin/skills/:name/secrets`, lists key names only (no values); opens as full-screen modal on mobile
- [x] 8.5 Implement set secret value input; calls `PUT /admin/skills/:name/secrets`

## 9. Sessions Page

- [x] 9.1 Create `admin/src/pages/Sessions.tsx` — fetches `GET /admin/sessions`, renders card list on mobile / table on desktop
- [x] 9.2 Implement session history panel — fetches `GET /admin/sessions/:key`, displays messages with role styling; full-screen on mobile
- [x] 9.3 Implement reset session with `<ConfirmDialog>`; calls `POST /admin/sessions/:key/reset`

## 10. Allowlist Page

- [x] 10.1 Create `admin/src/pages/Allowlist.tsx` — fetches `GET /admin/allowlist`, renders card list on mobile / table on desktop
- [x] 10.2 Implement add user form with channel selector and user ID input; calls `POST /admin/allowlist`
- [x] 10.3 Implement remove user with `<ConfirmDialog>`; calls `DELETE /admin/allowlist/:id`
- [x] 10.4 Implement generate pairing code button; calls `POST /admin/pairing`, displays code with copy-to-clipboard button

## 11. Settings Page

- [x] 11.1 Create `admin/src/pages/Settings.tsx` — fetches `GET /admin/config`, renders key/value rows
- [x] 11.2 Implement inline edit: tap value → editable input; Enter to save calls `PUT /admin/config/:key`; Escape to cancel
- [x] 11.3 Implement add new config entry form with key + value fields; calls `PUT /admin/config/:key`

## 12. Types

- [x] 12.1 Create `admin/src/types.ts` — TypeScript interfaces matching all admin API response shapes (Agent, Skill, Session, AllowlistEntry, ConfigEntry, StatusResponse, UsageResponse)

## 13. Verify & Deploy

- [ ] 13.1 Run `wrangler dev` locally and verify `/dashboard/` loads the SPA
- [ ] 13.2 Verify all Worker routes (`/admin/*`, `/telegram/*`, `/discord/*`, `/connect/*`, `/callback/*`, `/media/*`) still respond correctly
- [ ] 13.3 Verify SPA client-side navigation (e.g. `/dashboard/agents`) returns `index.html`
- [ ] 13.4 Run `deploy` script (`vite build && wrangler deploy`) and smoke-test production
