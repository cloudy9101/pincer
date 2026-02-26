## Why

Pincer currently has no sense of identity and no knowledge of the person it's talking to — every conversation starts from zero with "You are a helpful AI assistant." Making it act as a genuine personal assistant requires a bot persona, a persistent user profile, and an active onboarding flow that warms the user in and collects the context needed to be useful from day one.

## What Changes

- Replace the bare default system prompt with a rich persona + behavioral rules
- Add a `user_profiles` D1 table to store per-user structured facts (name, location, timezone, communication style)
- Assemble the user profile into the system prompt on every request (always-present, not query-dependent)
- Inject the user's current local time derived from their stored timezone
- Add active onboarding triggered on `/start` or first non-command message when profile is empty (2-turn, skippable)
- Add a `profile_update` LLM tool so the bot can save profile data during onboarding and update it organically in conversation
- Instruct the bot (via system prompt) to detect and silently update location/timezone when the user mentions being somewhere new

## Capabilities

### New Capabilities

- `user-profile`: Per-user profile store (D1 table, loader, injection into system prompt, local time computation)
- `bot-onboarding`: Active first-time onboarding flow — warm 2-turn conversation that collects name, location, and communication style; skippable; same agent/model
- `profile-update-tool`: LLM tool `profile_update` for saving and updating user profile fields during conversation

### Modified Capabilities

- `bot-persona`: Replace `DEFAULTS.systemPrompt` with a rich persona + behavioral directives including location-change detection instructions

## Impact

- New migration: `migrations/0006_user_profile.sql`
- New module: `src/user-profile/` (types, loader)
- New LLM tool: `profile_update` in `src/llm/tool-registry.ts`
- Updated: `src/durables/conversation.ts` — onboarding detection in `message()`, profile injection in `alarm()` and `runTask()`
- Updated: `src/config/defaults.ts` — richer default system prompt
- No API changes, no new Cloudflare bindings
