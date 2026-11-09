/**
 * @file server/modules/distributed-processing/types.ts
 * @description Employee 75 — Distributed Background Processing and Workflow Infrastructure (Phases 4 & 5).
 * Authoritative types for Job Definitions, Job Instances, Workers, Exclusive Leases,
 * Transactional Outbox, Idempotency Records, Durable Workflows, Saga Compensations,
 * Scheduled Operations, and Backpressure Admission Control.
 */

import type { SecurityClassificationLevel } from '../platform-foundation/types';

export type JobPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export type JobInstanceStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'RUNNING'
  | 'RETRY_WAIT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'DEAD_LETTERED';

export type WorkerLifecycleStatus =
  | 'STARTING'
  | 'READY'
  | 'BUSY'
  | 'DEGRADED'
  | 'STOPPING'
  | 'OFFLINE';

export type OutboxPublicationStatus =
  | 'PENDING'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'RETRY_WAIT'
  | 'FAILED'
  | 'DEAD_LETTERED';

export interface JobRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxElapsedMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableCategories: string[];
}

export interface JobDefinitionRecord {
  jobType: string;
  jobVersion: string;
  ownerModule: string;
  handlerReference: string;
  inputSchemaReference: string;
  outputSchemaReference: string;
  timeoutPolicy: {
    executionTimeoutMs: number;
    leaseDurationMs: number;
    maxLeaseRenewals: number;
  };
  retryPolicy: JobRetryPolicy;
  idempotencyPolicy: 'REQUIRED' | 'OPTIONAL';
  priority: JobPriority;
  concurrencyLimit: number;
  tenantScope: 'TENANT_SCOPED' | 'PLATFORM_GLOBAL' | 'OPTIONAL_TENANT';
  securityClassification: SecurityClassificationLevel;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobInstanceRecord {
  jobId: string;
  jobType: string;
  jobVersion: string;
  status: JobInstanceStatus;
  priority: JobPriority;
  tenantId?: string | null;
  organizationId?: string | null;
  actorId?: string | null;
  correlationId: string;
  causationId?: string | null;
  idempotencyKey: string;
  inputReference: string;
  resultReference?: string | null;
  attemptCount: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  leaseRenewalCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
}

export interface WorkerRecord {
  workerId: string;
  workerType: string;
  capabilities: string[];
  environment: string;
  status: WorkerLifecycleStatus;
  lastHeartbeatAt: string;
  leaseCount: number;
  maximumConcurrency: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionalOutboxRecord {
  outboxId: string;
  eventId: string;
  eventType: string;
  eventVersion: string;
  ownerModule: string;
  aggregateType: string;
  aggregateId: string;
  tenantId?: string | null;
  correlationId: string;
  causationId?: string | null;
  payloadReference: string;
  publicationStatus: OutboxPublicationStatus;
  attemptCount: number;
  nextAttemptAt: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedIdempotencyRecord {
  idempotencyKey: string;
  operationScope: string;
  tenantScope: string | null;
  actorScope: string | null;
  requestFingerprint: string;
  executionStatus: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT';
  resultReference: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * Phase 5 — Durable Workflows, Saga Orchestration, Scheduling & Backpressure
 */
export type WorkflowInstanceStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPENSATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'MANUAL_INTERVENTION_REQUIRED';

export interface WorkflowStepSpec {
  stepCode: string;
  ownerModule: string;
  dependsOnSteps: string[];
  forwardActionReference: string;
  compensationActionReference: string | null;
  compensationEligible: boolean;
  idempotencyRequired: boolean;
  timeoutMs: number;
  maxRetries: number;
}

export interface WorkflowDefinitionRecord {
  workflowType: string;
  workflowVersion: string;
  ownerModule: string;
  description: string;
  steps: WorkflowStepSpec[];
  inputSchemaReference: string;
  outputSchemaReference: string;
  timeoutPolicy: { overallTimeoutMs: number };
  retryPolicy: { maxStepRetries: number; backoffMs: number };
  authorizationPermission: string;
  tenantScope: 'TENANT_SCOPED' | 'PLATFORM_GLOBAL' | 'OPTIONAL_TENANT';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepCheckpoint {
  stepCode: string;
  status: 'COMPLETED' | 'FAILED' | 'COMPENSATED' | 'COMPENSATION_FAILED';
  attemptCount: number;
  durationMs: number;
  outputReference: string | null;
  errorCode: string | null;
  checkpointedAt: string;
}

export interface WorkflowInstanceRecord {
  workflowId: string;
  workflowType: string;
  workflowVersion: string;
  status: WorkflowInstanceStatus;
  tenantId?: string | null;
  organizationId?: string | null;
  actorId?: string | null;
  correlationId: string;
  currentStep: string | null;
  completedSteps: string[];
  failedStep: string | null;
  compensationState: 'NONE' | 'IN_PROGRESS' | 'COMPENSATED' | 'COMPENSATION_FAILED_MANUAL_REQUIRED';
  compensatedSteps: string[];
  checkpoints: Record<string, WorkflowStepCheckpoint>;
  inputReference: string;
  resultReference: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
}

export type ScheduleExecutionCadence = 'ONE_TIME' | 'RECURRING' | 'DELAYED';

export type MissedWindowPolicy = 'SKIP_MISSED' | 'SINGLE_CATCHUP';

export interface ScheduledOperationRecord {
  scheduleId: string;
  ownerModule: string;
  operationReference: string;
  jobType: string;
  tenantId: string | null;
  timezone: string;
  cadenceType: ScheduleExecutionCadence;
  recurrenceRule: string | null;
  intervalMinutes: number | null;
  missedWindowPolicy: MissedWindowPolicy;
  nextExecutionAt: string | null;
  lastExecutionAt: string | null;
  executionStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'COMPLETED';
  exclusiveLockOwner: string | null;
  idempotencyPolicy: 'WINDOW_SCOPED_REQUIRED';
  retryPolicy: { maxAttempts: number; backoffMs: number };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackpressureConfig {
  maxGlobalQueueDepth: number;
  maxTenantActiveJobs: number;
  maxLowPriorityQueueDepth: number;
  deferLowPriorityAboveDepth: number;
}

export interface AdmissionDecision {
  admitted: boolean;
  action: 'ADMITTED' | 'DEFERRED_LOW_PRIORITY' | 'REJECTED_BACKPRESSURE';
  reason: string;
  currentQueueDepth: number;
  tenantActiveJobs: number;
}
