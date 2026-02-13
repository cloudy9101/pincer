import type { IncomingMessage } from '../types.ts';
import type { TelegramUpdate } from './types.ts';

export function parseTelegramWebhook(body: TelegramUpdate): IncomingMessage | null {
  const message = body.message ?? body.edited_message;
  if (!message) return null;
  if (!message.from) return null;

  const text = message.text ?? message.caption ?? '';
  if (!text) return null;

  const chatType = message.chat.type === 'private' ? 'direct' : 'group';
  const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ');

  return {
    channel: 'telegram',
    channelMessageId: String(message.message_id),
    senderId: String(message.from.id),
    senderName,
    chatId: String(message.chat.id),
    chatType,
    threadId: message.message_thread_id ? String(message.message_thread_id) : undefined,
    text,
    replyToMessageId: message.reply_to_message ? String(message.reply_to_message.message_id) : undefined,
    raw: body,
  };
}
