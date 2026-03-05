import { spawn } from 'child_process';
import { writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MOCK_PORT = 9999;
const ROOT = resolve(__dirname, '..');
const DEV_VARS = resolve(ROOT, '.dev.vars');
const DEV_VARS_BACKUP = resolve(ROOT, '.dev.vars.bak');

/** Test-specific secrets — all values are safe to commit (used only locally). */
const TEST_DEV_VARS = [
  'ADMIN_AUTH_TOKEN=test-admin-token-000',
  'ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000',
  'TELEGRAM_BOT_TOKEN=test_bot_token',
  'TELEGRAM_WEBHOOK_SECRET=test-webhook-secret',
  'MOCK_AI_RESPONSE=Hello from mock AI!',
  `TELEGRAM_API_BASE=http://localhost:${MOCK_PORT}`,
].join('\n') + '\n';

async function waitForHttp(url: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return; // server is up
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  // ── Backup and write .dev.vars ────────────────────────────────────────────
  if (existsSync(DEV_VARS)) {
    copyFileSync(DEV_VARS, DEV_VARS_BACKUP);
  }
  writeFileSync(DEV_VARS, TEST_DEV_VARS);

  // ── Start Telegram mock server ────────────────────────────────────────────
  const mockServer = spawn('bun', ['run', resolve(__dirname, 'telegram-mock-server.ts')], {
    cwd: ROOT,
    stdio: 'pipe',
    detached: false,
  });

  mockServer.stderr?.on('data', (d: Buffer) => process.stderr.write(d));

  // Store PID so teardown can kill it
  process.env.__TELEGRAM_MOCK_PID = String(mockServer.pid);

  // Wait for mock server to accept connections
  await waitForHttp(`http://localhost:${MOCK_PORT}/_test/messages`);
  console.log(`[setup] Telegram mock server ready on port ${MOCK_PORT}`);
}
