import type { IncomingMessage } from '../channels/types.ts';

export interface SessionKeyParts {
  agentId: string;
  channel: string;
  chatType: 'direct' | 'group';
  chatId: string;
  threadId?: string;
  accountId?: string;
}

export function buildSessionKey(parts: SessionKeyParts): string {
  const { agentId, channel, chatType, chatId, threadId, accountId } = parts;

  const segments = [`agent:${agentId}`];

  if (chatType === 'direct') {
    if (accountId) {
      segments.push(`${channel}:${accountId}:direct:${chatId}`);
    } else {
      segments.push(`${channel}:direct:${chatId}`);
    }
  } else {
    segments.push(`${channel}:group:${chatId}`);
    if (threadId) {
      segments.push(`thread:${threadId}`);
    }
  }

  return segments.join(':');
}

export function buildSessionKeyFromMessage(msg: IncomingMessage, agentId: string, accountId?: string): string {
  return buildSessionKey({
    agentId,
    channel: msg.channel,
    chatType: msg.chatType,
    chatId: msg.chatType === 'direct' ? msg.senderId : msg.chatId,
    threadId: msg.threadId,
    accountId,
  });
}
