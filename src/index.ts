interface RateLimitEntry {
  count: number;
  resetTime: number;
  previousCount: number;
  windowMs: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 100;

/**
 * Calculate the effective count using a sliding window approximation.
 * Weights the previous window's count by how much of the current window has elapsed.
 */
function slidingWindowCount(entry: RateLimitEntry, now: number): number {
  const elapsed = now - entry.windowStart;
  const windowFraction = Math.min(elapsed / entry.windowMs, 1);
  const previousWeight = 1 - windowFraction;
  return entry.previousCount * previousWeight + entry.count;
}

/**
 * Ensure the entry's window is current; rotate if expired.
 * Returns the (possibly rotated) entry, or null if no entry exists.
 */
function rotateIfNeeded(
  map: Map<string, RateLimitEntry>,
  identifier: string,
  now: number
): RateLimitEntry | null {
  const entry = map.get(identifier);
  if (!entry) return null;

  if (now >= entry.resetTime) {
    // Window has expired — rotate current into previous
    entry.previousCount = entry.count;
    entry.count = 0;
    entry.windowStart = entry.resetTime;
    entry.resetTime = entry.windowStart + entry.windowMs;

    // If still expired (multiple windows passed), zero out previous too
    if (now >= entry.resetTime) {
      entry.previousCount = 0;
      entry.windowStart = now;
      entry.resetTime = now + entry.windowMs;
    }
  }

  return entry;
}

/**
 * Internal checkRateLimit operating on a given map.
 */
function checkRateLimitInternal(
  map: Map<string, RateLimitEntry>,
  identifier: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rotateIfNeeded(map, identifier, now);

  if (!entry) {
    map.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
      previousCount: 0,
      windowMs,
      windowStart: now,
    });
    return true;
  }

  const effective = slidingWindowCount(entry, now);
  if (effective < limit) {
    entry.count++;
    return true;
  }

  return false;
}

/**
 * Internal getRateLimitInfo operating on a given map.
 */
function getRateLimitInfoInternal(
  map: Map<string, RateLimitEntry>,
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitInfo {
  const now = Date.now();
  const entry = rotateIfNeeded(map, identifier, now);

  if (!entry) {
    return {
      limit,
      remaining: limit,
      resetTime: new Date(now + windowMs).toISOString(),
      retryAfter: null,
    };
  }

  const effective = slidingWindowCount(entry, now);
  const remaining = Math.max(0, Math.floor(limit - effective));
  return {
    limit,
    remaining,
    resetTime: new Date(entry.resetTime).toISOString(),
    retryAfter: remaining === 0 ? Math.ceil((entry.resetTime - now) / 1000) : null,
  };
}

/**
 * Internal clearRateLimit operating on a given map.
 */
function clearRateLimitInternal(
  map: Map<string, RateLimitEntry>,
  identifier: string
): void {
  map.delete(identifier);
}

/**
 * Internal cleanupExpiredEntries operating on a given map.
 */
function cleanupExpiredEntriesInternal(map: Map<string, RateLimitEntry>): number {
  const now = Date.now();
  let removed = 0;

  for (const [identifier, entry] of map.entries()) {
    if (now > entry.resetTime) {
      // Only remove if both current and previous windows are fully expired
      // (previous window matters for sliding window accuracy)
      const prevWindowEnd = entry.windowStart;
      if (now > prevWindowEnd + entry.windowMs) {
        map.delete(identifier);
        removed++;
      }
    }
  }

  return removed;
}

// ---------------------------------------------------------------------------
// Global (backward-compatible) API
// ---------------------------------------------------------------------------

/**
 * Check if a request is allowed under the rate limit.
 * Uses a weighted sliding window approximation to prevent burst at window boundaries.
 * @param identifier - Unique identifier (user ID, IP address, email, etc.)
 * @param limit - Maximum requests allowed per window (default: 100)
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): boolean {
  return checkRateLimitInternal(rateLimitMap, identifier, limit, windowMs);
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: string;
  retryAfter: number | null;
}

/**
 * Get rate limit information for response headers.
 * @param identifier - Unique identifier
 * @param limit - The limit being enforced (default: 100)
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 */
export function getRateLimitInfo(
  identifier: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): RateLimitInfo {
  return getRateLimitInfoInternal(rateLimitMap, identifier, limit, windowMs);
}

/**
 * Clear rate limit entry for an identifier.
 */
export function clearRateLimit(identifier: string): void {
  clearRateLimitInternal(rateLimitMap, identifier);
}

/**
 * Clean up expired entries to prevent memory leaks.
 * Run this periodically in production.
 * @returns Number of entries removed
 */
export function cleanupExpiredEntries(): number {
  return cleanupExpiredEntriesInternal(rateLimitMap);
}

/** Common rate limit presets */
export const rateLimitPresets = {
  /** 5 requests per hour — sensitive operations (signup, password reset) */
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** 30 requests per hour — moderate operations */
  moderate: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** 100 requests per 15 minutes — general API */
  standard: { limit: 100, windowMs: 15 * 60 * 1000 },
  /** 1000 requests per hour — public endpoints */
  generous: { limit: 1000, windowMs: 60 * 60 * 1000 },
  /** 20 requests per minute — error reporting */
  errorReporting: { limit: 20, windowMs: 60 * 1000 },
  /** 10 requests per minute — data exports */
  dataExport: { limit: 10, windowMs: 60 * 1000 },
} as const;

export type RateLimitPreset = keyof typeof rateLimitPresets;

/**
 * Check rate limit using a preset configuration.
 * @param identifier - Unique identifier
 * @param preset - Preset name from rateLimitPresets
 */
export function checkRateLimitPreset(identifier: string, preset: RateLimitPreset): boolean {
  const { limit, windowMs } = rateLimitPresets[preset];
  return checkRateLimit(identifier, limit, windowMs);
}

// ---------------------------------------------------------------------------
// Factory API — create independent rate limiter instances
// ---------------------------------------------------------------------------

export interface RateLimiter {
  /** Check if a request is allowed under the rate limit. */
  checkRateLimit(identifier: string, limit?: number, windowMs?: number): boolean;
  /** Get rate limit information for response headers. */
  getRateLimitInfo(identifier: string, limit?: number, windowMs?: number): RateLimitInfo;
  /** Clear rate limit entry for an identifier. */
  clearRateLimit(identifier: string): void;
  /** Clean up expired entries. Returns number removed. */
  cleanupExpiredEntries(): number;
  /** Check rate limit using a preset. */
  checkRateLimitPreset(identifier: string, preset: RateLimitPreset): boolean;
}

/**
 * Create an independent rate limiter with its own internal state.
 * Useful for per-route or per-service rate limiting without sharing state.
 *
 * @param defaultLimit - Default max requests per window (default: 100)
 * @param defaultWindowMs - Default window in milliseconds (default: 15 minutes)
 */
export function createRateLimiter(
  defaultLimit: number = DEFAULT_LIMIT,
  defaultWindowMs: number = DEFAULT_WINDOW_MS
): RateLimiter {
  const map = new Map<string, RateLimitEntry>();

  return {
    checkRateLimit(
      identifier: string,
      limit: number = defaultLimit,
      windowMs: number = defaultWindowMs
    ): boolean {
      return checkRateLimitInternal(map, identifier, limit, windowMs);
    },

    getRateLimitInfo(
      identifier: string,
      limit: number = defaultLimit,
      windowMs: number = defaultWindowMs
    ): RateLimitInfo {
      return getRateLimitInfoInternal(map, identifier, limit, windowMs);
    },

    clearRateLimit(identifier: string): void {
      clearRateLimitInternal(map, identifier);
    },

    cleanupExpiredEntries(): number {
      return cleanupExpiredEntriesInternal(map);
    },

    checkRateLimitPreset(identifier: string, preset: RateLimitPreset): boolean {
      const { limit, windowMs } = rateLimitPresets[preset];
      return this.checkRateLimit(identifier, limit, windowMs);
    },
  };
}
