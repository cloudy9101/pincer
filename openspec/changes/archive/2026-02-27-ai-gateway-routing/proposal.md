## Why

All LLM provider calls leave the Worker with no visibility, no caching, and with API keys stored as Worker secrets. Routing inference through Cloudflare AI Gateway (C2 hybrid approach with BYOK) gives full observability, response caching, dynamic routing, and moves provider credentials out of the Worker.

## What Changes

- Replace `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` with `ai-gateway-provider`
- Add `CF_AIG_TOKEN` secret (Cloudflare API token scoped to AI Gateway)
- Update `gateway.ts` to route all inference through AI Gateway using provider-specific backends:
  - Anthropic: native Anthropic endpoint (preserves extended thinking / `providerOptions`)
  - OpenAI, Google, others: unified `/compat` endpoint
- Store provider API keys in AI Gateway BYOK (Bring Your Own Keys) rather than Worker secrets
- Remove `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` from Worker env once BYOK is active
- Wire up the existing `AI_GATEWAY_ENDPOINT` env var (currently declared but unused)
- Update `wrangler.toml` with new secret and remove old provider key references

## Capabilities

### New Capabilities

- `ai-gateway-routing`: How Pincer routes LLM inference through Cloudflare AI Gateway using provider-specific backends and BYOK authentication

### Modified Capabilities

<!-- No existing spec-level requirement changes — this is a pure infrastructure change -->

## Impact

- `src/llm/gateway.ts`: Replace provider SDK instantiation with `ai-gateway-provider`
- `src/env.ts`: Remove `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`; add `CF_AIG_TOKEN`
- `wrangler.toml`: Update secrets list
- `package.json`: Remove 3 `@ai-sdk/provider` packages, add `ai-gateway-provider`
- All other files (`conversation.ts`, `tool-registry.ts`, `auto-extract.ts`): unchanged — AI SDK core interface is preserved
- `@ai-sdk/mcp`: unaffected
