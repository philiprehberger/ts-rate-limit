import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('rate-limit', async () => {
  const mod = await import('../../dist/index.js');

  it('exports checkRateLimit as a function', () => {
    assert.ok(typeof mod.checkRateLimit === 'function');
  });

  it('exports getRateLimitInfo as a function', () => {
    assert.ok(typeof mod.getRateLimitInfo === 'function');
  });

  it('exports clearRateLimit as a function', () => {
    assert.ok(typeof mod.clearRateLimit === 'function');
  });
});
