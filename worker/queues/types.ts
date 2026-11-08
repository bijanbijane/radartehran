/**
 * @file worker/queues/types.ts
 * @description Cloudflare Queues, Cron Triggers, and Distributed Job Orchestration Types.
 *
 * Enforces:
 * - Versioned, strongly typed job envelopes with correlation IDs and idempotency keys.
 * - Explicit job classification (SCHEDULED, EVENT_DRIVEN, MAINTENANCE, ANALYTICAL, OPERATIONAL).
 * - Finite job lifecycle state machine.
 * - Failure classifications and bounded retry policies.
 * - Official Cloudflare Queue bindings and message batch interfaces.
 */

export type JobCategory =
  | 'SCHEDULED'
  | 'EVENT_DRIVEN'
  | 'LONG_RUNNING'
  | 'MAINTENANCE'
  | 'ANALYTICAL'
  | 'HIGH_PRIORITY_OPERATIONAL'
  | 'INTERACTIVE_ASYNC';

export type JobLifecycleState =
  | 'CREATED'
  | 'VALIDATED'
  | 'QUEUED'
  | 'RUNNING'
  | 'RETRY_PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DEAD_LETTERED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type JobFailureClassification =
  | 'TRANSIENT_NETWORK'
  | 'DEPENDENCY_OUTAGE'
  | 'RATE_LIMITED'
  | 'PERMANENT_VALIDATION'
  | 'PERMANENT_AUTHORIZATION'
  | 'EXECUTION_TIMEOUT'
  | 'CONFLICT_OR_CONCURRENCY'
  | 'UNKNOWN';

export type QueueName =
  | 'radar-media-jobs'
  | 'radar-data-sync'
  | 'radar-telemetry-batches'
  | 'radar-maintenance-jobs'
  | 'radar-dead-letter';

/**
 * Standard versioned job envelope.
 * Strictly avoids PII, passwords, full binary files, or raw database documents.
 */
export interface JobEnvelope<TPayload = Record<string, unknown>> {
  readonly jobId: string;
  readonly jobType: string;
  readonly schemaVersion: number;
  readonly queueName: QueueName;
  readonly priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly createdAtIso: string;
  readonly scheduledForIso?: string;
  readonly expiresAtIso?: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly originatingService: string;
  readonly payload: TPayload;
}

export interface JobExecutionRecord {
  readonly jobId: string;
  readonly jobType: string;
  readonly state: JobLifecycleState;
  readonly queueName: QueueName;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly lastErrorClassification?: JobFailureClassification;
  readonly lastErrorMessage?: string;
  readonly startedAtIso?: string;
  readonly completedAtIso?: string;
  readonly nextRetryAtIso?: string;
  readonly executionDurationMs?: number;
  readonly resultSummary?: Record<string, unknown>;
}

/**
 * Official Cloudflare Queue message abstraction.
 */
export interface QueueMessage<T = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  retry(options?: { delaySeconds?: number }): void;
  ack(): void;
}

export interface MessageBatch<T = unknown> {
  readonly queue: string;
  readonly messages: readonly QueueMessage<T>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
}

/**
 * Official Cloudflare Queue sender binding.
 */
export interface QueueBinding<T = unknown> {
  send(message: T, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch(messages: Iterable<{ body: T; delaySeconds?: number }>): Promise<void>;
}

export interface CronEvent {
  readonly cron: string;
  readonly scheduledTime: number;
  readonly type: 'cron';
}

export interface ScheduledJobDefinition {
  readonly scheduleId: string;
  readonly cronExpression: string;
  readonly description: string;
  readonly jobType: string;
  readonly targetQueue: QueueName;
  readonly timeoutSeconds: number;
  readonly allowsConcurrency: boolean;
  readonly timeZone: string;
}
