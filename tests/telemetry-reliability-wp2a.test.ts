import assert from 'node:assert/strict';
import {
  isTelemetryFlushTimerRunning,
  resetServerTelemetryForTests,
  startTelemetryFlushTimer,
  stopTelemetryFlushTimer,
} from '../src/utils/productAnalyticsEngine';

console.log('🧪 Running WP-2A Phase 2: Telemetry Timer Lifecycle Tests...');

// 1. Importing module must NOT start timer
assert.equal(
  isTelemetryFlushTimerRunning(),
  false,
  'Importing productAnalyticsEngine must not start telemetryFlushTimer automatically',
);

// 2. Starting once returns true and marks timer running
assert.equal(startTelemetryFlushTimer(60_000), true, 'First startTelemetryFlushTimer call must return true');
assert.equal(isTelemetryFlushTimerRunning(), true, 'Timer must be running after startTelemetryFlushTimer');

// 3. Starting twice is idempotent and does not create duplicate timers
assert.equal(startTelemetryFlushTimer(60_000), false, 'Second startTelemetryFlushTimer call must return false (idempotent)');
assert.equal(isTelemetryFlushTimerRunning(), true, 'Timer must remain running');

// 4. Stopping stops timer and is idempotent
assert.equal(stopTelemetryFlushTimer(), true, 'First stopTelemetryFlushTimer call must return true');
assert.equal(isTelemetryFlushTimerRunning(), false, 'Timer must be stopped after stopTelemetryFlushTimer');
assert.equal(stopTelemetryFlushTimer(), false, 'Second stopTelemetryFlushTimer call must return false');

// 5. resetServerTelemetryForTests stops active timer cleanly
startTelemetryFlushTimer(60_000);
assert.equal(isTelemetryFlushTimerRunning(), true);
resetServerTelemetryForTests();
assert.equal(
  isTelemetryFlushTimerRunning(),
  false,
  'resetServerTelemetryForTests must stop the active flush timer',
);

console.log('✅ WP-2A Phase 2 Timer Lifecycle Tests Passed!');
