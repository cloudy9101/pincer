## ADDED Requirements

### Requirement: README at repo root
The repository SHALL have a `README.md` covering project overview, architecture summary, and quick-start instructions.

#### Scenario: README exists and covers key sections
- **WHEN** a developer opens the repo
- **THEN** `README.md` is present and contains: project description, architecture diagram or summary, prerequisites, and a link to the deployment guide

#### Scenario: README links to other docs
- **WHEN** a reader wants more detail on deployment or skill authoring
- **THEN** README contains links to `docs/deployment.md` and `docs/skill-authoring.md`

### Requirement: Deployment guide
The repository SHALL have a `docs/deployment.md` covering all steps required to deploy a new Pincer instance from scratch.

#### Scenario: Guide covers all required setup steps
- **WHEN** a developer follows the deployment guide
- **THEN** they can complete: Cloudflare account setup, wrangler config, all required secrets, D1 migration, Telegram/Discord webhook registration, and first deploy

#### Scenario: Required secrets documented
- **WHEN** a developer reads the deployment guide
- **THEN** every secret required in `src/env.ts` is listed with a description of where to obtain it

#### Scenario: Wrangler commands documented
- **WHEN** a developer follows the guide
- **THEN** the exact `wrangler` commands for migration, deploy, and secret setting are provided

### Requirement: Skill authoring guide
The repository SHALL have a `docs/skill-authoring.md` covering how to write, install, and manage SKILL.md files.

#### Scenario: Guide covers SKILL.md format
- **WHEN** a developer reads the skill authoring guide
- **THEN** they understand the YAML frontmatter fields (name, description, auth, version) and markdown body conventions

#### Scenario: Auth types documented
- **WHEN** a developer needs to configure skill authentication
- **THEN** all supported auth types (bearer, header, query, basic, oauth) are documented with examples

#### Scenario: Secret management documented
- **WHEN** a developer needs to set a skill secret
- **THEN** the guide explains using the admin API (`PUT /admin/skills/:name/secrets`) and the admin dashboard
