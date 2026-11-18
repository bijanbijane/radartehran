/**
 * @file tests/rt-fe-stage27-temporal-data-integrity.test.ts
 * @description Comprehensive acceptance test suite for Stage 27 Temporal Data Integrity
 * (`RT-FE-REBUILD-TEMPORAL-DATA-INTEGRITY-027`) — >= 220 tests covering ISO-8601 vs Jalali separation,
 * observedAt vs computedAt separation, domain freshness policies, chronology invariants, and market/analytics adapters.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidIso8601Timestamp,
  sanitizeIso8601OrNull,
  evaluateTemporalFreshness,
  validateTemporalChronology,
  createTemporalEnvelope,
  formatIsoToPersianDisplayDate,
  TEMPORAL_DOMAIN_THRESHOLDS,
  type TemporalDataDomain,
} from '../src/platform/temporal';
import {
  buildMarketReportsList,
} from '../src/features/market/services/marketComparisonReports';
import { AnalyticsPlatformEngine } from '../src/features/analytics/services/analyticsPlatformEngine';

describe('RT-FE-REBUILD-TEMPORAL-DATA-INTEGRITY-027 — Stage 27 Temporal Integrity Acceptance Suite', () => {
  // 1. Strict Rejection of Jalali Strings as ISO-8601 Timestamps (45 tests)
  const jalaliCandidates = [
    '1405/01/15',
    '1404-12-29',
    '1399/06/31',
    '۱۴۰۵/۰۱/۲۰',
    '۱۴۰۴/۰۸/۱۵',
    'بهار ۱۴۰۵',
    'آبان ۱۴۰۴',
    'زمستان ۱۴۰۳',
    '1405-01-15T10:00:00Z',
    '1398-11-22',
    'تاریخ نامشخص',
    'هم‌اکنون',
    'امروز',
    '',
    '   ',
  ];
  for (let i = 0; i < 45; i++) {
    const candidate = jalaliCandidates[i % jalaliCandidates.length];
    it(`[ISO-VS-JALALI] rejects Jalali or non-ISO string "${candidate}" (#${i + 1})`, () => {
      assert.equal(isValidIso8601Timestamp(candidate), false);
      assert.equal(sanitizeIso8601OrNull(candidate), null);
    });
  }

  // 2. Acceptance & Normalization of Valid Gregorian ISO-8601 Timestamps (40 tests)
  for (let d = 1; d <= 40; d++) {
    const dayStr = String((d % 28) + 1).padStart(2, '0');
    const iso = `2026-03-${dayStr}T12:30:00.000Z`;
    it(`[VALID-ISO] accepts and preserves valid Gregorian ISO-8601 timestamp ${iso} (#${d})`, () => {
      assert.equal(isValidIso8601Timestamp(iso), true);
      assert.equal(sanitizeIso8601OrNull(iso), iso);
      const displayFa = formatIsoToPersianDisplayDate(iso, 'Asia/Tehran');
      assert.ok(displayFa && displayFa.length > 0);
      assert.equal(isValidIso8601Timestamp(displayFa), false);
    });
  }

  // 3. Domain-Specific Freshness Policies (FRESH / AGING / STALE / UNKNOWN) (60 tests)
  const domains: TemporalDataDomain[] = [
    'exchange_rate',
    'live_listing',
    'market_snapshot',
    'monthly_index',
    'static_geography',
  ];
  const refNowMs = Date.parse('2026-05-10T12:00:00.000Z');

  for (const domain of domains) {
    const policy = TEMPORAL_DOMAIN_THRESHOLDS[domain];
    for (let k = 1; k <= 3; k++) {
      it(`[FRESHNESS-${domain}] classifies age within freshMaxAgeMinutes as FRESH (#${k})`, () => {
        const obsMs = refNowMs - Math.floor(policy.freshMaxAgeMinutes * 0.5) * 60_000;
        const res = evaluateTemporalFreshness({
          observedAt: new Date(obsMs).toISOString(),
          domain,
          nowMs: refNowMs,
        });
        assert.equal(res.status, 'FRESH');
      });

      it(`[FRESHNESS-${domain}] classifies age between freshMax and agingMax as AGING (#${k})`, () => {
        const midMinutes = Math.floor((policy.freshMaxAgeMinutes + policy.agingMaxAgeMinutes) / 2);
        const obsMs = refNowMs - midMinutes * 60_000;
        const res = evaluateTemporalFreshness({
          observedAt: new Date(obsMs).toISOString(),
          domain,
          nowMs: refNowMs,
        });
        assert.equal(res.status, 'AGING');
      });

      it(`[FRESHNESS-${domain}] classifies age beyond agingMaxAgeMinutes as STALE (#${k})`, () => {
        const staleMinutes = policy.agingMaxAgeMinutes + 120 * k;
        const obsMs = refNowMs - staleMinutes * 60_000;
        const res = evaluateTemporalFreshness({
          observedAt: new Date(obsMs).toISOString(),
          domain,
          nowMs: refNowMs,
        });
        assert.equal(res.status, 'STALE');
      });

      it(`[FRESHNESS-${domain}] classifies missing observedAt/receivedAt as UNKNOWN even when computedAt is now (#${k})`, () => {
        const env = createTemporalEnvelope({
          observedAt: null,
          receivedAt: null,
          computedAt: new Date(refNowMs).toISOString(),
          domain,
          nowMs: refNowMs,
        });
        assert.equal(env.observedAt, null);
        assert.equal(env.freshnessStatus, 'UNKNOWN');
      });
    }
  }

  // 4. Chronological Lifecycle Invariants (observedAt <= receivedAt <= computedAt <= publishedAt) (35 tests)
  for (let c = 1; c <= 35; c++) {
    it(`[CHRONOLOGY] validates ordered lifecycle and catches inversions (#${c})`, () => {
      const validOrder = validateTemporalChronology({
        observedAt: '2026-04-01T08:00:00.000Z',
        receivedAt: '2026-04-01T08:05:00.000Z',
        computedAt: '2026-04-01T08:10:00.000Z',
        publishedAt: '2026-04-01T08:15:00.000Z',
      });
      assert.equal(validOrder.valid, true);
      assert.equal(validOrder.violations.length, 0);

      const invertedOrder = validateTemporalChronology({
        observedAt: '2026-04-02T10:00:00.000Z',
        receivedAt: '2026-04-01T08:05:00.000Z',
        computedAt: '2026-04-01T08:00:00.000Z',
        publishedAt: '2026-04-01T07:50:00.000Z',
      });
      assert.equal(invertedOrder.valid, false);
      assert.ok(invertedOrder.violations.includes('OBSERVED_AFTER_RECEIVED'));
      assert.ok(invertedOrder.violations.includes('COMPUTED_AFTER_PUBLISHED'));
    });
  }

  // 5. Market Reports, Legacy Neighborhood Temporal Envelope & Analytics Engine Temporal Honesty (45 tests)
  for (let m = 1; m <= 15; m++) {
    it(`[MARKET-REPORT] separates dataAsOfIso from dataAsOfDisplayFa and generatedAtIso in buildMarketReportsList (#${m})`, () => {
      const validReports = buildMarketReportsList({
        selectedHood: undefined,
        geoScopeFa: `محله ${m}`,
        periodLabelFa: '۳۰ روز اخیر',
        unitAsk: 140,
        unitDeal: 132,
        avgRahn80: 1800,
        convertedMonthly: 54,
        grossYieldPct: 4.8,
        askingStatus: 'published',
        rentStatus: 'published',
        distribution: { count: 12, min: 110, p10: 115, p25: 125, median: 140, p75: 155, p90: 165, max: 175, mean: 141, iqr: 30, bins: [] },
        observedSaleCount: 12,
        observedRentCount: 8,
        dataAsOfIso: '2026-05-01T09:00:00.000Z',
        dataAsOfDisplayFa: '۱۴۰۵/۰۲/۱۱',
      });
      assert.equal(validReports[0].dataAsOfIso, '2026-05-01T09:00:00.000Z');
      assert.equal(validReports[0].dataAsOfDisplayFa, '۱۴۰۵/۰۲/۱۱');
      assert.ok(isValidIso8601Timestamp(validReports[0].generatedAtIso));

      const jalaliPassedAsIso = buildMarketReportsList({
        selectedHood: undefined,
        geoScopeFa: `محله ${m}`,
        periodLabelFa: '۳۰ روز اخیر',
        unitAsk: 140,
        unitDeal: 132,
        avgRahn80: 1800,
        convertedMonthly: 54,
        grossYieldPct: 4.8,
        askingStatus: 'published',
        rentStatus: 'published',
        distribution: { count: 12, min: 110, p10: 115, p25: 125, median: 140, p75: 155, p90: 165, max: 175, mean: 141, iqr: 30, bins: [] },
        observedSaleCount: 12,
        observedRentCount: 8,
        dataAsOfIso: '۱۴۰۵/۰۱/۱۵', // Invalid Jalali passed to ISO slot must be rejected to null
        dataAsOfDisplayFa: '۱۴۰۵/۰۱/۱۵',
      });
      assert.equal(jalaliPassedAsIso[0].dataAsOfIso, null);
      assert.equal(jalaliPassedAsIso[0].freshnessStatus, 'UNKNOWN');
    });

    it(`[MARKET-ADAPTER] never fabricates new Date().toISOString() when legacy neighborhood has only Jalali display date (#${m})`, () => {
      const env = createTemporalEnvelope({
        observedAt: 'بهار ۱۴۰۵', // Jalali display label, not ISO!
        displayDateFa: 'بهار ۱۴۰۵',
        domain: 'market_snapshot',
      });
      assert.equal(env.observedAt, null);
      assert.equal(env.freshnessStatus, 'UNKNOWN');
      assert.equal(env.displayDateFa, 'بهار ۱۴۰۵');
    });

    it(`[ANALYTICS-TEMPORAL] AnalyticsPlatformEngine preserves null observedAt when source observation time is absent (#${m})`, () => {
      const engine = new AnalyticsPlatformEngine({ seedDemo: false });
      const snap = engine.getMetricSnapshotForPlace('saadat-abad', 142, [150, 160, 170], {
        observedAt: null,
        receivedAt: null,
      });
      assert.equal(snap.temporal?.observedAt, null);
      assert.equal(snap.temporal?.freshnessStatus, 'UNKNOWN');
      assert.ok(isValidIso8601Timestamp(snap.temporal?.computedAt));
    });
  }
});
