import type { IncomingMessage } from '../types.ts';
import { InteractionType, type DiscordInteraction } from './types.ts';

export function parseDiscordInteraction(interaction: DiscordInteraction): IncomingMessage | null {
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) return null;
  if (!interaction.data) return null;

  const user = interaction.member?.user ?? interaction.user;
  if (!user) return null;

  const commandName = interaction.data.name;
  const options = interaction.data.options ?? [];

  let text: string;
  if (commandName === 'chat') {
    const messageOpt = options.find(o => o.name === 'message');
    text = messageOpt?.value ? String(messageOpt.value) : '';
    if (!text) return null;
  } else {
    // Map other slash commands to /command format for handleCommand()
    const arg = options.find(o => o.name === 'name' || o.name === 'message');
    text = arg?.value ? `/${commandName} ${arg.value}` : `/${commandName}`;
  }

  const chatType = interaction.guild_id ? 'group' : 'direct';
  const displayName = interaction.member?.nick ?? user.global_name ?? user.username;

  return {
    channel: 'discord',
    channelMessageId: interaction.id,
    senderId: user.id,
    senderName: displayName,
    chatId: interaction.channel_id,
    chatType,
    guildId: interaction.guild_id,
    text,
    raw: interaction,
  };
}
