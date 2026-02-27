## Context

Currently `src/llm/gateway.ts` instantiates provider SDK adapters directly (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) and calls provider APIs without any observability layer. Provider API keys are stored as Worker secrets. The `AI_GATEWAY_ENDPOINT` env var is declared in `env.ts` but never used. The `env.AI` Workers AI binding is used only for embeddings.

The AI SDK's `generateText`/`streamText`/`tool()` orchestration layer is solid and stays intact. Only the provider *instantiation* in `gateway.ts` changes.

## Goals / Non-Goals

**Goals:**
- Route all inference through Cloudflare AI Gateway for observability, caching, and dynamic routing
- Preserve extended thinking (`providerOptions.anthropic.thinking`) by using the native Anthropic backend (not the unified OpenAI-compat endpoint)
- Move provider API keys out of the Worker via BYOK
- Keep model string format (`provider/model`) unchanged
- Remove 3 `@ai-sdk/provider` packages, add 1 (`ai-gateway-provider`)

**Non-Goals:**
- Changing the AI SDK core (`ai` package, `generateText`, `streamText`, `tool()`, `ModelMessage`)
- Changing MCP client (`@ai-sdk/mcp`) — unaffected
- Changing tool-registry, conversation.ts, auto-extract.ts
- Supporting additional providers beyond anthropic/openai/google at this time
- AI Gateway caching configuration (can be done in dashboard)

## Decisions

### Decision 1: C2 hybrid routing — Anthropic native, others unified

**Chosen**: Use `ai-gateway-provider`'s Anthropic-specific backend for `anthropic/*` models; use the unified `/compat` endpoint for all other providers.

**Why**: The unified `/compat/chat/completions` endpoint translates requests to OpenAI format. Anthropic's extended thinking uses native Anthropic API parameters (`thinking.type`, `thinking.budget_tokens`) that are not part of the OpenAI spec and would be stripped by the translation layer. Using the native Anthropic backend in AI Gateway passes the request body through unchanged, preserving `providerOptions`.

**Alternative considered**: Use unified endpoint for everything (C1). Simpler, but breaks extended thinking. Rejected because `thinkingLevel` is a first-class config field in Pincer.

**gateway.ts routing logic**:
```
anthropic/* → createAiGateway()(anthropicProvider(model))    ← native format
openai/*    → createAiGateway()(unified('openai/model'))      ← compat format
google/*    → createAiGateway()(unified('google/model'))      ← compat format
```

### Decision 2: BYOK via CF_AIG_TOKEN, remove provider key secrets

**Chosen**: Store `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` as BYOK secrets in AI Gateway dashboard. The Worker passes `CF_AIG_TOKEN` as authentication; AI Gateway injects provider keys at runtime.

**Why**: Reduces Worker secret surface area from 3 provider keys to 1 Cloudflare token. Provider keys never appear in Worker code or `wrangler.toml`. Revocation/rotation is handled in AI Gateway dashboard.

**Migration**: During transition, keep provider key secrets in wrangler.toml until BYOK is confirmed working in AI Gateway dashboard, then remove them.

**env.ts changes**: Remove `ANTHROPIC_API_KEY?`, `OPENAI_API_KEY?`, `GOOGLE_AI_API_KEY?`. Add `CF_AIG_TOKEN: string`. Retain `AI_GATEWAY_ENDPOINT?: string` as the configured gateway URL.

### Decision 3: Keep AI_GATEWAY_ENDPOINT as the gateway identifier

**Chosen**: Use `AI_GATEWAY_ENDPOINT` (already declared) to hold the full gateway base URL: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}`.

**Why**: Already in env.ts and wrangler.toml vars. No new naming needed.

**Alternative**: Use `CF_ACCOUNT_ID` + gateway name as separate vars. More config, no benefit.

## Risks / Trade-offs

**Risk: ai-gateway-provider maturity** → It's a newer Cloudflare-published package. Mitigation: pin to a specific version; fall back to direct provider SDKs if issues arise (gateway.ts is the only change).

**Risk: extra network hop latency** → Each request now goes Worker → AI Gateway edge → provider API. AI Gateway runs on Cloudflare's edge so the hop is typically <10ms. Mitigation: acceptable; AI Gateway caching offsets this for repeated prompts.

**Risk: extended thinking passthrough unverified** → The Anthropic-native backend *should* pass provider options through, but this hasn't been tested. Mitigation: test with a thinking-enabled request in staging before removing old provider packages.

**Risk: BYOK setup required before deployment** → If `CF_AIG_TOKEN` is set but BYOK keys aren't configured in AI Gateway, inference will fail with auth errors. Mitigation: document setup order; keep provider key secrets in wrangler.toml as fallback during transition.

## Migration Plan

1. Install `ai-gateway-provider`, keep existing `@ai-sdk/*` packages temporarily
2. Configure AI Gateway in Cloudflare dashboard (create gateway, add BYOK secrets)
3. Update `gateway.ts` to use `ai-gateway-provider`, keep old packages as fallback
4. Test: basic inference, extended thinking, OpenAI fallback
5. Remove `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` from package.json
6. Remove provider key secrets from wrangler.toml / Worker env
7. Update `env.ts` to remove old key fields

**Rollback**: Revert `gateway.ts` to provider SDK instantiation. Old packages were only removed at step 5 — rollback before that is trivial.

## Open Questions

- Does `ai-gateway-provider`'s Anthropic backend support streaming (`streamText`) in addition to `generateText`? (Very likely yes, but needs verification.)
- What is the exact `CF_AIG_TOKEN` scope required? (AI Gateway → Read/Write or just inference?)
