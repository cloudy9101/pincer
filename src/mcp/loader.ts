import type { Env } from '../env.ts';
import type { MCPServer } from './types.ts';

const MCP_CACHE_KEY = 'mcp:active';
const MCP_CACHE_TTL = 60; // seconds

export async function loadActiveMCPServers(env: Env): Promise<MCPServer[]> {
  const cached = await env.CACHE.get(MCP_CACHE_KEY, 'json');
  if (cached) return cached as MCPServer[];

  const { results } = await env.DB.prepare(
    "SELECT * FROM mcp_servers WHERE status = 'active' ORDER BY name"
  ).all();

  const servers = results.map(rowToMCPServer);

  await env.CACHE.put(MCP_CACHE_KEY, JSON.stringify(servers), { expirationTtl: MCP_CACHE_TTL });
  return servers;
}

export async function getMCPServer(env: Env, name: string): Promise<MCPServer | null> {
  const row = await env.DB.prepare('SELECT * FROM mcp_servers WHERE name = ?').bind(name).first();
  if (!row) return null;
  return rowToMCPServer(row);
}

export async function invalidateMCPCache(env: Env): Promise<void> {
  await env.CACHE.delete(MCP_CACHE_KEY);
}

function rowToMCPServer(row: Record<string, unknown>): MCPServer {
  return {
    name: row.name as string,
    displayName: row.display_name as string | null,
    description: row.description as string | null,
    url: row.url as string,
    transportType: (row.transport_type as 'sse' | 'http') ?? 'http',
    toolSchemas: row.tool_schemas ? JSON.parse(row.tool_schemas as string) : null,
    toolWhitelist: row.tool_whitelist ? JSON.parse(row.tool_whitelist as string) : null,
    status: row.status as string,
    discoveredAt: row.discovered_at as number | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
