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

/** Mark onboarding as complete so the SPA doesn't redirect to /setup. */
async function completeSetupViaAPI(page: Page): Promise<void> {
  await page.request.post(`${BASE_URL}/admin/setup/complete`, { headers: authHeaders });
}

/** Authenticate the admin SPA by injecting the token into localStorage. */
async function loginSPA(page: Page): Promise<void> {
  // Ensure setup is marked complete so AuthGuard doesn't redirect to /setup
  await completeSetupViaAPI(page);
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
  test('unauthenticated visit to /dashboard/ shows login screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/`);
    // Login page must ask for a token (no sidebar should be visible)
    await expect(page.getByRole('heading', { name: /pincer|admin|login/i })).toBeVisible();
    // Use getByLabel because <input type="password"> is not exposed as role=textbox
    await expect(page.getByLabel(/admin token|token/i)).toBeVisible();
  });

  test('submitting invalid token shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.getByLabel(/admin token|token/i).fill('wrong-token');
    await page.getByRole('button', { name: /save|connect|login|sign|submit/i }).click();
    await expect(page.getByText(/Invalid|error/i)).toBeVisible();
  });

  test('valid token persists and redirects to dashboard', async ({ page }) => {
    await loginSPA(page);
    // After login we should see the dashboard — not the login form
    await expect(page.getByLabel(/admin token|token/i)).not.toBeVisible();
  });
});

// ─── Admin SPA — Setup onboarding ────────────────────────────────────────────

test.describe('Admin SPA — setup onboarding', () => {
  test('redirects to /setup when setup is not completed', async ({ page }) => {
    // Login WITHOUT completing setup first
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.evaluate((token) => localStorage.setItem('pincer_admin_token', token), ADMIN_TOKEN);
    await page.goto(`${BASE_URL}/dashboard/`);

    // AuthGuard should redirect to /setup
    await expect(page).toHaveURL(/setup/);
    await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();
  });

  test('setup page shows onboarding steps', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.evaluate((token) => localStorage.setItem('pincer_admin_token', token), ADMIN_TOKEN);
    await page.goto(`${BASE_URL}/dashboard/setup`);

    await expect(page.getByText(/Connect Telegram/i)).toBeVisible();
    await expect(page.getByText(/Create an Agent/i)).toBeVisible();
    await expect(page.getByText(/Add Users/i)).toBeVisible();
  });

  test('completing setup allows access to dashboard', async ({ page }) => {
    // First mark setup complete via API
    await completeSetupViaAPI(page);

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
  test('returns 401 without Authorization header', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/status`);
    expect(res.status()).toBe(401);
  });

  test('GET /admin/status returns counts and setupCompleted flag', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/status`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('sessions');
    expect(body).toHaveProperty('setupCompleted');
    expect(typeof body.setupCompleted).toBe('boolean');
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

  test('POST /admin/setup/complete marks setup as done', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/admin/setup/complete`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify the status now reflects setupCompleted
    const status = await page.request.get(`${BASE_URL}/admin/status`, { headers: authHeaders });
    const statusBody = await status.json();
    expect(statusBody.setupCompleted).toBe(true);
  });

  test('GET /admin/telegram/webhook returns webhook info', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/telegram/webhook`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('result');
    expect(body.result).toHaveProperty('url');
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
