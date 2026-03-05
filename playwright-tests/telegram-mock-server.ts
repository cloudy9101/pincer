/**
 * Lightweight mock for the Telegram Bot API.
 *
 * Intercepts outbound calls from the worker (sendMessage, editMessageText,
 * sendChatAction) and stores them in memory so tests can assert on them.
 *
 * Control endpoints (not part of the Telegram API):
 *   GET  /_test/messages          – return all captured calls
 *   DELETE /_test/messages        – clear captured calls
 *
 * Run standalone:  bun playwright-tests/telegram-mock-server.ts
 */

export interface CapturedCall {
  method: string;
  body: unknown;
  timestamp: number;
}

const messages: CapturedCall[] = [];

const server = Bun.serve({
  port: 9999,
  async fetch(req) {
    const url = new URL(req.url);

    // ── Test control endpoints ────────────────────────────────
    if (url.pathname === '/_test/messages') {
      if (req.method === 'GET') {
        return Response.json(messages);
      }
      if (req.method === 'DELETE') {
        messages.length = 0;
        return Response.json({ ok: true });
      }
    }

    // ── Telegram Bot API  /bot<TOKEN>/<method> ────────────────
    const match = url.pathname.match(/^\/bot[^/]+\/(.+)$/);
    if (match) {
      const method = match[1]!;
      let body: unknown = null;
      try {
        body = await req.json();
      } catch {
        // sendChatAction may have no body
      }
      messages.push({ method, body, timestamp: Date.now() });

      // Return method-specific responses
      if (method === 'getWebhookInfo') {
        return Response.json({
          ok: true,
          result: {
            url: '',
            has_custom_certificate: false,
            pending_update_count: 0,
          },
        });
      }

      // Return a minimal Telegram-like success envelope
      return Response.json({
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 1_000_000),
          chat: { id: 12345, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: '',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Telegram mock server listening on http://localhost:${server.port}`);

// Keep alive until the parent kills us
process.on('SIGTERM', () => server.stop());
process.on('SIGINT', () => server.stop());
