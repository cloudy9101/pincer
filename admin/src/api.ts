import { getToken, clearToken } from './auth';
import type {
  Agent, Skill, SkillSecretKey, Session, SessionMessage,
  AllowlistEntry, ConfigEntry, StatusResponse, UsageResponse,
  MCPServer, OAuthConnection, CatalogSkill,
} from './types';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...authHeaders(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/dashboard/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Status & Usage
export const getStatus = () => request<StatusResponse>('GET', '/admin/status');
export const getUsage = () => request<UsageResponse>('GET', '/admin/usage');

// Agents
export const listAgents = () => request<Agent[]>('GET', '/admin/agents');
export const createAgent = (data: Partial<Agent>) => request<Agent>('POST', '/admin/agents', data);
export const updateAgent = (id: string, data: Partial<Agent>) => request<Agent>('PATCH', `/admin/agents/${id}`, data);
export const deleteAgent = (id: string) => request<void>('DELETE', `/admin/agents/${id}`);

// Skills
export const listSkills = () => request<Skill[]>('GET', '/admin/skills');
export const installSkill = (data: { name?: string; url?: string }) => request<Skill>('POST', '/admin/skills', data);
export const removeSkill = (name: string) => request<void>('DELETE', `/admin/skills/${name}`);
export const listSkillSecrets = (name: string) => request<SkillSecretKey[]>('GET', `/admin/skills/${name}/secrets`);
export const setSkillSecret = (name: string, key: string, value: string) =>
  request<void>('PUT', `/admin/skills/${name}/secrets`, { key, value });

// Sessions
export const listSessions = () => request<Session[]>('GET', '/admin/sessions');
export const getSession = (key: string) => request<{ messages: SessionMessage[] }>('GET', `/admin/sessions/${encodeURIComponent(key)}/history`);
export const resetSession = (key: string) => request<void>('POST', `/admin/sessions/${encodeURIComponent(key)}/reset`);

// Allowlist
export const listAllowlist = () => request<AllowlistEntry[]>('GET', '/admin/allowlist');
export const addAllowlistEntry = (data: { channel: string; userId: string }) => request<AllowlistEntry>('POST', '/admin/allowlist', data);
export const removeAllowlistEntry = (id: string) => request<void>('DELETE', `/admin/allowlist/${id}`);
export const generatePairingCode = () => request<{ code: string; expiresAt: string }>('POST', '/admin/pairing');

// Config
export const listConfig = () => request<ConfigEntry[]>('GET', '/admin/config');
export const setConfig = (key: string, value: string) => request<void>('PUT', `/admin/config/${key}`, { value });

// MCP
export const listMCP = () => request<MCPServer[]>('GET', '/admin/mcp');

// OAuth
export const listOAuth = () => request<OAuthConnection[]>('GET', '/admin/oauth');
export const revokeOAuth = (id: string) => request<void>('DELETE', `/admin/oauth/${id}`);

// Skill catalog
export const listCatalog = () => request<CatalogSkill[]>('GET', '/admin/skills/catalog');
export const installCatalogSkill = (name: string, secrets?: Record<string, string>) =>
  request<{ ok: boolean; name: string }>('POST', `/admin/skills/catalog/${name}/install`, { secrets: secrets ?? {} });
