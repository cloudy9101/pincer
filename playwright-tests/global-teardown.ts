import { existsSync, copyFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(__dirname, '..');
const DEV_VARS = resolve(ROOT, '.dev.vars');
const DEV_VARS_BACKUP = resolve(ROOT, '.dev.vars.bak');

export default async function globalTeardown() {
  // ── Stop Telegram mock server ─────────────────────────────────────────────
  const pid = process.env.__TELEGRAM_MOCK_PID;
  if (pid) {
    try {
      process.kill(parseInt(pid));
    } catch {
      // Already gone
    }
  }

  // ── Restore .dev.vars ─────────────────────────────────────────────────────
  if (existsSync(DEV_VARS_BACKUP)) {
    copyFileSync(DEV_VARS_BACKUP, DEV_VARS);
    unlinkSync(DEV_VARS_BACKUP);
  } else if (existsSync(DEV_VARS)) {
    // We created it — remove it
    unlinkSync(DEV_VARS);
  }

  console.log('[teardown] Cleanup complete');
}
