## Why

Pincer's skills system shares the same SKILL.md format as the emerging agentskills.io open standard, but diverges in field validation, missing optional fields, and prompt architecture. Aligning now ensures skill portability with the wider ecosystem and fixes a context-scaling problem before it becomes painful.

## What Changes

- Add name validation to `parseSkillContent` (1-64 chars, `[a-z0-9-]`, no leading/trailing/consecutive hyphens)
- Add `license`, `compatibility`, `metadata`, `allowed-tools` fields to the parser and D1 schema
- Move `version` to parse from `metadata.version` (with backward-compat fallback to top-level `version`)
- Replace eager full-body system prompt injection with a 2-tier model: compact skill index (name + description) always present, full body loaded on demand via a new `skill_read` LLM tool

## Capabilities

### New Capabilities
- `skill-name-validation`: Name format enforcement on install with clear error messages
- `skill-spec-fields`: Support for `license`, `compatibility`, `metadata`, `allowed-tools` frontmatter fields
- `skill-progressive-disclosure`: Tier-1 index (name+desc) in system prompt; `skill_read` tool loads full body

### Modified Capabilities
- `skill-install`: New fields parsed and stored; name validation applied on install

## Impact

- `src/skills/parser.ts`: Validation + new field parsing
- `src/skills/types.ts`: Extended `SkillFrontmatter` and `Skill` interfaces
- `src/skills/installer.ts`: Store new fields in D1; validate on install
- `src/skills/prompt.ts`: Switch from full-body injection to index-only format
- `src/llm/tool-registry.ts`: Add `skill_read` tool
- `migrations/`: New migration for `license`, `compatibility`, `metadata`, `allowed_tools` columns
