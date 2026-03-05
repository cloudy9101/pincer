/**
 * Post-deploy script: register Telegram bot commands via setMyCommands.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... bun run scripts/register-commands.ts
 *
 * Automatically called by `bun run deploy`.
 */
import { BOT_COMMANDS } from '../src/channels/telegram/commands.ts';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set — skipping command registration.');
  process.exit(0); // non-fatal: deploy still succeeds
}

const apiBase = process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org';

const res = await fetch(`${apiBase}/bot${token}/setMyCommands`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ commands: BOT_COMMANDS }),
});

const data = await res.json();

if (data.ok) {
  console.log(`Registered ${BOT_COMMANDS.length} Telegram bot commands.`);
} else {
  console.error('Failed to register Telegram commands:', data.description);
  process.exit(1);
}
