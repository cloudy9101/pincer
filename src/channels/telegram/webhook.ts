import type { IncomingMessage, MediaAttachment } from '../types.ts';
import type { TelegramUpdate } from './types.ts';

export function parseTelegramWebhook(body: TelegramUpdate): IncomingMessage | null {
  const message = body.message ?? body.edited_message;
  if (!message) return null;
  if (!message.from) return null;

  const text = message.text ?? message.caption ?? '';

  // Collect media attachments
  const mediaAttachments: MediaAttachment[] = [];

  // Photos: Telegram sends multiple sizes; pick the largest (last element)
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1]!;
    mediaAttachments.push({ fileId: largest.file_id, type: 'image', mimeType: 'image/jpeg' });
  }

  // Documents that are images (e.g. uncompressed photos sent as files)
  if (message.document) {
    const mime = message.document.mime_type ?? '';
    if (mime.startsWith('image/')) {
      mediaAttachments.push({ fileId: message.document.file_id, type: 'image', mimeType: mime });
    }
    // Audio documents
    if (mime.startsWith('audio/')) {
      mediaAttachments.push({ fileId: message.document.file_id, type: 'audio', mimeType: mime });
    }
  }

  // Voice messages (OGG/Opus from microphone)
  if (message.voice) {
    mediaAttachments.push({
      fileId: message.voice.file_id,
      type: 'audio',
      mimeType: message.voice.mime_type ?? 'audio/ogg',
    });
  }

  // Audio files (music etc)
  if (message.audio) {
    mediaAttachments.push({
      fileId: message.audio.file_id,
      type: 'audio',
      mimeType: message.audio.mime_type ?? 'audio/mpeg',
    });
  }

  // Drop messages with no text and no supported media
  if (!text && mediaAttachments.length === 0) return null;

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
    mediaAttachments: mediaAttachments.length > 0 ? mediaAttachments : undefined,
    replyToMessageId: message.reply_to_message ? String(message.reply_to_message.message_id) : undefined,
    raw: body,
  };
}
