import type { LLMToolDefinition } from './providers/types.ts';
import { getBuiltinTools } from '../tools/index.ts';

export interface ToolRegistryEntry {
  definition: LLMToolDefinition;
  source: 'builtin' | 'plugin';
  pluginName?: string;
}

export async function buildToolList(
  db: D1Database,
  cache: KVNamespace
): Promise<ToolRegistryEntry[]> {
  const tools: ToolRegistryEntry[] = [];

  // Built-in tools
  for (const tool of getBuiltinTools()) {
    tools.push({ definition: tool, source: 'builtin' });
  }

  // Plugin tools (from D1)
  const cacheKey = 'tools:plugins';
  const cached = await cache.get(cacheKey, 'json') as ToolRegistryEntry[] | null;

  if (cached) {
    tools.push(...cached);
  } else {
    const { results } = await db
      .prepare("SELECT name, manifest FROM plugins WHERE status = 'active'")
      .all();

    const pluginTools: ToolRegistryEntry[] = [];
    for (const row of results) {
      const manifest = JSON.parse(row.manifest as string) as {
        tools: LLMToolDefinition[];
      };
      for (const tool of manifest.tools) {
        pluginTools.push({
          definition: tool,
          source: 'plugin',
          pluginName: row.name as string,
        });
      }
    }

    await cache.put(cacheKey, JSON.stringify(pluginTools), { expirationTtl: 60 });
    tools.push(...pluginTools);
  }

  return tools;
}

export function getToolDefinitions(tools: ToolRegistryEntry[]): LLMToolDefinition[] {
  return tools.map((t) => t.definition);
}
