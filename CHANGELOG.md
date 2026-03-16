# Changelog

## 0.3.3

- Add Development section to README
- Fix CI badge to reference publish.yml

## 0.3.0

- Add `autoCleanupInterval` option to `createRateLimiter()` for automatic expired-entry purging
- Add `destroy()` method on `RateLimiter` to stop the cleanup timer and clear state
- Add `size()` method to both the global API and `RateLimiter` instances
- Add identifier validation (must be a non-empty string, max 512 characters)

## 0.2.0

- Fix `getRateLimitInfo` using hardcoded 15-minute window regardless of configuration
- Add `createRateLimiter()` factory for independent limiter instances
- Add sliding window approximation to prevent burst at window boundaries
- Add behavioral test suite (20 tests)

## 0.1.2

- Update repository URLs to new ts-prefixed GitHub repo

## 0.1.1

- Add author, homepage, bugs, engines fields to package.json
- Add test suite
- Add GitHub Actions publish workflow

## 0.1.0

- Initial release
