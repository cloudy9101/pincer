## Context

Pincer's admin REST API (`/admin/*`) is fully implemented and covers all management operations. There is currently no UI — operators interact via curl or API clients. This design covers the SPA that wraps that API.

Cloudflare now recommends Workers with static assets over CF Pages for new projects. Static assets are deployed as part of the Worker in a single operation — no separate project, no cross-origin requests, no CORS configuration needed.

## Goals / Non-Goals

**Goals:**
- Single-page app co-deployed with the Worker via Workers static assets
- Served under `/dashboard/` sub-path — clean namespace separation from Worker routes
- Same origin as the admin API — no CORS overhead
- Token-based auth gate: prompt for admin bearer token on first visit, persist in localStorage
- Full CRUD for: agents, skills (+ secrets), bindings, allowlist, sessions, config
- Read-only views for: system status, usage stats, OAuth connections
- Single `wrangler deploy` deploys both Worker and SPA

**Non-Goals:**
- CF Access integration (admin token auth is sufficient for a personal gateway)
- Real-time streaming / WebSocket updates
- ~~Mobile-optimized layout (desktop-first)~~ ← removed, see Decisions
- Multi-user / role-based access control

## Decisions

### Workers static assets (not CF Pages)

**Decision**: Deploy the SPA as static assets alongside the existing Worker using the `[assets]` directive in `wrangler.toml`.
**Rationale**: Cloudflare now recommends migrating Pages projects to Workers. Static assets on Workers: same deployment unit, same origin (eliminates CORS), automatic CDN caching.

**wrangler.toml addition:**
```toml
[assets]
directory = "./admin/dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
```

No `run_worker_first` needed — the `/dashboard/` sub-path naturally separates SPA assets from Worker routes (see decision below).

### `/dashboard/` sub-path for the SPA

**Decision**: Serve the SPA under `/dashboard/` rather than at root.
**Rationale**: Eliminates all routing ambiguity between the SPA and existing Worker routes. Static asset files (`/dashboard/assets/app.js`, etc.) are served directly by the asset layer without invoking Worker code. SPA client-side routes (`/dashboard/agents`, `/dashboard/skills`, etc.) have no matching file so they fall to the Worker, which delegates to `env.ASSETS.fetch()`. With `not_found_handling = "single-page-application"`, that returns `index.html`.

**Worker addition** — one handler in the existing fetch router:
```ts
if (url.pathname.startsWith('/dashboard/')) {
  return env.ASSETS.fetch(request);
}
```

**Vite config:**
```ts
// admin/vite.config.ts
export default {
  base: '/dashboard/',
  build: { outDir: './dist/dashboard' }
}
```

This produces `admin/dist/dashboard/index.html` and `admin/dist/dashboard/assets/...`, which map to the correct URL paths.

**React Router:**
```tsx
<BrowserRouter basename="/dashboard">
```

### React + Tailwind + React Router

**Decision**: React with Tailwind CSS and React Router for client-side routing.
**Rationale**: React Router handles the multi-page nav without full reloads. Tailwind avoids a separate CSS build pipeline. Standard ecosystem with strong Vite support.
**Alternative considered**: Vanilla JS — rejected because the number of pages and shared state (API client, auth token, loading/error states) benefits from a component model.

### Vite build for the SPA

**Decision**: Use Vite as the build tool for `admin/`.
**Rationale**: Standard CF Workers + Vite toolchain. Fast HMR during development, optimized production builds.
**Note**: Vite is used for the SPA build only — the Worker itself still uses `wrangler` and Bun as per CLAUDE.md. Two separate build steps: `vite build` (SPA) → `wrangler deploy` (Worker + assets).

### Same-origin API calls (no CORS)

**Decision**: SPA calls `/admin/*` directly — no CORS headers required.
**Rationale**: SPA and admin API share the same origin. The browser treats these as same-origin requests.

### Admin token stored in localStorage

**Decision**: Store the admin bearer token in `localStorage` and send it as `Authorization: Bearer <token>` on every API call.
**Rationale**: The gateway is a personal tool; a simple token flow is appropriate.
**Trade-off**: Token is readable by JS (XSS risk), but scope is narrow — personal use, no sensitive user data served through the SPA itself.

### Mobile-first responsive design

**Decision**: Build with mobile-first responsive design using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`).
**Rationale**: The admin dashboard may be used from a phone to quickly check status or manage allowlist on the go. Mobile-first ensures the base styles work on small screens; progressive enhancement adds layout complexity for larger screens.
**Approach**:
- Single-column stacked layout at mobile, sidebar + content grid at `md:` and above
- Sidebar collapses to a bottom nav or hamburger drawer on mobile
- Tables become card lists on small screens (Tailwind responsive utilities)
- Touch targets minimum 44px per WCAG guidelines

### Shared API client module

**Decision**: Single `admin/src/api.ts` module with typed fetch wrappers for every admin endpoint, using the stored token automatically.
**Rationale**: Avoids duplicated fetch + auth logic across 7+ pages. Centralizes error handling (401 → clear token + redirect to login).

## Risks / Trade-offs

- **Token exposure**: localStorage token visible to any JS on the same origin. Acceptable for personal use. → No mitigation needed for v1.
- **API drift**: SPA hardcodes endpoint shapes. If Worker API changes, SPA breaks silently. → TypeScript types copied into `admin/src/types.ts`; revisit if API evolves frequently.
- **Build step ordering**: `wrangler deploy` must run after `vite build` to pick up `admin/dist`. → Deploy script: `cd admin && vite build && cd .. && wrangler deploy`.

## Migration Plan

1. Add `[assets]` block to `wrangler.toml` + `ASSETS` binding to env types
2. Add `/dashboard/` handler to Worker fetch router
3. Create `admin/` directory with Vite + React + Tailwind scaffold
4. Implement shared API client (`admin/src/api.ts`) + auth gate
5. Build pages in order: Dashboard → Agents → Skills → Sessions → Allowlist → Bindings → Settings → Connections
6. Add deploy script: `cd admin && vite build && cd .. && wrangler deploy`
7. Test locally with `wrangler dev` (serves both Worker and static assets)
8. Deploy to production

Rollback: `wrangler rollback` reverts both Worker code and static assets atomically.

## Open Questions

- None — routing approach is fully resolved.
