import type { Env } from '../env.ts';
import type { ToolRegistryEntry } from './tool-registry.ts';
import { executeLinkRead } from '../tools/builtin/link-read.ts';

export interface ToolCallContext {
  env: Env;
  sessionKey: string;
  userId: string;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  tools: ToolRegistryEntry[],
  ctx: ToolCallContext
): Promise<string> {
  const entry = tools.find((t) => t.definition.name === toolName);
  if (!entry) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  if (entry.source === 'builtin') {
    return executeBuiltinTool(toolName, args, ctx);
  }

  if (entry.source === 'plugin' && entry.pluginName) {
    return executePluginTool(entry.pluginName, toolName, args, ctx);
  }

  return JSON.stringify({ error: `Cannot execute tool: ${toolName}` });
}

async function executeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext
): Promise<string> {
  switch (toolName) {
    case 'link_read':
      return executeLinkRead(args as { url: string; max_length?: number });
    default:
      return JSON.stringify({ error: `Unknown builtin tool: ${toolName}` });
  }
}

async function executePluginTool(
  pluginName: string,
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext
): Promise<string> {
  const { env } = ctx;

  // Look up plugin worker URL
  const row = await env.DB.prepare('SELECT worker_url FROM plugins WHERE name = ? AND status = ?')
    .bind(pluginName, 'active')
    .first();

  if (!row) {
    return JSON.stringify({ error: `Plugin not found: ${pluginName}` });
  }

  const workerUrl = row.worker_url as string;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add CF Access service token if available
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET;
  }

  const response = await fetch(`${workerUrl}/invoke`, {
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
