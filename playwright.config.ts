import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';

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
    // Run migrations then start the worker in local mode
    command: 'bunx wrangler d1 migrations apply DB --local && bunx wrangler dev --local --port 8787',
    url: BASE_URL + '/health',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
