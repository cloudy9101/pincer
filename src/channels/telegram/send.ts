import type { OutgoingMessage } from '../types.ts';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const MAX_MESSAGE_LENGTH = 4096;

export async function sendTelegramMessage(message: OutgoingMessage, botToken: string): Promise<void> {
  const chunks = splitMessage(message.text, MAX_MESSAGE_LENGTH);

  for (const chunk of chunks) {
    const body: Record<string, unknown> = {
      chat_id: message.chatId,
      text: chunk,
    };

    if (message.parseMode === 'markdown') {
      body.parse_mode = 'MarkdownV2';
    } else if (message.parseMode === 'html') {
      body.parse_mode = 'HTML';
    }

    if (message.replyToMessageId) {
      body.reply_parameters = { message_id: Number(message.replyToMessageId) };
    }

    if (message.threadId) {
      body.message_thread_id = Number(message.threadId);
    }

    const response = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Telegram sendMessage failed: ${response.status} ${error}`);

      // Retry without parse mode if markdown failed
      if (body.parse_mode) {
        delete body.parse_mode;
        await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
    }
  }
}

export async function sendTelegramMessageAndGetId(
  message: OutgoingMessage,
  botToken: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    chat_id: message.chatId,
    text: message.text,
  };

  if (message.replyToMessageId) {
    body.reply_parameters = { message_id: Number(message.replyToMessageId) };
  }

  if (message.threadId) {
    body.message_thread_id = Number(message.threadId);
  }

  const response = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { result: { message_id: number } };
  return String(data.result.message_id);
}

export async function editTelegramMessage(
  chatId: string,
  messageId: string,
  text: string,
  botToken: string,
): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}${botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: Number(messageId),
      text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Telegram editMessageText failed: ${response.status} ${error}`);
  } else {
    response.body?.cancel();
  }
}

export async function sendTelegramChatAction(chatId: string, action: string, botToken: string): Promise<void> {
  const response = await fetch(`${TELEGRAM_API}${botToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
  response.body?.cancel();
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Try to split at a space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}
