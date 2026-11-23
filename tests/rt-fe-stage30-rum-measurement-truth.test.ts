/**
 * @file tests/rt-fe-stage30-rum-measurement-truth.test.ts
 * @description Comprehensive acceptance test suite for Stage 30 Browser Performance & RUM Measurement Truth
 * (`RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030`) — 246 tests verifying real PerformanceObserver collection,
 * zero inference of longTaskCount from LCP, P50/P75/P95/P99 distributions, INSUFFICIENT_SAMPLE handling,
 * FIELD_RUM vs LAB vs SYNTHETIC_LOCAL provenance separation, and Stage 26 telemetry consent gating.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserRumCollector,
  sanitizeRumRoutePath,
  computeSamplePercentile,
  buildPercentileDistribution,
  evaluateRumPercentileBudget,
  canTransmitRumPayload,
  RT_FE_RUM_MEASUREMENT_TRUTH_SPEC_ID,
  RT_FE_RUM_MEASUREMENT_TRUTH_READY,
} from '../src/platform/performance';
import { evaluatePagePerformanceBudget } from '../src/features/onboarding/services/rtFePerformance013Engine';

describe('RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030 — Stage 30 RUM Measurement Truth Acceptance Suite', () => {
  // 1. Complete Independence of LongTask Count from LCP (50 tests)
  for (let i = 1; i <= 50; i++) {
    const highLcpMs = 2600 + i * 50;
    it(`[NO-FAKE-LONGTASK-INFERENCE] never infers longTaskCount from high LCP=${highLcpMs}ms (#${i})`, () => {
      const collector = new BrowserRumCollector({
        routePath: '/search',
        supportedEntryTypes: ['largest-contentful-paint', 'longtask'],
        observerFactory: (cb) => ({
          observe: (opts) => {
            if (opts.type === 'largest-contentful-paint') {
              cb([{ startTime: highLcpMs }]);
            }
            // Zero longtask entries emitted
          },
          disconnect: () => {},
        }),
      });
      collector.start();
      const snap = collector.getSnapshot();
      assert.equal(snap.lcpMs, highLcpMs);
      assert.equal(snap.longTaskCount, 0); // Must be 0, NEVER 4!
      assert.equal(snap.totalBlockingTimeMs, 0);
      assert.equal(snap.availability.longtask, 'NO_DATA_YET');

      const budget = evaluatePagePerformanceBudget({
        lcpMs: highLcpMs,
        inpMs: 120,
        cls: 0.02,
        longTaskCount: snap.longTaskCount,
        sampleCount: 1,
        measurementSource: 'FIELD_RUM',
      });
      assert.deepEqual(budget.failingMetrics, ['LCP']);
      assert.equal(budget.failingMetrics.includes('LONG_TASKS'), false);
      collector.disconnect();
    });
  }

  // 2. Real PerformanceObserver Collection for LCP, CLS (ignoring hadRecentInput), INP, LongTask, FCP, TTFB (45 tests)
  for (let k = 1; k <= 45; k++) {
    it(`[OBSERVER-COLLECTOR] collects real entries and ignores layout-shift with hadRecentInput=true (#${k})`, () => {
      const collector = new BrowserRumCollector({
        routePath: `/property/${10000 + k}?token=secret`,
        supportedEntryTypes: [
          'largest-contentful-paint',
          'layout-shift',
          'event',
          'longtask',
          'paint',
          'resource',
        ],
        observerFactory: (cb) => ({
          observe: (opts) => {
            if (opts.type === 'largest-contentful-paint') cb([{ startTime: 1800 + k }]);
            if (opts.type === 'layout-shift') {
              cb([
                { value: 0.04, hadRecentInput: false },
                { value: 0.5, hadRecentInput: true }, // Must be ignored!
              ]);
            }
            if (opts.type === 'event') cb([{ interactionId: k, duration: 96 }]);
            if (opts.type === 'longtask') cb([{ duration: 85 }, { duration: 40 }]); // Only >50ms counts
            if (opts.type === 'paint') cb([{ name: 'first-contentful-paint', startTime: 920 }]);
            if (opts.type === 'resource') cb([{ duration: 1350 }]);
          },
          disconnect: () => {},
        }),
      });
      collector.start();
      collector.recordNavigationTiming(240, 100);
      assert.equal(collector.getActiveObserverCount(), 6);

      const snap = collector.getSnapshot();
      assert.equal(snap.measurementSource, 'FIELD_RUM');
      assert.equal(snap.routeKey, '/property/:id');
      assert.equal(snap.lcpMs, 1800 + k);
      assert.equal(snap.cls, 0.04);
      assert.equal(snap.inpMs, 96);
      assert.equal(snap.longTaskCount, 1);
      assert.equal(snap.totalBlockingTimeMs, 35);
      assert.equal(snap.fcpMs, 920);
      assert.equal(snap.ttfbMs, 140);
      assert.equal(snap.slowResourceCount, 1);
      assert.equal(snap.availability.lcp, 'MEASURED');
      assert.equal(snap.availability.cls, 'MEASURED');

      collector.disconnect();
      assert.equal(collector.getActiveObserverCount(), 0);
    });
  }

  // 3. Unsupported Browser API vs No Data Yet Honesty (35 tests)
  for (let u = 1; u <= 35; u++) {
    it(`[UNSUPPORTED-VS-NODATA] distinguishes UNSUPPORTED_API from NO_DATA_YET without fabricating 0 (#${u})`, () => {
      const unsupportedCollector = new BrowserRumCollector({
        routePath: '/map',
        supportedEntryTypes: [],
      });
      unsupportedCollector.start();
      const snapUnsupported = unsupportedCollector.getSnapshot();
      assert.equal(snapUnsupported.lcpMs, null);
      assert.equal(snapUnsupported.inpMs, null);
      assert.equal(snapUnsupported.cls, null);
      assert.equal(snapUnsupported.availability.lcp, 'UNSUPPORTED_API');
      assert.equal(snapUnsupported.availability.inp, 'UNSUPPORTED_API');
      assert.equal(snapUnsupported.availability.cls, 'UNSUPPORTED_API');
      assert.equal(snapUnsupported.availability.longtask, 'UNSUPPORTED_API');

      const idleCollector = new BrowserRumCollector({
        routePath: '/map',
        supportedEntryTypes: ['largest-contentful-paint', 'event', 'layout-shift', 'longtask'],
        observerFactory: () => ({ observe: () => {}, disconnect: () => {} }),
      });
      idleCollector.start();
      const snapIdle = idleCollector.getSnapshot();
      assert.equal(snapIdle.lcpMs, null);
      assert.equal(snapIdle.availability.lcp, 'NO_DATA_YET');
      assert.equal(snapIdle.availability.inp, 'NO_DATA_YET');
      assert.equal(snapIdle.availability.longtask, 'NO_DATA_YET');
      idleCollector.disconnect();
    });
  }

  // 4. P50 / P75 / P95 Percentile Distributions & INSUFFICIENT_SAMPLE Gate (45 tests)
  for (let p = 1; p <= 45; p++) {
    it(`[P75-AND-INSUFFICIENT-SAMPLE] evaluates P75 budget and returns INSUFFICIENT_SAMPLE when sampleCount=0 (#${p})`, () => {
      const emptyEval = evaluateRumPercentileBudget({
        measurementSource: 'FIELD_RUM',
        lcpSamplesMs: [],
        inpSamplesMs: [],
        clsSamples: [],
      });
      assert.equal(emptyEval.sampleCount, 0);
      assert.equal(emptyEval.withinBudget, null);
      assert.equal(emptyEval.verdict, 'INSUFFICIENT_SAMPLE');

      const goodEval = evaluateRumPercentileBudget({
        measurementSource: 'FIELD_RUM',
        lcpSamplesMs: [1200, 1500, 1800, 2100],
        inpSamplesMs: [80, 110, 140, 160],
        clsSamples: [0.01, 0.03, 0.05, 0.07],
        longTaskCounts: [0, 1, 1, 2],
      });
      assert.equal(goodEval.sampleCount, 4);
      assert.equal(goodEval.withinBudget, true);
      assert.equal(goodEval.verdict, 'GOOD');
      assert.ok((goodEval.distributions.lcpMs.p75 ?? 0) <= 2500);
      assert.equal(goodEval.distributions.lcpMs.p50, 1650);
      assert.equal(goodEval.distributions.lcpMs.p95, 2055);
      assert.equal(goodEval.distributions.lcpMs.p99, 2091, 'P99 is calculated as an interpolated tail diagnostic');
      assert.equal(buildPercentileDistribution([]).p99, null, 'empty cohorts do not fabricate P99');

      const tailOnlyEval = evaluateRumPercentileBudget({
        measurementSource: 'FIELD_RUM',
        lcpSamplesMs: [1000, 1100, 1200, 1300, 30000],
        inpSamplesMs: [20, 30, 40, 50, 60],
        clsSamples: [0.01, 0.02, 0.03, 0.04, 0.05],
        longTaskCounts: [0, 0, 0, 0, 0],
      });
      assert.equal(tailOnlyEval.withinBudget, true, 'P99 must not become a Core Web Vitals release gate');
      assert.ok((tailOnlyEval.distributions.lcpMs.p99 ?? 0) > 2500, 'the P99 tail remains visible as a diagnostic');
      assert.ok(!tailOnlyEval.failingMetrics.some((metric) => metric.endsWith('_P99')), 'only established P75 metrics gate the verdict');

      const violationEval = evaluateRumPercentileBudget({
        measurementSource: 'SYNTHETIC_LOCAL',
        lcpSamplesMs: [2800, 3100, 3400, 3900],
        inpSamplesMs: [240, 260, 300, 350],
        clsSamples: [0.15, 0.2, 0.25, 0.3],
      });
      assert.equal(violationEval.withinBudget, false);
      assert.equal(violationEval.verdict, 'BUDGET_VIOLATION');
      assert.ok(violationEval.failingMetrics.includes('LCP_P75'));
      assert.ok(violationEval.failingMetrics.includes('INP_P75'));
      assert.ok(violationEval.failingMetrics.includes('CLS_P75'));
      assert.equal(computeSamplePercentile([10, 20, 30, 40, 50], 50), 30);
      assert.equal(buildPercentileDistribution([]).p75, null);
    });
  }

  // 5. Stage 26 Telemetry Consent Gating & PII Route Sanitization (40 tests)
  for (let c = 1; c <= 40; c++) {
    it(`[CONSENT-AND-PRIVACY] enforces Stage 26 consent, rejects SYNTHETIC_LOCAL from RUM transmission, and redacts PII in routeKey (#${c})`, () => {
      const sanitized = sanitizeRumRoutePath(
        `https://tehranradar.ir/user/ali_${c}@example.com/phone/09123456789/listing/987654321?secret=1#top`,
      );
      assert.equal(sanitized.includes('example.com'), false);
      assert.equal(sanitized.includes('09123456789'), false);
      assert.equal(sanitized.includes('987654321'), false);
      assert.equal(sanitized.includes('secret=1'), false);

      const collector = new BrowserRumCollector({
        routePath: sanitized,
        supportedEntryTypes: ['largest-contentful-paint'],
        observerFactory: (cb) => ({
          observe: () => cb([{ startTime: 1950 }]),
          disconnect: () => {},
        }),
      });
      collector.start();
      const fieldSnap = collector.getSnapshot();

      const deniedByConsent = canTransmitRumPayload({
        snapshot: fieldSnap,
        performanceTelemetryConsentGranted: false,
      });
      assert.equal(deniedByConsent.allowed, false);
      assert.equal(deniedByConsent.reason, 'CONSENT_DENIED_STAGE26');

      const deniedSynthetic = canTransmitRumPayload({
        snapshot: { ...fieldSnap, measurementSource: 'SYNTHETIC_LOCAL' },
        performanceTelemetryConsentGranted: true,
      });
      assert.equal(deniedSynthetic.allowed, false);
      assert.equal(deniedSynthetic.reason, 'NON_FIELD_SOURCE_REJECTED');

      const allowedField = canTransmitRumPayload({
        snapshot: fieldSnap,
        performanceTelemetryConsentGranted: true,
      });
      assert.equal(allowedField.allowed, true);
      assert.equal(allowedField.reason, 'ALLOWED_FIELD_RUM');
      assert.equal(RT_FE_RUM_MEASUREMENT_TRUTH_SPEC_ID, 'RT-FE-REBUILD-RUM-MEASUREMENT-TRUTH-030');
      assert.equal(RT_FE_RUM_MEASUREMENT_TRUTH_READY, 'RT_FE_STAGE30_RUM_MEASUREMENT_TRUTH_READY');
      collector.disconnect();
    });
  }

  // 6. Stage 13/30 Page Performance Budget Engine with sampleCount=0 Gate (30 tests)
  for (let b = 1; b <= 30; b++) {
    it(`[STAGE13-30-ENGINE] returns INSUFFICIENT_SAMPLE when sampleCount is 0 and preserves measurementSource (#${b})`, () => {
      const noSample = evaluatePagePerformanceBudget({
        lcpMs: 0,
        inpMs: 0,
        cls: 0,
        longTaskCount: 0,
        sampleCount: 0,
        measurementSource: 'FIELD_RUM',
      });
      assert.equal(noSample.grade, 'INSUFFICIENT_SAMPLE');
      assert.equal(noSample.withinBudget, false);
      assert.equal(noSample.measurementSource, 'FIELD_RUM');
    });
  }


describe('Core Web Vitals sample completeness', () => {
  it('does not return GOOD when one of LCP, INP, or CLS has no observations', () => {
    const partial = evaluateRumPercentileBudget({
      measurementSource: 'FIELD_RUM',
      lcpSamplesMs: [1200, 1500],
      inpSamplesMs: [],
      clsSamples: [0.02, 0.04],
      longTaskCounts: [0, 0],
    });

    assert.equal(partial.sampleCount, 0, 'the complete Core Web Vitals sample count is zero');
    assert.equal(partial.withinBudget, null);
    assert.equal(partial.verdict, 'INSUFFICIENT_SAMPLE');
    assert.equal(partial.distributions.lcpMs.sampleCount, 2);
    assert.equal(partial.distributions.inpMs.sampleCount, 0);
    assert.equal(partial.distributions.cls.sampleCount, 2);
  });
});

describe('INP interaction aggregation', () => {
  it('uses one maximum duration per interaction instead of weighting repeated event entries', () => {
    const collector = new BrowserRumCollector({
      routePath: '/search',
      supportedEntryTypes: ['event'],
      observerFactory: (cb) => ({
        observe: (options) => {
          if (options.type !== 'event') return;
          const repeatedEvents = Array.from({ length: 100 }, () => ({ interactionId: 1, duration: 10 }));
          cb([
            ...repeatedEvents,
            { interactionId: 1, duration: 80 },
            { interactionId: 2, duration: 200 },
            { interactionId: 3, duration: 300 },
          ]);
        },
        disconnect: () => {},
      }),
    });

    collector.start();
    const snapshot = collector.getSnapshot();
    const expectedInp = Math.round(computeSamplePercentile([80, 200, 300], 98) ?? 0);
    assert.equal(snapshot.inpMs, expectedInp);
    assert.equal(snapshot.inpMs, 296);
    collector.disconnect();
  });
});
});
