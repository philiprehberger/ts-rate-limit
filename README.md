# @philiprehberger/rate-limit

[![CI](https://github.com/philiprehberger/rate-limit/actions/workflows/publish.yml/badge.svg)](https://github.com/philiprehberger/rate-limit/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/@philiprehberger/rate-limit.svg)](https://www.npmjs.com/package/@philiprehberger/rate-limit)
[![License](https://img.shields.io/github/license/philiprehberger/rate-limit)](LICENSE)

In-memory rate limiting for Node.js API routes with configurable windows and presets

> **Note:** This is a single-instance rate limiter using an in-memory Map. For distributed systems with multiple server instances, use a Redis-based solution.

## Installation

```bash
npm install @philiprehberger/rate-limit
```

## Usage

### Basic

```ts
import { checkRateLimit, getRateLimitInfo } from '@philiprehberger/rate-limit';

// In your API route handler:
const allowed = checkRateLimit(userIp, 100, 15 * 60 * 1000); // 100 req / 15 min

if (!allowed) {
  const info = getRateLimitInfo(userIp, 100);
  return Response.json({ error: 'Too many requests' }, {
    status: 429,
    headers: {
      'X-RateLimit-Limit': String(info.limit),
      'X-RateLimit-Remaining': String(info.remaining),
      'Retry-After': String(info.retryAfter),
    },
  });
}
```

### With Presets

```ts
import { checkRateLimitPreset } from '@philiprehberger/rate-limit';

// Signup: 5 requests per hour
if (!checkRateLimitPreset(email, 'signup')) {
  return Response.json({ error: 'Too many signup attempts' }, { status: 429 });
}
```

### Available Presets

| Preset | Limit | Window |
|--------|-------|--------|
| `signup` | 5 | 1 hour |
| `moderate` | 30 | 1 hour |
| `standard` | 100 | 15 minutes |
| `generous` | 1000 | 1 hour |
| `errorReporting` | 20 | 1 minute |
| `dataExport` | 10 | 1 minute |

### Independent Limiters

```ts
import { createRateLimiter } from '@philiprehberger/rate-limit';

const apiLimiter = createRateLimiter(100, 15 * 60 * 1000);
const loginLimiter = createRateLimiter(5, 60 * 60 * 1000);

// Each has its own state — no cross-contamination
apiLimiter.checkRateLimit(userIp);
loginLimiter.checkRateLimit(userIp);
```

### Auto-Cleanup

`createRateLimiter` accepts an options object with `autoCleanupInterval` to automatically purge expired entries on a timer. The interval is unreffed so it won't keep the Node.js process alive.

```ts
const limiter = createRateLimiter({
  limit: 100,
  windowMs: 15 * 60 * 1000,
  autoCleanupInterval: 60_000, // cleanup every 60 seconds
});

// When you're done with the limiter, stop the timer and clear state:
limiter.destroy();
```

### Manual Cleanup

```ts
import { cleanupExpiredEntries } from '@philiprehberger/rate-limit';

// Run periodically to prevent memory leaks
setInterval(() => cleanupExpiredEntries(), 60 * 1000);
```

### Checking Size

Use `size()` to see how many identifiers are currently tracked.

```ts
import { size } from '@philiprehberger/rate-limit';

console.log(`Tracking ${size()} identifiers`);

// Also available on limiter instances:
const limiter = createRateLimiter();
limiter.checkRateLimit('user-1');
console.log(limiter.size()); // 1
```

### Identifier Limits

Identifiers must be non-empty strings of at most 512 characters. Passing an empty string or a string exceeding the limit throws an `Error`.

## API

### Global Functions

| Function | Description |
|----------|-------------|
| `checkRateLimit(id, limit?, windowMs?)` | Returns `true` if the request is allowed |
| `getRateLimitInfo(id, limit?, windowMs?)` | Returns limit/remaining/resetTime/retryAfter |
| `clearRateLimit(id)` | Removes the entry for an identifier |
| `cleanupExpiredEntries()` | Purges expired entries, returns count removed |
| `checkRateLimitPreset(id, preset)` | Check using a named preset |
| `size()` | Number of tracked identifiers |

### `createRateLimiter(options?)` / `createRateLimiter(limit?, windowMs?)`

Returns a `RateLimiter` instance with the same methods as the global API, plus:

| Method | Description |
|--------|-------------|
| `size()` | Number of tracked identifiers in this instance |
| `destroy()` | Stops the auto-cleanup interval (if any) and clears all entries |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `100` | Max requests per window |
| `windowMs` | `number` | `900000` (15 min) | Window duration in ms |
| `autoCleanupInterval` | `number` | — | If set, starts an automatic cleanup interval (ms) |


## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
