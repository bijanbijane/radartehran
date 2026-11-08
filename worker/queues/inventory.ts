/**
 * @file worker/queues/inventory.ts
 * @description Complete Background Job Inventory, Classification, and Cron Migration Map.
 *
 * Replaces Express process-local timers (`setInterval`, `setTimeout`, unref loops)
 * with Cloudflare Cron Triggers and isolated Queues.
 */

import type { JobCategory, QueueName, ScheduledJobDefinition } from './types';

export interface BackgroundJobInventoryEntry {
  readonly jobId: string;
  readonly businessPurpose: string;
  readonly category: JobCategory;
  readonly legacyTriggerMechanism: string;
  readonly proposedCloudflareTrigger: 'CRON_TRIGGER' | 'QUEUE_EVENT' | 'HTTP_ENDPOINT';
  readonly targetQueue?: QueueName;
  readonly scheduleCron?: string;
  readonly executionFrequency: string;
  readonly idempotencyStrategy: string;
  readonly retryPolicy: string;
  readonly allowsConcurrency: boolean;
  readonly operationalCriticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export const TEHRAN_RADAR_JOB_INVENTORY: readonly BackgroundJobInventoryEntry[] = [
  {
    jobId: 'market_pulse_deep_monitoring',
    businessPurpose: 'Periodic scraping, Open-Meteo air quality fetch, and Gemini ground-truth market pulse aggregation for cities',
    category: 'SCHEDULED',
    legacyTriggerMechanism: 'server.ts backgroundMonitoringTimer = setInterval(..., MONITORING_INTERVAL_MS)',
    proposedCloudflareTrigger: 'CRON_TRIGGER',
    targetQueue: 'radar-data-sync',
    scheduleCron: '*/15 * * * *', // Every 15 minutes
    executionFrequency: 'Every 15 minutes',
    idempotencyStrategy: 'Atomic D1 lease on city_id + timestamp window check',
    retryPolicy: 'Max 3 attempts with exponential backoff; skips if next run starts',
    allowsConcurrency: false,
    operationalCriticality: 'HIGH',
  },
  {
    jobId: 'telemetry_batch_flush',
    businessPurpose: 'Flushes server-side telemetry events to storage and triggers k-anonymity aggregation',
    category: 'ANALYTICAL',
    legacyTriggerMechanism: 'productAnalyticsEngine.ts setInterval(flushServerTelemetryToS3Now, 30_000)',
    proposedCloudflareTrigger: 'CRON_TRIGGER',
    targetQueue: 'radar-telemetry-batches',
    scheduleCron: '*/5 * * * *', // Every 5 minutes
    executionFrequency: 'Every 5 minutes',
    idempotencyStrategy: 'D1 partition journal key (date + batch index)',
    retryPolicy: 'Max 5 attempts with jitter; routes to dead-letter after 5 failures',
    allowsConcurrency: false,
    operationalCriticality: 'MEDIUM',
  },
  {
    jobId: 'media_orphan_cleanup',
    businessPurpose: 'Scans for dangling unattached media bytes past 24h grace period or pending deletion failures',
    category: 'MAINTENANCE',
    legacyTriggerMechanism: 'serverObjectStorageCleanup.ts manual / on-demand POST triggers',
    proposedCloudflareTrigger: 'CRON_TRIGGER',
    targetQueue: 'radar-maintenance-jobs',
    scheduleCron: '0 3 * * *', // Daily at 03:00 UTC
    executionFrequency: 'Once daily',
    idempotencyStrategy: 'Idempotent R2 deletion + verification of active bargain/sponsor references',
    retryPolicy: 'Max 3 attempts per object; non-blocking failure reporting',
    allowsConcurrency: false,
    operationalCriticality: 'MEDIUM',
  },
  {
    jobId: 'expired_chunk_upload_session_cleanup',
    businessPurpose: 'Purges expired multipart and chunk upload sessions from memory/D1',
    category: 'MAINTENANCE',
    legacyTriggerMechanism: 'serverBackupAndChunkUploadRoutes.ts cleanupExpiredChunkSessions() called inside route handlers',
    proposedCloudflareTrigger: 'CRON_TRIGGER',
    targetQueue: 'radar-maintenance-jobs',
    scheduleCron: '*/30 * * * *', // Every 30 minutes
    executionFrequency: 'Every 30 minutes',
    idempotencyStrategy: 'D1 session status check (expires_at < now)',
    retryPolicy: 'Best-effort delete with retry on database lock',
    allowsConcurrency: false,
    operationalCriticality: 'LOW',
  },
  {
    jobId: 'media_processing_and_watermark',
    businessPurpose: 'Validates uploaded property media, checks magic bytes, extracts dimensions, attaches metadata',
    category: 'EVENT_DRIVEN',
    legacyTriggerMechanism: 'Express synchronous route processing during POST /upload',
    proposedCloudflareTrigger: 'QUEUE_EVENT',
    targetQueue: 'radar-media-jobs',
    executionFrequency: 'On media upload completion',
    idempotencyStrategy: 'D1 media_objects unique storage_key + object_id constraint',
    retryPolicy: 'Max 3 attempts; permanent validation errors sent directly to dead-letter',
    allowsConcurrency: true,
    operationalCriticality: 'HIGH',
  },
  {
    jobId: 'account_deletion_cascade_orchestrator',
    businessPurpose: 'Asynchronously deletes user preferences, bargains, media, and alert subscriptions upon user account removal',
    category: 'LONG_RUNNING',
    legacyTriggerMechanism: 'server/modules/account-lifecycle/durableJobStore.ts step execution',
    proposedCloudflareTrigger: 'QUEUE_EVENT',
    targetQueue: 'radar-maintenance-jobs',
    executionFrequency: 'On user account delete request',
    idempotencyStrategy: 'D1 account_deletion_jobs checkpoint cursor + unique user_id block',
    retryPolicy: 'Resumable stages; checkpointed progress',
    allowsConcurrency: false,
    operationalCriticality: 'CRITICAL',
  },
];

export const CLOUDFLARE_CRON_SCHEDULE_MAP: readonly ScheduledJobDefinition[] = [
  {
    scheduleId: 'cron-market-pulse',
    cronExpression: '*/15 * * * *',
    description: '15-minute city market pulse and weather sync',
    jobType: 'market_pulse_deep_monitoring',
    targetQueue: 'radar-data-sync',
    timeoutSeconds: 60,
    allowsConcurrency: false,
    timeZone: 'Asia/Tehran',
  },
  {
    scheduleId: 'cron-telemetry-flush',
    cronExpression: '*/5 * * * *',
    description: '5-minute behavioral telemetry buffer aggregation',
    jobType: 'telemetry_batch_flush',
    targetQueue: 'radar-telemetry-batches',
    timeoutSeconds: 30,
    allowsConcurrency: false,
    timeZone: 'UTC',
  },
  {
    scheduleId: 'cron-media-cleanup',
    cronExpression: '0 3 * * *',
    description: 'Daily orphan media inspection and safe deletion',
    jobType: 'media_orphan_cleanup',
    targetQueue: 'radar-maintenance-jobs',
    timeoutSeconds: 300,
    allowsConcurrency: false,
    timeZone: 'Asia/Tehran',
  },
  {
    scheduleId: 'cron-upload-session-cleanup',
    cronExpression: '*/30 * * * *',
    description: '30-minute stale chunk upload session pruning',
    jobType: 'expired_chunk_upload_session_cleanup',
    targetQueue: 'radar-maintenance-jobs',
    timeoutSeconds: 30,
    allowsConcurrency: false,
    timeZone: 'UTC',
  },
];
