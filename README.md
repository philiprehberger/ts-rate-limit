# @philiprehberger/rate-limit

In-memory rate limiting for Node.js API routes with configurable windows and presets.

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

### Cleanup

```ts
import { cleanupExpiredEntries } from '@philiprehberger/rate-limit';

// Run periodically to prevent memory leaks
setInterval(() => cleanupExpiredEntries(), 60 * 1000);
```

## License

MIT
