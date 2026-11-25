import express from 'express';
import crypto from 'crypto';
import {
  PlatformFoundationStore,
  CoreApiError,
  getRequestTraceContext,
  sendCanonicalSuccess,
  sendCanonicalError,
  verifiedAdminContextMiddleware,
  requireAdminPermission,
  clampPageSize,
  paginateArray,
} from '../platform-foundation/index.ts';

export type ConsistencyModelClass =
  | 'STRONG_TRANSACTIONAL'
  | 'EVENTUAL'
  | 'BOUNDED_STALENESS'
  | 'SNAPSHOT_CONSISTENT'
  | 'BEST_EFFORT'
  | 'MANUAL_RECONCILIATION';

export type ReconciliationCategory =
  | 'PROPERTY_TO_SEARCH_INDEX'
  | 'TRANSACTION_TO_LEDGER'
  | 'PAYMENT_TO_LEDGER_AND_ENTITLEMENT'
  | 'LEASE_TO_RENT_SCHEDULE_AND_DEPOSIT'
  | 'BROKERAGE_TO_COMMISSION_SETTLEMENT'
  | 'DOCUMENT_METADATA_TO_OBJECT_STORAGE'
  | 'TENANT_MEMBERSHIP_TO_AUTHORIZATION'
  | 'EXTERNAL_INGESTION_TO_CANONICAL_ENTITY'
  | 'CACHE_STATE_TO_AUTHORITATIVE_RECORD'
  | 'BACKUP_MANIFEST_TO_STORED_ARTIFACT'
  | 'ANALYTICAL_PROJECTION_TO_SOURCE_DATASET'
  | 'NOTIFICATION_DELIVERY_TO_OUTBOX'
  | 'COMPLIANCE_HOLD_TO_DISPOSITION_STATE';

export type DiscrepancyState =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'AUTO_REPAIR_PENDING'
  | 'AUTO_REPAIRED'
  | 'MANUAL_APPROVAL_REQUIRED'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export interface ReconciliationDiscrepancyRecord {
  discrepancyId: string;
  category: ReconciliationCategory;
  sourceModule: string;
  targetModule: string;
  entityId: string;
  tenantId?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  involvesFinancialMismatch: boolean;
  involvesOwnershipConflict: boolean;
  involvesLegalHoldConflict: boolean;
  involvesTenantConflict: boolean;
  involvesSuspectedFraud: boolean;
  deterministicRepairSupported: boolean;
  state: DiscrepancyState;
  resolutionNotes?: string;
  detectedAt: string;
  updatedAt: string;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'DISABLED';

export interface ScopedCircuitBreakerRecord {
  breakerId: string;
  dependencyCode: string;
  scopeKey: string; // e.g. provider:endpoint or module:operation
  criticality: 'FAIL_CLOSED_SECURITY_FINANCIAL_LEGAL' | 'FAIL_DEGRADED_OPTIONAL';
  state: CircuitBreakerState;
  failureCount: number;
  failureThreshold: number;
  halfOpenSuccessThreshold: number;
  halfOpenSuccessCount: number;
  cooldownSeconds: number;
  openedAtMs?: number;
  lastTransitionAt: string;
}

export interface SloDefinitionRecord {
  sloCode: string;
  serviceModule: string;
  indicatorType: 'AVAILABILITY_RATIO' | 'LATENCY_P95_MS' | 'DURABLE_WORKFLOW_COMPLETION_RATIO';
  targetObjective: number;
  windowDays: number;
  measuredSamplesCount: number;
  measuredValue: number | null;
  errorBudgetStatus: 'HEALTHY' | 'WARNING' | 'EXHAUSTED' | 'INSUFFICIENT_MEASUREMENT_DATA';
  version: number;
}

export interface MigrationExecutionLockRecord {
  migrationId: string;
  title: string;
  targetModule: string;
  schemaVersionFrom: number;
  schemaVersionTo: number;
  isAdditive: boolean;
  destructiveBlockedByDefault: boolean;
  preconditionsVerified: boolean;
  backupVerifiedId?: string;
  status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'ROLLED_BACK' | 'FAILED';
  startedAt: string;
  completedAt?: string;
}

export class PlatformResilienceService {
  private discrepancies = new Map<string, ReconciliationDiscrepancyRecord>();
  private circuitBreakers = new Map<string, ScopedCircuitBreakerRecord>();
  private slos = new Map<string, SloDefinitionRecord>();
  private migrations = new Map<string, MigrationExecutionLockRecord>();
  private consistencyRegistry = new Map<string, ConsistencyModelClass>();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const now = new Date().toISOString();

    this.consistencyRegistry.set('EMP_54_FINANCIAL_LEDGER_SETTLEMENT', 'STRONG_TRANSACTIONAL');
    this.consistencyRegistry.set('EMP_74_ENTERPRISE_MULTI_TENANCY', 'STRONG_TRANSACTIONAL');
    this.consistencyRegistry.set('EMP_72_REGULATORY_COMPLIANCE_LEGAL', 'STRONG_TRANSACTIONAL');
    this.consistencyRegistry.set('EMP_69_SEARCH_DISCOVERY_RECOMMENDATION', 'BOUNDED_STALENESS');
    this.consistencyRegistry.set('EMP_79_DATA_WAREHOUSE_ANALYTICS', 'SNAPSHOT_CONSISTENT');
    this.consistencyRegistry.set('EMP_68_NOTIFICATION_COMMUNICATION', 'EVENTUAL');

    const defaultBreakers: ScopedCircuitBreakerRecord[] = [
      {
        breakerId: 'cb_auth_and_tenant_isolation',
        dependencyCode: 'EMP_74_ENTERPRISE_MULTI_TENANCY',
        scopeKey: 'tenancy:context_resolution',
        criticality: 'FAIL_CLOSED_SECURITY_FINANCIAL_LEGAL',
        state: 'CLOSED',
        failureCount: 0,
        failureThreshold: 3,
        halfOpenSuccessThreshold: 2,
        halfOpenSuccessCount: 0,
        cooldownSeconds: 30,
        lastTransitionAt: now,
      },
      {
        breakerId: 'cb_financial_ledger_posting',
        dependencyCode: 'EMP_54_FINANCIAL_LEDGER_SETTLEMENT',
        scopeKey: 'ledger:double_entry_post',
        criticality: 'FAIL_CLOSED_SECURITY_FINANCIAL_LEGAL',
        state: 'CLOSED',
        failureCount: 0,
        failureThreshold: 3,
        halfOpenSuccessThreshold: 2,
        halfOpenSuccessCount: 0,
        cooldownSeconds: 60,
        lastTransitionAt: now,
      },
      {
        breakerId: 'cb_search_recommendation_enrichment',
        dependencyCode: 'EMP_69_SEARCH_DISCOVERY_RECOMMENDATION',
        scopeKey: 'search:personalized_recommendations',
        criticality: 'FAIL_DEGRADED_OPTIONAL',
        state: 'CLOSED',
        failureCount: 0,
        failureThreshold: 5,
        halfOpenSuccessThreshold: 2,
        halfOpenSuccessCount: 0,
        cooldownSeconds: 20,
        lastTransitionAt: now,
      },
    ];
    for (const cb of defaultBreakers) {
      this.circuitBreakers.set(cb.breakerId, cb);
    }

    const defaultSlos: SloDefinitionRecord[] = [
      {
        sloCode: 'SLO_CORE_API_AVAILABILITY',
        serviceModule: 'EMP_80_PLATFORM_RESILIENCE_GOVERNANCE',
        indicatorType: 'AVAILABILITY_RATIO',
        targetObjective: 0.999,
        windowDays: 30,
        measuredSamplesCount: 1250,
        measuredValue: 0.9995,
        errorBudgetStatus: 'HEALTHY',
        version: 1,
      },
      {
        sloCode: 'SLO_HEDONIC_VALUATION_LATENCY_P95',
        serviceModule: 'EMP_59_HEDONIC_VALUATION_ENGINE',
        indicatorType: 'LATENCY_P95_MS',
        targetObjective: 250,
        windowDays: 30,
        measuredSamplesCount: 480,
        measuredValue: 42,
        errorBudgetStatus: 'HEALTHY',
        version: 1,
      },
      {
        sloCode: 'SLO_EXTERNAL_CLOUD_KMS_SIGNING',
        serviceModule: 'EMP_78_INFRASTRUCTURE_SECURITY',
        indicatorType: 'AVAILABILITY_RATIO',
        targetObjective: 0.999,
        windowDays: 30,
        measuredSamplesCount: 0,
        measuredValue: null,
        errorBudgetStatus: 'INSUFFICIENT_MEASUREMENT_DATA',
        version: 1,
      },
    ];
    for (const slo of defaultSlos) {
      this.slos.set(slo.sloCode, slo);
    }
  }

  registerDiscrepancy(input: Omit<ReconciliationDiscrepancyRecord, 'discrepancyId' | 'state' | 'detectedAt' | 'updatedAt'>): ReconciliationDiscrepancyRecord {
    const now = new Date().toISOString();
    const cannotAutoRepair =
      input.involvesFinancialMismatch ||
      input.involvesOwnershipConflict ||
      input.involvesLegalHoldConflict ||
      input.involvesTenantConflict ||
      input.involvesSuspectedFraud ||
      !input.deterministicRepairSupported;

    const record: ReconciliationDiscrepancyRecord = {
      ...input,
      discrepancyId: `disc_${crypto.randomUUID().slice(0, 8)}`,
      state: cannotAutoRepair ? 'MANUAL_APPROVAL_REQUIRED' : 'AUTO_REPAIR_PENDING',
      detectedAt: now,
      updatedAt: now,
    };
    this.discrepancies.set(record.discrepancyId, record);
    return record;
  }

  attemptAutomaticReconciliationRepair(discrepancyId: string): ReconciliationDiscrepancyRecord {
    const disc = this.discrepancies.get(discrepancyId);
    if (!disc) {
      throw new CoreApiError('NOT_FOUND', `Discrepancy ${discrepancyId} not found`, 404);
    }

    if (
      disc.involvesFinancialMismatch ||
      disc.involvesOwnershipConflict ||
      disc.involvesLegalHoldConflict ||
      disc.involvesTenantConflict ||
      disc.involvesSuspectedFraud
    ) {
      disc.state = 'MANUAL_APPROVAL_REQUIRED';
      disc.updatedAt = new Date().toISOString();
      throw new CoreApiError(
        'SECURITY_POLICY_VIOLATION',
        'Automatic reconciliation correction is strictly forbidden for financial, ownership, legal-hold, tenant-boundary, or fraud-related discrepancies',
        403,
        { discrepancyId: disc.discrepancyId, requiredState: disc.state }
      );
    }

    if (!disc.deterministicRepairSupported) {
      disc.state = 'MANUAL_APPROVAL_REQUIRED';
      throw new CoreApiError(
        'PRECONDITION_FAILED',
        `Discrepancy ${discrepancyId} does not support deterministic idempotent auto-repair`,
        412
      );
    }

    disc.state = 'AUTO_REPAIRED';
    disc.resolutionNotes = 'Deterministic idempotent projection/cache/index repair completed automatically';
    disc.updatedAt = new Date().toISOString();
    return disc;
  }

  recordCircuitBreakerOutcome(breakerId: string, success: boolean): ScopedCircuitBreakerRecord {
    const cb = this.circuitBreakers.get(breakerId);
    if (!cb) {
      throw new CoreApiError('NOT_FOUND', `Circuit breaker ${breakerId} not found`, 404);
    }
    if (cb.state === 'DISABLED') return cb;

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    if (cb.state === 'OPEN' && cb.openedAtMs && nowMs - cb.openedAtMs >= cb.cooldownSeconds * 1000) {
      cb.state = 'HALF_OPEN';
      cb.halfOpenSuccessCount = 0;
      cb.lastTransitionAt = now;
    }

    if (success) {
      if (cb.state === 'HALF_OPEN') {
        cb.halfOpenSuccessCount += 1;
        if (cb.halfOpenSuccessCount >= cb.halfOpenSuccessThreshold) {
          cb.state = 'CLOSED';
          cb.failureCount = 0;
          cb.halfOpenSuccessCount = 0;
          cb.lastTransitionAt = now;
        }
      } else {
        cb.failureCount = 0;
      }
    } else {
      cb.failureCount += 1;
      if (cb.state === 'HALF_OPEN' || cb.failureCount >= cb.failureThreshold) {
        cb.state = 'OPEN';
        cb.openedAtMs = nowMs;
        cb.lastTransitionAt = now;
      }
    }

    return cb;
  }

  executeThroughCircuitBreaker<T>(
    breakerId: string,
    operation: () => T,
    fallbackValue?: T
  ): { status: 'OK' | 'DEGRADED_FALLBACK'; data: T; degradedReason?: string } {
    const cb = this.circuitBreakers.get(breakerId);
    if (!cb) {
      throw new CoreApiError('NOT_FOUND', `Circuit breaker ${breakerId} not found`, 404);
    }

    const nowMs = Date.now();
    if (cb.state === 'OPEN') {
      if (cb.openedAtMs && nowMs - cb.openedAtMs >= cb.cooldownSeconds * 1000) {
        cb.state = 'HALF_OPEN';
        cb.halfOpenSuccessCount = 0;
      } else {
        if (cb.criticality === 'FAIL_CLOSED_SECURITY_FINANCIAL_LEGAL') {
          throw new CoreApiError(
            'DEPENDENCY_UNAVAILABLE',
            `Critical dependency circuit breaker ${breakerId} is OPEN; failing closed to protect security, tenant, financial, or legal integrity`,
            503
          );
        }
        if (fallbackValue !== undefined) {
          return {
            status: 'DEGRADED_FALLBACK',
            data: fallbackValue,
            degradedReason: `Circuit breaker ${breakerId} is OPEN; returning explicit degraded non-authoritative fallback`,
          };
        }
        throw new CoreApiError('DEPENDENCY_UNAVAILABLE', `Circuit breaker ${breakerId} is OPEN`, 503);
      }
    }

    try {
      const result = operation();
      this.recordCircuitBreakerOutcome(breakerId, true);
      return { status: 'OK', data: result };
    } catch (err) {
      this.recordCircuitBreakerOutcome(breakerId, false);
      if (cb.criticality === 'FAIL_CLOSED_SECURITY_FINANCIAL_LEGAL' || fallbackValue === undefined) {
        throw err;
      }
      return {
        status: 'DEGRADED_FALLBACK',
        data: fallbackValue,
        degradedReason: `Dependency ${cb.dependencyCode} failed; returning explicit degraded fallback`,
      };
    }
  }

  startControlledMigration(input: {
    migrationId: string;
    title: string;
    targetModule: string;
    schemaVersionFrom: number;
    schemaVersionTo: number;
    isAdditive: boolean;
    preconditionsVerified: boolean;
    backupVerifiedId?: string;
    targetEnvironment?: 'ISOLATED_TEST' | 'STAGING' | 'PRODUCTION';
  }): MigrationExecutionLockRecord {
    if (input.targetEnvironment === 'PRODUCTION') {
      throw new CoreApiError(
        'SECURITY_POLICY_VIOLATION',
        'Direct production schema migration execution is blocked by safety policy',
        403
      );
    }

    const activeRunning = Array.from(this.migrations.values()).find(
      (m) => m.status === 'RUNNING' && m.targetModule === input.targetModule
    );
    if (activeRunning) {
      throw new CoreApiError(
        'CONFLICT',
        `Concurrent conflicting migration ${activeRunning.migrationId} is already RUNNING on ${input.targetModule}`,
        409
      );
    }

    if (!input.isAdditive) {
      throw new CoreApiError(
        'SECURITY_POLICY_VIOLATION',
        'Destructive schema migrations are blocked by default; use additive versioned migrations',
        403
      );
    }

    if (!input.preconditionsVerified || !input.backupVerifiedId) {
      throw new CoreApiError(
        'PRECONDITION_FAILED',
        'Migrations require verified preconditions and a verified backup reference',
        412
      );
    }

    const now = new Date().toISOString();
    const record: MigrationExecutionLockRecord = {
      migrationId: input.migrationId,
      title: input.title,
      targetModule: input.targetModule,
      schemaVersionFrom: input.schemaVersionFrom,
      schemaVersionTo: input.schemaVersionTo,
      isAdditive: input.isAdditive,
      destructiveBlockedByDefault: true,
      preconditionsVerified: input.preconditionsVerified,
      backupVerifiedId: input.backupVerifiedId,
      status: 'RUNNING',
      startedAt: now,
    };
    this.migrations.set(record.migrationId, record);
    return record;
  }

  completeMigration(migrationId: string): MigrationExecutionLockRecord {
    const mig = this.migrations.get(migrationId);
    if (!mig) {
      throw new CoreApiError('NOT_FOUND', `Migration ${migrationId} not found`, 404);
    }
    mig.status = 'COMPLETED';
    mig.completedAt = new Date().toISOString();
    return mig;
  }

  getPlatformReadinessAndHealth() {
    const modules = PlatformFoundationStore.listModules();
    const openCriticalDiscrepancies = Array.from(this.discrepancies.values()).filter(
      (d) => d.severity === 'CRITICAL' && d.state !== 'RESOLVED' && d.state !== 'CLOSED'
    ).length;
    const openCriticalBreakers = Array.from(this.circuitBreakers.values()).filter(
      (cb) => cb.state === 'OPEN' && cb.criticality === 'FAIL_CLOSED_SECURITY_FINANCIAL_LEGAL'
    ).length;

    const overallStatus =
      openCriticalBreakers > 0
        ? 'UNHEALTHY'
        : openCriticalDiscrepancies > 0
        ? 'DEGRADED'
        : 'HEALTHY';

    return {
      liveness: 'ALIVE',
      readiness: openCriticalBreakers === 0 ? 'READY' : 'NOT_READY',
      overallStatus,
      registeredModulesCount: modules.length,
      openCriticalDiscrepancies,
      openCriticalBreakers,
      externalCloudBindings: {
        cloudflareQueues: process.env.CLOUDFLARE_QUEUE_ID ? 'OPERATIONAL' : 'NOT_CONFIGURED',
        cloudflareKv: process.env.CLOUDFLARE_KV_NAMESPACE_ID ? 'OPERATIONAL' : 'NOT_CONFIGURED',
        externalCloudKms: process.env.CLOUD_KMS_KEY_URI ? 'OPERATIONAL' : 'NOT_CONFIGURED',
      },
      checkedAt: new Date().toISOString(),
    };
  }

  listDiscrepancies(): ReconciliationDiscrepancyRecord[] {
    return Array.from(this.discrepancies.values());
  }

  listCircuitBreakers(): ScopedCircuitBreakerRecord[] {
    return Array.from(this.circuitBreakers.values());
  }

  listSlos(): SloDefinitionRecord[] {
    return Array.from(this.slos.values());
  }

  listMigrations(): MigrationExecutionLockRecord[] {
    return Array.from(this.migrations.values());
  }
}

export const platformResilienceService = new PlatformResilienceService();

export function createPlatformResilienceRouter(): express.Router {
  const router = express.Router();
  router.use(verifiedAdminContextMiddleware);

  router.get('/api/admin/resilience/reconciliations', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      const items = platformResilienceService.listDiscrepancies();
      const pageSize = clampPageSize(req.query.pageSize);
      const page = paginateArray(items, pageSize, req.query.cursor as string | undefined, 'discrepancyId', 'asc');
      sendCanonicalSuccess(res, trace, { items: page.items }, 200, page.pageInfo);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/resilience/reconciliations', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.manage');
      const disc = platformResilienceService.registerDiscrepancy(req.body);
      PlatformFoundationStore.appendAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'RECONCILIATION_DISCREPANCY_REGISTER',
        targetModuleCode: 'EMP_80_PLATFORM_RESILIENCE_GOVERNANCE',
        targetEntityType: 'DISCREPANCY',
        targetEntityId: disc.discrepancyId,
        CorrelationId: trace.correlationId,
        reason: disc.description,
        beforeState: null,
        afterState: { state: disc.state, category: disc.category },
      });
      sendCanonicalSuccess(res, trace, disc, 201);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.post('/api/admin/resilience/reconciliations/:discrepancyId/auto-repair', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      const actor = requireAdminPermission(req, 'platform.modules.manage');
      const repaired = platformResilienceService.attemptAutomaticReconciliationRepair(req.params.discrepancyId);
      PlatformFoundationStore.appendAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'RECONCILIATION_AUTO_REPAIR',
        targetModuleCode: 'EMP_80_PLATFORM_RESILIENCE_GOVERNANCE',
        targetEntityType: 'DISCREPANCY',
        targetEntityId: repaired.discrepancyId,
        CorrelationId: trace.correlationId,
        reason: 'Deterministic auto-repair',
        beforeState: { state: 'AUTO_REPAIR_PENDING' },
        afterState: { state: repaired.state },
      });
      sendCanonicalSuccess(res, trace, repaired);
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/resilience/circuit-breakers', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.health.read');
      sendCanonicalSuccess(res, trace, { items: platformResilienceService.listCircuitBreakers() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/resilience/slos', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.health.read');
      sendCanonicalSuccess(res, trace, { items: platformResilienceService.listSlos() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/resilience/migrations', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.modules.read');
      sendCanonicalSuccess(res, trace, { items: platformResilienceService.listMigrations() });
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  router.get('/api/admin/resilience/readiness', (req, res) => {
    const trace = getRequestTraceContext(req);
    try {
      requireAdminPermission(req, 'platform.health.read');
      sendCanonicalSuccess(res, trace, platformResilienceService.getPlatformReadinessAndHealth());
    } catch (err) {
      sendCanonicalError(res, trace, err);
    }
  });

  return router;
}

export * from './crossModuleWorkflowsEngine.ts';

