import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';

// Test-only vars passed directly to wrangler dev so they are present at
// startup — webServer launches BEFORE globalSetup, so .dev.vars cannot be
// relied on (it would not exist yet when wrangler reads it).
const WRANGLER_VARS = [
  'MOCK_AI_RESPONSE:mock-ai-response',
  'TELEGRAM_API_BASE:http://localhost:9999',
  'TELEGRAM_OWNER_USERNAME:testowner',
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
    // 1. Build admin SPA (wrangler [build] can be unreliable in local mode)
    // 2. Apply D1 migrations
    // 3. Start worker with test vars baked in (must be here — webServer starts before globalSetup)
    command: [
      'cd admin && bun install && bun run build && cd ..',
      'bunx wrangler d1 migrations apply DB --local',
      `bunx wrangler dev --local --port 8787 ${WRANGLER_VARS}`,
    ].join(' && '),
    url: BASE_URL + '/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
