## Context

Pincer's skills system stores SKILL.md files fetched from remote URLs. The parser currently handles `name`, `description`, `auth`, and `version` frontmatter fields. Skills are loaded by injecting their full bodies into the system prompt on every message. The agentskills.io open spec defines a richer frontmatter schema and a progressive disclosure model that separates a compact index (name + description) from the full body (loaded on demand).

## Goals / Non-Goals

**Goals:**
- Add agentskills.io-compatible fields: `license`, `compatibility`, `metadata`, `allowed-tools`
- Enforce spec-compliant name validation at install time
- Switch to a 2-tier prompt model: compact index always present, full body loaded via `skill_read` tool
- Maintain backward compatibility with existing installed skills

**Non-Goals:**
- Directory-based skill structure (`scripts/`, `references/`, `assets/`) — Pincer uses remote URLs, not local directories
- `allowed-tools` enforcement at runtime — stored and exposed but not enforced (matching the spec's "experimental" label)
- Retroactive name validation of already-installed skills
- Migrating `auth` into `metadata` — `auth` is a permanent top-level Pincer extension; the spec's `metadata` is a flat string→string map and the wrong shape for a typed auth object

## Decisions

### Decision 1: Name validation in parser, not installer

Validation runs in `parseSkillContent()` so it applies universally (LLM-triggered install, admin API, and future paths). The installer calls the parser, so this is the single choke point.

**Rule set** (from spec):
- 1–64 characters
- `[a-z0-9-]` only (lowercase; no uppercase)
- Must not start or end with `-`
- Must not contain `--`

**Alternative considered**: Validate only in the installer. Rejected — parser is the earlier, more universal gate.

### Decision 2: `auth` stays as a top-level Pincer extension

`auth` remains a top-level YAML key alongside spec fields. It is not moved into `metadata`. The agentskills.io spec's `metadata` is designed for simple string key-value pairs (author, team, version). Pincer's `auth` is a typed, structured object that drives credential injection logic — the shapes are incompatible. Standard YAML/frontmatter parsers silently ignore unknown top-level fields, so Pincer SKILL.md files remain valid in the wider ecosystem.

### Decision 3: `version` field backward-compatible

Top-level `version` remains supported and is read directly by the parser. `metadata.version` is also accepted if present. Top-level takes precedence if both exist. The existing `version` column in D1 is unchanged; the new `metadata` column stores the full map as JSON.

**Alternative considered**: Deprecate top-level `version` immediately. Rejected — breaking change for existing skill authors.

### Decision 4: Progressive disclosure via `skill_read` tool

`formatSkillsPrompt` switches to index-only format — a compact bullet list of name + description with a prompt instructing the LLM to call `skill_read` for full instructions before using a skill.

A new `skill_read` LLM tool accepts a skill name and returns the full markdown body from D1.

**Alternative considered**: Threshold-based hybrid (include body if under N tokens, otherwise lazy-load). Rejected — inconsistent behavior is harder to reason about and test.

**Alternative considered**: Keep full-body injection. Rejected — doesn't scale past ~5 skills; wastes context on skills irrelevant to the current task.

### Decision 5: `skill_read` returns body only

Auth config is sensitive and used only internally by the `fetch` tool. `skill_read` returns the markdown body (instructions) the LLM needs to understand how to use a skill. Auth injection continues to happen transparently in the `fetch` tool as before.

### Decision 6: D1 migration — additive columns only

New columns: `license TEXT`, `compatibility TEXT`, `metadata TEXT` (JSON blob), `allowed_tools TEXT`. All nullable. No existing column changes. Existing rows get NULLs for new columns automatically.

## Risks / Trade-offs

- **LLM may fail to call `skill_read`**: If descriptions are too vague, the LLM may attempt a task without loading skill instructions. Mitigation: the index format includes an explicit directive to call `skill_read` before using any skill.
- **Extra round-trip on first use**: Progressive disclosure adds one tool call before the LLM can act. Acceptable trade-off at Pincer's scale.
- **`allowed-tools` stored but not enforced**: Filed as future work. Data is captured now for when enforcement is added.

## Migration Plan

1. Deploy D1 migration (additive columns — zero downtime)
2. Deploy Worker with updated parser, types, prompt format, and `skill_read` tool
3. No skill re-install required — existing skills work with index-only prompt; full body available via `skill_read`
4. Rollback: revert Worker; additive migration columns are harmless if left in place
