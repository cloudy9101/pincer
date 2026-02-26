## 1. Database migration

- [x] 1.1 Create `migrations/0006_user_profile.sql` with the `user_profiles` table: `(user_id TEXT, key TEXT, value TEXT, updated_at INTEGER DEFAULT (unixepoch()), PRIMARY KEY (user_id, key))`

## 2. User profile module

- [x] 2.1 Create `src/user-profile/types.ts` — `UserProfile` type (Record<string, string>), `PROFILE_KEYS` const with allowed keys: `name`, `home_location`, `location`, `timezone`, `communication_style`
- [x] 2.2 Create `src/user-profile/loader.ts` — `loadProfile(db, userId): Promise<UserProfile>` (returns all key-value pairs for the user)
- [x] 2.3 Add `saveProfile(db, userId, fields: Partial<UserProfile>): Promise<void>` to `loader.ts` — upserts only allowed keys, ignores unknown keys

## 3. Profile system prompt formatting

- [x] 3.1 Create `src/user-profile/prompt.ts` — `formatProfileSection(profile, now)` that returns a `## About <name>` markdown section or `null` if profile has no `name`
- [x] 3.2 In `formatProfileSection`, compute the user's local time from `profile.timezone` using `new Date(now).toLocaleString('en-US', { timeZone, ... })` and include it in the output
- [x] 3.3 In `formatProfileSection`, show `Currently in: <location>` and `Home: <home_location>` when they differ; show only `Location: <location>` when they match or only one is set

## 4. profile_update LLM tool

- [x] 4.1 Add `profile_update` tool to `src/llm/tool-registry.ts` with input schema `{ fields: object }` — description should explain the allowed keys and the location-tracking use case
- [x] 4.2 Implement the tool executor: filter `fields` to `PROFILE_KEYS`, call `saveProfile()`, return confirmation with saved key names

## 5. Default system prompt

- [x] 5.1 Replace `systemPrompt` in `src/config/defaults.ts` with the rich default persona including: warm direct tone, "no AI disclaimers" directive, `profile_update` save-silently instruction, and location-tracking rules (present-tense first-person only, not future or third-party)

## 6. Onboarding flow in ConversationSqlDO

- [x] 6.1 In `alarm()` in `src/durables/conversation.ts`, load the user profile and call `formatProfileSection()` — inject the result after the persona and before the memories section
- [x] 6.2 In `alarm()`, also inject current UTC timestamp (passed as `now = Date.now()`) into `formatProfileSection` for local time computation
- [x] 6.3 In `message()`, after command check, load the user profile to detect onboarding state: if `profile.name` is falsy (absent or empty), set a flag `needsOnboarding = true`
- [x] 6.4 In `message()` when `needsOnboarding`, check if `input.text` is "skip" or starts with "/start skip" — if so, call `saveProfile(db, userId, { name: "(skipped)" })` and send a friendly "no problem, ask me anything" reply, then return
- [x] 6.5 In `alarm()`, when `needsOnboarding`, swap the system prompt for the onboarding prompt (defined in `src/user-profile/onboarding.ts`) and skip the normal profile section injection

## 7. Onboarding system prompt

- [x] 7.1 Create `src/user-profile/onboarding.ts` — export `ONBOARDING_SYSTEM_PROMPT` string that instructs the LLM to: greet warmly, collect name+location in turn 1, collect communication_style in turn 2, call `profile_update` as it learns each field, handle "skip" by saving `name: "(skipped)"`, invite the user to ask anything once done

## 8. Update /start command

- [x] 8.1 In `handleCommand('/start')` in `src/durables/conversation.ts`, check if the user's profile has a `name` — if yes, return a brief "welcome back" message; if no, trigger the onboarding greeting by routing to the alarm flow with the onboarding prompt active

## 9. runTask profile injection

- [x] 9.1 In `runTask()` in `src/durables/conversation.ts`, load the user profile and inject `formatProfileSection()` result after the base system prompt (same position as in `alarm()`)
