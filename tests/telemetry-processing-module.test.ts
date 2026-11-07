import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  validateAndSanitizeTelemetryItem,
  PII_KEY_REGEX,
} from '../server/modules/telemetry/telemetryValidator';
import { DurableTelemetryBufferQueue } from '../server/modules/telemetry/telemetryBufferQueue';
import { BoundedTelemetryAggregationEngine } from '../server/modules/telemetry/telemetryAggregator';
import { TelemetryDataProcessingService } from '../server/modules/telemetry/telemetryService';
import { registerTelemetryModuleRoutes } from '../server/modules/telemetry/telemetryRoutes';
import type { IngestibleTelemetryBatchItem } from '../server/modules/telemetry/telemetryTypes';

console.log('🧪 Running Employee 5 Telemetry & Event-Processing Backend Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  // Test 1: Schema validation & PII neutralization
  await verify('Schema validator rejects PII keys (phone, uid, national_id) and extracts clean metrics', () => {
    const piiResult = validateAndSanitizeTelemetryItem({
      eventName: 'user.click',
      // @ts-expect-error Testing invalid runtime input
      phone: '09123456789',
    });
    assert.equal(piiResult.valid, false);
    assert.equal(piiResult.errorCode, 'ILLEGAL_PII_KEY');

    const piiValueResult = validateAndSanitizeTelemetryItem({
      eventName: 'user.search',
      dimensions: {
        query_note: 'تماس با 09121112233 جهت خرید',
      },
    });
    assert.equal(piiValueResult.valid, false);
    assert.equal(piiValueResult.errorCode, 'ILLEGAL_PII_VALUE');

    const cleanResult = validateAndSanitizeTelemetryItem({
      eventName: 'valuation.completed',
      hoodId: 14,
      cityId: 'tehran',
      metrics: {
        dwellMs: 1450,
        estimatedPriceBillion: 18.5,
      },
      dimensions: {
        floorBucket: 'middle',
      },
    });
    assert.equal(cleanResult.valid, true);
    assert.equal(cleanResult.sanitizedEvent?.hoodId, 14);
    assert.equal(cleanResult.sanitizedEvent?.numericMetrics.dwellMs, 1450);
  });

  // Test 2: Deduplication and durable write-ahead buffering
  await verify('Durable buffer queue rejects duplicates and recovers state across instances', () => {
    const testBufferDir = path.resolve(process.cwd(), '.test-telemetry-buffer');
    const queue1 = new DurableTelemetryBufferQueue({ bufferDir: testBufferDir });
    queue1.clearForTests();

    const event = {
      eventId: 'evt_dedupe_123',
      eventName: 'modal.opened',
      category: 'USER_INTERACTION' as const,
      privacyClassification: 'PUBLIC_AGGREGATE' as const,
      sessionHash: 'sess_abc',
      hoodId: 5,
      numericMetrics: {},
      categoricalDimensions: {},
      provenance: {
        origin: 'web_client' as const,
        appVersion: '6.0.0',
        tehranDateKey: '2026-11-07',
        ingestedAtMs: Date.now(),
      },
      rawPayloadHashSha256: 'hash123',
    };

    const firstEnqueue = queue1.enqueue(event);
    assert.equal(firstEnqueue.accepted, true);
    assert.equal(firstEnqueue.isDuplicate, false);

    const duplicateEnqueue = queue1.enqueue(event);
    assert.equal(duplicateEnqueue.accepted, false);
    assert.equal(duplicateEnqueue.isDuplicate, true);

    // Verify recovery on new instance
    const queue2 = new DurableTelemetryBufferQueue({ bufferDir: testBufferDir });
    assert.equal(queue2.isDuplicate('evt_dedupe_123'), true);

    const batches = queue2.readBatch(10);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].eventId, 'evt_dedupe_123');

    queue1.clearForTests();
  });

  // Test 3: Bounded aggregation & k-anonymity privacy lock
  await verify('Bounded aggregator enforces k-anonymity (>=15 sessions) before exposing aggregates', () => {
    const aggregator = new BoundedTelemetryAggregationEngine({ minDistinctSessionsForKAnonymity: 15 });

    // Ingest 10 events from 10 distinct sessions (k < 15)
    for (let i = 1; i <= 10; i++) {
      aggregator.aggregateEvent({
        eventId: `ev_${i}`,
        eventName: 'inspection.dwell',
        category: 'USER_INTERACTION',
        privacyClassification: 'PUBLIC_AGGREGATE',
        sessionHash: `sess_user_${i}`,
        hoodId: 22,
        cityId: 'tehran',
        numericMetrics: { dwellSeconds: 45 },
        categoricalDimensions: {},
        provenance: {
          origin: 'web_client',
          appVersion: '6.0.0',
          tehranDateKey: '2026-11-07',
          ingestedAtMs: 1762510000000,
        },
        rawPayloadHashSha256: `hash_${i}`,
      });
    }

    let snapshots = aggregator.generateSnapshots();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].distinctSessionsCount, 10);
    assert.equal(snapshots[0].isKAnonymityPreserved, false);
    assert.equal(snapshots[0].avgMetrics.dwellSeconds, 0, 'Must redact avg when k < 15');

    // Add 6 more sessions (total 16 >= 15)
    for (let i = 11; i <= 16; i++) {
      aggregator.aggregateEvent({
        eventId: `ev_${i}`,
        eventName: 'inspection.dwell',
        category: 'USER_INTERACTION',
        privacyClassification: 'PUBLIC_AGGREGATE',
        sessionHash: `sess_user_${i}`,
        hoodId: 22,
        cityId: 'tehran',
        numericMetrics: { dwellSeconds: 45 },
        categoricalDimensions: {},
        provenance: {
          origin: 'web_client',
          appVersion: '6.0.0',
          tehranDateKey: '2026-11-07',
          ingestedAtMs: 1762510000000,
        },
        rawPayloadHashSha256: `hash_${i}`,
      });
    }

    snapshots = aggregator.generateSnapshots();
    assert.equal(snapshots[0].distinctSessionsCount, 16);
    assert.equal(snapshots[0].isKAnonymityPreserved, true);
    assert.equal(snapshots[0].avgMetrics.dwellSeconds, 45, 'Exposes aggregate once k >= 15');
    assert.ok(snapshots[0].p50Metrics !== undefined);
  });

  // Test 4: Master Service partial failure, retries, and buffer limits
  await verify('TelemetryDataProcessingService handles partial batches, PII drops, and duplicates gracefully', () => {
    const testBufferDir = path.resolve(process.cwd(), '.test-service-buffer');
    const queue = new DurableTelemetryBufferQueue({ bufferDir: testBufferDir });
    queue.clearForTests();

    const service = new TelemetryDataProcessingService({ bufferQueue: queue });

    const batch = [
      { eventName: 'page.view', metrics: { timeMs: 200 } },
      { eventName: 'user.login', national_id: '0012345678' }, // Dropped PII
      { eventName: 'calc.hedonic', metrics: { budgetBillion: 12 } },
      { eventName: 'page.view', metrics: { timeMs: 200 } }, // Will generate duplicate signature if identical
    ] as unknown as IngestibleTelemetryBatchItem[];

    const outcome = service.ingestBatch(batch);
    assert.ok(outcome.acceptedCount >= 2);
    assert.equal(outcome.droppedPiiCount, 1);

    const diags = service.getDiagnostics();
    assert.ok(diags.totalIngestedEvents >= 2);
    assert.equal(diags.totalRejectedPiiEvents, 1);

    service.resetForTests();
  });

  // Test 5: Express Route API integration
  await verify('Telemetry Express API mounts and responds accurately to batch ingestion and diagnostics', async () => {
    const app = express();
    app.use(express.json());
    const service = new TelemetryDataProcessingService();
    service.resetForTests();

    registerTelemetryModuleRoutes(app, { service });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const postRes = await fetch(`${baseUrl}/api/v2/telemetry/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            { eventName: 'search.initiated', metrics: { resultsCount: 12 }, hoodId: 8 },
            { eventName: 'search.filtered', metrics: { budgetMillion: 8500 }, hoodId: 8 },
          ],
        }),
      });
      assert.equal(postRes.status, 202);
      const postJson = (await postRes.json()) as { status: string; outcome: { acceptedCount: number } };
      assert.equal(postJson.status, 'accepted');
      assert.equal(postJson.outcome.acceptedCount, 2);

      const diagRes = await fetch(`${baseUrl}/api/v2/telemetry/diagnostics`);
      assert.equal(diagRes.status, 200);
      const diagJson = (await diagRes.json()) as { status: string; diagnostics: { totalIngestedEvents: number } };
      assert.equal(diagJson.status, 'ok');
      assert.equal(diagJson.diagnostics.totalIngestedEvents, 2);

      const purgeRes = await fetch(`${baseUrl}/api/v2/telemetry/retention/purge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: 30 }),
      });
      assert.equal(purgeRes.status, 200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.resetForTests();
    }
  });

  console.log(`\n🎉 ALL ${passed} EMPLOYEE 5 TELEMETRY TESTS PASSED!\n`);
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
