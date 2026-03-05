export default async function globalTeardown() {
  const pid = process.env.__TELEGRAM_MOCK_PID;
  if (pid) {
    try {
      process.kill(parseInt(pid));
    } catch {
      // Already gone
    }
  }
  console.log('[teardown] Cleanup complete');
}
