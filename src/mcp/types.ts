export interface MCPToolSchema {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
}

export interface MCPServer {
  name: string;
  displayName: string | null;
  description: string | null;
  url: string;
  transportType: 'sse' | 'http';
  toolSchemas: MCPToolSchema[] | null;
  toolWhitelist: string[] | null;
  status: string;
  discoveredAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MCPServerInput {
  name: string;
  url: string;
  displayName?: string;
  description?: string;
  transportType?: 'sse' | 'http';
  toolWhitelist?: string[];
}
