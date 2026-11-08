/**
 * @file tests/cloudflare-phase8-telemetry-and-privacy.test.ts
 * @description Phase 8: Telemetry, Product Analytics, Real Estate Intelligence,
 * Hedonic Model Drift, and Privacy Governance Test Suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndSanitizeTelemetryEnvelope,
  containsPiiPattern,
  computeDailyRotatingSessionHash,
  buildNeighborhoodMarketIndicator,
  evaluateHedonicModelDrift,
  computeQuartiles,
  MIN_K_ANONYMITY_THRESHOLD,
} from '../worker/telemetry/index';

test('Phase 8: Telemetry, Analytics, Market Intelligence & Privacy Governance', async (t) => {
  await t.test('1. strictly rejects PII keys (phone, token, password, email) and PII values', async () => {
    // Top-level PII key rejected
    const badTopLevel = await validateAndSanitizeTelemetryEnvelope({
      eventName: 'user_login',
      domain: 'PRODUCT_ANALYTICS',
      phone: '09121234567',
    });
    assert.equal(badTopLevel.valid, false);
    assert.equal(badTopLevel.errorCode, 'ILLEGAL_PII_KEY_DETECTED');

    // Nested payload PII key rejected
    const badNestedKey = await validateAndSanitizeTelemetryEnvelope({
      eventName: 'checkout_step',
      domain: 'PRODUCT_ANALYTICS',
      payload: { user_id: 'secret_uid_123', amount: 500 },
    });
    assert.equal(badNestedKey.valid, false);
    assert.equal(badNestedKey.errorCode, 'ILLEGAL_PII_KEY_DETECTED');

    // PII pattern in value (Iranian mobile) rejected
    const badMobileValue = await validateAndSanitizeTelemetryEnvelope({
      eventName: 'search_filter',
      domain: 'PRODUCT_ANALYTICS',
      payload: { query: 'call me at 09351112233' },
    });
    assert.equal(badMobileValue.valid, false);
    assert.equal(badMobileValue.errorCode, 'ILLEGAL_PII_VALUE_DETECTED');

    // Valid anonymized event passes
    const validEvent = await validateAndSanitizeTelemetryEnvelope({
      eventName: 'filter_applied',
      domain: 'PRODUCT_ANALYTICS',
      sessionSeed: 'client_session_seed_abc',
      payload: { hoodId: 42, minSqm: 80, maxPriceMillion: 9500 },
    });
    assert.equal(validEvent.valid, true);
    assert.ok(validEvent.sanitizedEnvelope);
    assert.equal(validEvent.sanitizedEnvelope?.payload.hoodId, 42);
  });

  await t.test('2. generates daily rotating session hashes to prevent cross-day tracking', async () => {
    const salt = 'salt_2026_test';
    const seed = 'client_browser_session_1';

    const day1Hash = await computeDailyRotatingSessionHash(seed, salt, '2026-05-01');
    const day2Hash = await computeDailyRotatingSessionHash(seed, salt, '2026-05-02');

    // Same seed across different days yields different hashes
    assert.notEqual(day1Hash, day2Hash);
    assert.equal(day1Hash.length, 24);
  });

  await t.test('3. calculates market indicators and enforces k-anonymity (k >= 5)', () => {
    // 3 observations (below k=5 threshold) -> INSUFFICIENT_SAMPLE
    const smallBatch = [
      { pricePerSqmMillion: 100, fullDepositMillion: 800 },
      { pricePerSqmMillion: 110, fullDepositMillion: 850 },
      { pricePerSqmMillion: 120, fullDepositMillion: 900 },
    ];
    const smallRes = buildNeighborhoodMarketIndicator('tehran', 42, '2026-05', smallBatch);
    assert.equal(smallRes.confidenceLevel, 'INSUFFICIENT_SAMPLE');
    assert.equal(smallRes.medianPricePerSqmMillion, 0); // Suppressed for privacy

    // 6 observations (satisfies k=5) -> Computes statistical medians
    const validBatch = [
      { pricePerSqmMillion: 90, fullDepositMillion: 700 },
      { pricePerSqmMillion: 95, fullDepositMillion: 750 },
      { pricePerSqmMillion: 100, fullDepositMillion: 800 },
      { pricePerSqmMillion: 110, fullDepositMillion: 850 },
      { pricePerSqmMillion: 120, fullDepositMillion: 900 },
      { pricePerSqmMillion: 130, fullDepositMillion: 950 },
    ];
    const validRes = buildNeighborhoodMarketIndicator('tehran', 42, '2026-05', validBatch);
    assert.notEqual(validRes.confidenceLevel, 'INSUFFICIENT_SAMPLE');
    assert.equal(validRes.medianPricePerSqmMillion, 105); // Median of 100 and 110
    assert.equal(validRes.sampleSize, 6);
  });

  await t.test('4. monitors Hedonic pricing model drift and preserves FAST_SALE_FACTOR=0.88 invariant', () => {
    const pairs = [
      { predictedSqm: 100, verifiedSqm: 102 },
      { predictedSqm: 120, verifiedSqm: 118 },
      { predictedSqm: 150, verifiedSqm: 155 },
    ];

    const driftRecord = evaluateHedonicModelDrift('hedonic-v3', pairs);
    assert.equal(driftRecord.modelVersion, 'hedonic-v3');
    assert.equal(driftRecord.fastSaleFactorObserved, 0.88); // Monitored invariant
    assert.equal(driftRecord.calibrationStatus, 'CALIBRATED');
    assert.ok(driftRecord.meanAbsolutePercentageError < 5.0);
  });
});
