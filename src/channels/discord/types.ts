export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
}

export enum InteractionCallbackType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
}

export enum ApplicationCommandOptionType {
  STRING = 3,
  INTEGER = 4,
  BOOLEAN = 5,
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
}

export interface DiscordMember {
  user: DiscordUser;
  nick?: string;
  roles: string[];
}

export interface DiscordCommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

export interface DiscordInteractionData {
  id: string;
  name: string;
  options?: DiscordCommandOption[];
}

export interface DiscordInteraction {
  id: string;
  type: InteractionType;
  data?: DiscordInteractionData;
  guild_id?: string;
  channel_id: string;
  member?: DiscordMember;
  user?: DiscordUser;
  token: string;
  application_id: string;
}

export interface DiscordApplicationCommandOption {
  name: string;
  description: string;
  type: ApplicationCommandOptionType;
  required?: boolean;
}

export interface DiscordApplicationCommand {
  name: string;
  description: string;
  options?: DiscordApplicationCommandOption[];
}
