export type Channel = 'telegram' | 'webchat';

export interface MediaAttachment {
  fileId: string;
  type: 'image' | 'audio';
  mimeType?: string;
}

export interface IncomingMessage {
  channel: Channel;
  channelMessageId: string;
  senderId: string;
  senderName: string;
  chatId: string;
  chatType: 'direct' | 'group';
  threadId?: string;
  text: string;
  mediaAttachments?: MediaAttachment[];
  replyToMessageId?: string;
  raw: unknown;
}

export interface OutgoingMessage {
  channel: Channel;
  chatId: string;
  text: string;
  replyToMessageId?: string;
  threadId?: string;
  mediaUrls?: string[];
  parseMode?: 'markdown' | 'html' | 'plain';
}

export interface ChannelAdapter {
  verifyWebhook(request: Request): Promise<boolean>;
  parseWebhook(request: Request): Promise<IncomingMessage | null>;
  sendMessage(message: OutgoingMessage, env: ChannelEnv): Promise<void>;
}

export interface ChannelEnv {
  botToken: string;
  [key: string]: string;
}
