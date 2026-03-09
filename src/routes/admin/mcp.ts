import { Hono } from 'hono';
import type { Env } from '../../env.ts';
import { registerMCPServer, removeMCPServer, updateMCPServer, updateMCPServerHeaders, listMCPServerHeaderKeys } from '../../mcp/installer.ts';
import { getMCPServer } from '../../mcp/loader.ts';
import { discoverMCPTools } from '../../mcp/client.ts';

type HonoEnv = { Bindings: Env };

export const mcpRouter = new Hono<HonoEnv>();

mcpRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT name, display_name, description, url, transport_type, tool_schemas, tool_whitelist, status, discovered_at, created_at, updated_at FROM mcp_servers ORDER BY name'
  ).all();
  return c.json(results.map(r => ({
    ...r,
    tool_schemas: r.tool_schemas ? JSON.parse(r.tool_schemas as string) : null,
    tool_whitelist: r.tool_whitelist ? JSON.parse(r.tool_whitelist as string) : null,
  })));
});

mcpRouter.post('/', async (c) => {
  const input = await c.req.json() as {
    name: string;
    url: string;
    displayName?: string;
    description?: string;
    transportType?: 'sse' | 'http';
    toolWhitelist?: string[];
  };
  try {
    const server = await registerMCPServer(c.env, input);
    return c.json({
      ok: true,
      name: server.name,
      url: server.url,
      tools: server.toolSchemas?.map(t => t.name) ?? [],
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

mcpRouter.get('/:name/headers', async (c) => {
  const serverName = decodeURIComponent(c.req.param('name'));
  const keys = await listMCPServerHeaderKeys(c.env, serverName);
  return c.json({ keys });
});

mcpRouter.put('/:name/headers', async (c) => {
  const serverName = decodeURIComponent(c.req.param('name'));
  const headers = await c.req.json() as Record<string, string>;
  await updateMCPServerHeaders(c.env, serverName, headers);
  return c.json({ ok: true });
});

mcpRouter.post('/:name/discover', async (c) => {
  const serverName = decodeURIComponent(c.req.param('name'));
  try {
    const schemas = await discoverMCPTools(c.env, serverName);
    return c.json({ ok: true, tools: schemas });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

mcpRouter.get('/:name', async (c) => {
  const serverName = decodeURIComponent(c.req.param('name'));
  const server = await getMCPServer(c.env, serverName);
  if (!server) return c.json({ error: 'Not found' }, 404);
  return c.json(server);
});

mcpRouter.patch('/:name', async (c) => {
  const serverName = decodeURIComponent(c.req.param('name'));
  const updates = await c.req.json() as Record<string, unknown>;
  const updated = await updateMCPServer(c.env, serverName, {
    url: updates.url as string | undefined,
    displayName: updates.displayName as string | undefined,
    description: updates.description as string | undefined,
    transportType: updates.transportType as 'sse' | 'http' | undefined,
    toolWhitelist: updates.toolWhitelist as string[] | undefined,
    status: updates.status as string | undefined,
  });
  return c.json({ ok: updated });
});

mcpRouter.delete('/:name', async (c) => {
  const serverName = decodeURIComponent(c.req.param('name'));
  const removed = await removeMCPServer(c.env, serverName);
  return c.json({ ok: removed });
});
