export type SkillAuthType = 'none' | 'bearer' | 'header' | 'query' | 'basic' | 'oauth';

export interface SkillAuthConfig {
  type: SkillAuthType;
  /** Secret key name for bearer/header auth */
  secret?: string;
  /** Custom header name (for 'header' type) */
  header_name?: string;
  /** Query parameter name (for 'query' type) */
  param_name?: string;
  /** Secret key name for basic auth username */
  username_secret?: string;
  /** Secret key name for basic auth password */
  password_secret?: string;
  /** OAuth provider name (for 'oauth' type) */
  provider?: string;
  /** OAuth scopes override (for 'oauth' type, space-separated) */
  scopes?: string;
}

export interface SkillFrontmatter {
  name: string;
  description?: string;
  auth?: SkillAuthConfig;
  version?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string;
}

export interface Skill {
  name: string;
  displayName: string | null;
  description: string | null;
  /** Full raw content (frontmatter + body) */
  content: string;
  /** Markdown body (after frontmatter) */
  body: string;
  authType: SkillAuthType;
  authConfig: SkillAuthConfig | null;
  sourceUrl: string | null;
  version: string | null;
  license: string | null;
  compatibility: string | null;
  metadata: Record<string, string> | null;
  allowedTools: string | null;
  status: string;
}

export interface SkillInstallInput {
  /** Raw SKILL.md content */
  content?: string;
  /** URL to fetch SKILL.md from */
  url?: string;
}
