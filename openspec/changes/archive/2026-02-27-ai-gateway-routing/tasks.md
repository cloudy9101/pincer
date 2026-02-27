## 1. Install dependency

- [x] 1.1 Add `ai-gateway-provider` to `package.json` dependencies and run `bun install`

## 2. Update env types

- [x] 2.1 In `src/env.ts`, add `CF_AIG_TOKEN: string` and remove `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`

## 3. Rewrite gateway.ts

- [x] 3.1 In `src/llm/gateway.ts`, import `createAiGateway` from `ai-gateway-provider` and `createUnified` from `ai-gateway-provider/providers/unified`
- [x] 3.2 Import the Anthropic provider from `ai-gateway-provider/providers/anthropic` (or equivalent) for the native Anthropic backend
- [x] 3.3 Replace the `switch` block: Anthropic → native AI Gateway Anthropic backend; OpenAI and Google → unified endpoint
- [x] 3.4 Use `CF_ACCOUNT_ID` + `CF_AIG_GATEWAY` + `CF_AIG_TOKEN` with `createAiGateway()` (ai-gateway-provider takes accountId+gateway, not a full URL)
- [x] 3.5 Remove imports of `@ai-sdk/openai`, `@ai-sdk/google` from `gateway.ts` (kept `@ai-sdk/anthropic` via sub-provider)

## 4. Remove old provider packages

- [x] 4.1 Remove `@ai-sdk/openai`, `@ai-sdk/google` from `package.json` and run `bun install` (kept `@ai-sdk/anthropic` — required by ai-gateway-provider/providers/anthropic)

## 5. Update wrangler.toml

- [x] 5.1 Secrets are managed via `wrangler secret put CF_AIG_TOKEN` and `wrangler secret put CF_AIG_GATEWAY` — no wrangler.toml changes needed
- [x] 5.2 Old provider secrets removed from env.ts; revoke via `wrangler secret delete ANTHROPIC_API_KEY` etc. after BYOK is configured in AI Gateway dashboard

## 6. Verify build

- [x] 6.1 Run `bunx wrangler deploy --dry-run --outdir dist` and confirm it compiles clean with no TypeScript errors
