/**
 * Telegram Bot command registration via setMyCommands API.
 *
 * Call registerTelegramCommands() to push the bot's slash-command menu
 * so users see autocomplete when typing "/" in Telegram.
 */

const DEFAULT_TELEGRAM_API = 'https://api.telegram.org';

export interface BotCommand {
  /** Command name without leading slash */
  command: string;
  /** Human-readable description (1-256 chars) */
  description: string;
}

/** Authoritative list of bot commands shown in the Telegram menu. */
export const BOT_COMMANDS: BotCommand[] = [
  { command: 'help', description: 'Show available commands' },
  { command: 'reset', description: 'Clear conversation history' },
  { command: 'compact', description: 'Summarize old messages to save context' },
  { command: 'model', description: 'Show or switch the current model' },
  { command: 'agent', description: 'Show or switch the current agent' },
  { command: 'whoami', description: 'Show your identity info' },
  { command: 'status', description: 'Show bot status' },
];

/** Hash of the current command list — changes when BOT_COMMANDS is edited. */
const COMMANDS_VERSION = BOT_COMMANDS.map(c => c.command).join(',');
const KV_KEY = 'tg:commands_registered';

/**
 * Register bot commands with Telegram so they appear in the "/" menu.
 * Calls the setMyCommands API for the default scope.
 */
export async function registerTelegramCommands(
  botToken: string,
  apiBase?: string,
): Promise<{ ok: boolean; description?: string }> {
  const base = (apiBase ?? DEFAULT_TELEGRAM_API) + '/bot';
  const response = await fetch(`${base}${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: BOT_COMMANDS }),
  });

  const data = (await response.json()) as { ok: boolean; description?: string };
  return data;
}

/**
 * Lazily register commands on the first webhook request after a deploy.
 * Uses KV to store the version so it only calls setMyCommands once per
 * command-list change. Safe to call on every request — it's a single KV read.
 */
export async function ensureCommandsRegistered(
  cache: KVNamespace,
  botToken: string,
  apiBase?: string,
): Promise<void> {
  const stored = await cache.get(KV_KEY);
  if (stored === COMMANDS_VERSION) return;

  const result = await registerTelegramCommands(botToken, apiBase);
  if (result.ok) {
    // Cache for 30 days — re-registers after deploy if commands changed
    await cache.put(KV_KEY, COMMANDS_VERSION, { expirationTtl: 60 * 60 * 24 * 30 });
  }
}
