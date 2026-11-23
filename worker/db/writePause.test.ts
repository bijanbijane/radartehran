import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveD1WritePauseState } from './writePause';

test('D1 write pause is inactive when no deadline is configured', () => {
  assert.deepEqual(resolveD1WritePauseState({}, 1_800_000_000_000), {
    paused: false,
    pauseUntilUtc: null,
    retryAfterSeconds: 0,
    invalidConfiguration: false,
  });
});

test('D1 write pause is active before its UTC deadline', () => {
  const state = resolveD1WritePauseState(
    { DB_WRITES_PAUSED_UNTIL_UTC: '2026-11-24T00:00:00Z' },
    Date.parse('2026-11-23T12:00:00Z'),
  );
  assert.equal(state.paused, true);
  assert.equal(state.pauseUntilUtc, '2026-11-24T00:00:00.000Z');
  assert.equal(state.retryAfterSeconds, 3600);
  assert.equal(state.invalidConfiguration, false);
});

test('D1 write pause expires automatically at and after the deadline', () => {
  const env = { DB_WRITES_PAUSED_UNTIL_UTC: '2026-11-24T00:00:00Z' };
  assert.equal(resolveD1WritePauseState(env, Date.parse('2026-11-24T00:00:00Z')).paused, false);
  assert.equal(resolveD1WritePauseState(env, Date.parse('2026-11-24T00:01:00Z')).paused, false);
});

test('invalid configured D1 write pause deadline fails closed', () => {
  const state = resolveD1WritePauseState(
    { DB_WRITES_PAUSED_UNTIL_UTC: 'not-a-date' },
    Date.parse('2026-11-23T12:00:00Z'),
  );
  assert.equal(state.paused, true);
  assert.equal(state.invalidConfiguration, true);
  assert.equal(state.retryAfterSeconds, 3600);
});
