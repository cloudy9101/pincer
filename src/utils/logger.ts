type LogCtx = { traceId?: string; handler?: string };

export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
  ctx?: LogCtx,
): void {
  const entry: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (ctx?.traceId) entry.traceId = ctx.traceId;
  if (ctx?.handler) entry.handler = ctx.handler;
  if (data && Object.keys(data).length > 0) entry.data = data;

  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}
