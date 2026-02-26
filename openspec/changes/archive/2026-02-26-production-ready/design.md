## Context

The Worker has a basic `log()` utility that emits JSON entries but has no request-level trace ID, no consistent field naming, and no structured context for which handler produced each log line. Debugging production issues currently means sifting through unrelated log entries with no way to correlate them to a specific request.

Documentation is entirely absent — deployment requires reading source code and wrangler.toml.

## Goals / Non-Goals

**Goals:**
- Thread a `traceId` through every request so all log lines for a single request share an ID
- Standardise log fields: `level`, `traceId`, `handler`, `message`, `timestamp`, plus optional `data`
- Log key events: incoming request, handler dispatch, errors, DO calls, outbound messages
- Three markdown docs: `README.md`, `docs/deployment.md`, `docs/skill-authoring.md`

**Non-Goals:**
- External log shipping (Logpush, Sentry) — Cloudflare Workers Logs is sufficient for now
- Log sampling or rate limiting
- Structured tracing (OpenTelemetry spans)

## Decisions

### Trace ID passed as a parameter (not a global)

**Decision**: Generate a `traceId` (`crypto.randomUUID()`) at the top of `fetch()` and pass it explicitly to handler functions that call `log()`.
**Rationale**: Workers have no async-local-storage equivalent that works reliably across all runtimes. Explicit passing is simple, type-safe, and zero-dependency.
**Alternative considered**: `AsyncLocalStorage` (available via Node.js compat) — rejected because it adds complexity and a compat flag dependency for a minor ergonomic gain.

### Extend `log()` signature with optional `traceId` and `handler`

**Decision**: Update `log(level, message, data?, ctx?)` where `ctx = { traceId?, handler? }`.
**Rationale**: Backwards-compatible — all existing call sites continue to work. New call sites opt in to richer context.

### Docs as committed markdown (not a wiki or external site)

**Decision**: `README.md` at repo root, `docs/deployment.md` and `docs/skill-authoring.md` as committed files.
**Rationale**: Docs stay in sync with code in the same PR. No external tooling required. GitHub renders markdown natively.

## Risks / Trade-offs

- **Noise vs. signal**: Logging every request adds volume. → Keep info-level logs terse; reserve `data` field for actionable context only.
- **Docs drift**: Markdown docs can become stale as the codebase evolves. → Scope docs to stable concepts (architecture, deployment steps, SKILL.md format) rather than API details that change frequently.

## Migration Plan

1. Update `src/utils/logger.ts` — add optional `ctx` parameter, include `traceId` and `handler` in output
2. Update `src/index.ts` — generate `traceId` per request, pass to handler calls
3. Add targeted `log()` calls to key handlers (webhook receipt, DO dispatch, errors)
4. Write `README.md`, `docs/deployment.md`, `docs/skill-authoring.md`

No migration needed — log format change is additive. Existing log consumers (Cloudflare dashboard) handle arbitrary JSON fields.
