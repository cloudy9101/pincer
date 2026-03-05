import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';

// Test-only vars passed directly to wrangler dev so they are present at
// startup — webServer launches BEFORE globalSetup, so .dev.vars cannot be
// relied on (it would not exist yet when wrangler reads it).
const WRANGLER_VARS = [
  'ADMIN_AUTH_TOKEN:test-admin-token-000',
  'ENCRYPTION_KEY:0000000000000000000000000000000000000000000000000000000000000000',
  'TELEGRAM_BOT_TOKEN:test_bot_token',
  'TELEGRAM_WEBHOOK_SECRET:test-webhook-secret',
  'MOCK_AI_RESPONSE:mock-ai-response',
  'TELEGRAM_API_BASE:http://localhost:9999',
].map((v) => `--var ${v}`).join(' ');

export default defineConfig({
  testDir: './playwright-tests',
  testMatch: '**/*.spec.ts',

  // Fail fast — one retry on CI to catch flakes
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  // Global timeouts (Workers startup + D1 migration can be slow)
  timeout: 30_000,
  expect: { timeout: 10_000 },

  globalSetup: './playwright-tests/global-setup.ts',
  globalTeardown: './playwright-tests/global-teardown.ts',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Run migrations then start the worker in local mode with test vars baked in
    command: `bunx wrangler d1 migrations apply DB --local && bunx wrangler dev --local --port 8787 ${WRANGLER_VARS}`,
    url: BASE_URL + '/health',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
