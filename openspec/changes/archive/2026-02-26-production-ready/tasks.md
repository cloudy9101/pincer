## 1. Update logger

- [x] 1.1 Extend `log()` signature in `src/utils/logger.ts` to accept optional `ctx: { traceId?: string; handler?: string }` parameter
- [x] 1.2 Include `traceId` and `handler` fields in the JSON output when present (nested under their own keys, not spread into root)
- [x] 1.3 Move `data` to a `data` key in the JSON object (instead of spreading it into root) to match the spec field layout

## 2. Thread trace ID through request lifecycle

- [x] 2.1 Generate `traceId` via `crypto.randomUUID()` at the top of `fetch()` in `src/index.ts`
- [x] 2.2 Log an info entry when a Telegram webhook is received (handler, method, path)
- [x] 2.3 Log an info entry when a Discord webhook is received (handler, method, path)
- [x] 2.4 Pass `traceId` to the Telegram and Discord handler functions as a parameter
- [x] 2.5 Log an info entry just before dispatching to the ConversationSqlDO (handler: "do-dispatch", sessionKey)
- [x] 2.6 Log an error entry with traceId, handler, and path in the top-level catch block of `fetch()`

## 3. Log outbound messages

- [x] 3.1 Add an info log in `src/channels/telegram/send.ts` after a message is sent (handler: "telegram-send", chatId)
- [x] 3.2 Add an info log in `src/channels/discord/send.ts` after a message is sent (handler: "discord-send", chatId)

## 4. Write documentation

- [x] 4.1 Write `README.md` at the repo root: project description, architecture summary, prerequisites, quick-start deploy command, links to `docs/deployment.md` and `docs/skill-authoring.md`
- [x] 4.2 Write `docs/deployment.md`: Cloudflare account setup, wrangler config, every secret in `src/env.ts` with description and where to obtain, D1 migration command, Telegram/Discord webhook registration steps, and first deploy command
- [x] 4.3 Write `docs/skill-authoring.md`: SKILL.md YAML frontmatter fields, markdown body conventions, all auth types (bearer, header, query, basic, oauth) with examples, secret management via admin API and dashboard
