## 1. Database Migration

- [x] 1.1 Create `migrations/0005_skills_spec_fields.sql` adding `license TEXT`, `compatibility TEXT`, `metadata TEXT`, `allowed_tools TEXT` columns to the `skills` table

## 2. Types

- [x] 2.1 Extend `SkillFrontmatter` in `src/skills/types.ts` with `license`, `compatibility`, `metadata`, `allowedTools` optional fields
- [x] 2.2 Extend `Skill` interface in `src/skills/types.ts` with the same four fields

## 3. Parser

- [x] 3.1 Add name validation to `parseSkillContent` in `src/skills/parser.ts` — enforce 1-64 chars, `[a-z0-9-]` only, no leading/trailing/consecutive hyphens
- [x] 3.2 Parse `license` and `compatibility` as top-level string fields
- [x] 3.3 Parse `metadata` as a nested key-value map (string→string)
- [x] 3.4 Parse `allowed-tools` as a top-level string field (stored as-is)
- [x] 3.5 Resolve `version`: use top-level `version` if present, fall back to `metadata.version`

## 4. Installer

- [x] 4.1 Update `installSkill` in `src/skills/installer.ts` to bind and store `license`, `compatibility`, `metadata` (JSON), `allowed_tools` in the INSERT/UPSERT statement
- [x] 4.2 Update `rowToSkill` in `src/skills/loader.ts` to map new columns onto the `Skill` object

## 5. Progressive Disclosure — Prompt

- [x] 5.1 Rewrite `formatSkillsPrompt` in `src/skills/prompt.ts` to emit a compact index (name + description bullet list) instead of full skill bodies
- [x] 5.2 Add a directive in the index section instructing the LLM to call `skill_read` before using any skill

## 6. Progressive Disclosure — Tool

- [x] 6.1 Add `skill_read` tool to `buildToolSet` in `src/llm/tool-registry.ts` — accepts `name: string`, fetches skill from D1 via `getSkill`, returns the markdown body
- [x] 6.2 Return a clear error message from `skill_read` when the skill name is not found
- [x] 6.3 Ensure `skill_read` response contains only the markdown body (no auth config, no secrets)
