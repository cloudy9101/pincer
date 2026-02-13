import { DEFAULTS } from '../config/defaults.ts';

export async function checkRateLimit(
  cache: KVNamespace,
  channel: string,
  senderId: string,
  limitPerMinute: number = DEFAULTS.rateLimitPerMinute
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rl:${channel}:${senderId}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - 60;

  const stored = await cache.get(key, 'json') as { timestamps: number[] } | null;
  const timestamps = stored?.timestamps.filter((t) => t > windowStart) ?? [];

  if (timestamps.length >= limitPerMinute) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  await cache.put(key, JSON.stringify({ timestamps }), { expirationTtl: 120 });

  return { allowed: true, remaining: limitPerMinute - timestamps.length };
}
