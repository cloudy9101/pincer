export interface Agent {
  id: string;
  name: string;
  model: string;
  system_prompt?: string;
  max_steps?: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  name: string;
  description?: string;
  auth_type?: string;
  version?: string;
  enabled: boolean;
  created_at: string;
}

export interface SkillSecretKey {
  key: string;
}

export interface Session {
  session_key: string;
  agent_id: string;
  model_override?: string;
  message_count: number;
  last_activity: number; // unix timestamp
  created_at: number;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
}

export interface AllowlistEntry {
  id: string;
  channel: string;
  user_id: string;
  added_at: string;
}

export interface ConfigEntry {
  key: string;
  value: string;
}

export interface StatusResponse {
  status: string;
  agents: number;
  sessions: number;
  allowlistEntries: number;
}

export interface UsageRow {
  provider: string;
  model: string;
  total_input: number;
  total_output: number;
  call_count: number;
}

export interface UsageResponse {
  days: number;
  usage: UsageRow[];
}

export interface MCPServer {
  name: string;
  url: string;
  transport: 'sse' | 'http';
  enabled: boolean;
  created_at: string;
}

export interface OAuthConnection {
  id: string;
  provider: string;
  user_id?: string;
  scope?: string;
  expires_at?: string;
  created_at: string;
}

export interface CatalogSecretField {
  key: string;
  label: string;
  placeholder: string;
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export interface WebhookInfoResponse {
  ok: boolean;
  result: WebhookInfo;
}

export interface TelegramSetupResponse {
  webhook: { ok: boolean; description?: string };
  commands: { ok: boolean; description?: string };
}

export interface CatalogSkill {
  name: string;
  displayName: string;
  description: string;
  authType: string;
  secretFields: CatalogSecretField[];
  oauthProvider: string | null;
  setupUrl: string | null;
  installed: boolean;
}
