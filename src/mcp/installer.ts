import type { Env } from '../env.ts';
import type { MCPServer, MCPServerInput } from './types.ts';
import { getMCPServer, invalidateMCPCache } from './loader.ts';
import { discoverMCPTools } from './client.ts';
import { encrypt } from '../security/encryption.ts';

/**
 * Register an MCP server: validate, upsert to D1, invalidate cache,
 * and auto-discover tools.
 */
export async function registerMCPServer(env: Env, input: MCPServerInput): Promise<MCPServer> {
  if (!input.name || !input.url) {
    throw new Error('"name" and "url" are required');
  }

  const transportType = input.transportType ?? 'http';
  if (transportType !== 'sse' && transportType !== 'http') {
    throw new Error('"transportType" must be "sse" or "http"');
  }

  await env.DB.prepare(
    `INSERT INTO mcp_servers (name, display_name, description, url, transport_type, tool_whitelist, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())
     ON CONFLICT (name) DO UPDATE SET
       display_name = excluded.display_name,
       description = excluded.description,
       url = excluded.url,
       transport_type = excluded.transport_type,
       tool_whitelist = excluded.tool_whitelist,
       status = excluded.status,
       updated_at = unixepoch()`
  ).bind(
    input.name,
    input.displayName ?? input.name,
    input.description ?? null,
    input.url,
    transportType,
    input.toolWhitelist ? JSON.stringify(input.toolWhitelist) : null,
  ).run();

  await invalidateMCPCache(env);

  // Auto-discover tools (best effort — don't fail registration if server is unreachable)
  try {
    await discoverMCPTools(env, input.name);
  } catch {
    // Server may not be reachable yet; tools can be discovered later
  }

  const server = await getMCPServer(env, input.name);
  return server!;
}

/**
 * Remove an MCP server. CASCADE handles mcp_server_headers.
 */
export async function removeMCPServer(env: Env, name: string): Promise<boolean> {
  const result = await env.DB.prepare('DELETE FROM mcp_servers WHERE name = ?').bind(name).run();
  await invalidateMCPCache(env);
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Update an existing MCP server's config fields.
 */
export async function updateMCPServer(
  env: Env,
  name: string,
  updates: Partial<Pick<MCPServerInput, 'url' | 'displayName' | 'description' | 'transportType' | 'toolWhitelist'>> & { status?: string },
): Promise<boolean> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.url !== undefined) { fields.push('url = ?'); values.push(updates.url); }
  if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.transportType !== undefined) { fields.push('transport_type = ?'); values.push(updates.transportType); }
  if (updates.toolWhitelist !== undefined) { fields.push('tool_whitelist = ?'); values.push(JSON.stringify(updates.toolWhitelist)); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }

  if (fields.length === 0) return false;

  fields.push('updated_at = unixepoch()');
  values.push(name);

  const result = await env.DB.prepare(
    `UPDATE mcp_servers SET ${fields.join(', ')} WHERE name = ?`
  ).bind(...values).run();

  await invalidateMCPCache(env);
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Encrypt and upsert headers for an MCP server.
 */
export async function updateMCPServerHeaders(
  env: Env,
  serverName: string,
  headers: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(headers)) {
    const encrypted = await encrypt(value, env.ENCRYPTION_KEY);
    await env.DB.prepare(
      `INSERT INTO mcp_server_headers (server_name, key, encrypted_value)
       VALUES (?, ?, ?)
       ON CONFLICT (server_name, key) DO UPDATE SET encrypted_value = excluded.encrypted_value`
    ).bind(serverName, key, encrypted).run();
  }
}

/**
 * List header key names (not values) for an MCP server.
 */
export async function listMCPServerHeaderKeys(env: Env, serverName: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT key FROM mcp_server_headers WHERE server_name = ?'
  ).bind(serverName).all();
  return results.map(r => r.key as string);
}
