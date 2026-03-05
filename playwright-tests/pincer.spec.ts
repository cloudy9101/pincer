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

/** Authenticate the admin SPA by injecting the token into localStorage. */
async function loginSPA(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/dashboard/`);
  await page.evaluate((token) => localStorage.setItem('adminToken', token), ADMIN_TOKEN);
  await page.reload();
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
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('submitting invalid token shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/`);
    await page.getByRole('textbox').fill('wrong-token');
    await page.getByRole('button', { name: /save|connect|login|submit/i }).click();
    await expect(page.getByText(/invalid|unauthori|error/i)).toBeVisible();
  });

  test('valid token persists and redirects to dashboard', async ({ page }) => {
    await loginSPA(page);
    // After login we should see the dashboard — not the login form
    await expect(page.getByRole('textbox')).not.toBeVisible();
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
    await page.getByRole('button', { name: /new|create|add/i }).click();

    // Fill in agent ID (required)
    const idField = page.getByLabel(/agent id|id/i).first();
    await idField.fill(agentId);

    // Save
    await page.getByRole('button', { name: /save|create|submit/i }).click();

    // New agent must appear in the list
    await expect(page.getByText(agentId)).toBeVisible();
  });

  test('delete an agent removes it from the list', async ({ page }) => {
    // Create via API first so we have something to delete
    const agentId = `del-agent-${Date.now()}`;
    await page.request.post(`${BASE_URL}/admin/agents`, {
      data: { id: agentId },
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.reload();
    await expect(page.getByText(agentId)).toBeVisible();

    // Delete it
    const row = page.locator(`text=${agentId}`).locator('..');
    await row.getByRole('button', { name: /delete|remove/i }).click();

    // Confirm deletion if a dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByText(agentId)).not.toBeVisible({ timeout: 5000 });
  });
});

// ─── Admin API (raw) ──────────────────────────────────────────────────────────

test.describe('Admin API', () => {
  const authHeaders = { Authorization: `Bearer ${ADMIN_TOKEN}` };

  test('returns 401 without Authorization header', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/status`);
    expect(res.status()).toBe(401);
  });

  test('GET /admin/status returns counts', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/admin/status`, { headers: authHeaders });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('sessions');
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
