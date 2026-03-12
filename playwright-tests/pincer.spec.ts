/**
 * Pincer Gateway — Playwright E2E tests
 *
 * Covers:
 *  - Health endpoint
 *  - Admin SPA (auth gate, navigation, CRUD flows)
 *  - Telegram webhook (signature verification, allowlist, AI response via mock)
 */
import { test, expect, type Page } from '@playwright/test';
import type { CapturedCall } from './telegram-mock-server';

const BASE_URL = 'http://localhost:8787';
const MOCK_URL = 'http://localhost:9999';
const ADMIN_TOKEN = 'test-admin-token-000';
const WEBHOOK_SECRET = 'test-webhook-secret';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const authHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/**
 * Seed KV with onboarded state and a test session token.
 * Uses the dev-seed endpoint (only available when MOCK_AI_RESPONSE is set).
 */
async function seedState(page: Page): Promise<void> {
  await page.request.post(`${BASE_URL}/onboarding/dev-seed`);
}

/** Reset the onboarded flag so the Worker redirects to /dashboard/onboarding. */
async function resetSetupViaAPI(page: Page): Promise<void> {
  await page.request.post(`${BASE_URL}/onboarding/dev-reset`);
}

/** Authenticate the admin SPA by seeding state and injecting the session token. */
async function loginSPA(page: Page): Promise<void> {
  await seedState(page);
  await page.goto(`${BASE_URL}/dashboard/`);
  // Key must match TOKEN_KEY in admin/src/auth.ts
  await page.evaluate((token) => localStorage.setItem('pincer_admin_token', token), ADMIN_TOKEN);
  await page.goto(`${BASE_URL}/dashboard/`);
}

/** Fetch captured calls from the Telegram mock server. */
async function getCapturedCalls(page: Page): Promise<CapturedCall[]> {
  const res = await page.request.get(`${MOCK_URL}/_test/messages`);
  return res.json();
}

/** Clear captured calls on the mock server. */
async function clearCapturedCalls(page: Page): Promise<void> {
  await page.request.delete(`${MOCK_URL}/_test/messages`);
}

/** Build a minimal Telegram Update payload. */
function telegramUpdate(overrides: {
  userId?: number;
  chatId?: number;
  text?: string;
  firstName?: string;
} = {}) {
  const userId = overrides.userId ?? 111111;
  const chatId = overrides.chatId ?? userId;
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 100_000),
      from: {
        id: userId,
        is_bot: false,
        first_name: overrides.firstName ?? 'Test',
      },
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: overrides.text ?? 'Hello',
    },
  };
}

/** POST to /webhook/telegram with the correct secret header. */
async function postWebhook(
  page: Page,
  body: object,
  secret = WEBHOOK_SECRET,
) {
  return page.request.post(`${BASE_URL}/webhook/telegram`, {
    data: body,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret,
    },
  });
}

/** Wait until the mock server has received at least `count` sendMessage calls. */
async function waitForBotMessages(
  page: Page,
  count = 1,
  timeoutMs = 15_000,
): Promise<CapturedCall[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const calls = await getCapturedCalls(page);
    const sends = calls.filter((c) => c.method === 'sendMessage');
    if (sends.length >= count) return sends;
    await page.waitForTimeout(300);
  }
  throw new Error(`Timed out waiting for ${count} bot message(s)`);
}

// ─── Health ───────────────────────────────────────────────────────────────────

test.describe('Health', () => {
  test('GET /health returns ok', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/health`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('pincer-gateway');
  });
});

// ─── Admin SPA — Auth gate ────────────────────────────────────────────────────

test.describe('Admin SPA — auth gate', () => {
  test('unauthenticated, not-onboarded visit redirects to /dashboard/setup', async ({ page }) => {
    await resetSetupViaAPI(page);
    const res = await page.request.get(`${BASE_URL}/dashboard/`, { maxRedirects: 0 });
    // Worker should 302 to /dashboard/setup when not onboarded
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toContain('/dashboard/setup');
  });

  test('onboarded visit with no session shows SPA login screen', async ({ page }) => {
    await seedState(page);
    await page.goto(`${BASE_URL}/dashboard/`);
    // SPA should show some form of login (token input or Telegram Login)
    await expect(page.getByRole('heading', { name: /pincer|admin|login|setup/i })).toBeVisible();
  });

  test('valid session token grants access to dashboard', async ({ page }) => {
    await loginSPA(page);
    // After login we should see the dashboard — not just the onboarding page
    await expect(page.getByLabel(/admin token|token/i)).not.toBeVisible();
  });
});

// ─── Admin SPA — Setup onboarding ────────────────────────────────────────────

test.describe('Admin SPA — setup onboarding', () => {
  test('redirects to /setup when setup is not completed', async ({ page }) => {
    // Ensure setup_completed is reset (other tests may have set it)
    await resetSetupViaAPI(page);

    // Login WITHOUT completing setup
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.evaluate((token) => localStorage.setItem('pincer_admin_token', token), ADMIN_TOKEN);
    await page.goto(`${BASE_URL}/dashboard/`);

    // AuthGuard should redirect to /setup
    await expect(page).toHaveURL(/setup/);
    await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();
  });

  test('setup page shows onboarding wizard', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.evaluate((token) => localStorage.setItem('pincer_admin_token', token), ADMIN_TOKEN);
    await page.goto(`${BASE_URL}/dashboard/setup`);

    // New onboarding wizard — shows one step at a time
    await expect(page.getByRole('heading', { name: /setup your bot/i })).toBeVisible();
    // First step is instructions for creating a bot
    await expect(page.getByRole('heading', { name: /create a telegram bot/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /i have my bot/i })).toBeVisible();
  });

  test('completing setup allows access to dashboard', async ({ page }) => {
    // Seed onboarded state via API
    await seedState(page);

    // Now login — should reach dashboard, not setup
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.evaluate((token) => localStorage.setItem('pincer_admin_token', token), ADMIN_TOKEN);
    await page.goto(`${BASE_URL}/dashboard/`);

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });
});

// ─── Admin SPA — Navigation ───────────────────────────────────────────────────

test.describe('Admin SPA — navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginSPA(page);
  });

  test('dashboard page loads with status info', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('agents page loads', async ({ page }) => {
    await page.getByRole('link', { name: /agent/i }).click();
    await expect(page).toHaveURL(/agents/);
    await expect(page.getByRole('heading', { name: /agent/i })).toBeVisible();
  });

  test('sessions page loads', async ({ page }) => {
    await page.getByRole('link', { name: /session/i }).click();
    await expect(page).toHaveURL(/sessions/);
    await expect(page.getByRole('heading', { name: /session/i })).toBeVisible();
  });

  test('allowlist page loads', async ({ page }) => {
    await page.getByRole('link', { name: /allowlist/i }).click();
    await expect(page).toHaveURL(/allowlist/);
    await expect(page.getByRole('heading', { name: /allowlist/i })).toBeVisible();
  });

  test('settings page loads', async ({ page }) => {
    await page.getByRole('link', { name: /setting/i }).click();
    await expect(page).toHaveURL(/settings/);
    await expect(page.getByRole('heading', { name: /setting/i })).toBeVisible();
  });

  test('SPA client-side routing works without full reload', async ({ page }) => {
    // Navigate directly to a sub-route — the worker must return index.html
    await page.goto(`${BASE_URL}/dashboard/agents`);
    await expect(page.getByRole('heading', { name: /agent/i })).toBeVisible();
  });

  test('sidebar visible on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Navigation links should be directly visible (not behind a hamburger)
    await expect(page.getByRole('link', { name: /agent/i }).first()).toBeVisible();
  });

  test('hamburger menu present on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    // On mobile a button to open the menu should be visible
    const hamburger = page.getByRole('button', { name: /menu|open|nav/i })
      .or(page.locator('[aria-label*="menu" i]'))
      .first();
    await expect(hamburger).toBeVisible();
  });
});

// ─── Admin SPA — Agents CRUD ──────────────────────────────────────────────────

test.describe('Admin SPA — agents CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginSPA(page);
    await page.getByRole('link', { name: /agent/i }).click();
    await expect(page).toHaveURL(/agents/);
  });

  test('create an agent and it appears in the list', async ({ page }) => {
    const agentId = `test-agent-${Date.now()}`;

    // Open create form
    await page.getByText('New Agent').click();

    // Fill in agent ID (required)
    const idField = page.getByRole('textbox').first();
    await idField.fill(agentId);
    const nameField = page.getByRole('textbox').nth(1);
    await nameField.fill("test agent");
    const modelField = page.getByRole('textbox').nth(2);
    await modelField.fill("model");
    const systemPrompt = page.locator('textarea');
    await systemPrompt.fill("test prompt");

    // Save
    await page.getByText('Save').click();

    // New agent must appear in the list
    await expect(page.getByRole('cell', { name: agentId })).toBeVisible();
  });

  test('delete an agent removes it from the list', async ({ page }) => {
    // Create via API first so we have something to delete
    const agentId = `del-agent-${Date.now()}`;
    await page.request.post(`${BASE_URL}/admin/agents`, {
      data: { id: agentId },
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.reload();
    await expect(page.getByRole('cell', { name: agentId })).toBeVisible();

    // Delete it
    const row = page.getByRole('cell', { name: agentId }).locator('..');
    await row.getByRole('button', { name: 'Delete' }).click();

    // Confirm deletion if a dialog appears
    const dialog = page.getByRole('button', { name: 'Cancel' }).locator('..');
    const confirmBtn = dialog.getByRole('button', { name: 'Delete' });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByRole('cell', { name: agentId })).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin API (raw) ──────────────────────────────────────────────────────────

test.describe('Admin API', () => {
  test.beforeAll(async ({ request }) => {
    await request.post(`${BASE_URL}/onboarding/dev-seed`);
  });

  test('returns 401 without Authorization header', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/status`);
    expect(res.status()).toBe(401);
  });

  test('GET /admin/status returns counts and onboarded flag', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/status`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('sessions');
    expect(body).toHaveProperty('onboarded');
    expect(typeof body.onboarded).toBe('boolean');
  });

  test('GET /admin/agents returns array', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/agents`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /admin/allowlist returns array', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/allowlist`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('POST /admin/allowlist adds an entry', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/admin/allowlist`, {
      data: { channel: 'telegram', sender_id: '9999', display_name: 'Test User' },
      headers: authHeaders,
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('GET /admin/telegram/webhook returns webhook info', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/telegram/webhook`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('url');
  });

  test('GET /admin/setup/check returns secrets, telegram, and connectors info', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/setup/check`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('secrets');
    expect(body).toHaveProperty('telegram');
    expect(body).toHaveProperty('connectors');
    expect(typeof body.secrets).toBe('object');
    // secrets now has TELEGRAM_BOT_TOKEN and ENCRYPTION_KEY (both KV-based)
    expect(typeof body.secrets.TELEGRAM_BOT_TOKEN).toBe('boolean');
    expect(typeof body.secrets.ENCRYPTION_KEY).toBe('boolean');
    expect(Array.isArray(body.connectors)).toBe(true);
  });

  test('PUT /admin/connectors/:provider saves and DELETE removes a connector', async ({ page }) => {
    // Save a connector
    const saveRes = await page.request.put(`${BASE_URL}/admin/connectors/google`, {
      data: { client_id: 'test-client-id', client_secret: 'test-client-secret' },
      headers: authHeaders,
    });
    expect(saveRes.ok()).toBe(true);

    // Verify it appears in list
    const listRes = await page.request.get(`${BASE_URL}/admin/connectors`, { headers: authHeaders });
    expect(listRes.ok()).toBe(true);
    const connectors = await listRes.json();
    expect(connectors.some((c: { provider: string }) => c.provider === 'google')).toBe(true);

    // Delete it
    const delRes = await page.request.delete(`${BASE_URL}/admin/connectors/google`, { headers: authHeaders });
    expect(delRes.ok()).toBe(true);

    // Verify it's gone
    const listRes2 = await page.request.get(`${BASE_URL}/admin/connectors`, { headers: authHeaders });
    const connectors2 = await listRes2.json();
    expect(connectors2.some((c: { provider: string }) => c.provider === 'google')).toBe(false);
  });

  test('POST /admin/telegram/setup registers webhook and commands', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/admin/telegram/setup`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('webhook');
    expect(body).toHaveProperty('commands');
    expect(body.webhook.ok).toBe(true);
    expect(body.commands.ok).toBe(true);
  });
});

// ─── Telegram webhook ─────────────────────────────────────────────────────────

test.describe('Telegram webhook', () => {
  test('rejects request without secret header', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/webhook/telegram`, {
      data: telegramUpdate(),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects request with wrong secret', async ({ page }) => {
    const res = await postWebhook(page, telegramUpdate(), 'wrong-secret');
    expect(res.status()).toBe(401);
  });

  test('accepts request with correct secret and returns 200', async ({ page }) => {
    const res = await postWebhook(page, telegramUpdate());
    expect(res.status()).toBe(200);
  });

  test('ignores non-message updates (no text) and returns 200', async ({ page }) => {
    const update = { update_id: 1, edited_channel_post: {} };
    const res = await postWebhook(page, update);
    expect(res.status()).toBe(200);
  });

  test('non-allowlisted user receives pairing code via Telegram', async ({ page }) => {
    await clearCapturedCalls(page);

    // Use a unique user ID that is definitely not on the allowlist
    const userId = 888_001 + Math.floor(Math.random() * 1000);
    const res = await postWebhook(page, telegramUpdate({ userId, text: 'hello' }));
    expect(res.status()).toBe(200);

    // The worker fires processTelegramMessage in the background —
    // wait for the mock server to capture the pairing-code message.
    const sends = await waitForBotMessages(page, 1);
    const body = sends[0]!.body as { text: string };
    expect(body.text).toMatch(/pairing code/i);
  });
});

// ─── Telegram webhook — full AI round-trip ────────────────────────────────────

test.describe('Telegram webhook — AI response (mock)', () => {
  let ownerId: number;

  test.beforeAll(async ({ request }) => {
    // Seed KV session so admin API calls are authenticated
    await request.post(`${BASE_URL}/onboarding/dev-seed`);
    // Add a known user to the allowlist so they can chat
    ownerId = 777_001 + Math.floor(Math.random() * 1000);
    await request.post(`${BASE_URL}/admin/allowlist`, {
      data: { channel: 'telegram', sender_id: String(ownerId), display_name: 'Owner' },
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test('allowed user message triggers mock AI reply via Telegram', async ({ page }) => {
    await clearCapturedCalls(page);

    const res = await postWebhook(
      page,
      telegramUpdate({ userId: ownerId, text: 'Say hello!' }),
    );
    expect(res.status()).toBe(200);

    // Wait for the DO alarm to fire and the mock AI reply to be sent
    const sends = await waitForBotMessages(page, 1);
    const body = sends[0]!.body as { text: string };

    // The mock AI always responds with this exact string (set via --var in playwright.config.ts)
    expect(body.text).toBe('mock-ai-response');
  });

  test('/help command returns help text without hitting AI', async ({ page }) => {
    await clearCapturedCalls(page);

    const res = await postWebhook(
      page,
      telegramUpdate({ userId: ownerId, text: '/help' }),
    );
    expect(res.status()).toBe(200);

    const sends = await waitForBotMessages(page, 1);
    const body = sends[0]!.body as { text: string };
    expect(body.text).toMatch(/available commands/i);
  });
});
