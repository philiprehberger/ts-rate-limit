import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../../dist/index.js');
const {
  checkRateLimit,
  getRateLimitInfo,
  clearRateLimit,
  cleanupExpiredEntries,
  rateLimitPresets,
  checkRateLimitPreset,
  createRateLimiter,
} = mod;

// Helper: generate a unique identifier per test to avoid cross-test pollution
let idCounter = 0;
function uid() {
  return `test-${Date.now()}-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Basic allow / block behavior
// ---------------------------------------------------------------------------
describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const id = uid();
    for (let i = 0; i < 5; i++) {
      assert.equal(checkRateLimit(id, 5, 60_000), true, `request ${i + 1} should be allowed`);
    }
  });

  it('blocks requests at the limit', () => {
    const id = uid();
    for (let i = 0; i < 3; i++) {
      checkRateLimit(id, 3, 60_000);
    }
    assert.equal(checkRateLimit(id, 3, 60_000), false, 'request beyond limit should be blocked');
  });

  it('allows requests again after the window expires', () => {
    const id = uid();
    // Use a tiny window so it expires quickly
    const windowMs = 50;
    for (let i = 0; i < 2; i++) {
      checkRateLimit(id, 2, windowMs);
    }
    assert.equal(checkRateLimit(id, 2, windowMs), false);

    // Wait for window + a bit extra to expire
    const start = Date.now();
    // Busy-wait (acceptable for tiny duration in tests)
    while (Date.now() - start < windowMs * 2 + 10) {
      // spin
    }

    // After full expiry of both windows (sliding window needs 2x), should allow again
    assert.equal(checkRateLimit(id, 2, windowMs), true, 'should allow after window expiry');
  });
});

// ---------------------------------------------------------------------------
// getRateLimitInfo
// ---------------------------------------------------------------------------
describe('getRateLimitInfo', () => {
  it('returns full remaining when no requests made', () => {
    const id = uid();
    const info = getRateLimitInfo(id, 10, 60_000);
    assert.equal(info.limit, 10);
    assert.equal(info.remaining, 10);
    assert.equal(info.retryAfter, null);
    assert.ok(info.resetTime); // ISO string
  });

  it('returns correct remaining after some requests', () => {
    const id = uid();
    checkRateLimit(id, 5, 60_000);
    checkRateLimit(id, 5, 60_000);
    const info = getRateLimitInfo(id, 5, 60_000);
    assert.equal(info.limit, 5);
    // Sliding window: remaining should be close to 3 (exact value depends on timing)
    assert.ok(info.remaining >= 2 && info.remaining <= 3, `remaining=${info.remaining}`);
    assert.equal(info.retryAfter, null);
  });

  it('returns retryAfter when limit exhausted', () => {
    const id = uid();
    for (let i = 0; i < 5; i++) {
      checkRateLimit(id, 5, 60_000);
    }
    const info = getRateLimitInfo(id, 5, 60_000);
    assert.equal(info.remaining, 0);
    assert.equal(typeof info.retryAfter, 'number');
    assert.ok(info.retryAfter > 0);
  });

  it('uses provided windowMs instead of hardcoded 15min', () => {
    const id = uid();
    const windowMs = 5000; // 5 seconds
    const info = getRateLimitInfo(id, 10, windowMs);
    const resetDate = new Date(info.resetTime).getTime();
    const now = Date.now();
    // Reset time should be within windowMs of now (± 1s tolerance)
    assert.ok(
      resetDate >= now + windowMs - 1000 && resetDate <= now + windowMs + 1000,
      `resetTime should be ~${windowMs}ms from now, got ${resetDate - now}ms`
    );
  });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
describe('rateLimitPresets and checkRateLimitPreset', () => {
  it('exports expected preset keys', () => {
    const keys = Object.keys(rateLimitPresets);
    assert.ok(keys.includes('signup'));
    assert.ok(keys.includes('standard'));
    assert.ok(keys.includes('generous'));
    assert.ok(keys.includes('errorReporting'));
    assert.ok(keys.includes('dataExport'));
  });

  it('checkRateLimitPreset enforces preset limits', () => {
    const id = uid();
    // signup preset: 5 per hour
    for (let i = 0; i < 5; i++) {
      assert.equal(checkRateLimitPreset(id, 'signup'), true);
    }
    assert.equal(checkRateLimitPreset(id, 'signup'), false);
  });
});

// ---------------------------------------------------------------------------
// clearRateLimit
// ---------------------------------------------------------------------------
describe('clearRateLimit', () => {
  it('resets the counter so requests are allowed again', () => {
    const id = uid();
    for (let i = 0; i < 3; i++) {
      checkRateLimit(id, 3, 60_000);
    }
    assert.equal(checkRateLimit(id, 3, 60_000), false);
    clearRateLimit(id);
    assert.equal(checkRateLimit(id, 3, 60_000), true);
  });
});

// ---------------------------------------------------------------------------
// cleanupExpiredEntries
// ---------------------------------------------------------------------------
describe('cleanupExpiredEntries', () => {
  it('removes expired entries and returns the count', () => {
    const id = uid();
    const windowMs = 50;
    checkRateLimit(id, 1, windowMs);

    // Wait for full expiry (need 2x window for sliding window cleanup)
    const start = Date.now();
    while (Date.now() - start < windowMs * 2 + 20) {
      // spin
    }

    const removed = cleanupExpiredEntries();
    assert.ok(removed >= 1, `should have removed at least 1 entry, got ${removed}`);
  });
});

// ---------------------------------------------------------------------------
// createRateLimiter — factory / independent instances
// ---------------------------------------------------------------------------
describe('createRateLimiter', () => {
  it('returns an object with all expected methods', () => {
    const limiter = createRateLimiter();
    assert.equal(typeof limiter.checkRateLimit, 'function');
    assert.equal(typeof limiter.getRateLimitInfo, 'function');
    assert.equal(typeof limiter.clearRateLimit, 'function');
    assert.equal(typeof limiter.cleanupExpiredEntries, 'function');
    assert.equal(typeof limiter.checkRateLimitPreset, 'function');
  });

  it('uses its own independent state', () => {
    const limiterA = createRateLimiter(2, 60_000);
    const limiterB = createRateLimiter(2, 60_000);
    const id = 'shared-id';

    // Exhaust limiterA
    limiterA.checkRateLimit(id);
    limiterA.checkRateLimit(id);
    assert.equal(limiterA.checkRateLimit(id), false, 'limiterA should be exhausted');

    // limiterB should be unaffected
    assert.equal(limiterB.checkRateLimit(id), true, 'limiterB should still allow');
  });

  it('is also independent from the global limiter', () => {
    const limiter = createRateLimiter(2, 60_000);
    const id = uid();

    limiter.checkRateLimit(id);
    limiter.checkRateLimit(id);
    assert.equal(limiter.checkRateLimit(id), false);

    // Global should still allow
    assert.equal(checkRateLimit(id, 2, 60_000), true, 'global limiter should be independent');
    clearRateLimit(id); // cleanup
  });

  it('uses default limit and window from constructor', () => {
    const limiter = createRateLimiter(3, 60_000);
    const id = uid();

    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.checkRateLimit(id), true);
    }
    assert.equal(limiter.checkRateLimit(id), false);
  });

  it('getRateLimitInfo works on instance', () => {
    const limiter = createRateLimiter(5, 60_000);
    const id = uid();
    limiter.checkRateLimit(id);
    const info = limiter.getRateLimitInfo(id);
    assert.equal(info.limit, 5);
    assert.ok(info.remaining >= 3 && info.remaining <= 4);
  });

  it('clearRateLimit works on instance', () => {
    const limiter = createRateLimiter(1, 60_000);
    const id = uid();
    limiter.checkRateLimit(id);
    assert.equal(limiter.checkRateLimit(id), false);
    limiter.clearRateLimit(id);
    assert.equal(limiter.checkRateLimit(id), true);
  });

  it('checkRateLimitPreset works on instance', () => {
    const limiter = createRateLimiter();
    const id = uid();
    // dataExport preset: 10 per minute
    for (let i = 0; i < 10; i++) {
      assert.equal(limiter.checkRateLimitPreset(id, 'dataExport'), true);
    }
    assert.equal(limiter.checkRateLimitPreset(id, 'dataExport'), false);
  });
});

// ---------------------------------------------------------------------------
// Sliding window behavior
// ---------------------------------------------------------------------------
describe('sliding window', () => {
  it('weights previous window count at boundary', () => {
    // With a very short window, we can observe that requests from the
    // previous window still contribute to the effective count.
    const limiter = createRateLimiter(10, 100); // 100ms window
    const id = uid();

    // Fill up most of the window
    for (let i = 0; i < 8; i++) {
      limiter.checkRateLimit(id);
    }

    // Wait for window to rotate
    const start = Date.now();
    while (Date.now() - start < 110) {
      // spin
    }

    // Right after rotation, the previous 8 requests should still have
    // significant weight, so we should not be able to make 10 more.
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (limiter.checkRateLimit(id)) allowed++;
    }

    // With pure fixed window, all 10 would be allowed.
    // With sliding window, fewer should be allowed because previous count
    // still weighs in. The exact number depends on timing, but it should
    // be noticeably less than 10.
    assert.ok(
      allowed < 10,
      `sliding window should restrict: only ${allowed} of 10 allowed (expected < 10)`
    );
  });

  it('previous window weight decreases over time', () => {
    const limiter = createRateLimiter(10, 100);
    const id = uid();

    // Fill the window
    for (let i = 0; i < 10; i++) {
      limiter.checkRateLimit(id);
    }

    // Wait for window to rotate, then wait ~80% through the new window
    const start = Date.now();
    while (Date.now() - start < 180) {
      // spin
    }

    // Now previous weight should be ~20%, so effective ≈ 2 from prev.
    // We should be able to make ~7-8 requests in the new window.
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (limiter.checkRateLimit(id)) allowed++;
    }

    assert.ok(
      allowed >= 5,
      `after 80% of window, most requests should be allowed: got ${allowed}`
    );
  });
});
