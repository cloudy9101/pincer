import { InteractionCallbackType } from './types.ts';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_MESSAGE_LENGTH = 2000;

export async function deferDiscordInteraction(interactionId: string, interactionToken: string): Promise<void> {
  const response = await fetch(`${DISCORD_API}/interactions/${interactionId}/${interactionToken}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: InteractionCallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Discord defer failed: ${response.status} ${error}`);
  }
}

export async function editDiscordInteractionResponse(
  appId: string,
  interactionToken: string,
  text: string,
  botToken: string,
): Promise<void> {
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);

  // Edit the original deferred response with the first chunk
  const editResponse = await fetch(`${DISCORD_API}/webhooks/${appId}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({ content: chunks[0] }),
  });

  if (!editResponse.ok) {
    const error = await editResponse.text();
    console.error(`Discord edit response failed: ${editResponse.status} ${error}`);
  }

  // Send remaining chunks as followup messages
  for (let i = 1; i < chunks.length; i++) {
    await sendDiscordFollowup(appId, interactionToken, chunks[i]!, botToken);
  }
}

export async function sendDiscordFollowup(
  appId: string,
  interactionToken: string,
  text: string,
  botToken: string,
): Promise<void> {
  const response = await fetch(`${DISCORD_API}/webhooks/${appId}/${interactionToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({ content: text }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Discord followup failed: ${response.status} ${error}`);
  }
}

export async function sendDiscordChannelMessage(
  channelId: string,
  text: string,
  botToken: string,
): Promise<void> {
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);

  for (const chunk of chunks) {
    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify({ content: chunk }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Discord channel message failed: ${response.status} ${error}`);
    }
  }
}

export function splitMessage(text: string, maxLength: number): string[] {
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
