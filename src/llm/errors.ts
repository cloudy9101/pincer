/**
 * LLM error classification and handling utilities.
 *
 * Detects rate-limit (429) and context-length errors from various providers
 * so the caller can react with retries, auto-compaction, or user feedback.
 */

export type LLMErrorKind = 'rate_limit' | 'context_length' | 'overloaded' | 'unknown';

/** Structured info extracted from an LLM provider error. */
export interface LLMErrorInfo {
  kind: LLMErrorKind;
  /** HTTP status code when available */
  status?: number;
  /** Retry-After header value in seconds, if the provider sent one */
  retryAfterSeconds?: number;
  /** Original error message */
  message: string;
}

// Patterns that indicate the request exceeded the model's context window
const CONTEXT_LIMIT_PATTERNS = [
  /context.{0,20}length/i,
  /token.{0,20}limit/i,
  /maximum.{0,20}context/i,
  /too many tokens/i,
  /input.{0,20}too long/i,
  /exceeds?.{0,20}(the\s+)?max(imum)?\s+(allowed\s+)?length/i,
  /request too large/i,
  /content.{0,20}too.{0,20}large/i,
  /prompt.{0,20}too.{0,20}long/i,
];

// Patterns that indicate the provider is overloaded (worth retrying)
const OVERLOADED_PATTERNS = [
  /overloaded/i,
  /capacity/i,
  /529/,
  /service.{0,10}unavailable/i,
];

/**
 * Classify an error thrown by the AI SDK / provider into an actionable kind.
 */
export function classifyLLMError(error: unknown): LLMErrorInfo {
  const message = error instanceof Error ? error.message : String(error);

  // Try to extract HTTP status from various error shapes
  const status = extractStatus(error);

  // 1) Rate-limit: 429
  if (status === 429 || /rate.{0,10}limit/i.test(message) || /too many requests/i.test(message)) {
    return {
      kind: 'rate_limit',
      status,
      retryAfterSeconds: extractRetryAfter(error),
      message,
    };
  }

  // 2) Context / token length exceeded
  for (const pat of CONTEXT_LIMIT_PATTERNS) {
    if (pat.test(message)) {
      return { kind: 'context_length', status, message };
    }
  }
  // Some providers return 400 with a body mentioning tokens
  if (status === 400 && /token/i.test(message)) {
    return { kind: 'context_length', status, message };
  }

  // 3) Overloaded / 529 / 503
  if (status === 529 || status === 503) {
    return { kind: 'overloaded', status, retryAfterSeconds: extractRetryAfter(error), message };
  }
  for (const pat of OVERLOADED_PATTERNS) {
    if (pat.test(message)) {
      return { kind: 'overloaded', status, retryAfterSeconds: extractRetryAfter(error), message };
    }
  }

  return { kind: 'unknown', status, message };
}

/** Sleep helper that returns a promise resolved after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Internals ─────────────────────────────────────────────

function extractStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    // AI SDK wraps provider errors with a `status` or `statusCode` field
    const e = error as Record<string, unknown>;
    if (typeof e.status === 'number') return e.status;
    if (typeof e.statusCode === 'number') return e.statusCode;

    // Some errors nest inside `cause` or `data`
    if (e.cause && typeof e.cause === 'object') {
      const cause = e.cause as Record<string, unknown>;
      if (typeof cause.status === 'number') return cause.status;
      if (typeof cause.statusCode === 'number') return cause.statusCode;
    }
    if (e.data && typeof e.data === 'object') {
      const data = e.data as Record<string, unknown>;
      if (typeof data.status === 'number') return data.status;
    }
  }
  // Try parsing from message
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/\b(429|503|529)\b/);
  if (m) return parseInt(m[1]!, 10);

  return undefined;
}

function extractRetryAfter(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;

    // Check headers (some SDK errors expose response headers)
    if (e.headers && typeof e.headers === 'object') {
      const headers = e.headers as Record<string, string>;
      const val = headers['retry-after'] ?? headers['Retry-After'];
      if (val) {
        const n = parseFloat(val);
        if (!isNaN(n)) return n;
      }
    }

    // Check responseHeaders
    if (e.responseHeaders && typeof e.responseHeaders === 'object') {
      const headers = e.responseHeaders as Record<string, string>;
      const val = headers['retry-after'] ?? headers['Retry-After'];
      if (val) {
        const n = parseFloat(val);
        if (!isNaN(n)) return n;
      }
    }
  }
  return undefined;
}
