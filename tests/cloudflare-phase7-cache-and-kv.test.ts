/**
 * @file tests/cloudflare-phase7-cache-and-kv.test.ts
 * @description Phase 7: Distributed Caching, Cloudflare Workers KV,
 * Cache Policies, Stampede Protection, and Rate Limiting Test Suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_POLICIES,
  buildCacheKey,
  CloudflareKVCacheManager,
  SimulatedKVNamespace,
  DistributedEdgeRateLimiter,
} from '../worker/cache/index';

test('Phase 7: Distributed Caching, KV Architecture & Distributed State', async (t) => {
  await t.test('1. enforces strict cache classification and forbids private or transactional data in KV', () => {
    // Public data allowed in KV
    assert.equal(CACHE_POLICIES.PUBLIC_STATIC_REFERENCE.allowedInKv, true);
    assert.equal(CACHE_POLICIES.PUBLIC_SLOW_CHANGING.allowedInKv, true);
    assert.equal(CACHE_POLICIES.PUBLIC_FREQUENTLY_CHANGING.allowedInKv, true);

    // Private user data strictly FORBIDDEN in KV
    assert.equal(CACHE_POLICIES.USER_PRIVATE_SENSITIVE.allowedInKv, false);
    assert.equal(CACHE_POLICIES.USER_PRIVATE_SENSITIVE.allowedInEdgeCache, false);

    // Privileged security authorization strictly FORBIDDEN in KV
    assert.equal(CACHE_POLICIES.SECURITY_PRIVILEGED_AUTHORIZATION.allowedInKv, false);

    // Transactional source of truth strictly FORBIDDEN in KV
    assert.equal(CACHE_POLICIES.TRANSACTIONAL_SOURCE_OF_TRUTH.allowedInKv, false);

    // Key conventions include environment, domain, scope, and schema version
    const key = buildCacheKey({
      environment: 'production',
      domain: 'benchmarks',
      scope: 'public',
      resourceId: 'tehran_hood_42',
      schemaVersion: 1,
    });
    assert.equal(key, 'radar:production:benchmarks:public:tehran_hood_42:v1');
  });

  await t.test('2. executes KV getOrCompute with fresh hit, stale-while-revalidate, and negative caching', async () => {
    const kv = new SimulatedKVNamespace();
    const manager = new CloudflareKVCacheManager(kv);

    let computeCount = 0;
    const fetchBenchmark = async () => {
      computeCount += 1;
      return { hoodId: 42, buyPerSqm: 120 };
    };

    const keyParams = {
      domain: 'benchmarks' as const,
      resourceId: 'hood_42',
    };

    // 1. Initial compute (cache miss)
    const res1 = await manager.getOrCompute(keyParams, 'PUBLIC_SLOW_CHANGING', fetchBenchmark);
    assert.equal(res1.cached, false);
    assert.equal(res1.value?.buyPerSqm, 120);
    assert.equal(computeCount, 1);

    // 2. Immediate read: fresh cache hit
    const res2 = await manager.getOrCompute(keyParams, 'PUBLIC_SLOW_CHANGING', fetchBenchmark);
    assert.equal(res2.cached, true);
    assert.equal(res2.stale, false);
    assert.equal(res2.value?.buyPerSqm, 120);
    assert.equal(computeCount, 1); // Not re-computed

    // 3. Negative caching for missing items
    let missingComputeCount = 0;
    const missingParams = { domain: 'benchmarks' as const, resourceId: 'hood_9999' };
    const missingFetch = async () => {
      missingComputeCount += 1;
      return null;
    };

    const neg1 = await manager.getOrCompute(missingParams, 'PUBLIC_SLOW_CHANGING', missingFetch);
    assert.equal(neg1.value, null);
    assert.equal(missingComputeCount, 1);

    // Negative hit cached
    const neg2 = await manager.getOrCompute(missingParams, 'PUBLIC_SLOW_CHANGING', missingFetch);
    assert.equal(neg2.value, null);
  });

  await t.test('3. coalesces concurrent cache misses to protect against cache stampede', async () => {
    const kv = new SimulatedKVNamespace();
    const manager = new CloudflareKVCacheManager(kv);

    let computationRuns = 0;
    const expensiveOperation = async () => {
      computationRuns += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { metrics: 'aggregated_pulse' };
    };

    const keyParams = { domain: 'pulse' as const, resourceId: 'tehran' };

    // Fire 5 simultaneous requests
    const promises = Array.from({ length: 5 }, () =>
      manager.getOrCompute(keyParams, 'PUBLIC_FREQUENTLY_CHANGING', expensiveOperation)
    );

    const results = await Promise.all(promises);
    for (const r of results) {
      assert.equal(r.value?.metrics, 'aggregated_pulse');
    }
    // Only 1 execution occurred despite 5 concurrent callers
    assert.equal(computationRuns, 1);
  });

  await t.test('4. enforces distributed sliding-window rate limits and calculates retry-after accurately', async () => {
    const store = new Map<string, string>();
    const storage = {
      get: async (k: string) => store.get(k) || null,
      put: async (k: string, v: string) => {
        store.set(k, v);
      },
    };

    const limiter = new DistributedEdgeRateLimiter(storage);
    const config = { maxRequests: 3, windowSeconds: 60, bucketType: 'test_limit' };
    const now = 1710000000000;

    // Requests 1, 2, 3 should be allowed
    const r1 = await limiter.evaluateLimit('user_ip_1', config, now);
    assert.equal(r1.allowed, true);
    assert.equal(r1.currentCount, 1);

    const r2 = await limiter.evaluateLimit('user_ip_1', config, now);
    assert.equal(r2.allowed, true);
    assert.equal(r2.currentCount, 2);

    const r3 = await limiter.evaluateLimit('user_ip_1', config, now);
    assert.equal(r3.allowed, true);
    assert.equal(r3.currentCount, 3);

    // Request 4 should be rejected with 429 semantics
    const r4 = await limiter.evaluateLimit('user_ip_1', config, now);
    assert.equal(r4.allowed, false);
    assert.equal(r4.currentCount, 4);
    assert.ok(r4.retryAfterSeconds > 0);
  });
});
