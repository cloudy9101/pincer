import { isBootstrapMode, validateAdminSession } from './bootstrap.ts';
import type { Env } from '../env.ts';

/**
 * Verify admin authentication.
 *
 * Three modes:
 * 1. **Bootstrap** — no ADMIN_AUTH_TOKEN env var set → allow all requests
 *    (dashboard is accessible for initial onboarding).
 * 2. **Bearer token** — matches ADMIN_AUTH_TOKEN env var.
 * 3. **Session token** — matches a KV-stored session created via Telegram Login.
 */
export async function verifyAdminAuth(request: Request, env: Env): Promise<boolean> {
  if (isBootstrapMode(env)) return true;

  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7);

  // Check env-var admin token
  if (env.ADMIN_AUTH_TOKEN && token === env.ADMIN_AUTH_TOKEN) return true;

  // Check KV session
  return validateAdminSession(env.CACHE, token);
}
