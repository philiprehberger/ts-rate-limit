interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Check if a request is allowed under the rate limit.
 * @param identifier - Unique identifier (user ID, IP address, email, etc.)
 * @param limit - Maximum requests allowed per window (default: 100)
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count < limit) {
    entry.count++;
    return true;
  }

  return false;
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
 */
export function getRateLimitInfo(identifier: string, limit: number = 100): RateLimitInfo {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    return {
      limit,
      remaining: limit,
      resetTime: new Date(now + 15 * 60 * 1000).toISOString(),
      retryAfter: null,
    };
  }

  const remaining = Math.max(0, limit - entry.count);
  return {
    limit,
    remaining,
    resetTime: new Date(entry.resetTime).toISOString(),
    retryAfter: remaining === 0 ? Math.ceil((entry.resetTime - now) / 1000) : null,
  };
}

/**
 * Clear rate limit entry for an identifier.
 */
export function clearRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}

/**
 * Clean up expired entries to prevent memory leaks.
 * Run this periodically in production.
 * @returns Number of entries removed
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let removed = 0;

  for (const [identifier, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(identifier);
      removed++;
    }
  }

  return removed;
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
