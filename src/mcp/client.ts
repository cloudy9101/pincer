import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import type { Env } from '../env.ts';
import type { MCPServer, MCPToolSchema } from './types.ts';
import { getMCPServer, invalidateMCPCache } from './loader.ts';
import { decrypt } from '../security/encryption.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { ensureEncryptionKey } from '../security/bootstrap.ts';

/**
 * Build AI SDK tool objects from cached MCP server schemas.
 * Each tool's execute lazily connects to the MCP server only when called.
 */
export function buildMCPTools(servers: MCPServer[], env: Env): ToolSet {
  const tools: ToolSet = {};

  for (const server of servers) {
    if (!server.toolSchemas) continue;

    const whitelist = server.toolWhitelist
      ? new Set(server.toolWhitelist)
      : null;

    for (const schema of server.toolSchemas) {
      if (whitelist && !whitelist.has(schema.name)) continue;

      const toolName = `${server.name}__${schema.name}`;

      tools[toolName] = tool({
        description: schema.description ?? `Tool "${schema.name}" from MCP server "${server.name}"`,
        inputSchema: jsonSchema(schema.inputSchema),
        execute: async (args: unknown) =>
          executeMCPTool(server.name, schema.name, args as Record<string, unknown>, env),
      });
    }
  }

  return tools;
}

/**
 * Execute a single MCP tool by lazily connecting to the server.
 */
export async function executeMCPTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  env: Env,
): Promise<string> {
  const server = await getMCPServer(env, serverName);
  if (!server) return JSON.stringify({ error: `MCP server not found: ${serverName}` });

  const headers = await getDecryptedHeaders(env, serverName);

  let client;
  try {
    client = await createMCPClient({
      transport: {
        type: server.transportType,
        url: server.url,
        headers,
      },
    });

    const tools = await client.tools();
    const targetTool = tools[toolName];
    if (!targetTool) {
      return JSON.stringify({ error: `Tool "${toolName}" not found on MCP server "${serverName}"` });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULTS.mcpToolExecTimeoutMs);

    try {
      const result = await targetTool.execute(args, {
        toolCallId: `mcp_${serverName}_${toolName}`,
        messages: [],
        abortSignal: controller.signal,
      });
      clearTimeout(timeout);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return JSON.stringify({ error: `MCP tool execution failed: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    if (client) {
      try { await client.close(); } catch { /* best effort */ }
    }
  }
}

/**
 * Connect to an MCP server, discover its tools, and cache the schemas in D1.
 */
export async function discoverMCPTools(env: Env, serverName: string): Promise<MCPToolSchema[]> {
  const server = await getMCPServer(env, serverName);
  if (!server) throw new Error(`MCP server not found: ${serverName}`);

  const headers = await getDecryptedHeaders(env, serverName);

  const client = await createMCPClient({
    transport: {
      type: server.transportType,
      url: server.url,
      headers,
    },
  });

  try {
    const result = await client.listTools();

    const schemas: MCPToolSchema[] = result.tools.map(t => ({
      name: t.name,
      description: t.description ?? null,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));

    // Cache schemas in D1
    await env.DB.prepare(
      'UPDATE mcp_servers SET tool_schemas = ?, discovered_at = unixepoch(), updated_at = unixepoch() WHERE name = ?'
    ).bind(JSON.stringify(schemas), serverName).run();

    await invalidateMCPCache(env);

    return schemas;
  } finally {
    try { await client.close(); } catch { /* best effort */ }
  }
}

/**
 * Load and decrypt all stored headers for an MCP server.
 */
async function getDecryptedHeaders(
  env: Env,
  serverName: string,
): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(
    'SELECT key, encrypted_value FROM mcp_server_headers WHERE server_name = ?'
  ).bind(serverName).all();

  const headers: Record<string, string> = {};
  for (const row of results) {
    const encrypted = new Uint8Array(row.encrypted_value as ArrayBuffer);
    headers[row.key as string] = await decrypt(encrypted, await ensureEncryptionKey(env.CACHE));
  }
  return headers;
}
