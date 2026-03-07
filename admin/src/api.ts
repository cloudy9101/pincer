import { getToken, clearToken } from './auth';
import type {
  Agent, Skill, SkillSecretKey, Session, SessionMessage,
  AllowlistEntry, ConfigEntry, StatusResponse, UsageResponse,
  MCPServer, OAuthConnection, CatalogSkill,
  WebhookInfoResponse, TelegramSetupResponse,
  SetupCheckResponse, ConnectorEntry,
  OnboardingStatus, BotTokenResponse, TelegramLoginData, TelegramLoginResponse,
} from './types';


async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Capture token at request time so we can check it against the current
  // token when the response arrives.  This avoids a race where a 401
  // response from an unauthenticated request clears a token that was
  // injected between fetch() and the response.
  const sentToken = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Only clear if we actually sent a token and it's still the current one.
    if (sentToken && getToken() === sentToken) {
      clearToken();
    }
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
export const patchConfig = (updates: Record<string, string>) => request<{ ok: boolean }>('PATCH', '/admin/config', updates);

// MCP
export const listMCP = () => request<MCPServer[]>('GET', '/admin/mcp');

// OAuth
export const listOAuth = () => request<OAuthConnection[]>('GET', '/admin/oauth');
export const revokeOAuth = (id: string) => request<void>('DELETE', `/admin/oauth/${id}`);

// Setup
export const completeSetup = () => request<{ ok: boolean }>('POST', '/admin/setup/complete');
export const getSetupCheck = () => request<SetupCheckResponse>('GET', '/admin/setup/check');

// Connectors
export const listConnectors = () => request<ConnectorEntry[]>('GET', '/admin/connectors');
export const saveConnector = (provider: string, data: { client_id: string; client_secret: string }) =>
  request<{ ok: boolean }>('PUT', `/admin/connectors/${provider}`, data);
export const removeConnector = (provider: string) => request<{ ok: boolean }>('DELETE', `/admin/connectors/${provider}`);

// Telegram setup
export const getTelegramWebhook = () => request<WebhookInfoResponse>('GET', '/admin/telegram/webhook');
export const setupTelegramChannel = () => request<TelegramSetupResponse>('POST', '/admin/telegram/setup');

// Skill catalog
export const listCatalog = () => request<CatalogSkill[]>('GET', '/admin/skills/catalog');
export const installCatalogSkill = (name: string, secrets?: Record<string, string>) =>
  request<{ ok: boolean; name: string }>('POST', `/admin/skills/catalog/${name}/install`, { secrets: secrets ?? {} });

// Onboarding
export const getOnboardingStatus = () => request<OnboardingStatus>('GET', '/admin/onboarding/status');
export const submitBotUsername = (username: string) =>
  request<{ ok: boolean }>('POST', '/admin/onboarding/bot-username', { username });
export const submitOwnerUsername = (username: string) =>
  request<{ ok: boolean }>('POST', '/admin/onboarding/username', { username });
export const submitBotToken = (token: string) =>
  request<BotTokenResponse>('POST', '/admin/onboarding/bot-token', { token });
export const submitTelegramLogin = (data: TelegramLoginData) =>
  request<TelegramLoginResponse>('POST', '/admin/onboarding/telegram-login', data);
export const sendWelcomeMessage = () =>
  request<{ ok: boolean }>('POST', '/admin/onboarding/welcome');
