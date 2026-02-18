import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { Env } from '../env.ts';
import type { MemoryScope, MemoryCategory } from '../memory/types.ts';
import { executeLinkRead } from '../tools/builtin/link-read.ts';
import { storeMemory, deleteMemory } from '../memory/store.ts';
import { searchMemories, searchMultiScope } from '../memory/search.ts';
import { embedText } from '../memory/embed.ts';
import { resolveScopes } from '../memory/retrieve.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { applySkillAuth, getRequiredSecretKeys, type FetchRequestArgs } from '../skills/auth.ts';
import { installSkill, removeSkill } from '../skills/installer.ts';
import { loadActiveSkills } from '../skills/loader.ts';

export interface ToolCallContext {
  env: Env;
  sessionKey: string;
  userId: string;
}

export async function buildToolSet(ctx: ToolCallContext): Promise<ToolSet> {
  const tools: ToolSet = {};
  const agentId = extractAgentId(ctx.sessionKey);

  // ─── Built-in tools ─────────────────────────────────────────

  tools.link_read = tool({
    description:
      'Fetches the content of a URL and returns the readable text. Use this to read web pages, articles, documentation, etc. when a user shares a link or you need to look something up.',
    inputSchema: jsonSchema<{ url: string; max_length?: number }>({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch and read' },
        max_length: { type: 'number', description: 'Maximum content length to return (default: 50000)' },
      },
      required: ['url'],
    }),
    execute: async (args: { url: string; max_length?: number }) => executeLinkRead(args),
  });

  // ─── Memory tools ───────────────────────────────────────────

  tools.memory_save = tool({
    description:
      'Save a piece of information to long-term memory. Use this when the user explicitly asks you to remember something, or when important facts/preferences/instructions are shared that should persist across conversations.',
    inputSchema: jsonSchema<{
      content: string;
      category?: string;
      tags?: string[];
    }>({
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to remember' },
        category: {
          type: 'string',
          enum: ['fact', 'preference', 'instruction', 'context', 'decision'],
          description: 'Category of the memory (default: fact)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for categorization',
        },
      },
      required: ['content'],
    }),
    execute: async (args: { content: string; category?: string; tags?: string[] }) => {
      const isDM = ctx.sessionKey.includes(':direct:');
      const scope: MemoryScope = isDM ? 'user' : 'group';
      const scopeId = resolveScopeId(scope, ctx, agentId);

      const result = await storeMemory(ctx.env, {
        content: args.content,
        scope,
        scopeId,
        category: (args.category as MemoryCategory) ?? 'fact',
        tags: args.tags,
        source: 'explicit',
        sourceSessionKey: ctx.sessionKey,
      });

      if (result) {
        return JSON.stringify({ saved: true, id: result.id, scope, content: result.content });
      }
      return JSON.stringify({ saved: false, reason: 'Duplicate memory already exists' });
    },
  });

  tools.memory_search = tool({
    description:
      'Search long-term memories for relevant information. Use this when you need to look up something the user previously told you, or to find context from past conversations.',
    inputSchema: jsonSchema<{ query: string; scope?: string }>({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        scope: {
          type: 'string',
          enum: ['user', 'group', 'agent'],
          description: 'Limit search to a specific scope (optional)',
        },
      },
      required: ['query'],
    }),
    execute: async (args: { query: string; scope?: string }) => {
      if (args.scope) {
        const scopeId = resolveScopeId(args.scope as MemoryScope, ctx, agentId);
        const results = await searchMemories(ctx.env, args.query, {
          scope: args.scope as MemoryScope,
          scopeId,
          topK: 10,
        });
        return JSON.stringify(results.map(formatSearchResult));
      }

      // Search all applicable scopes
      const vector = await embedText(ctx.env, args.query);
      const filters = resolveScopes({ sessionKey: ctx.sessionKey, userId: ctx.userId, agentId });
      const results = await searchMultiScope(ctx.env, vector, filters);
      return JSON.stringify(results.map(formatSearchResult));
    },
  });

  tools.memory_list = tool({
    description:
      'List all memories in a given scope. Use this when the user asks "what do you remember about me?" or wants to see all stored memories.',
    inputSchema: jsonSchema<{ scope?: string; limit?: number }>({
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['user', 'group', 'agent'],
          description: 'Which scope to list (default: user in DMs, group in groups)',
        },
        limit: { type: 'number', description: 'Maximum number of memories to return (default: 20)' },
      },
    }),
    execute: async (args: { scope?: string; limit?: number }) => {
      const isDM = ctx.sessionKey.includes(':direct:');
      const scope = (args.scope as MemoryScope) ?? (isDM ? 'user' : 'group');
      const scopeId = resolveScopeId(scope, ctx, agentId);
      const limit = args.limit ?? 20;

      const { results } = await ctx.env.DB.prepare(
        'SELECT * FROM memory_entries WHERE scope = ? AND scope_id = ? AND superseded_by IS NULL ORDER BY created_at DESC LIMIT ?'
      )
        .bind(scope, scopeId, limit)
        .all();

      return JSON.stringify(
        results.map((row) => ({
          id: row.id,
          content: row.content,
          category: row.category,
          source: row.source,
          created_at: row.created_at,
        }))
      );
    },
  });

  tools.memory_delete = tool({
    description:
      'Delete a specific memory by its ID. Use this when the user asks you to forget something specific.',
    inputSchema: jsonSchema<{ id: string }>({
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the memory to delete' },
      },
      required: ['id'],
    }),
    execute: async (args: { id: string }) => {
      const deleted = await deleteMemory(ctx.env, args.id);
      return JSON.stringify({ deleted, id: args.id });
    },
  });

  // ─── Skill tools ──────────────────────────────────────────

  tools.fetch = tool({
    description:
      'Make an HTTP request to an external API. If calling a skill\'s API, set the `skill` parameter to the skill name — authentication will be injected automatically. Do NOT include API keys or auth tokens manually.',
    inputSchema: jsonSchema<{
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      skill?: string;
    }>({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        method: { type: 'string', description: 'HTTP method (default: GET)', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        headers: {
          type: 'object',
          description: 'Request headers (do NOT include auth headers when using a skill)',
          additionalProperties: { type: 'string' },
        },
        body: { type: 'string', description: 'Request body (for POST/PUT/PATCH)' },
        skill: { type: 'string', description: 'Skill name for automatic auth injection' },
      },
      required: ['url'],
    }),
    execute: async (args: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      skill?: string;
    }) => {
      const requestArgs: FetchRequestArgs = {
        url: args.url,
        method: args.method,
        headers: { ...args.headers },
        body: args.body,
      };

      // Inject auth if a skill is specified
      if (args.skill) {
        await applySkillAuth(args.skill, requestArgs, ctx.env);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEFAULTS.fetchTimeoutMs);

        const response = await fetch(requestArgs.url, {
          method: requestArgs.method ?? 'GET',
          headers: requestArgs.headers,
          body: requestArgs.body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        let responseBody = await response.text();
        if (responseBody.length > DEFAULTS.fetchMaxResponseBytes) {
          responseBody = responseBody.slice(0, DEFAULTS.fetchMaxResponseBytes) + '\n...[truncated]';
        }

        // Filter to useful response headers
        const usefulHeaders: Record<string, string> = {};
        const interestingHeaders = ['content-type', 'x-ratelimit-remaining', 'x-ratelimit-limit', 'x-ratelimit-reset', 'retry-after'];
        for (const h of interestingHeaders) {
          const val = response.headers.get(h);
          if (val) usefulHeaders[h] = val;
        }

        return JSON.stringify({
          status: response.status,
          headers: usefulHeaders,
          body: responseBody,
        });
      } catch (e) {
        return JSON.stringify({ error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    },
  });

  tools.skill_install = tool({
    description:
      'Install a new skill from a URL pointing to a SKILL.md file. Returns the skill name and any required secret keys that need to be configured.',
    inputSchema: jsonSchema<{ url: string }>({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to a SKILL.md file' },
      },
      required: ['url'],
    }),
    execute: async (args: { url: string }) => {
      try {
        const skill = await installSkill(ctx.env, { url: args.url });
        const requiredSecrets = getRequiredSecretKeys(skill.authConfig);
        return JSON.stringify({
          installed: true,
          name: skill.name,
          description: skill.description,
          authType: skill.authType,
          requiredSecrets,
        });
      } catch (e) {
        return JSON.stringify({ error: `Install failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    },
  });

  tools.skill_remove = tool({
    description: 'Remove an installed skill and its secrets.',
    inputSchema: jsonSchema<{ name: string }>({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The skill name to remove' },
      },
      required: ['name'],
    }),
    execute: async (args: { name: string }) => {
      const removed = await removeSkill(ctx.env, args.name);
      return JSON.stringify({ removed, name: args.name });
    },
  });

  tools.skill_list = tool({
    description: 'List all installed skills with their name, description, auth type, and status.',
    inputSchema: jsonSchema<Record<string, never>>({
      type: 'object',
      properties: {},
    }),
    execute: async () => {
      const skills = await loadActiveSkills(ctx.env);
      return JSON.stringify(
        skills.map(s => ({
          name: s.name,
          description: s.description,
          authType: s.authType,
          status: s.status,
        }))
      );
    },
  });

  // ─── Plugin tools from D1 ──────────────────────────────────

  const { env } = ctx;
  const cached = await env.CACHE.get('tools:plugins', 'json') as PluginToolEntry[] | null;
  const pluginEntries = cached ?? await loadPluginTools(env);

  for (const entry of pluginEntries) {
    tools[entry.toolName] = tool({
      description: entry.description,
      inputSchema: jsonSchema(entry.inputSchema),
      execute: async (args: unknown) =>
        executePluginTool(entry.pluginName, entry.toolName, args as Record<string, unknown>, env),
    });
  }

  return tools;
}

// ─── Memory helpers ─────────────────────────────────────────

function extractAgentId(sessionKey: string): string {
  const match = sessionKey.match(/^agent:([^:]+)/);
  return match?.[1] ?? 'main';
}

function resolveScopeId(scope: MemoryScope, ctx: ToolCallContext, agentId: string): string {
  switch (scope) {
    case 'user': return ctx.userId;
    case 'group': return ctx.sessionKey;
    case 'agent': return agentId;
  }
}

function formatSearchResult(m: { entry: { id: string; content: string; category: string | null; scope: string }; score: number }) {
  return {
    id: m.entry.id,
    content: m.entry.content,
    category: m.entry.category,
    scope: m.entry.scope,
    relevance: Math.round(m.score * 100) / 100,
  };
}

// ─── Plugin tool helpers ────────────────────────────────────

interface PluginToolEntry {
  pluginName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

async function loadPluginTools(env: Env): Promise<PluginToolEntry[]> {
  const { results } = await env.DB
    .prepare("SELECT name, manifest FROM plugins WHERE status = 'active'")
    .all();

  const entries: PluginToolEntry[] = [];
  for (const row of results) {
    const manifest = JSON.parse(row.manifest as string) as {
      tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    };
    for (const t of manifest.tools) {
      entries.push({
        pluginName: row.name as string,
        toolName: t.name,
        description: t.description,
        inputSchema: t.input_schema,
      });
    }
  }

  await env.CACHE.put('tools:plugins', JSON.stringify(entries), { expirationTtl: 60 });
  return entries;
}

async function executePluginTool(
  pluginName: string,
  toolName: string,
  args: Record<string, unknown>,
  env: Env
): Promise<string> {
  const row = await env.DB.prepare('SELECT worker_url FROM plugins WHERE name = ? AND status = ?')
    .bind(pluginName, 'active')
    .first();

  if (!row) return JSON.stringify({ error: `Plugin not found: ${pluginName}` });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET;
  }

  const response = await fetch(`${row.worker_url as string}/invoke`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool: toolName, args }),
  });

  if (!response.ok) {
    const error = await response.text();
    return JSON.stringify({ error: `Plugin call failed: ${error}` });
  }

  return response.text();
}
