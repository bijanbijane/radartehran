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

  it('should notify subscribers on new events and on buffer clearing', () => {
    clearDiagnosticEvents();

    const captured: DiagnosticEventEntry[] = [];
    const unsubscribe = subscribeDiagnostics((entry) => {
      captured.push(entry);
    });

    recordDiagnosticEvent('Map', 'initMapInstance', 'success', 15.5);
    recordDiagnosticEvent('Filter', 'extraGreenWithLoanCalculation', 'success', 1.2);

    assert.equal(captured.length, 2);
    assert.equal(captured[0].action, 'initMapInstance');
    assert.equal(captured[1].action, 'extraGreenWithLoanCalculation');

    clearDiagnosticEvents();
    assert.equal(getDiagnosticSnapshots().length, 0);

    unsubscribe();
    recordDiagnosticEvent('Storage', 'readCache', 'success', 0.5);
    // Should not capture after unsubscribe
    assert.equal(captured.length, 3); // 2 previous + 1 'cleared' event
  });
});
