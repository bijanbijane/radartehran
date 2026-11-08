/**
 * @file tests/cloudflare-phase6-queues-and-cron.test.ts
 * @description Phase 6: Cloudflare Queues, Cron Triggers, Job Lifecycle,
 * Idempotency, and Retry/Dead-Letter Test Suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEHRAN_RADAR_JOB_INVENTORY,
  CLOUDFLARE_CRON_SCHEDULE_MAP,
  transitionJobState,
  evaluateJobRetry,
  CloudflareQueueProcessor,
  SimulatedQueueBinding,
  type JobEnvelope,
} from '../worker/queues/index';

test('Phase 6: Background Processing, Queues & Cron Triggers Architecture', async (t) => {
  await t.test('1. inventories background jobs and verifies Cloudflare Cron Trigger mappings', () => {
    assert.ok(TEHRAN_RADAR_JOB_INVENTORY.length >= 6);

    const pulseJob = TEHRAN_RADAR_JOB_INVENTORY.find((j) => j.jobId === 'market_pulse_deep_monitoring');
    assert.ok(pulseJob);
    assert.equal(pulseJob?.proposedCloudflareTrigger, 'CRON_TRIGGER');
    assert.equal(pulseJob?.scheduleCron, '*/15 * * * *');
    assert.equal(pulseJob?.targetQueue, 'radar-data-sync');

    const telemetryJob = TEHRAN_RADAR_JOB_INVENTORY.find((j) => j.jobId === 'telemetry_batch_flush');
    assert.ok(telemetryJob);
    assert.equal(telemetryJob?.proposedCloudflareTrigger, 'CRON_TRIGGER');
    assert.equal(telemetryJob?.targetQueue, 'radar-telemetry-batches');

    assert.ok(CLOUDFLARE_CRON_SCHEDULE_MAP.length >= 4);
    assert.ok(CLOUDFLARE_CRON_SCHEDULE_MAP.some((c) => c.scheduleId === 'cron-market-pulse'));
  });

  await t.test('2. enforces strict job lifecycle state transitions', () => {
    // Valid lifecycle progression
    assert.equal(transitionJobState('CREATED', 'VALIDATED').success, true);
    assert.equal(transitionJobState('VALIDATED', 'QUEUED').success, true);
    assert.equal(transitionJobState('QUEUED', 'RUNNING').success, true);
    assert.equal(transitionJobState('RUNNING', 'COMPLETED').success, true);

    // Idempotent no-op
    assert.equal(transitionJobState('RUNNING', 'RUNNING').isIdempotentNoop, true);

    // Invalid transition directly from CREATED to COMPLETED rejected
    const jump = transitionJobState('CREATED', 'COMPLETED');
    assert.equal(jump.success, false);
    assert.match(jump.error || '', /INVALID_JOB_STATE_TRANSITION/);

    // Cancel from QUEUED
    assert.equal(transitionJobState('QUEUED', 'CANCELLED').success, true);
  });

  await t.test('3. evaluates retries: calculates exponential backoff and isolates poison messages', () => {
    const job: JobEnvelope = {
      jobId: 'job_123',
      jobType: 'media_processing',
      schemaVersion: 1,
      queueName: 'radar-media-jobs',
      priority: 'HIGH',
      idempotencyKey: 'idem_key_1',
      correlationId: 'corr_1',
      createdAtIso: '2026-05-01T00:00:00Z',
      attempts: 1,
      maxAttempts: 3,
      originatingService: 'api-upload',
      payload: { objectId: 'obj_1' },
    };

    // Attempt 1: Transient network failure should retry
    const retry1 = evaluateJobRetry(job, 1, 'TRANSIENT_NETWORK', 'Connection reset');
    assert.equal(retry1.shouldRetry, true);
    assert.equal(retry1.targetState, 'RETRY_PENDING');
    assert.ok(retry1.delaySeconds >= 5);

    // Permanent authorization failure should NEVER retry and route directly to dead-letter
    const authFail = evaluateJobRetry(job, 1, 'PERMANENT_AUTHORIZATION', 'Forbidden');
    assert.equal(authFail.shouldRetry, false);
    assert.equal(authFail.targetState, 'DEAD_LETTERED');
    assert.equal(authFail.isPoisonMessage, true);

    // Exceeded max attempts routes to dead-letter
    const maxRetry = evaluateJobRetry(job, 3, 'TRANSIENT_NETWORK', 'Timeout');
    assert.equal(maxRetry.shouldRetry, false);
    assert.equal(maxRetry.targetState, 'DEAD_LETTERED');
  });

  await t.test('4. executes queue batch processing, enforcing idempotency and duplicate deduplication', async () => {
    const dlq = new SimulatedQueueBinding();
    const processor = new CloudflareQueueProcessor({ deadLetterQueue: dlq });

    let executionCount = 0;
    processor.registerHandler('test_task', async (_job) => {
      executionCount += 1;
      return { success: true };
    });

    const primaryQueue = new SimulatedQueueBinding();
    const jobPayload: JobEnvelope = {
      jobId: 'task_1',
      jobType: 'test_task',
      schemaVersion: 1,
      queueName: 'radar-data-sync',
      priority: 'NORMAL',
      idempotencyKey: 'stable_idem_key_100',
      correlationId: 'corr_1',
      createdAtIso: '2026-05-01T00:00:00Z',
      attempts: 1,
      maxAttempts: 3,
      originatingService: 'test',
      payload: {},
    };

    // Send original + duplicate message with same idempotency key
    await primaryQueue.send(jobPayload);
    await primaryQueue.send(jobPayload);

    const batch = primaryQueue.createBatch('radar-data-sync');
    const res = await processor.processBatch(batch);

    assert.equal(res.processedCount, 1);
    assert.equal(res.skippedDuplicateCount, 1);
    assert.equal(executionCount, 1); // Handler called only once
  });

  await t.test('5. routes poison messages and unknown job types to dead-letter queue without stalling batch', async () => {
    const dlq = new SimulatedQueueBinding();
    const processor = new CloudflareQueueProcessor({ deadLetterQueue: dlq });

    const primaryQueue = new SimulatedQueueBinding();
    const poisonJob: JobEnvelope = {
      jobId: 'poison_1',
      jobType: 'unknown_unregistered_job_type',
      schemaVersion: 1,
      queueName: 'radar-media-jobs',
      priority: 'LOW',
      idempotencyKey: 'poison_key',
      correlationId: 'corr_poison',
      createdAtIso: '2026-05-01T00:00:00Z',
      attempts: 1,
      maxAttempts: 3,
      originatingService: 'attacker',
      payload: {},
    };

    await primaryQueue.send(poisonJob);

    const batch = primaryQueue.createBatch('radar-media-jobs');
    const res = await processor.processBatch(batch);

    assert.equal(res.deadLetteredCount, 1);
    assert.equal(dlq.messages.length, 1);
    assert.equal(dlq.messages[0].jobId, 'poison_1');
  });
});
