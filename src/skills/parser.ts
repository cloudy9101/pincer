import type { SkillFrontmatter, SkillAuthType } from './types.ts';

/**
 * Parse a SKILL.md file into frontmatter and body.
 * Hand-rolled minimal YAML parser — handles flat key-value pairs
 * and one nested `auth` object. No external dependencies.
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

  const frontmatter: SkillFrontmatter = {
    name: data.name,
    description: data.description as string | undefined,
    version: data.version as string | undefined,
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
