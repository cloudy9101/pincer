import { ApplicationCommandOptionType, type DiscordApplicationCommand } from './types.ts';

const DISCORD_API = 'https://discord.com/api/v10';

export const DISCORD_COMMANDS: DiscordApplicationCommand[] = [
  {
    name: 'chat',
    description: 'Send a message to the AI assistant',
    options: [
      {
        name: 'message',
        description: 'Your message',
        type: ApplicationCommandOptionType.STRING,
        required: true,
      },
    ],
  },
  {
    name: 'reset',
    description: 'Clear conversation history',
  },
  {
    name: 'help',
    description: 'Show available commands',
  },
  {
    name: 'status',
    description: 'Show bot status',
  },
  {
    name: 'model',
    description: 'Show or switch the current model',
    options: [
      {
        name: 'name',
        description: 'Model name to switch to (e.g. anthropic/claude-sonnet-4-20250514)',
        type: ApplicationCommandOptionType.STRING,
        required: false,
      },
    ],
  },
  {
    name: 'agent',
    description: 'Show or switch the current agent',
    options: [
      {
        name: 'name',
        description: 'Agent ID to inspect',
        type: ApplicationCommandOptionType.STRING,
        required: false,
      },
    ],
  },
  {
    name: 'whoami',
    description: 'Show your identity info',
  },
  {
    name: 'compact',
    description: 'Summarize old messages to save context',
  },
];

export async function registerDiscordCommands(appId: string, botToken: string): Promise<{ ok: boolean; count: number }> {
  const response = await fetch(`${DISCORD_API}/applications/${appId}/commands`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(DISCORD_COMMANDS),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to register Discord commands: ${response.status} ${error}`);
  }

  const result = (await response.json()) as unknown[];
  return { ok: true, count: result.length };
}
