## Context

The Worker currently has a generic `"You are a helpful AI assistant."` default system prompt, no user profile storage, and a static `/start` response. Every conversation starts cold. The memory system (Vectorize) is reactive — it retrieves facts semantically similar to the current message — but key profile facts (name, timezone) won't surface unless the user says something that happens to match them semantically.

The goal is to give the bot a genuine identity and a persistent, always-present understanding of the user.

## Goals / Non-Goals

**Goals:**
- Always-present user profile injected into every system prompt (not query-dependent)
- Active 2-turn onboarding that collects name, location, and communication style
- `profile_update` LLM tool usable in onboarding and normal conversation
- Dynamic location tracking via conversational inference
- Rich default system prompt with behavioral directives

**Non-Goals:**
- Per-user agent configuration (agents remain shared)
- Admin UI for editing user profiles (LLM manages it; raw D1 access via admin API is sufficient)
- Profile versioning / history
- Onboarding for group chats (profile is per-user; group sessions don't run onboarding)

## Decisions

### D1 table with key-value pairs (not fixed columns)

**Decision**: `user_profiles (user_id TEXT, key TEXT, value TEXT, updated_at INTEGER)` with `PRIMARY KEY (user_id, key)`.

**Rationale**: Profile fields will grow over time (occupation, language, etc.). A key-value schema lets the LLM add new keys without schema migrations. Fixed columns would require a migration every time a new field is useful.

**Alternative considered**: Fixed columns (`name TEXT, timezone TEXT, ...`) — rejected because it requires a migration for every new profile field.

### Onboarding state from profile contents (not a separate flag)

**Decision**: A user is "in onboarding" if their profile has no `name` key. Once `profile_update` saves `name`, the user is out of onboarding. No separate state flag.

**Rationale**: The profile itself is the ground truth. A separate `onboarding_complete` flag can get out of sync. Checking `name` is simple and reliable — it's the minimum viable fact.

**Edge case**: User who skips onboarding → save `name: "(skipped)"` as a sentinel so the bot doesn't re-trigger.

### Onboarding uses a special system prompt (same model)

**Decision**: During onboarding, replace the agent's system prompt with an onboarding-specific prompt. Use the same agent model.

**Rationale**: The onboarding prompt needs to focus the LLM on collecting specific fields and calling `profile_update`. Using a separate cheaper model was considered but rejected for simplicity — onboarding only happens once per user.

**Onboarding system prompt structure**:
```
You are a warm, friendly personal AI assistant meeting a user for the first time.
Your goal is to collect three things: their name, where they're based, and their
communication preference (concise vs. detailed).

Collect them naturally across at most 2 conversational turns:
- Turn 1: Greet warmly. Ask for name and location in one message.
- Turn 2: After saving name + location via profile_update, ask about communication style.
- After saving communication_style via profile_update, say you're ready and invite them to ask anything.

If the user says "skip", call profile_update({ name: "(skipped)" }) and invite them to start.

Use profile_update to save fields as you learn them. Do not ask for more than these three things.
```

### Profile injection order in system prompt

**Decision**: The assembled system prompt layers are: `[persona] + [user profile] + [memories] + [skills]`.

**Rationale**: Profile comes before memories so the LLM has stable identity context before variable episodic facts. Skills come last as they're the most additive.

**Profile section format**:
```
## About Ray
- Name: Ray
- Home: Hong Kong
- Currently in: Tokyo (local time: 2:30 PM, Thursday)
- Communication style: concise
```

Local time is computed at request time: `new Date().toLocaleTimeString('en-US', { timeZone, ... })`.

### Location: two keys (home_location + location)

**Decision**: Two profile keys: `home_location` (set during onboarding, stable) and `location` (current, updated dynamically). `timezone` is always derived from `location`.

**Rationale**: When traveling, the assistant should know both where you live and where you are now. The `home_location` key is set once during onboarding and only changes if the user explicitly moves. `location` is updated whenever the bot infers a current presence change.

**Display logic**: If `home_location === location` (or `home_location` is absent), show one line. If they differ, show both.

### Default system prompt as a constant (not D1)

**Decision**: `DEFAULTS.systemPrompt` in `src/config/defaults.ts` is the rich default. Agents can override via `system_prompt` in the agents table.

**Rationale**: The default persona is code — it should be versioned, reviewed, and deployed like code. It's not runtime-configurable per-deployment.

**New default**:
```
You are a personal AI assistant. You are warm, direct, and get to the point — you act
before you explain, and you treat the user's time as precious. You have opinions and share
them. You never say "As an AI language model..." — respond as a trusted assistant would.

When you learn something worth remembering about the user (preferences, context, or
location), save it with the profile_update tool without announcing it.

Location tracking: if the user mentions they are currently in a new place (present tense,
first person — "I'm in Tokyo", "just landed in London"), call profile_update to update
their location and timezone. Do not update for future plans ("I'm going to...") or
third-party locations ("my client is in...").
```

## Risks / Trade-offs

- **Onboarding skew**: The LLM might phrase questions differently from turn to turn. The onboarding prompt is explicit enough to constrain this. → Keep the onboarding prompt concise and prescriptive.
- **Timezone inference**: The LLM infers timezone from city name. Major cities are reliably mapped; obscure locations may be wrong. → User can correct it conversationally ("actually I'm UTC+8"), and the LLM will call `profile_update`.
- **Context window cost**: Profile section adds ~100–200 tokens per request permanently. Acceptable for a personal assistant.
- **Skip sentinel**: Saving `name: "(skipped)"` means the bot won't re-onboard. If the user wants to onboard later, they say "what's my name?" and the bot can offer to re-collect. → No special handling needed; the LLM can handle this naturally.

## Migration Plan

1. Add `migrations/0006_user_profile.sql` — `user_profiles` table
2. Add `src/user-profile/` module (types, loader with load/save functions)
3. Add `profile_update` tool to `src/llm/tool-registry.ts`
4. Update `src/durables/conversation.ts`:
   - `message()`: detect onboarding condition, swap system prompt
   - `alarm()`: inject profile section after persona, before memories
5. Update `src/config/defaults.ts`: replace `systemPrompt`

No data migration needed — existing sessions continue normally; profile is empty until onboarding runs.
