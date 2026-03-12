import { validateAdminSession } from './bootstrap.ts';
import type { Env } from '../env.ts';

/**
 * Verify admin authentication via KV session token.
 * Requires Authorization: Bearer <session-token> created by Telegram Login.
 */
export async function verifyAdminAuth(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7);
  return validateAdminSession(env.CACHE, token);
}
