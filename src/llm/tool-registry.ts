import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { Env } from '../env.ts';
import { executeLinkRead } from '../tools/builtin/link-read.ts';

export interface ToolCallContext {
  env: Env;
  sessionKey: string;
  userId: string;
}

export async function buildToolSet(ctx: ToolCallContext): Promise<ToolSet> {
  const tools: ToolSet = {};

  // Built-in tools
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

  // Plugin tools from D1
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
