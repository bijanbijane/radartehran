/**
 * @file server/modules/distributed-processing/workflowsSagaAndSchedulerEngine.ts
 * @description Phase 5 — Employee 75: Durable Workflows, Step Checkpointing,
 * Saga Orchestration & Domain-Respecting Compensation Engine, Provider-Independent Scheduling,
 * Missed-Window & Exclusive-Execution Safety, and Business Workflow Integrations.
 */

import { randomUUID } from 'node:crypto';
import { decodePaginationCursor, encodePaginationCursor, normalizePaginationParams } from '../core';
import { PlatformApplicationError } from '../platform-foundation';
import { getDefaultDistributedProcessingStore, type DistributedProcessingStore } from './jobsOutboxAndWorkersEngine';
import type {
  MissedWindowPolicy,
  ScheduleExecutionCadence,
  ScheduledOperationRecord,
  WorkflowDefinitionRecord,
  WorkflowInstanceRecord,
  WorkflowStepCheckpoint,
} from './types';

const VALID_TIMEZONES = new Set<string>([
  'Asia/Tehran',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'America/New_York',
]);

/**
 * 5.10 — Authoritative Business Workflow Integrations (coordinating domain-owned handlers without replacing them)
 */
export const INITIAL_WORKFLOW_DEFINITIONS: readonly WorkflowDefinitionRecord[] = [
  {
    workflowType: 'tenant.provisioning.workflow',
    workflowVersion: '1.0.0',
    ownerModule: 'enterprise-multi-tenancy',
    description: 'Coordinate tenant registration, primary organization creation, owner membership, and entitlement binding.',
    steps: [
      {
        stepCode: 'create_tenant_record',
        ownerModule: 'enterprise-multi-tenancy',
        dependsOnSteps: [],
        forwardActionReference: 'enterprise-multi-tenancy.actions.createTenant',
        compensationActionReference: 'enterprise-multi-tenancy.compensations.suspendPendingTenant',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 10000,
        maxRetries: 2,
      },
      {
        stepCode: 'create_primary_organization',
        ownerModule: 'enterprise-multi-tenancy',
        dependsOnSteps: ['create_tenant_record'],
        forwardActionReference: 'enterprise-multi-tenancy.actions.createPrimaryOrganization',
        compensationActionReference: 'enterprise-multi-tenancy.compensations.suspendPrimaryOrganization',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 10000,
        maxRetries: 2,
      },
      {
        stepCode: 'bind_billing_entitlements',
        ownerModule: 'marketplace-billing-payments',
        dependsOnSteps: ['create_primary_organization'],
        forwardActionReference: 'marketplace-billing-payments.actions.bindDefaultPlan',
        compensationActionReference: 'marketplace-billing-payments.compensations.revokeDefaultPlan',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 10000,
        maxRetries: 2,
      },
    ],
    inputSchemaReference: 'TenantProvisioningWorkflowInputSchema',
    outputSchemaReference: 'TenantProvisioningWorkflowOutputSchema',
    timeoutPolicy: { overallTimeoutMs: 60000 },
    retryPolicy: { maxStepRetries: 2, backoffMs: 500 },
    authorizationPermission: 'tenant.manage',
    tenantScope: 'OPTIONAL_TENANT',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
  {
    workflowType: 'listing.publication.workflow',
    workflowVersion: '1.0.0',
    ownerModule: 'listing-lifecycle',
    description: 'Coordinate Employee 58 listing validation, Employee 59 hedonic valuation seal, and Employee 69 search projection.',
    steps: [
      {
        stepCode: 'validate_listing_authority',
        ownerModule: 'listing-lifecycle',
        dependsOnSteps: [],
        forwardActionReference: 'listing-lifecycle.actions.validateListing',
        compensationActionReference: 'listing-lifecycle.compensations.revertDraftStatus',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 8000,
        maxRetries: 2,
      },
      {
        stepCode: 'compute_hedonic_valuation_seal',
        ownerModule: 'property-valuation',
        dependsOnSteps: ['validate_listing_authority'],
        forwardActionReference: 'property-valuation.actions.computeHedonicSeal',
        compensationActionReference: null,
        compensationEligible: false,
        idempotencyRequired: true,
        timeoutMs: 8000,
        maxRetries: 2,
      },
      {
        stepCode: 'project_to_search_index',
        ownerModule: 'search-discovery',
        dependsOnSteps: ['compute_hedonic_valuation_seal'],
        forwardActionReference: 'search-discovery.actions.indexPublishedListing',
        compensationActionReference: 'search-discovery.compensations.removeListingFromIndex',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 8000,
        maxRetries: 3,
      },
    ],
    inputSchemaReference: 'ListingPublicationWorkflowInputSchema',
    outputSchemaReference: 'ListingPublicationWorkflowOutputSchema',
    timeoutPolicy: { overallTimeoutMs: 45000 },
    retryPolicy: { maxStepRetries: 2, backoffMs: 400 },
    authorizationPermission: 'listing.write',
    tenantScope: 'OPTIONAL_TENANT',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
  {
    workflowType: 'backup.execution.workflow',
    workflowVersion: '1.0.0',
    ownerModule: 'backup-disaster-recovery',
    description: 'Coordinate Employee 77 backup snapshot, manifest checksum verification, and Employee 72 retention tagging.',
    steps: [
      {
        stepCode: 'capture_resource_snapshot',
        ownerModule: 'backup-disaster-recovery',
        dependsOnSteps: [],
        forwardActionReference: 'backup-disaster-recovery.actions.captureSnapshot',
        compensationActionReference: 'backup-disaster-recovery.compensations.cleanupPartialSnapshot',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 20000,
        maxRetries: 2,
      },
      {
        stepCode: 'verify_manifest_integrity',
        ownerModule: 'backup-disaster-recovery',
        dependsOnSteps: ['capture_resource_snapshot'],
        forwardActionReference: 'backup-disaster-recovery.actions.verifyManifest',
        compensationActionReference: 'backup-disaster-recovery.compensations.markManifestFailed',
        compensationEligible: true,
        idempotencyRequired: true,
        timeoutMs: 15000,
        maxRetries: 2,
      },
    ],
    inputSchemaReference: 'BackupExecutionWorkflowInputSchema',
    outputSchemaReference: 'BackupExecutionWorkflowOutputSchema',
    timeoutPolicy: { overallTimeoutMs: 90000 },
    retryPolicy: { maxStepRetries: 2, backoffMs: 1000 },
    authorizationPermission: 'backup.manage',
    tenantScope: 'OPTIONAL_TENANT',
    enabled: true,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
  },
];

export class DurableWorkflowAndSchedulerEngine {
  private workflowDefinitions = new Map<string, WorkflowDefinitionRecord>();
  private workflows = new Map<string, WorkflowInstanceRecord>();
  private schedules = new Map<string, ScheduledOperationRecord>();
  private scheduleWindowExecutedKeys = new Set<string>();
  private readonly processingStore: DistributedProcessingStore;

  constructor(processingStore?: DistributedProcessingStore) {
    this.processingStore = processingStore ?? getDefaultDistributedProcessingStore();
    for (const def of INITIAL_WORKFLOW_DEFINITIONS) {
      this.workflowDefinitions.set(def.workflowType, structuredClone(def));
    }
  }

  public registerWorkflowDefinition(def: WorkflowDefinitionRecord): WorkflowDefinitionRecord {
    if (!def.workflowType || !Array.isArray(def.steps) || def.steps.length === 0) {
      throw new PlatformApplicationError({
        code: 'INVALID_WORKFLOW_DEFINITION',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'distributed-background-processing',
        message: 'Workflow definition requires a valid workflowType and at least one step.',
      });
    }
    this.workflowDefinitions.set(def.workflowType, structuredClone(def));
    return structuredClone(def);
  }

  public getWorkflowDefinition(workflowType: string): WorkflowDefinitionRecord {
    const def = this.workflowDefinitions.get((workflowType ?? '').trim());
    if (!def) {
      throw new PlatformApplicationError({
        code: 'WORKFLOW_DEFINITION_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Workflow definition '${workflowType}' not found.`,
      });
    }
    return structuredClone(def);
  }

  public listWorkflowDefinitions(): WorkflowDefinitionRecord[] {
    return Array.from(this.workflowDefinitions.values()).map((d) => structuredClone(d));
  }

  // ============================================================================
  // 5.4 & 5.5 — Durable Workflow Execution, Checkpointing, Resume & Saga Compensation
  // ============================================================================

  public startWorkflow(input: {
    workflowType: string;
    inputReference: string;
    tenantId?: string | null;
    organizationId?: string | null;
    actorId?: string | null;
    correlationId: string;
  }): WorkflowInstanceRecord {
    const def = this.getWorkflowDefinition(input.workflowType);
    if (!def.enabled) {
      throw new PlatformApplicationError({
        code: 'WORKFLOW_DISABLED',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        owningModule: 'distributed-background-processing',
        message: `Workflow '${def.workflowType}' is disabled.`,
      });
    }

    const nowIso = new Date().toISOString();
    const firstStep = def.steps[0]?.stepCode ?? null;
    const instance: WorkflowInstanceRecord = {
      workflowId: `wf_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      workflowType: def.workflowType,
      workflowVersion: def.workflowVersion,
      status: 'RUNNING',
      tenantId: input.tenantId ?? null,
      organizationId: input.organizationId ?? null,
      actorId: input.actorId ?? null,
      correlationId: input.correlationId,
      currentStep: firstStep,
      completedSteps: [],
      failedStep: null,
      compensationState: 'NONE',
      compensatedSteps: [],
      checkpoints: {},
      inputReference: input.inputReference.trim(),
      resultReference: null,
      startedAt: nowIso,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      recordVersion: 1,
    };

    this.workflows.set(instance.workflowId, instance);
    return structuredClone(instance);
  }

  public getWorkflowById(workflowId: string): WorkflowInstanceRecord {
    const wf = this.workflows.get((workflowId ?? '').trim());
    if (!wf) {
      throw new PlatformApplicationError({
        code: 'WORKFLOW_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Workflow '${workflowId}' not found.`,
      });
    }
    return structuredClone(wf);
  }

  public listWorkflows(params?: {
    limit?: number;
    cursor?: string;
    status?: WorkflowInstanceRecord['status'];
  }): { items: WorkflowInstanceRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 25, maxLimit: 100 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.workflows.values())
      .filter((w) => (!params?.status ? true : w.status === params.status))
      .sort((a, b) => a.workflowId.localeCompare(b.workflowId));
    const filtered = decoded ? all.filter((w) => w.workflowId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((w) => structuredClone(w));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({ sortValue: last.workflowId, docId: last.workflowId, direction: 'asc' })
          : null,
    };
  }

  /**
   * Executes or resumes the current workflow step, persisting a durable checkpoint.
   * If a step fails and cannot be retried, triggers reverse-order Saga compensation on completed eligible steps.
   */
  public executeNextWorkflowStep(
    workflowId: string,
    options?: {
      simulateFailureOnStep?: string;
      simulateCompensationFailureOnStep?: string;
      durationMs?: number;
    },
  ): WorkflowInstanceRecord {
    const wf = this.getWorkflowById(workflowId);
    if (
      wf.status === 'COMPLETED' ||
      wf.status === 'CANCELLED' ||
      wf.status === 'MANUAL_INTERVENTION_REQUIRED'
    ) {
      return wf;
    }

    const def = this.getWorkflowDefinition(wf.workflowType);
    const nextStepSpec = def.steps.find((s) => !wf.completedSteps.includes(s.stepCode));
    const nowIso = new Date().toISOString();

    if (!nextStepSpec) {
      const completedWf: WorkflowInstanceRecord = {
        ...wf,
        status: 'COMPLETED',
        currentStep: null,
        resultReference: `wf_res://${wf.workflowType}/${wf.workflowId}`,
        completedAt: nowIso,
        updatedAt: nowIso,
        recordVersion: wf.recordVersion + 1,
      };
      this.workflows.set(workflowId, completedWf);
      return structuredClone(completedWf);
    }

    // Verify all upstream step dependencies are satisfied
    for (const depStep of nextStepSpec.dependsOnSteps) {
      if (!wf.completedSteps.includes(depStep)) {
        throw new PlatformApplicationError({
          code: 'WORKFLOW_STEP_DEPENDENCY_UNSATISFIED',
          category: 'BUSINESS_RULE',
          httpStatus: 422,
          owningModule: 'distributed-background-processing',
          message: `Step '${nextStepSpec.stepCode}' requires step '${depStep}' to be completed first.`,
        });
      }
    }

    const prevCheckpoint = wf.checkpoints[nextStepSpec.stepCode];
    const attemptCount = (prevCheckpoint?.attemptCount ?? 0) + 1;

    if (options?.simulateFailureOnStep === nextStepSpec.stepCode) {
      const failedCheckpoint: WorkflowStepCheckpoint = {
        stepCode: nextStepSpec.stepCode,
        status: 'FAILED',
        attemptCount,
        durationMs: options?.durationMs ?? 25,
        outputReference: null,
        errorCode: 'WORKFLOW_STEP_FAILED',
        checkpointedAt: nowIso,
      };
      wf.checkpoints[nextStepSpec.stepCode] = failedCheckpoint;
      wf.currentStep = nextStepSpec.stepCode;

      if (attemptCount <= nextStepSpec.maxRetries) {
        wf.status = 'WAITING';
        wf.updatedAt = nowIso;
        wf.recordVersion += 1;
        this.workflows.set(workflowId, wf);
        return structuredClone(wf);
      }

      // Max retries exhausted -> transition to Saga compensation in reverse order of completedSteps
      wf.failedStep = nextStepSpec.stepCode;
      return this.runSagaCompensation(wf, def, options?.simulateCompensationFailureOnStep);
    }

    const okCheckpoint: WorkflowStepCheckpoint = {
      stepCode: nextStepSpec.stepCode,
      status: 'COMPLETED',
      attemptCount,
      durationMs: options?.durationMs ?? 15,
      outputReference: `step_out://${wf.workflowId}/${nextStepSpec.stepCode}`,
      errorCode: null,
      checkpointedAt: nowIso,
    };
    wf.checkpoints[nextStepSpec.stepCode] = okCheckpoint;
    wf.completedSteps.push(nextStepSpec.stepCode);

    const remaining = def.steps.find((s) => !wf.completedSteps.includes(s.stepCode));
    if (!remaining) {
      wf.status = 'COMPLETED';
      wf.currentStep = null;
      wf.resultReference = `wf_res://${wf.workflowType}/${wf.workflowId}`;
      wf.completedAt = nowIso;
    } else {
      wf.status = 'RUNNING';
      wf.currentStep = remaining.stepCode;
    }
    wf.updatedAt = nowIso;
    wf.recordVersion += 1;
    this.workflows.set(workflowId, wf);
    return structuredClone(wf);
  }

  private runSagaCompensation(
    wf: WorkflowInstanceRecord,
    def: WorkflowDefinitionRecord,
    simulateCompensationFailureOnStep?: string,
  ): WorkflowInstanceRecord {
    const nowIso = new Date().toISOString();
    wf.status = 'COMPENSATING';
    wf.compensationState = 'IN_PROGRESS';

    const reversedCompleted = [...wf.completedSteps].reverse();
    for (const stepCode of reversedCompleted) {
      const spec = def.steps.find((s) => s.stepCode === stepCode);
      if (!spec || !spec.compensationEligible || !spec.compensationActionReference) {
        continue;
      }
      if (simulateCompensationFailureOnStep === stepCode) {
        wf.status = 'MANUAL_INTERVENTION_REQUIRED';
        wf.compensationState = 'COMPENSATION_FAILED_MANUAL_REQUIRED';
        wf.checkpoints[stepCode] = {
          ...(wf.checkpoints[stepCode] ?? {
            stepCode,
            attemptCount: 1,
            durationMs: 10,
            outputReference: null,
          }),
          status: 'COMPENSATION_FAILED',
          errorCode: 'SAGA_COMPENSATION_FAILED',
          checkpointedAt: nowIso,
        };
        wf.updatedAt = nowIso;
        wf.recordVersion += 1;
        this.workflows.set(wf.workflowId, wf);
        return structuredClone(wf);
      }

      wf.compensatedSteps.push(stepCode);
      if (wf.checkpoints[stepCode]) {
        wf.checkpoints[stepCode].status = 'COMPENSATED';
      }
    }

    wf.status = 'FAILED';
    wf.compensationState = 'COMPENSATED';
    wf.updatedAt = nowIso;
    wf.recordVersion += 1;
    this.workflows.set(wf.workflowId, wf);
    return structuredClone(wf);
  }

  public cancelWorkflow(workflowId: string): WorkflowInstanceRecord {
    const wf = this.getWorkflowById(workflowId);
    if (wf.status === 'COMPLETED' || wf.status === 'CANCELLED') return wf;
    const updated: WorkflowInstanceRecord = {
      ...wf,
      status: 'CANCELLED',
      currentStep: null,
      updatedAt: new Date().toISOString(),
      recordVersion: wf.recordVersion + 1,
    };
    this.workflows.set(workflowId, updated);
    return structuredClone(updated);
  }

  // ============================================================================
  // 5.6 & 5.7 — Provider-Independent Scheduling & Missed-Window Safety
  // ============================================================================

  public createSchedule(input: {
    scheduleId?: string;
    ownerModule: string;
    operationReference: string;
    jobType: string;
    tenantId?: string | null;
    timezone?: string;
    cadenceType: ScheduleExecutionCadence;
    recurrenceRule?: string | null;
    intervalMinutes?: number | null;
    missedWindowPolicy?: MissedWindowPolicy;
    nextExecutionAt: string;
  }): ScheduledOperationRecord {
    if (this.schedules.size >= 500) {
      throw new PlatformApplicationError({
        code: 'UNBOUNDED_SCHEDULE_CREATION_BLOCKED',
        category: 'RESOURCE_EXHAUSTED',
        httpStatus: 429,
        owningModule: 'distributed-background-processing',
        message: 'Maximum schedule registry limit reached.',
      });
    }

    const tz = (input.timezone ?? 'Asia/Tehran').trim();
    if (!VALID_TIMEZONES.has(tz)) {
      throw new PlatformApplicationError({
        code: 'INVALID_SCHEDULE_TIMEZONE',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'distributed-background-processing',
        message: `Unsupported timezone '${tz}'.`,
      });
    }

    if (!Number.isFinite(Date.parse(input.nextExecutionAt))) {
      throw new PlatformApplicationError({
        code: 'INVALID_SCHEDULE_NEXT_EXECUTION',
        category: 'VALIDATION',
        httpStatus: 400,
        owningModule: 'distributed-background-processing',
        message: 'nextExecutionAt must be a valid ISO-8601 timestamp.',
      });
    }

    this.processingStore.getJobDefinition(input.jobType);

    const nowIso = new Date().toISOString();
    const record: ScheduledOperationRecord = {
      scheduleId: input.scheduleId?.trim() || `sch_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      ownerModule: input.ownerModule.trim(),
      operationReference: input.operationReference.trim(),
      jobType: input.jobType.trim(),
      tenantId: input.tenantId ?? null,
      timezone: tz,
      cadenceType: input.cadenceType,
      recurrenceRule: input.recurrenceRule ?? null,
      intervalMinutes: input.intervalMinutes ?? (input.cadenceType === 'RECURRING' ? 60 : null),
      missedWindowPolicy: input.missedWindowPolicy ?? 'SINGLE_CATCHUP',
      nextExecutionAt: input.nextExecutionAt,
      lastExecutionAt: null,
      executionStatus: 'ACTIVE',
      exclusiveLockOwner: null,
      idempotencyPolicy: 'WINDOW_SCOPED_REQUIRED',
      retryPolicy: { maxAttempts: 3, backoffMs: 1000 },
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.schedules.set(record.scheduleId, record);
    return structuredClone(record);
  }

  public listSchedules(): ScheduledOperationRecord[] {
    return Array.from(this.schedules.values()).map((s) => structuredClone(s));
  }

  /**
   * 5.7 — Triggers a due schedule safely:
   * - Prevents duplicate execution for the same window.
   * - Prevents overlapping exclusive executions.
   * - Never executes an unlimited backlog after downtime (at most 1 catch-up job or skips missed windows).
   */
  public triggerDueSchedule(
    scheduleId: string,
    nowMs: number = Date.now(),
  ): {
    dispatchedJob: ReturnType<DistributedProcessingStore['submitJob']> | null;
    skippedReason: string | null;
    missedWindowsCount: number;
    schedule: ScheduledOperationRecord;
  } {
    const sch = this.schedules.get((scheduleId ?? '').trim());
    if (!sch) {
      throw new PlatformApplicationError({
        code: 'SCHEDULE_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Schedule '${scheduleId}' not found.`,
      });
    }
    if (sch.executionStatus !== 'ACTIVE' || !sch.nextExecutionAt) {
      return {
        dispatchedJob: null,
        skippedReason: `SCHEDULE_${sch.executionStatus}`,
        missedWindowsCount: 0,
        schedule: structuredClone(sch),
      };
    }
    if (sch.exclusiveLockOwner) {
      throw new PlatformApplicationError({
        code: 'OVERLAPPING_EXCLUSIVE_SCHEDULE_EXECUTION',
        category: 'CONFLICT',
        httpStatus: 409,
        owningModule: 'distributed-background-processing',
        message: `Schedule '${scheduleId}' already has an exclusive execution in progress ('${sch.exclusiveLockOwner}').`,
      });
    }

    const scheduledMs = Date.parse(sch.nextExecutionAt);
    if (nowMs < scheduledMs) {
      return {
        dispatchedJob: null,
        skippedReason: 'NOT_YET_DUE',
        missedWindowsCount: 0,
        schedule: structuredClone(sch),
      };
    }

    const windowKey = `${sch.scheduleId}:${sch.nextExecutionAt}`;
    if (this.scheduleWindowExecutedKeys.has(windowKey)) {
      return {
        dispatchedJob: null,
        skippedReason: 'DUPLICATE_WINDOW_ALREADY_EXECUTED',
        missedWindowsCount: 0,
        schedule: structuredClone(sch),
      };
    }

    const intervalMs = (sch.intervalMinutes ?? 60) * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - scheduledMs);
    const missedWindowsCount =
      sch.cadenceType === 'RECURRING' ? Math.floor(elapsedMs / intervalMs) : 0;

    // Advance nextExecutionAt past all missed windows so we never run an unbounded backlog
    const nextFutureMs =
      sch.cadenceType === 'RECURRING'
        ? scheduledMs + (missedWindowsCount + 1) * intervalMs
        : null;

    const nowIso = new Date(nowMs).toISOString();
    if (missedWindowsCount > 0 && sch.missedWindowPolicy === 'SKIP_MISSED') {
      const updatedSkipped: ScheduledOperationRecord = {
        ...sch,
        nextExecutionAt: nextFutureMs ? new Date(nextFutureMs).toISOString() : null,
        updatedAt: nowIso,
        version: sch.version + 1,
      };
      this.schedules.set(scheduleId, updatedSkipped);
      return {
        dispatchedJob: null,
        skippedReason: 'SKIPPED_MISSED_WINDOWS_PER_POLICY',
        missedWindowsCount,
        schedule: structuredClone(updatedSkipped),
      };
    }

    this.scheduleWindowExecutedKeys.add(windowKey);
    const dispatchedJob = this.processingStore.submitJob({
      jobType: sch.jobType,
      idempotencyKey: `sch_win_${windowKey}`,
      inputReference: `schedule://${sch.scheduleId}/${sch.operationReference}`,
      tenantId: sch.tenantId,
      authorizedSystemService: true,
      correlationId: `corr_${sch.scheduleId}_${nowMs}`,
    });

    const updated: ScheduledOperationRecord = {
      ...sch,
      lastExecutionAt: nowIso,
      nextExecutionAt: nextFutureMs ? new Date(nextFutureMs).toISOString() : null,
      executionStatus: sch.cadenceType === 'RECURRING' ? 'ACTIVE' : 'COMPLETED',
      updatedAt: nowIso,
      version: sch.version + 1,
    };
    this.schedules.set(scheduleId, updated);

    return {
      dispatchedJob,
      skippedReason: null,
      missedWindowsCount,
      schedule: structuredClone(updated),
    };
  }

  public updateScheduleStatus(
    scheduleId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED',
  ): ScheduledOperationRecord {
    const sch = this.schedules.get((scheduleId ?? '').trim());
    if (!sch) {
      throw new PlatformApplicationError({
        code: 'SCHEDULE_NOT_FOUND',
        category: 'NOT_FOUND',
        httpStatus: 404,
        owningModule: 'distributed-background-processing',
        message: `Schedule '${scheduleId}' not found.`,
      });
    }
    const updated: ScheduledOperationRecord = {
      ...sch,
      executionStatus: status,
      updatedAt: new Date().toISOString(),
      version: sch.version + 1,
    };
    this.schedules.set(scheduleId, updated);
    return structuredClone(updated);
  }
}

let defaultWorkflowEngine: DurableWorkflowAndSchedulerEngine | null = null;

export function getDefaultDurableWorkflowEngine(): DurableWorkflowAndSchedulerEngine {
  if (!defaultWorkflowEngine) {
    defaultWorkflowEngine = new DurableWorkflowAndSchedulerEngine();
  }
  return defaultWorkflowEngine;
}
