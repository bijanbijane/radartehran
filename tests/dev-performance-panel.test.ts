import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordDiagnosticEvent,
  createExecutionTimer,
  getDiagnosticSnapshots,
  getDiagnosticPerformanceMetrics,
  subscribeDiagnostics,
  clearDiagnosticEvents,
  DiagnosticEventEntry,
} from '../src/utils/diagnostics';

describe('Development Performance Monitoring & Diagnostic Infrastructure', () => {
  it('should record diagnostic telemetry events and maintain ring buffer limits', () => {
    clearDiagnosticEvents();
    assert.equal(getDiagnosticSnapshots().length, 0);

    recordDiagnosticEvent('Map', 'testMapRender', 'success', 12.4);
    recordDiagnosticEvent('Filter', 'testFilterCalculation', 'success', 4.8);

    const snapshots = getDiagnosticSnapshots();
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].scope, 'Filter');
    assert.equal(snapshots[0].action, 'testFilterCalculation');
    assert.equal(snapshots[0].durationMs, 4.8);
    assert.equal(snapshots[0].outcome, 'success');

    assert.equal(snapshots[1].scope, 'Map');
    assert.equal(snapshots[1].action, 'testMapRender');
    assert.equal(snapshots[1].durationMs, 12.4);
  });

  it('should measure execution times accurately using createExecutionTimer', async () => {
    clearDiagnosticEvents();
    const timer = createExecutionTimer('Filter', 'evaluateCityNeighborhoods');

    // Simulate small computation
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      sum += Math.sqrt(i);
    }
    const elapsed = timer('success');

    assert.ok(elapsed >= 0, 'Elapsed duration should be non-negative');
    const snapshots = getDiagnosticSnapshots();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].scope, 'Filter');
    assert.equal(snapshots[0].action, 'evaluateCityNeighborhoods');
    assert.ok(typeof snapshots[0].durationMs === 'number');
    assert.equal(snapshots[0].outcome, 'success');
  });

  it('should compute comprehensive performance metric summaries for Map and Filter scopes', () => {
    clearDiagnosticEvents();

    // Record synthetic series for Map
    recordDiagnosticEvent('Map', 'renderMarkersAndLayers', 'success', 10.0);
    recordDiagnosticEvent('Map', 'renderMarkersAndLayers', 'success', 20.0);
    recordDiagnosticEvent('Map', 'renderAdvancedSpatialOverlays', 'success', 30.0);

    // Record synthetic series for Filter
    recordDiagnosticEvent('Filter', 'filterCityNeighborhoods', 'success', 2.0);
    recordDiagnosticEvent('Filter', 'smartSuggestedNeighborhoods', 'success', 4.0);
    recordDiagnosticEvent('Filter', 'smartSuggestedNeighborhoods', 'success', 6.0);

    const mapSummary = getDiagnosticPerformanceMetrics('Map');
    assert.equal(mapSummary.count, 3);
    assert.equal(mapSummary.minDurationMs, 10.0);
    assert.equal(mapSummary.maxDurationMs, 30.0);
    assert.equal(mapSummary.avgDurationMs, 20.0);
    assert.ok(mapSummary.actions['renderMarkersAndLayers']);
    assert.equal(mapSummary.actions['renderMarkersAndLayers'].count, 2);
    assert.equal(mapSummary.actions['renderMarkersAndLayers'].avgMs, 15.0);

    const filterSummary = getDiagnosticPerformanceMetrics('Filter');
    assert.equal(filterSummary.count, 3);
    assert.equal(filterSummary.minDurationMs, 2.0);
    assert.equal(filterSummary.maxDurationMs, 6.0);
    assert.equal(filterSummary.avgDurationMs, 4.0);
    assert.ok(filterSummary.actions['smartSuggestedNeighborhoods']);
    assert.equal(filterSummary.actions['smartSuggestedNeighborhoods'].count, 2);
    assert.equal(filterSummary.actions['smartSuggestedNeighborhoods'].avgMs, 5.0);

    const overallSummary = getDiagnosticPerformanceMetrics();
    assert.equal(overallSummary.count, 6);
  });

  /**
   * Deterministically drains the microtask queue without arbitrary sleep/timeout delays.
   */
  const flushMicrotasks = async (rounds = 2): Promise<void> => {
    for (let i = 0; i < rounds; i++) {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    }
  };

  it('should notify subscribers asynchronously on new events and on buffer clearing', async () => {
    clearDiagnosticEvents();
    await flushMicrotasks();

    const captured: DiagnosticEventEntry[] = [];
    const unsubscribe = subscribeDiagnostics((entry) => {
      captured.push(entry);
    });

    recordDiagnosticEvent('Map', 'initMapInstance', 'success', 15.5);
    recordDiagnosticEvent('Filter', 'extraGreenWithLoanCalculation', 'success', 1.2);

    // Notifications must be deferred via microtask (not synchronous)
    assert.equal(captured.length, 0, 'Notifications must not execute synchronously');

    // Drain microtasks deterministically
    await flushMicrotasks();

    // Verify two recorded events are delivered
    assert.equal(captured.length, 2);
    // Verify event ordering is preserved (FIFO)
    assert.equal(captured[0].action, 'initMapInstance');
    assert.equal(captured[0].scope, 'Map');
    assert.equal(captured[1].action, 'extraGreenWithLoanCalculation');
    assert.equal(captured[1].scope, 'Filter');

    // Verify snapshot contents are correct
    const snapshots = getDiagnosticSnapshots();
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].action, 'extraGreenWithLoanCalculation');
    assert.equal(snapshots[1].action, 'initMapInstance');

    clearDiagnosticEvents();
    await flushMicrotasks();

    assert.equal(getDiagnosticSnapshots().length, 0);
    assert.equal(captured.length, 3);
    assert.equal(captured[2].action, 'bufferCleared');
    assert.equal(captured[2].scope, 'Diagnostics');

    unsubscribe();
    recordDiagnosticEvent('Storage', 'readCache', 'success', 0.5);
    await flushMicrotasks();

    // Should not capture after unsubscribe
    assert.equal(captured.length, 3);
  });

  it('should not notify subscriber when unsubscribed before queued microtask executes', async () => {
    clearDiagnosticEvents();
    await flushMicrotasks();

    const captured: DiagnosticEventEntry[] = [];
    const unsubscribe = subscribeDiagnostics((entry) => {
      captured.push(entry);
    });

    recordDiagnosticEvent('Security', 'rateLimitCheck', 'success', 0.8);

    // Unsubscribe synchronously before microtask executes
    unsubscribe();

    // Drain microtasks deterministically
    await flushMicrotasks();

    // Unsubscribed listener must be skipped
    assert.equal(captured.length, 0, 'Unsubscribed listener must not receive pending notifications');
  });

  it('should handle simulated component unmount safely while notification is pending', async () => {
    clearDiagnosticEvents();
    await flushMicrotasks();

    let isMounted = true;
    let stateUpdates = 0;
    let scheduled = false;

    // Simulate component lifecycle hook like DevPerformancePanel
    const unsubscribe = subscribeDiagnostics(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (isMounted) {
          stateUpdates += 1;
        }
      });
    });

    recordDiagnosticEvent('Map', 'renderClusterOverlay', 'success', 4.3);

    // Simulate unmount during the current event tick
    isMounted = false;
    unsubscribe();

    await flushMicrotasks();

    assert.equal(stateUpdates, 0, 'State updates must not execute after component unmount');
  });

  it('should preserve ordering and ring buffer integrity when 50+ rapid events are recorded before notification batch', async () => {
    clearDiagnosticEvents();
    await flushMicrotasks();

    const delivered: DiagnosticEventEntry[] = [];
    const unsubscribe = subscribeDiagnostics((entry) => {
      delivered.push(entry);
    });

    // Record 60 rapid events synchronously before draining microtasks
    const EVENT_COUNT = 60;
    for (let i = 0; i < EVENT_COUNT; i++) {
      recordDiagnosticEvent('Bulk', `rapidOperation_${i}`, 'success', i * 0.1);
    }

    // Verify subscriber is not called synchronously
    assert.equal(delivered.length, 0, 'Subscriber should not be called synchronously during rapid recording loop');

    // Drain microtasks deterministically
    await flushMicrotasks();

    // All 60 events should be delivered in FIFO order
    assert.equal(delivered.length, EVENT_COUNT);
    for (let i = 0; i < EVENT_COUNT; i++) {
      assert.equal(delivered[i].action, `rapidOperation_${i}`);
    }

    // Ring buffer snapshots check (ring buffer unshifts newest to index 0)
    const snapshots = getDiagnosticSnapshots();
    assert.equal(snapshots.length, EVENT_COUNT);
    assert.equal(snapshots[0].action, `rapidOperation_${EVENT_COUNT - 1}`);
    assert.equal(snapshots[EVENT_COUNT - 1].action, 'rapidOperation_0');

    unsubscribe();
  });

  it('should deliver notifications to remaining active subscribers when one unmounts early', async () => {
    clearDiagnosticEvents();
    await flushMicrotasks();

    const sub1Events: string[] = [];
    const sub2Events: string[] = [];

    const unsub1 = subscribeDiagnostics((e) => sub1Events.push(e.action));
    const unsub2 = subscribeDiagnostics((e) => sub2Events.push(e.action));

    recordDiagnosticEvent('System', 'eventA', 'success', 1.0);

    // Unsub 1 cancels early, unsub 2 remains active
    unsub1();

    await flushMicrotasks();

    assert.equal(sub1Events.length, 0, 'Early unsubscribed listener should receive 0 events');
    assert.equal(sub2Events.length, 1, 'Active listener should receive 1 event');
    assert.equal(sub2Events[0], 'eventA');

    unsub2();
  });
});
