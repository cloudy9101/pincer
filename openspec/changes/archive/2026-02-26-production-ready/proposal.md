## Why

Pincer is running in production but has no structured logging or documentation. Debugging issues requires guesswork, and deploying or extending the gateway requires reading source code. These are the final gaps before the gateway is reliably maintainable.

## What Changes

- Structured JSON logging throughout the Worker (request tracing, error capture, key lifecycle events)
- README covering project overview, architecture, and quick-start deployment
- Deployment guide (wrangler config, secrets, D1 migration, webhook registration)
- Skill authoring guide (SKILL.md format, auth types, secret management)

## Capabilities

### New Capabilities

- `structured-logging`: Consistent JSON log output for all request paths, errors, and key events — with a request trace ID threaded through each request lifecycle
- `documentation`: README, deployment guide, and skill authoring guide as markdown files in the repo

### Modified Capabilities

## Impact

- `src/utils/logger.ts` — extend existing logger to emit structured JSON with trace IDs
- `src/index.ts` — generate trace ID per request, pass through to all handlers
- New `docs/` directory: `deployment.md`, `skill-authoring.md`
- Root `README.md`
- No API changes, no new dependencies
