export interface AgentConfig {
  id: string;
  displayName: string | null;
  model: string;
  systemPrompt: string | null;
  thinkingLevel: string | null;
  temperature: number;
  maxTokens: number;
}

export interface BindingRule {
  id: number;
  channel: string;
  accountId: string | null;
  peerKind: string | null;
  peerId: string | null;
  guildId: string | null;
  teamId: string | null;
  agentId: string;
  priority: number;
}

export interface AllowlistEntry {
  id: number;
  channel: string;
  senderId: string;
  displayName: string | null;
  status: string;
}

export interface PairingCode {
  code: string;
  channel: string;
  senderId: string;
  senderName: string | null;
  expiresAt: number;
  used: number;
}
