/**
 * @file server/modules/distributed-processing/jobsOutboxAndWorkersEngine.ts
 * @description Phase 4 — Employee 75: Distributed Jobs, Queues, Transactional Outbox,
 * Shared Idempotency Infrastructure, Worker Registry & Exclusive Leases, Priority & Tenant Fairness,
 * Retry Policies, Dead-Letter Management, and Queue Provider Adapter.
 */

import { createHash, randomUUID } from 'node:crypto';
import { decodePaginationCursor, encodePaginationCursor, normalizePaginationParams } from '../core';
import {
  getDefaultEnterpriseTenancyStore,
  verifyBackgroundOperationTenantScope,
  type EnterpriseTenancyStore,
} from '../enterprise-tenancy';
import { PlatformApplicationError } from '../platform-foundation';
import type {
  AdmissionDecision,
  BackpressureConfig,
  JobDefinitionRecord,
  JobInstanceRecord,
  JobInstanceStatus,
  JobPriority,
  SharedIdempotencyRecord,
  TransactionalOutboxRecord,
  WorkerRecord,
} from './types';

const NON_RETRYABLE_ERROR_CODES = new Set<string>([
  'VALIDATION_FAILED',
  'AUTHENTICATION_REQUIRED',
  'PERMISSION_DENIED',
  'TENANT_ACCESS_DENIED',
  'TENANT_SUSPENDED',
  'IDEMPOTENCY_CONFLICT',
  'LEGAL_HOLD_ACTIVE',
]);

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  CRITICAL: 400,
  HIGH: 300,
  NORMAL: 200,
  LOW: 100,
};

export interface QueueProviderAdapter {
  readonly providerName: string;
  readonly isExternalCloudProvisioned: boolean;
  readonly operationalState: 'AVAILABLE_LOCAL_ADAPTER' | 'NOT_CONFIGURED' | 'BLOCKED' | 'UNAVAILABLE';
  enqueueMessage(message: { jobId: string; jobType: string; priority: JobPriority; correlationId: string }): void;
  publishOutboxEvent(outbox: TransactionalOutboxRecord): void;
}

export class ConfigurableQueueProviderAdapter implements QueueProviderAdapter {
  public readonly providerName: string;
  public readonly isExternalCloudProvisioned: boolean;
  public operationalState: 'AVAILABLE_LOCAL_ADAPTER' | 'NOT_CONFIGURED' | 'BLOCKED' | 'UNAVAILABLE';
  private simulateOutage = false;
  private dispatchedMessages: Array<{ jobId: string; jobType: string; priority: JobPriority }> = [];
  private publishedEvents: string[] = [];

  constructor(options?: { cloudflareQueuesConfigured?: boolean }) {
    const cfConfigured =
      options?.cloudflareQueuesConfigured ?? Boolean((process.env.CF_QUEUE_NAME ?? '').trim());
    this.isExternalCloudProvisioned = cfConfigured;
    this.providerName = cfConfigured ? 'cloudflare-queues' : 'isolated-durable-queue-adapter';
    this.operationalState = cfConfigured ? 'AVAILABLE_LOCAL_ADAPTER' : 'NOT_CONFIGURED';
  }

  public setSimulatedOutage(outage: boolean): void {
    this.simulateOutage = outage;
  }

  public enqueueMessage(message: {
    jobId: string;
    jobType: string;
    priority: JobPriority;
    correlationId: string;
  }): void {
    if (this.simulateOutage) {
      throw new PlatformApplicationError({
        code: 'DEPENDENCY_UNAVAILABLE',
        category: 'DEPENDENCY_UNAVAILABLE',
        httpStatus: 503,
        retryable: true,
        owningModule: 'distributed-background-processing',
        message: `Queue provider '${this.providerName}' is currently unavailable.`,
      });
    }
    this.dispatchedMessages.push({
      jobId: message.jobId,
      jobType: message.jobType,
      priority: message.priority,
    });
  }

  public publishOutboxEvent(outbox: TransactionalOutboxRecord): void {
    if (this.simulateOutage) {
      throw new PlatformApplicationError({
        code: 'DEPENDENCY_UNAVAILABLE',
        category: 'DEPENDENCY_UNAVAILABLE',
        httpStatus: 503,
        retryable: true,
        owningModule: 'distributed-background-processing',
        message: `Event transport provider '${this.providerName}' is unavailable for outbox '${outbox.outboxId}'.`,
      });
    }
    if (!this.publishedEvents.includes(outbox.eventId)) {
      this.publishedEvents.push(outbox.eventId);
    }
  }

  public getPublishedEventIds(): string[] {
    return [...this.publishedEvents];
  }
}

export const INITIAL_JOB_DEFINITIONS: readonly JobDefinitionRecord[] = [
  {
    jobType: 'tenant.provisioning.execute',
    jobVersion: '1.0.0',
    ownerModule: 'enterprise-multi-tenancy',
    handlerReference: 'enterprise-multi-tenancy.handlers.provisionTenant',
    inputSchemaReference: 'TenantProvisionJobInputSchema',
    outputSchemaReference: 'TenantProvisionJobOutputSchema',
    timeoutPolicy: { executionTimeoutMs: 15000, leaseDurationMs: 20000, maxLeaseRenewals: 3 },
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      maxElapsedMs: 60000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableCategories: ['DEPENDENCY_UNAVAILABLE', 'TIMEOUT'],
    },
    idempotencyPolicy: 'REQUIRED',
    priority: 'HIGH',
    concurrencyLimit: 5,
    tenantScope: 'OPTIONAL_TENANT',
    securityClassification: 'CRITICAL_SECURITY',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
  {
    jobType: 'listing.publication.index_sync',
    jobVersion: '1.0.0',
    ownerModule: 'listing-lifecycle',
    handlerReference: 'listing-lifecycle.handlers.syncSearchAndFeed',
    inputSchemaReference: 'ListingPublicationSyncInputSchema',
    outputSchemaReference: 'ListingPublicationSyncOutputSchema',
    timeoutPolicy: { executionTimeoutMs: 10000, leaseDurationMs: 15000, maxLeaseRenewals: 2 },
    retryPolicy: {
      maxAttempts: 4,
      baseDelayMs: 400,
      maxDelayMs: 4000,
      maxElapsedMs: 45000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableCategories: ['DEPENDENCY_UNAVAILABLE', 'TIMEOUT'],
    },
    idempotencyPolicy: 'REQUIRED',
    priority: 'NORMAL',
    concurrencyLimit: 10,
    tenantScope: 'OPTIONAL_TENANT',
    securityClassification: 'INTERNAL',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
  {
    jobType: 'valuation.neighborhood.refresh',
    jobVersion: '1.0.0',
    ownerModule: 'property-valuation',
    handlerReference: 'property-valuation.handlers.refreshNeighborhoodPulse',
    inputSchemaReference: 'ValuationRefreshInputSchema',
    outputSchemaReference: 'ValuationRefreshOutputSchema',
    timeoutPolicy: { executionTimeoutMs: 20000, leaseDurationMs: 25000, maxLeaseRenewals: 3 },
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      maxElapsedMs: 90000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableCategories: ['DEPENDENCY_UNAVAILABLE', 'TIMEOUT'],
    },
    idempotencyPolicy: 'REQUIRED',
    priority: 'NORMAL',
    concurrencyLimit: 4,
    tenantScope: 'PLATFORM_GLOBAL',
    securityClassification: 'INTERNAL',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
  {
    jobType: 'backup.manifest.execute',
    jobVersion: '1.0.0',
    ownerModule: 'backup-disaster-recovery',
    handlerReference: 'backup-disaster-recovery.handlers.executeBackup',
    inputSchemaReference: 'BackupExecutionInputSchema',
    outputSchemaReference: 'BackupExecutionOutputSchema',
    timeoutPolicy: { executionTimeoutMs: 30000, leaseDurationMs: 40000, maxLeaseRenewals: 4 },
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      maxElapsedMs: 120000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableCategories: ['DEPENDENCY_UNAVAILABLE', 'TIMEOUT'],
    },
    idempotencyPolicy: 'REQUIRED',
    priority: 'CRITICAL',
    concurrencyLimit: 2,
    tenantScope: 'OPTIONAL_TENANT',
    securityClassification: 'CRITICAL_SECURITY',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
  {
    jobType: 'analytics.ingestion.pipeline',
    jobVersion: '1.0.0',
    ownerModule: 'analytical-data-platform',
    handlerReference: 'analytical-data-platform.handlers.runIngestionPipeline',
    inputSchemaReference: 'AnalyticsIngestionInputSchema',
    outputSchemaReference: 'AnalyticsIngestionOutputSchema',
    timeoutPolicy: { executionTimeoutMs: 25000, leaseDurationMs: 30000, maxLeaseRenewals: 3 },
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 800,
      maxDelayMs: 8000,
      maxElapsedMs: 90000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      retryableCategories: ['DEPENDENCY_UNAVAILABLE', 'TIMEOUT'],
    },
    idempotencyPolicy: 'REQUIRED',
    priority: 'LOW',
    concurrencyLimit: 3,
    tenantScope: 'OPTIONAL_TENANT',
    securityClassification: 'CONFIDENTIAL',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
];

export function computeRequestFingerprint(payload: unknown): string {
  const canonical = JSON.stringify(payload ?? {});
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

export class DistributedProcessingStore {
  private jobDefinitions = new Map<string, JobDefinitionRecord>();
  private jobs = new Map<string, JobInstanceRecord>();
  private workers = new Map<string, WorkerRecord>();
  private outbox = new Map<string, TransactionalOutboxRecord>();
  private idempotencyRecords = new Map<string, SharedIdempotencyRecord>();
  private consumedEventIds = new Set<string>();
  private serverHandlers = new Map<
    string,
    (job: JobInstanceRecord) => Promise<{ resultReference: string }> | { resultReference: string }
  >();
  public readonly queueAdapter: ConfigurableQueueProviderAdapter;
  private readonly tenancyStore: EnterpriseTenancyStore;
  private backpressureConfig: BackpressureConfig = {
    maxGlobalQueueDepth: 200,
    maxTenantActiveJobs: 10,
    maxLowPriorityQueueDepth: 50,
    deferLowPriorityAboveDepth: 20,
  };

  constructor(options?: {
    queueAdapter?: ConfigurableQueueProviderAdapter;
    tenancyStore?: EnterpriseTenancyStore;
    backpressureConfig?: Partial<BackpressureConfig>;
  }) {
    this.queueAdapter = options?.queueAdapter ?? new ConfigurableQueueProviderAdapter();
    this.tenancyStore = options?.tenancyStore ?? getDefaultEnterpriseTenancyStore();
    if (options?.backpressureConfig) {
      this.backpressureConfig = { ...this.backpressureConfig, ...options.backpressureConfig };
    }
    for (const def of INITIAL_JOB_DEFINITIONS) {
      this.jobDefinitions.set(def.jobType, structuredClone(def));
      this.serverHandlers.set(def.handlerReference, (job) => ({
        resultReference: `res://${job.jobType}/${job.jobId}/v${job.recordVersion}`,
      }));
    }
  }

  public setBackpressureConfig(patch: Partial<BackpressureConfig>): BackpressureConfig {
    this.backpressureConfig = { ...this.backpressureConfig, ...patch };
    return { ...this.backpressureConfig };
  }

  public getBackpressureConfig(): BackpressureConfig {
    return { ...this.backpressureConfig };
  }

  // ============================================================================
  // 4.6 — Shared Idempotency Service
  // ============================================================================

  public acquireOrVerifyIdempotency(input: {
    idempotencyKey: string;
    operationScope: string;
    tenantScope?: string | null;
    actorScope?: string | null;
    requestPayload: unknown;
    ttlMinutes?: number;
  }): { status: 'NEW' | 'REPLAY_COMPLETED' | 'IN_PROGRESS'; record: SharedIdempotencyRecord } {
    const cleanKey = (input.idempotencyKey ?? '').trim();
    const cleanScope = (input.operationScope ?? '').trim();
    if (!cleanKey || !cleanScope) {
      throw new PlatformApplicationError({
        code: 'INVALID_IDEMPOTENCY_KEY',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'distributed-background-processing',
        message: 'idempotencyKey and operationScope are required.',
      });
    }

    const compositeKey = `${cleanScope}:${input.tenantScope ?? 'global'}:${cleanKey}`;
    const fingerprint = computeRequestFingerprint(input.requestPayload);
    const existing = this.idempotencyRecords.get(compositeKey);

    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new PlatformApplicationError({
          code: 'IDEMPOTENCY_CONFLICT',
          category: 'CONFLICT',
          httpStatus: 409,
          owningModule: 'distributed-background-processing',
          message: `Idempotency key '${cleanKey}' was already used with a different request payload in scope '${cleanScope}'.`,
        });
      }
      if (existing.executionStatus === 'COMPLETED') {
        return { status: 'REPLAY_COMPLETED', record: structuredClone(existing) };
      }
      if (existing.executionStatus === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS', record: structuredClone(existing) };
      }
      if (existing.executionStatus === 'FAILED_PERMANENT') {
        throw new PlatformApplicationError({
          code: 'IDEMPOTENCY_PERMANENT_FAILURE',
          category: 'BUSINESS_RULE',
          httpStatus: 422,
          owningModule: 'distributed-background-processing',
          message: `Previous execution for idempotency key '${cleanKey}' failed permanently and cannot be retried.`,
        });
      }
    }

    const nowMs = Date.now();
    const record: SharedIdempotencyRecord = {
      idempotencyKey: cleanKey,
      operationScope: cleanScope,
      tenantScope: input.tenantScope ?? null,
      actorScope: input.actorScope ?? null,
      requestFingerprint: fingerprint,
      executionStatus: 'IN_PROGRESS',
      resultReference: null,
      createdAt: existing?.createdAt ?? new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + (input.ttlMinutes ?? 60 * 24) * 60 * 1000).toISOString(),
    };
    this.idempotencyRecords.set(compositeKey, record);
    return { status: 'NEW', record: structuredClone(record) };
  }

  public finalizeIdempotencyRecord(input: {
    idempotencyKey: string;
    operationScope: string;
    tenantScope?: string | null;
    executionStatus: 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT';
    resultReference?: string | null;
  }): SharedIdempotencyRecord {
    const compositeKey = `${input.operationScope.trim()}:${input.tenantScope ?? 'global'}:${input.idempotencyKey.trim()}`;
    const existing = this.idempotencyRecords.get(compositeKey);
    if (!existing) {
      throw new PlatformApplicationError({
        code: 'IDEMPOTENCY_RECORD_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Idempotency record '${input.idempotencyKey}' not found.`,
      });
    }
    const updated: SharedIdempotencyRecord = {
      ...existing,
      executionStatus: input.executionStatus,
      resultReference: input.resultReference ?? existing.resultReference,
      updatedAt: new Date().toISOString(),
    };
    this.idempotencyRecords.set(compositeKey, updated);
    return structuredClone(updated);
  }

  public deleteExpiredIdempotencyRecord(
    operationScope: string,
    idempotencyKey: string,
    tenantScope: string | null = null,
    nowMs: number = Date.now(),
  ): boolean {
    const compositeKey = `${operationScope.trim()}:${tenantScope ?? 'global'}:${idempotencyKey.trim()}`;
    const existing = this.idempotencyRecords.get(compositeKey);
    if (!existing) return false;
    // Rule 4.6: Idempotency records must NEVER be deleted while an operation remains unresolved
    if (existing.executionStatus === 'IN_PROGRESS') {
      throw new PlatformApplicationError({
        code: 'IDEMPOTENCY_OPERATION_UNRESOLVED',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'distributed-background-processing',
        message: `Cannot delete idempotency record '${idempotencyKey}' while operation is IN_PROGRESS.`,
      });
    }
    if (nowMs <= Date.parse(existing.expiresAt)) {
      return false;
    }
    return this.idempotencyRecords.delete(compositeKey);
  }

  // ============================================================================
  // 4.2 — Server-Controlled Job Definition Registry
  // ============================================================================

  public registerServerJobDefinition(
    def: Omit<JobDefinitionRecord, 'createdAt' | 'updatedAt'>,
    handler: (job: JobInstanceRecord) => Promise<{ resultReference: string }> | { resultReference: string },
  ): JobDefinitionRecord {
    const nowIso = new Date().toISOString();
    const record: JobDefinitionRecord = {
      ...def,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.jobDefinitions.set(record.jobType, record);
    this.serverHandlers.set(record.handlerReference, handler);
    return structuredClone(record);
  }

  public listJobDefinitions(): JobDefinitionRecord[] {
    return Array.from(this.jobDefinitions.values()).map((d) => structuredClone(d));
  }

  public getJobDefinition(jobType: string): JobDefinitionRecord {
    const def = this.jobDefinitions.get((jobType ?? '').trim());
    if (!def) {
      throw new PlatformApplicationError({
        code: 'JOB_DEFINITION_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Job definition '${jobType}' is not registered.`,
      });
    }
    return structuredClone(def);
  }

  // ============================================================================
  // 4.3, 4.4, 4.8 & 5.8 — Job Submission, Backpressure, Priority & Execution
  // ============================================================================

  public evaluateBackpressureAdmission(
    priority: JobPriority,
    tenantId?: string | null,
  ): AdmissionDecision {
    const activeAndQueued = Array.from(this.jobs.values()).filter(
      (j) => j.status === 'QUEUED' || j.status === 'RUNNING' || j.status === 'RETRY_WAIT',
    );
    const currentQueueDepth = activeAndQueued.length;
    const tenantActiveJobs = tenantId
      ? activeAndQueued.filter((j) => j.tenantId === tenantId).length
      : 0;

    // Rule 5.8: Never silently discard CRITICAL jobs
    if (priority === 'CRITICAL') {
      return {
        admitted: true,
        action: 'ADMITTED',
        reason: 'CRITICAL priority bypasses noncritical backpressure deferral.',
        currentQueueDepth,
        tenantActiveJobs,
      };
    }

    if (tenantId && tenantActiveJobs >= this.backpressureConfig.maxTenantActiveJobs) {
      return {
        admitted: false,
        action: 'REJECTED_BACKPRESSURE',
        reason: `Tenant '${tenantId}' reached maximum concurrent job quota (${this.backpressureConfig.maxTenantActiveJobs}).`,
        currentQueueDepth,
        tenantActiveJobs,
      };
    }

    if (currentQueueDepth >= this.backpressureConfig.maxGlobalQueueDepth) {
      return {
        admitted: false,
        action: 'REJECTED_BACKPRESSURE',
        reason: `Global queue depth (${currentQueueDepth}) reached threshold (${this.backpressureConfig.maxGlobalQueueDepth}).`,
        currentQueueDepth,
        tenantActiveJobs,
      };
    }

    if (
      priority === 'LOW' &&
      currentQueueDepth >= this.backpressureConfig.deferLowPriorityAboveDepth
    ) {
      return {
        admitted: true,
        action: 'DEFERRED_LOW_PRIORITY',
        reason: `Low-priority job deferred due to queue depth (${currentQueueDepth}).`,
        currentQueueDepth,
        tenantActiveJobs,
      };
    }

    return {
      admitted: true,
      action: 'ADMITTED',
      reason: 'Within capacity budgets.',
      currentQueueDepth,
      tenantActiveJobs,
    };
  }

  public submitJob(input: {
    jobType: string;
    idempotencyKey: string;
    inputReference: string;
    requestPayloadForFingerprint?: unknown;
    priority?: JobPriority;
    tenantId?: string | null;
    organizationId?: string | null;
    actorId?: string | null;
    authorizedSystemService?: boolean;
    correlationId: string;
    causationId?: string | null;
    scheduledAt?: string;
  }): JobInstanceRecord {
    const def = this.getJobDefinition(input.jobType);
    if (!def.enabled) {
      throw new PlatformApplicationError({
        code: 'JOB_TYPE_DISABLED',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        owningModule: 'distributed-background-processing',
        message: `Job type '${def.jobType}' is currently disabled.`,
      });
    }

    // Rule 3.9: Validate tenant context against authoritative Employee 74 tenancy store
    const tenantId = input.tenantId?.trim() || null;
    if (def.tenantScope === 'TENANT_SCOPED' && !tenantId) {
      throw new PlatformApplicationError({
        code: 'TENANT_CONTEXT_REQUIRED',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'distributed-background-processing',
        message: `Job type '${def.jobType}' requires a verified tenantId.`,
      });
    }
    if (tenantId) {
      verifyBackgroundOperationTenantScope(this.tenancyStore, {
        claimedTenantId: tenantId,
        initiatingActorId: input.actorId,
        authorizedSystemService: input.authorizedSystemService ?? false,
      });
    }

    const idemCheck = this.acquireOrVerifyIdempotency({
      idempotencyKey: input.idempotencyKey,
      operationScope: `job:${def.jobType}`,
      tenantScope: tenantId,
      actorScope: input.actorId ?? null,
      requestPayload: input.requestPayloadForFingerprint ?? {
        jobType: def.jobType,
        inputReference: input.inputReference,
        tenantId,
      },
    });

    // If duplicate submission with same idempotencyKey & payload, return existing job instance without duplicating
    if (idemCheck.status !== 'NEW') {
      for (const existingJob of this.jobs.values()) {
        if (
          existingJob.jobType === def.jobType &&
          existingJob.idempotencyKey === input.idempotencyKey.trim() &&
          (existingJob.tenantId ?? null) === tenantId
        ) {
          return structuredClone(existingJob);
        }
      }
    }

    const priority = input.priority ?? def.priority;
    const admission = this.evaluateBackpressureAdmission(priority, tenantId);
    if (!admission.admitted) {
      throw new PlatformApplicationError({
        code: 'QUEUE_BACKPRESSURE_LIMIT_EXCEEDED',
        category: 'RESOURCE_EXHAUSTED',
        httpStatus: 429,
        retryable: true,
        owningModule: 'distributed-background-processing',
        message: admission.reason,
      });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const scheduledAt =
      admission.action === 'DEFERRED_LOW_PRIORITY'
        ? new Date(nowMs + 30000).toISOString()
        : input.scheduledAt ?? nowIso;

    const job: JobInstanceRecord = {
      jobId: `job_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      jobType: def.jobType,
      jobVersion: def.jobVersion,
      status: 'QUEUED',
      priority,
      tenantId,
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      idempotencyKey: input.idempotencyKey.trim(),
      inputReference: input.inputReference.trim(),
      resultReference: null,
      attemptCount: 0,
      maxAttempts: def.retryPolicy.maxAttempts,
      scheduledAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseRenewalCount: 0,
      lastErrorCode: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      recordVersion: 1,
    };

    this.jobs.set(job.jobId, job);
    this.queueAdapter.enqueueMessage({
      jobId: job.jobId,
      jobType: job.jobType,
      priority: job.priority,
      correlationId: job.correlationId,
    });

    return structuredClone(job);
  }

  public getJobById(jobId: string): JobInstanceRecord {
    const job = this.jobs.get((jobId ?? '').trim());
    if (!job) {
      throw new PlatformApplicationError({
        code: 'JOB_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Job '${jobId}' not found.`,
      });
    }
    return structuredClone(job);
  }

  public listJobs(params?: {
    limit?: number;
    cursor?: string;
    status?: JobInstanceStatus;
    tenantId?: string;
  }): { items: JobInstanceRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.jobs.values())
      .filter((j) => {
        if (params?.status && j.status !== params.status) return false;
        if (params?.tenantId && j.tenantId !== params.tenantId) return false;
        return true;
      })
      .sort((a, b) => a.jobId.localeCompare(b.jobId));
    const filtered = decoded ? all.filter((j) => j.jobId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((j) => structuredClone(j));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({ sortValue: last.jobId, docId: last.jobId, direction: 'asc' })
          : null,
    };
  }

  // ============================================================================
  // 4.7 — Worker Registration, Exclusive Leases & Crash Recovery
  // ============================================================================

  public registerWorker(input: {
    workerId?: string;
    workerType: string;
    capabilities: string[];
    environment?: string;
    maximumConcurrency?: number;
  }): WorkerRecord {
    const nowIso = new Date().toISOString();
    const workerId = input.workerId?.trim() || `wrk_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const record: WorkerRecord = {
      workerId,
      workerType: input.workerType.trim(),
      capabilities: input.capabilities,
      environment: input.environment ?? 'development',
      status: 'READY',
      lastHeartbeatAt: nowIso,
      leaseCount: 0,
      maximumConcurrency: Math.min(32, Math.max(1, input.maximumConcurrency ?? 4)),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.workers.set(workerId, record);
    return structuredClone(record);
  }

  public listWorkers(): WorkerRecord[] {
    return Array.from(this.workers.values()).map((w) => structuredClone(w));
  }

  /**
   * Claims a specific job or next highest-priority eligible job with an exclusive lease.
   * Safe under duplicate delivery: if the job is already COMPLETED, returns null/no-op.
   */
  public claimJobLease(
    workerId: string,
    targetJobId?: string,
    nowMs: number = Date.now(),
  ): JobInstanceRecord | null {
    const worker = this.workers.get(workerId);
    if (!worker || (worker.status !== 'READY' && worker.status !== 'BUSY')) {
      throw new PlatformApplicationError({
        code: 'WORKER_NOT_READY',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        owningModule: 'distributed-background-processing',
        message: `Worker '${workerId}' is not registered or not in READY/BUSY state.`,
      });
    }
    if (worker.leaseCount >= worker.maximumConcurrency) {
      return null;
    }

    let candidate: JobInstanceRecord | undefined;
    if (targetJobId) {
      const job = this.jobs.get(targetJobId);
      if (!job) return null;
      // Duplicate queue message delivery after job already completed -> safe no-op
      if (job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'DEAD_LETTERED') {
        return null;
      }
      const leaseExpired =
        job.leaseExpiresAt !== null && nowMs > Date.parse(job.leaseExpiresAt);
      if (
        job.status === 'RUNNING' &&
        job.leaseOwner &&
        job.leaseOwner !== workerId &&
        !leaseExpired
      ) {
        throw new PlatformApplicationError({
          code: 'JOB_LEASE_ALREADY_HELD',
          category: 'CONFLICT',
          httpStatus: 409,
          owningModule: 'distributed-background-processing',
          message: `Job '${job.jobId}' is already exclusively leased by worker '${job.leaseOwner}'.`,
        });
      }
      candidate = job;
    } else {
      // Priority + aging fairness selection
      const eligible = Array.from(this.jobs.values()).filter((j) => {
        if (j.status === 'QUEUED' || j.status === 'RETRY_WAIT') {
          return Date.parse(j.scheduledAt) <= nowMs;
        }
        if (j.status === 'RUNNING' && j.leaseExpiresAt && nowMs > Date.parse(j.leaseExpiresAt)) {
          return true; // Expired lease recovery
        }
        return false;
      });
      eligible.sort((a, b) => {
        const ageBonusA = Math.min(250, Math.floor((nowMs - Date.parse(a.createdAt)) / 1000));
        const ageBonusB = Math.min(250, Math.floor((nowMs - Date.parse(b.createdAt)) / 1000));
        const scoreA = PRIORITY_WEIGHT[a.priority] + ageBonusA;
        const scoreB = PRIORITY_WEIGHT[b.priority] + ageBonusB;
        return scoreB - scoreA;
      });
      candidate = eligible[0];
    }

    if (!candidate) return null;
    const def = this.getJobDefinition(candidate.jobType);
    const nowIso = new Date(nowMs).toISOString();
    const leaseExpiresAt = new Date(nowMs + def.timeoutPolicy.leaseDurationMs).toISOString();

    const updatedJob: JobInstanceRecord = {
      ...candidate,
      status: 'RUNNING',
      attemptCount: candidate.attemptCount + 1,
      startedAt: candidate.startedAt ?? nowIso,
      leaseOwner: workerId,
      leaseExpiresAt,
      leaseRenewalCount: 0,
      updatedAt: nowIso,
      recordVersion: candidate.recordVersion + 1,
    };

    this.jobs.set(updatedJob.jobId, updatedJob);
    worker.leaseCount += 1;
    worker.status = worker.leaseCount >= worker.maximumConcurrency ? 'BUSY' : 'READY';
    worker.lastHeartbeatAt = nowIso;
    worker.updatedAt = nowIso;
    this.workers.set(workerId, worker);

    return structuredClone(updatedJob);
  }

  public renewJobLease(
    workerId: string,
    jobId: string,
    nowMs: number = Date.now(),
  ): JobInstanceRecord {
    const job = this.getJobById(jobId);
    if (job.status !== 'RUNNING' || job.leaseOwner !== workerId) {
      throw new PlatformApplicationError({
        code: 'JOB_LEASE_EXPIRED',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'distributed-background-processing',
        message: `Worker '${workerId}' does not hold an active lease on job '${jobId}'.`,
      });
    }
    if (job.leaseExpiresAt && nowMs > Date.parse(job.leaseExpiresAt)) {
      throw new PlatformApplicationError({
        code: 'JOB_LEASE_EXPIRED',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'distributed-background-processing',
        message: `Lease on job '${jobId}' has already expired.`,
      });
    }
    const def = this.getJobDefinition(job.jobType);
    if (job.leaseRenewalCount >= def.timeoutPolicy.maxLeaseRenewals) {
      throw new PlatformApplicationError({
        code: 'MAX_LEASE_RENEWALS_EXCEEDED',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        owningModule: 'distributed-background-processing',
        message: `Job '${jobId}' reached maxLeaseRenewals (${def.timeoutPolicy.maxLeaseRenewals}).`,
      });
    }

    const updated: JobInstanceRecord = {
      ...job,
      leaseExpiresAt: new Date(nowMs + def.timeoutPolicy.leaseDurationMs).toISOString(),
      leaseRenewalCount: job.leaseRenewalCount + 1,
      updatedAt: new Date(nowMs).toISOString(),
      recordVersion: job.recordVersion + 1,
    };
    this.jobs.set(jobId, updated);
    return structuredClone(updated);
  }

  public completeJobWithLease(
    workerId: string,
    jobId: string,
    expectedRecordVersion: number,
    resultReference: string,
    nowMs: number = Date.now(),
  ): JobInstanceRecord {
    const job = this.getJobById(jobId);
    // Block stale worker from overwriting newer job state
    if (
      job.leaseOwner !== workerId ||
      job.recordVersion !== expectedRecordVersion ||
      (job.leaseExpiresAt && nowMs > Date.parse(job.leaseExpiresAt))
    ) {
      throw new PlatformApplicationError({
        code: 'JOB_LEASE_EXPIRED',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'distributed-background-processing',
        message: `Stale worker '${workerId}' (expectedVersion=${expectedRecordVersion}, actual=${job.recordVersion}) cannot overwrite job '${jobId}'.`,
      });
    }

    const nowIso = new Date(nowMs).toISOString();
    const updated: JobInstanceRecord = {
      ...job,
      status: 'COMPLETED',
      resultReference,
      completedAt: nowIso,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      recordVersion: job.recordVersion + 1,
    };
    this.jobs.set(jobId, updated);

    const worker = this.workers.get(workerId);
    if (worker) {
      worker.leaseCount = Math.max(0, worker.leaseCount - 1);
      worker.status = 'READY';
      worker.updatedAt = nowIso;
      this.workers.set(workerId, worker);
    }

    this.finalizeIdempotencyRecord({
      idempotencyKey: job.idempotencyKey,
      operationScope: `job:${job.jobType}`,
      tenantScope: job.tenantId ?? null,
      executionStatus: 'COMPLETED',
      resultReference,
    });

    return structuredClone(updated);
  }

  public failJobAttempt(
    workerId: string,
    jobId: string,
    error: { errorCode: string; retryable?: boolean },
    nowMs: number = Date.now(),
  ): JobInstanceRecord {
    const job = this.getJobById(jobId);
    if (job.leaseOwner !== workerId) {
      throw new PlatformApplicationError({
        code: 'JOB_LEASE_EXPIRED',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'distributed-background-processing',
        message: `Worker '${workerId}' does not own lease for job '${jobId}'.`,
      });
    }

    const def = this.getJobDefinition(job.jobType);
    const isPermanentError =
      NON_RETRYABLE_ERROR_CODES.has(error.errorCode) || error.retryable === false;
    const canRetry = !isPermanentError && job.attemptCount < job.maxAttempts;
    const nowIso = new Date(nowMs).toISOString();

    let nextStatus: JobInstanceStatus;
    let nextScheduledAt = job.scheduledAt;

    if (canRetry) {
      nextStatus = 'RETRY_WAIT';
      const expDelay = Math.min(
        def.retryPolicy.maxDelayMs,
        def.retryPolicy.baseDelayMs * Math.pow(def.retryPolicy.backoffMultiplier, job.attemptCount - 1),
      );
      nextScheduledAt = new Date(nowMs + expDelay).toISOString();
    } else {
      nextStatus = 'DEAD_LETTERED';
    }

    const updated: JobInstanceRecord = {
      ...job,
      status: nextStatus,
      scheduledAt: nextScheduledAt,
      failedAt: nextStatus === 'DEAD_LETTERED' ? nowIso : job.failedAt,
      lastErrorCode: error.errorCode,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      recordVersion: job.recordVersion + 1,
    };
    this.jobs.set(jobId, updated);

    const worker = this.workers.get(workerId);
    if (worker) {
      worker.leaseCount = Math.max(0, worker.leaseCount - 1);
      worker.status = 'READY';
      worker.updatedAt = nowIso;
      this.workers.set(workerId, worker);
    }

    this.finalizeIdempotencyRecord({
      idempotencyKey: job.idempotencyKey,
      operationScope: `job:${job.jobType}`,
      tenantScope: job.tenantId ?? null,
      executionStatus: canRetry ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
    });

    return structuredClone(updated);
  }

  public cancelJob(jobId: string): JobInstanceRecord {
    const job = this.getJobById(jobId);
    if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
      return job;
    }
    const nowIso = new Date().toISOString();
    const updated: JobInstanceRecord = {
      ...job,
      status: 'CANCELLED',
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      recordVersion: job.recordVersion + 1,
    };
    this.jobs.set(jobId, updated);
    return structuredClone(updated);
  }

  public retryDeadLetteredJob(jobId: string): JobInstanceRecord {
    const job = this.getJobById(jobId);
    if (job.status !== 'DEAD_LETTERED' && job.status !== 'FAILED') {
      throw new PlatformApplicationError({
        code: 'JOB_NOT_ELIGIBLE_FOR_MANUAL_RETRY',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        owningModule: 'distributed-background-processing',
        message: `Job '${jobId}' in status '${job.status}' cannot be manually retried.`,
      });
    }
    const nowIso = new Date().toISOString();
    const updated: JobInstanceRecord = {
      ...job,
      status: 'QUEUED',
      attemptCount: 0,
      scheduledAt: nowIso,
      failedAt: null,
      lastErrorCode: null,
      updatedAt: nowIso,
      recordVersion: job.recordVersion + 1,
    };
    this.jobs.set(jobId, updated);
    this.finalizeIdempotencyRecord({
      idempotencyKey: job.idempotencyKey,
      operationScope: `job:${job.jobType}`,
      tenantScope: job.tenantId ?? null,
      executionStatus: 'FAILED_RETRYABLE',
    });
    return structuredClone(updated);
  }

  // ============================================================================
  // 4.5 — Transactional Outbox Pattern & Idempotent Consumer Deduplication
  // ============================================================================

  public appendTransactionalOutbox(input: {
    eventId?: string;
    eventType: string;
    eventVersion?: string;
    ownerModule: string;
    aggregateType: string;
    aggregateId: string;
    tenantId?: string | null;
    correlationId: string;
    causationId?: string | null;
    payloadReference: string;
  }): TransactionalOutboxRecord {
    const nowIso = new Date().toISOString();
    const record: TransactionalOutboxRecord = {
      outboxId: `out_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      eventId: input.eventId ?? `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      eventType: input.eventType.trim(),
      eventVersion: input.eventVersion ?? '1.0.0',
      ownerModule: input.ownerModule.trim(),
      aggregateType: input.aggregateType.trim(),
      aggregateId: input.aggregateId.trim(),
      tenantId: input.tenantId ?? null,
      correlationId: input.correlationId.trim(),
      causationId: input.causationId ?? null,
      payloadReference: input.payloadReference.trim(),
      publicationStatus: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: nowIso,
      publishedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.outbox.set(record.outboxId, record);
    return structuredClone(record);
  }

  public publishOutboxRecord(
    outboxId: string,
    maxAttempts = 3,
    nowMs: number = Date.now(),
  ): TransactionalOutboxRecord {
    const existing = this.outbox.get((outboxId ?? '').trim());
    if (!existing) {
      throw new PlatformApplicationError({
        code: 'OUTBOX_RECORD_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Outbox record '${outboxId}' not found.`,
      });
    }
    if (existing.publicationStatus === 'PUBLISHED') {
      return structuredClone(existing);
    }

    const nowIso = new Date(nowMs).toISOString();
    const attemptCount = existing.attemptCount + 1;
    try {
      this.queueAdapter.publishOutboxEvent(existing);
      const published: TransactionalOutboxRecord = {
        ...existing,
        publicationStatus: 'PUBLISHED',
        attemptCount,
        publishedAt: nowIso,
        updatedAt: nowIso,
      };
      this.outbox.set(outboxId, published);
      return structuredClone(published);
    } catch {
      const nextStatus = attemptCount >= maxAttempts ? 'DEAD_LETTERED' : 'RETRY_WAIT';
      const failed: TransactionalOutboxRecord = {
        ...existing,
        publicationStatus: nextStatus,
        attemptCount,
        nextAttemptAt: new Date(nowMs + attemptCount * 1000).toISOString(),
        updatedAt: nowIso,
      };
      this.outbox.set(outboxId, failed);
      return structuredClone(failed);
    }
  }

  public consumeOutboxEventIdempotently(
    eventId: string,
    consumerScope: string,
    effectFn: () => void,
  ): { executed: boolean; duplicateIgnored: boolean } {
    const key = `${consumerScope}:${eventId}`;
    if (this.consumedEventIds.has(key)) {
      return { executed: false, duplicateIgnored: true };
    }
    effectFn();
    this.consumedEventIds.add(key);
    return { executed: true, duplicateIgnored: false };
  }

  public listOutboxRecords(params?: {
    limit?: number;
    cursor?: string;
    status?: TransactionalOutboxRecord['publicationStatus'];
  }): { items: TransactionalOutboxRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.outbox.values())
      .filter((o) => (!params?.status ? true : o.publicationStatus === params.status))
      .sort((a, b) => a.outboxId.localeCompare(b.outboxId));
    const filtered = decoded ? all.filter((o) => o.outboxId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((o) => structuredClone(o));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({ sortValue: last.outboxId, docId: last.outboxId, direction: 'asc' })
          : null,
    };
  }
}

let defaultProcessingStore: DistributedProcessingStore | null = null;

export function getDefaultDistributedProcessingStore(): DistributedProcessingStore {
  if (!defaultProcessingStore) {
    defaultProcessingStore = new DistributedProcessingStore();
  }
  return defaultProcessingStore;
}
