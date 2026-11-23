import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker/index';
import type { RadarQueueEnvelope } from '../worker/queues/queueAndCronProcessor';
import type { MessageBatch, WorkerEnv } from '../worker/types';

const executionCtx = { waitUntil() {}, passThroughOnException() {} } as never;

test('future DB write pause blocks mutations while preserving reads and privacy/security exceptions', async () => {
  const env = { DB_WRITES_PAUSED_UNTIL_UTC: '2099-01-01T00:00:00Z' } as WorkerEnv;
  const blocked = await worker.fetch(
    new Request('https://radar.test/api/account/profile', { method: 'PATCH' }),
    env,
    executionCtx,
  );
  assert.equal(blocked.status, 503);
  const blockedBody = await blocked.json() as { code: string; pausedUntilUtc: string };
  assert.equal(blockedBody.code, 'DB_WRITES_PAUSED');
  assert.equal(blockedBody.pausedUntilUtc, '2099-01-01T00:00:00.000Z');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  const read = await worker.fetch(new Request('https://radar.test/'), env, executionCtx);
  assert.equal(read.status, 200, 'GET navigation remains available during the write pause');

  const readOnlyQuery = await worker.fetch(
    new Request('https://radar.test/api/v1/ai/gateway/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: 'intelligent_search', prompt: 'آپارتمان در منطقه ۵ تهران' }),
    }),
    env,
    executionCtx,
  );
  assert.notEqual(readOnlyQuery.status, 503, 'allowlisted read-only POST queries remain available');

  const researchWrite = await worker.fetch(
    new Request('https://radar.test/api/v1/research/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'SEARCH' }),
    }),
    env,
    executionCtx,
  );
  const researchBody = await researchWrite.json() as { code: string };
  assert.equal(researchBody.code, 'DB_WRITES_PAUSED', 'research event ingestion remains blocked');

  const publisherWrite = await worker.fetch(
    new Request('https://radar.test/api/internal/geography/publish/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'quota-guard-test' }),
    }),
    env,
    executionCtx,
  );
  const publisherBody = await publisherWrite.json() as { code: string };
  assert.equal(
    publisherBody.code,
    'DB_WRITES_PAUSED',
    'the internal IRNI registry publisher must not bypass the global D1 write pause',
  );

  const privacyRequest = await worker.fetch(
    new Request('https://radar.test/api/account/deletion-requests', { method: 'POST' }),
    env,
    executionCtx,
  );
  const privacyBody = await privacyRequest.json() as { code?: string };
  assert.notEqual(privacyBody.code, 'DB_WRITES_PAUSED', 'account deletion remains reachable for user-rights handling');
});

test('invalid DB write-pause timestamp fails closed for mutations', async () => {
  const response = await worker.fetch(
    new Request('https://radar.test/api/account/favorites', { method: 'PUT' }),
    { DB_WRITES_PAUSED_UNTIL_UTC: 'tomorrow' } as WorkerEnv,
    executionCtx,
  );
  assert.equal(response.status, 503);
  const body = await response.json() as { code: string };
  assert.equal(body.code, 'DB_WRITES_PAUSE_CONFIG_INVALID');
});

test('expired DB write pause no longer blocks mutation dispatch', async () => {
  const response = await worker.fetch(
    new Request('https://radar.test/api/account/profile', { method: 'PATCH' }),
    { DB_WRITES_PAUSED_UNTIL_UTC: '2020-01-01T00:00:00Z' } as WorkerEnv,
    executionCtx,
  );
  const body = await response.json() as { code?: string };
  assert.notEqual(body.code, 'DB_WRITES_PAUSED');
});

test('queue batches are delayed until the pause expires instead of being processed or acknowledged', async () => {
  let retryDelay = 0;
  const batch = {
    queue: 'RADAR_QUEUE',
    messages: [],
    ackAll() {},
    retryAll(options?: { delaySeconds?: number }) {
      retryDelay = options?.delaySeconds ?? 0;
    },
  } as unknown as MessageBatch<RadarQueueEnvelope>;

  await worker.queue(batch, { DB_WRITES_PAUSED_UNTIL_UTC: '2099-01-01T00:00:00Z' } as WorkerEnv, executionCtx);
  assert.equal(retryDelay, 43_200, 'queue retry delay uses a bounded 12-hour recheck interval');
});

test('scheduled jobs are not enqueued while the DB write pause is active', async () => {
  let sent = 0;
  const env = {
    DB_WRITES_PAUSED_UNTIL_UTC: '2099-01-01T00:00:00Z',
    RADAR_QUEUE: { async send() { sent += 1; } },
  } as unknown as WorkerEnv;

  await worker.scheduled({ scheduledTime: Date.now(), cron: '0 * * * *' }, env, executionCtx);
  assert.equal(sent, 0);
});
