import type { SkillFrontmatter, SkillAuthType } from './types.ts';

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateSkillName(name: string): void {
  if (name.length === 0 || name.length > 64) {
    throw new Error(`Skill name must be 1-64 characters, got ${name.length}`);
  }
  if (!NAME_RE.test(name) || name.includes('--')) {
    throw new Error(
      `Skill name "${name}" is invalid. Must contain only lowercase letters, numbers, and hyphens; must not start/end with a hyphen or contain consecutive hyphens.`
    );
  }
}

/**
 * Parse a SKILL.md file into frontmatter and body.
 * Hand-rolled minimal YAML parser — handles flat key-value pairs
 * and one nested `auth`/`metadata` object. No external dependencies.
 */
export function parseSkillContent(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    throw new Error('Skill content must start with YAML frontmatter (---)');
  }

  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) {
    throw new Error('Unterminated YAML frontmatter — missing closing ---');
  }

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  const data = parseSimpleYaml(yamlBlock);

  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Skill frontmatter must include a "name" field');
  }

  validateSkillName(data.name);

  // Resolve version: top-level takes precedence over metadata.version
  const metadataMap = (data.metadata && typeof data.metadata === 'object')
    ? data.metadata as Record<string, string>
    : null;
  const version = (data.version as string | undefined)
    ?? metadataMap?.version
    ?? undefined;

  const frontmatter: SkillFrontmatter = {
    name: data.name,
    description: data.description as string | undefined,
    version,
    license: data.license as string | undefined,
    compatibility: data.compatibility as string | undefined,
    metadata: metadataMap ?? undefined,
    allowedTools: (data['allowed-tools'] as string | undefined),
  };

  if (data.auth && typeof data.auth === 'object') {
    const auth = data.auth as Record<string, string>;
    frontmatter.auth = {
      type: (auth.type ?? 'none') as SkillAuthType,
      secret: auth.secret,
      header_name: auth.header_name,
      param_name: auth.param_name,
      username_secret: auth.username_secret,
      password_secret: auth.password_secret,
      provider: auth.provider,
      scopes: auth.scopes,
    };
  }

  return { frontmatter, body };
}

/**
 * Minimal YAML parser: flat key-value with one level of nesting.
 * Handles:
 *   key: value
 *   key:
 *     nested_key: nested_value
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  let currentObject: Record<string, string> | null = null;
  let currentKey = '';

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const trimmedLine = line.trim();
    const colonIdx = trimmedLine.indexOf(':');

    if (colonIdx === -1) continue;

    const key = trimmedLine.slice(0, colonIdx).trim();
    const value = trimmedLine.slice(colonIdx + 1).trim();

    if (indent >= 2 && currentObject !== null) {
      // Nested key-value
      currentObject[key] = stripQuotes(value);
    } else {
      // Top-level
      if (currentObject !== null) {
        result[currentKey] = currentObject;
        currentObject = null;
      }

      if (value === '') {
        // Start of a nested object
        currentKey = key;
        currentObject = {};
      } else {
        result[key] = stripQuotes(value);
      }
    }
  }

  // Flush last nested object
  if (currentObject !== null) {
    result[currentKey] = currentObject;
  }

  return result;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
