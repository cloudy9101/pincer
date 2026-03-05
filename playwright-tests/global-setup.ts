import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MOCK_PORT = 9999;

async function waitForHttp(url: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  const mockServer = spawn('bun', ['run', resolve(__dirname, 'telegram-mock-server.ts')], {
    cwd: ROOT,
    stdio: 'pipe',
    detached: false,
  });

  mockServer.stderr?.on('data', (d: Buffer) => process.stderr.write(d));

  // Store PID so teardown can kill it
  process.env.__TELEGRAM_MOCK_PID = String(mockServer.pid);

  await waitForHttp(`http://localhost:${MOCK_PORT}/_test/messages`);
  console.log(`[setup] Telegram mock server ready on port ${MOCK_PORT}`);
}
