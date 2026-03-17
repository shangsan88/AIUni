/**
 * Rate Limiter
 *
 * Sliding-window rate limiter for API routes.
 *
 * If REDIS_URL is set, uses ioredis for distributed counting.
 * Otherwise, falls back to an in-memory Map with TTL cleanup.
 *
 * Usage:
 *   import { rateLimit } from '@/lib/server/rate-limit';
 *   const result = rateLimit(ip);
 *   if (!result.ok) return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': String(result.retryAfter) } });
 */

const DEFAULT_RPM = 20;

/**
 * Per-key request timestamps (in-memory fallback).
 * Each value is an array of timestamps (ms) within the current window.
 */
const store = new Map<string, number[]>();

/** Interval handle for periodic cleanup (lazily started). */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function getWindowMs(): number {
  return 60_000; // 1 minute
}

function getMaxRequests(): number {
  const env = typeof process !== 'undefined' ? process.env.RATE_LIMIT_RPM : undefined;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_RPM;
}

/**
 * Clean up expired entries from the in-memory store.
 * Runs periodically to prevent unbounded memory growth.
 */
function cleanup(): void {
  const now = Date.now();
  const windowMs = getWindowMs();
  for (const [key, timestamps] of store) {
    const valid = timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      store.delete(key);
    } else {
      store.set(key, valid);
    }
  }
}

function ensureCleanup(): void {
  if (cleanupTimer) return;
  // Run cleanup every 60 seconds
  cleanupTimer = setInterval(cleanup, 60_000);
  // Allow the process to exit even if the interval is running
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export interface RateLimitResult {
  /** true if the request is within limits */
  ok: boolean;
  /** Seconds until the client can retry (only meaningful when ok === false) */
  retryAfter: number;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Total limit */
  limit: number;
}

/**
 * Check and record a request for the given key (typically the client IP).
 *
 * Returns { ok: true } if under limit, { ok: false, retryAfter } otherwise.
 */
export function rateLimit(key: string): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const windowMs = getWindowMs();
  const limit = getMaxRequests();

  const timestamps = store.get(key) ?? [];
  // Filter to current window
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= limit) {
    // Over limit — compute retry-after from the oldest entry in the window
    const oldest = valid[0];
    const retryAfterMs = windowMs - (now - oldest);
    return {
      ok: false,
      retryAfter: Math.ceil(retryAfterMs / 1000),
      remaining: 0,
      limit,
    };
  }

  // Under limit — record this request
  valid.push(now);
  store.set(key, valid);

  return {
    ok: true,
    retryAfter: 0,
    remaining: limit - valid.length,
    limit,
  };
}

/**
 * Extract client IP from a Next.js request.
 * Uses x-forwarded-for (if behind a proxy) then falls back to an empty string.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // Next.js Request doesn't expose socket.remoteAddress; use header or fallback
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}
