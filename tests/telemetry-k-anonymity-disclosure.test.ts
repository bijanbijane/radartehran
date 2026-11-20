import assert from 'node:assert/strict';
import { BoundedTelemetryAggregationEngine } from '../server/modules/telemetry/telemetryAggregator';
import type { TelemetryEventPayload } from '../server/modules/telemetry/telemetryTypes';

const engine = new BoundedTelemetryAggregationEngine({ minDistinctSessionsForKAnonymity: 15 });

function makeEvent(session: string, hoodId: number): TelemetryEventPayload {
  return {
    eventId: `evt-${session}-${hoodId}`,
    eventName: 'map_pan',
    category: 'USER_INTERACTION',
    privacyClassification: 'PUBLIC_AGGREGATE',
    sessionHash: session,
    hoodId,
    cityId: 'tehran',
    numericMetrics: { dwell_ms: 100 },
    categoricalDimensions: {},
    provenance: {
      origin: 'web_client',
      appVersion: '6.0.0',
      tehranDateKey: '2026-11-20',
      ingestedAtMs: Date.now(),
    },
    rawPayloadHashSha256: 'abc',
  };
}

for (let i = 0; i < 3; i++) {
  engine.aggregateEvent(makeEvent(`sess-${i}`, 12));
}

const snapshots = engine.generateSnapshots();
assert.equal(snapshots.length, 0, 'Buckets below K=15 must be omitted from public output');

for (let i = 0; i < 16; i++) {
  engine.aggregateEvent(makeEvent(`sess-k-${i}`, 55));
}
const okSnaps = engine.generateSnapshots();
assert.ok(okSnaps.length >= 1);
assert.ok(okSnaps[0].hoodId === 55);

console.log('telemetry-k-anonymity-disclosure.test.ts PASS');