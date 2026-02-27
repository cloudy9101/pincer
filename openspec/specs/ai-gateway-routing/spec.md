## ADDED Requirements

### Requirement: All LLM inference routes through AI Gateway
All inference calls (generateText, streamText) SHALL be routed through Cloudflare AI Gateway rather than calling provider APIs directly.

#### Scenario: Anthropic request routed via AI Gateway
- **WHEN** a conversation uses an `anthropic/*` model
- **THEN** the request is proxied through AI Gateway's Anthropic-specific endpoint before reaching the Anthropic API

#### Scenario: OpenAI request routed via AI Gateway
- **WHEN** a conversation uses an `openai/*` model
- **THEN** the request is proxied through AI Gateway's unified `/compat` endpoint

#### Scenario: Google request routed via AI Gateway
- **WHEN** a conversation uses a `google/*` model
- **THEN** the request is proxied through AI Gateway's unified `/compat` endpoint

### Requirement: Provider-specific backend preserves Anthropic extended thinking
The Anthropic provider SHALL use a native (non-unified) AI Gateway backend so that `providerOptions.anthropic.thinking` parameters pass through intact.

#### Scenario: Extended thinking params survive gateway routing
- **WHEN** a request includes `providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: N } } }`
- **THEN** the thinking parameters are forwarded to the Anthropic API without being stripped or transformed

#### Scenario: Unified endpoint not used for Anthropic
- **WHEN** the model string is `anthropic/claude-*`
- **THEN** the request does NOT go through the OpenAI-compatible `/compat/chat/completions` endpoint

### Requirement: BYOK — provider credentials stored in AI Gateway
Provider API keys (Anthropic, OpenAI, Google) SHALL be stored as BYOK secrets in Cloudflare AI Gateway rather than as Worker secrets.

#### Scenario: Worker holds no provider API keys
- **WHEN** the Worker handles an inference request
- **THEN** it does not use `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_AI_API_KEY` environment variables

#### Scenario: AI Gateway injects provider key at runtime
- **WHEN** AI Gateway forwards a request to a provider
- **THEN** it injects the stored BYOK secret as the provider authentication header

### Requirement: Worker authenticates to AI Gateway with a single token
The Worker SHALL authenticate to AI Gateway using a single `CF_AIG_TOKEN` Cloudflare API token.

#### Scenario: Single token used for all providers
- **WHEN** the Worker calls any provider via AI Gateway
- **THEN** the same `CF_AIG_TOKEN` is used as the bearer token regardless of which provider is targeted

### Requirement: Model string format unchanged
The `provider/model` string format used throughout Pincer SHALL remain unchanged after this migration.

#### Scenario: Existing model strings still work
- **WHEN** an agent is configured with `model: "anthropic/claude-sonnet-4-20250514"`
- **THEN** the model resolves correctly through AI Gateway without any configuration change
