/**
 * @file server/modules/platform-foundation/registriesAndPersistence.ts
 * @description Deliverables D01 (Module Registry), D02 (Service Dependency Registry & Cycle Detector),
 * D03 (Source-of-Truth & Domain Ownership Registry), and D11 (Durable Persistence & Additive Migrations).
 */

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decodePaginationCursor, encodePaginationCursor, normalizePaginationParams } from '../core';
import { INITIAL_API_CONTRACT_METADATA, validateApiContractMetadata } from './configAndContracts';
import { PlatformApplicationError } from './contextAndErrors';
import {
  INITIAL_DOMAIN_OWNERSHIP_RECORDS,
  INITIAL_EVENT_CONTRACTS,
  INITIAL_PLATFORM_MODULES,
  INITIAL_SERVICE_DEPENDENCIES,
} from './seedCatalogs';
import type {
  ApiContractMetadataRecord,
  DependencyGraphValidationResult,
  DomainOwnershipRecord,
  EmployeeId,
  EventContractMetadataRecord,
  MigrationArtifactRecord,
  ModuleImplementationStatus,
  ModuleLifecycleStatus,
  ModuleOperationalHealthStatus,
  PlatformModuleRecord,
  ServiceDependencyRecord,
} from './types';

const VALID_EMPLOYEES = new Set<string>(INITIAL_PLATFORM_MODULES.map((m) => m.owner));
const VALID_LIFECYCLE_STATUSES = new Set<ModuleLifecycleStatus>([
  'INITIALIZING',
  'HEALTHY',
  'DEGRADED',
  'UNAVAILABLE',
  'DISABLED',
  'MAINTENANCE',
]);
const NON_OPERATIONAL_IMPL_STATUSES = new Set<ModuleImplementationStatus>([
  'PLANNED',
  'UNVERIFIED',
  'NOT_STARTED',
  'BLOCKED',
]);

const PROTECTED_CORE_OWNERSHIP: Record<string, EmployeeId> = {
  FINANCIAL_LEDGER_ENTRY: 'EMP_54',
  PROPERTY_LISTING: 'EMP_58',
  LEGAL_HOLD_AND_RETENTION_POLICY: 'EMP_72',
};

export interface PlatformAdminAuditEntry {
  auditId: string;
  actorId: string;
  actorRole: string;
  permissionUsed: string;
  operation: string;
  targetResourceType: 'MODULE' | 'DEPENDENCY' | 'OWNERSHIP' | 'MIGRATION';
  targetResourceId: string;
  correlationId: string;
  timestamp: string;
  previousVersion: number | null;
  newVersion: number;
}

export interface PersistedPlatformFoundationState {
  schemaVersion: number;
  modules: PlatformModuleRecord[];
  dependencies: ServiceDependencyRecord[];
  ownerships: DomainOwnershipRecord[];
  apiContracts: ApiContractMetadataRecord[];
  eventContracts: EventContractMetadataRecord[];
  migrations: MigrationArtifactRecord[];
  auditLog: PlatformAdminAuditEntry[];
}

export const PHASE1_MIGRATION_ID = 'MIG_20261108_001_PLATFORM_FOUNDATION_REGISTRIES';

export class PlatformFoundationRegistryStore {
  private readonly persistenceFilePath: string | null;
  private modules = new Map<string, PlatformModuleRecord>();
  private dependencies = new Map<string, ServiceDependencyRecord>();
  private ownerships = new Map<string, DomainOwnershipRecord>();
  private apiContracts = new Map<string, ApiContractMetadataRecord>();
  private eventContracts = new Map<string, EventContractMetadataRecord>();
  private migrations = new Map<string, MigrationArtifactRecord>();
  private auditLog: PlatformAdminAuditEntry[] = [];

  constructor(options?: { persistenceFilePath?: string | null; autoSeed?: boolean }) {
    this.persistenceFilePath = options?.persistenceFilePath ?? null;
    if (this.persistenceFilePath && fs.existsSync(this.persistenceFilePath)) {
      this.loadFromDisk();
    }
    if (options?.autoSeed !== false) {
      this.runAdditiveMigrations();
    }
  }

  private loadFromDisk(): void {
    if (!this.persistenceFilePath || !fs.existsSync(this.persistenceFilePath)) return;
    const raw = fs.readFileSync(this.persistenceFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedPlatformFoundationState>;
    for (const m of parsed.modules ?? []) this.modules.set(m.moduleId, m);
    for (const d of parsed.dependencies ?? []) this.dependencies.set(d.id, d);
    for (const o of parsed.ownerships ?? []) this.ownerships.set(o.entityType, o);
    for (const c of parsed.apiContracts ?? []) this.apiContracts.set(c.contractId, c);
    for (const e of parsed.eventContracts ?? []) this.eventContracts.set(e.contractId, e);
    for (const mig of parsed.migrations ?? []) this.migrations.set(mig.migrationId, mig);
    this.auditLog = Array.isArray(parsed.auditLog) ? parsed.auditLog.slice(-500) : [];
  }

  private flushToDisk(): void {
    if (!this.persistenceFilePath) return;
    const dir = path.dirname(this.persistenceFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: PersistedPlatformFoundationState = {
      schemaVersion: 1,
      modules: Array.from(this.modules.values()),
      dependencies: Array.from(this.dependencies.values()),
      ownerships: Array.from(this.ownerships.values()),
      apiContracts: Array.from(this.apiContracts.values()),
      eventContracts: Array.from(this.eventContracts.values()),
      migrations: Array.from(this.migrations.values()),
      auditLog: this.auditLog.slice(-500),
    };
    const tmpFile = `${this.persistenceFilePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, this.persistenceFilePath);
  }

  /**
   * D11 — Repeat-safe, idempotent additive migration execution
   */
  public runAdditiveMigrations(): MigrationArtifactRecord {
    const existingMig = this.migrations.get(PHASE1_MIGRATION_ID);
    const nowIso = new Date().toISOString();

    for (const mod of INITIAL_PLATFORM_MODULES) {
      if (!this.modules.has(mod.moduleId) && !this.findModuleByCode(mod.moduleCode)) {
        this.modules.set(mod.moduleId, structuredClone(mod));
      }
    }
    for (const dep of INITIAL_SERVICE_DEPENDENCIES) {
      if (!this.dependencies.has(dep.id)) {
        this.dependencies.set(dep.id, structuredClone(dep));
      }
    }
    for (const own of INITIAL_DOMAIN_OWNERSHIP_RECORDS) {
      if (!this.ownerships.has(own.entityType)) {
        this.ownerships.set(own.entityType, structuredClone(own));
      }
    }
    for (const api of INITIAL_API_CONTRACT_METADATA) {
      if (!this.apiContracts.has(api.contractId)) {
        this.apiContracts.set(api.contractId, structuredClone(api));
      }
    }
    for (const evt of INITIAL_EVENT_CONTRACTS) {
      if (!this.eventContracts.has(evt.contractId)) {
        this.eventContracts.set(evt.contractId, structuredClone(evt));
      }
    }

    const checksum = createHash('sha256')
      .update(`${PHASE1_MIGRATION_ID}:${INITIAL_PLATFORM_MODULES.length}:${INITIAL_DOMAIN_OWNERSHIP_RECORDS.length}`)
      .digest('hex')
      .slice(0, 24);

    const record: MigrationArtifactRecord = {
      migrationId: PHASE1_MIGRATION_ID,
      owningModule: 'platform-integration-resilience',
      owningEmployee: 'EMP_80',
      description:
        'Additive initialization of Phase 1 canonical module, dependency, ownership, API contract, and event contract registries.',
      sourceVersion: 0,
      targetVersion: 1,
      executionMode: 'ADDITIVE_IDEMPOTENT',
      executedAt: existingMig ? existingMig.executedAt : nowIso,
      executionStatus: existingMig ? 'ALREADY_APPLIED' : 'APPLIED',
      validationStatus: 'VALIDATED',
      rollbackStrategy: 'Non-destructive additive registry records; safe no-op rollback.',
      checksum,
    };

    this.migrations.set(PHASE1_MIGRATION_ID, record);
    this.flushToDisk();
    return record;
  }

  public getMigrations(): MigrationArtifactRecord[] {
    return Array.from(this.migrations.values());
  }

  public getAuditLog(): PlatformAdminAuditEntry[] {
    return [...this.auditLog];
  }

  private recordAudit(entry: Omit<PlatformAdminAuditEntry, 'auditId' | 'timestamp'>): void {
    this.auditLog.push({
      ...entry,
      auditId: `aud_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      timestamp: new Date().toISOString(),
    });
  }

  // ============================================================================
  // D01 — Canonical Platform Module Registry Operations
  // ============================================================================

  public findModuleByCode(moduleCode: string): PlatformModuleRecord | null {
    const clean = (moduleCode ?? '').trim().toLowerCase();
    for (const m of this.modules.values()) {
      if (m.moduleCode.toLowerCase() === clean) return structuredClone(m);
    }
    return null;
  }

  public getModuleByIdOrCode(idOrCode: string): PlatformModuleRecord {
    const clean = (idOrCode ?? '').trim();
    const byId = this.modules.get(clean);
    if (byId) return structuredClone(byId);
    const byCode = this.findModuleByCode(clean);
    if (byCode) return byCode;
    throw new PlatformApplicationError({
      code: 'MODULE_NOT_FOUND',
      category: 'NOT_FOUND',
      message: `Platform module '${clean}' is not registered.`,
    });
  }

  public listModules(params?: {
    limit?: number;
    cursor?: string;
    ownerFilter?: string;
    implementationStatusFilter?: string;
  }): { items: PlatformModuleRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 30, maxLimit: 50 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;

    const all = Array.from(this.modules.values())
      .filter((m) => {
        if (params?.ownerFilter && m.owner !== params.ownerFilter) return false;
        if (
          params?.implementationStatusFilter &&
          m.implementationStatus !== params.implementationStatusFilter
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.moduleId.localeCompare(b.moduleId));

    const filtered = decoded
      ? all.filter((m) => m.moduleId > decoded.docId)
      : all;
    const slice = filtered.slice(0, page.limit).map((m) => structuredClone(m));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];

    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.moduleId,
              docId: last.moduleId,
              direction: 'asc',
            })
          : null,
    };
  }

  public registerModule(
    input: {
      moduleId?: string;
      moduleCode: string;
      displayName: string;
      owner: EmployeeId;
      assignedPhases?: PlatformModuleRecord['assignedPhases'];
      semver?: string;
      status?: ModuleLifecycleStatus;
      implementationStatus: ModuleImplementationStatus;
      employeeCompletionStatus?: PlatformModuleRecord['employeeCompletionStatus'];
      operationalHealth?: ModuleOperationalHealthStatus;
      apiBasePath: string;
      eventContracts?: string[];
      dependencies?: string[];
      requiredInfrastructure?: string[];
      healthCheckReference?: string;
      dataOwnership?: string[];
      securityClassification?: PlatformModuleRecord['securityClassification'];
    },
    actor: { actorId: string; actorRole: string; correlationId: string },
  ): PlatformModuleRecord {
    const moduleCode = (input.moduleCode ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(moduleCode)) {
      throw new PlatformApplicationError({
        code: 'INVALID_MODULE_CODE',
        category: 'VALIDATION',
        message: 'moduleCode must be 3–64 lowercase alphanumeric or hyphen characters.',
      });
    }
    if (!input.displayName || input.displayName.trim().length < 3) {
      throw new PlatformApplicationError({
        code: 'INVALID_MODULE_DISPLAY_NAME',
        category: 'VALIDATION',
        message: 'displayName must be at least 3 characters.',
      });
    }
    if (!VALID_EMPLOYEES.has(input.owner)) {
      throw new PlatformApplicationError({
        code: 'INVALID_MODULE_OWNER',
        category: 'VALIDATION',
        message: `Invalid owner reference '${input.owner}'. Must be one of EMP_53 through EMP_80.`,
      });
    }
    if (this.findModuleByCode(moduleCode)) {
      throw new PlatformApplicationError({
        code: 'DUPLICATE_MODULE_CODE',
        category: 'CONFLICT',
        message: `Module with moduleCode '${moduleCode}' is already registered.`,
      });
    }
    const moduleId = (input.moduleId ?? `mod_${moduleCode.replace(/-/g, '_')}`).trim();
    if (this.modules.has(moduleId)) {
      throw new PlatformApplicationError({
        code: 'DUPLICATE_MODULE_ID',
        category: 'CONFLICT',
        message: `Module with moduleId '${moduleId}' is already registered.`,
      });
    }

    const isPlannedOrUnverified = NON_OPERATIONAL_IMPL_STATUSES.has(input.implementationStatus);
    const requestedStatus: ModuleLifecycleStatus =
      input.status ?? (isPlannedOrUnverified ? 'INITIALIZING' : 'HEALTHY');
    const requestedHealth: ModuleOperationalHealthStatus =
      input.operationalHealth ?? (isPlannedOrUnverified ? 'UNAVAILABLE' : 'HEALTHY');

    if (!VALID_LIFECYCLE_STATUSES.has(requestedStatus)) {
      throw new PlatformApplicationError({
        code: 'INVALID_MODULE_LIFECYCLE_STATUS',
        category: 'VALIDATION',
        message: `Invalid module lifecycle status '${requestedStatus}'.`,
      });
    }

    if (
      isPlannedOrUnverified &&
      (requestedStatus === 'HEALTHY' || requestedHealth === 'HEALTHY')
    ) {
      throw new PlatformApplicationError({
        code: 'PLANNED_MODULE_CANNOT_BE_OPERATIONAL',
        category: 'BUSINESS_RULE',
        message: `Module '${moduleCode}' with implementationStatus '${input.implementationStatus}' cannot be reported as HEALTHY/operational.`,
      });
    }

    const nowIso = new Date().toISOString();
    const record: PlatformModuleRecord = {
      moduleId,
      moduleCode,
      displayName: input.displayName.trim(),
      owner: input.owner,
      assignedPhases: input.assignedPhases ?? ['PHASE_01'],
      version: 1,
      semver: input.semver ?? '1.0.0',
      status: requestedStatus,
      implementationStatus: input.implementationStatus,
      employeeCompletionStatus:
        input.employeeCompletionStatus ??
        (isPlannedOrUnverified ? 'NOT_STARTED' : 'IMPLEMENTED'),
      operationalHealth: requestedHealth,
      isOperational: !isPlannedOrUnverified && requestedStatus === 'HEALTHY',
      apiBasePath: input.apiBasePath.trim(),
      eventContracts: input.eventContracts ?? [],
      dependencies: input.dependencies ?? [],
      requiredInfrastructure: input.requiredInfrastructure ?? [],
      healthCheckReference:
        input.healthCheckReference ?? `${input.apiBasePath.trim()}/health`,
      dataOwnership: input.dataOwnership ?? [],
      securityClassification: input.securityClassification ?? 'INTERNAL',
      migrationCompatibility: 'ADDITIVE_ONLY',
      exclusiveCapabilities: [],
      nonOwnedCapabilities: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.modules.set(moduleId, record);
    this.recordAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      permissionUsed: 'platform:admin:write',
      operation: 'module.register',
      targetResourceType: 'MODULE',
      targetResourceId: moduleId,
      correlationId: actor.correlationId,
      previousVersion: null,
      newVersion: 1,
    });
    this.flushToDisk();
    return structuredClone(record);
  }

  public updateModule(
    moduleIdOrCode: string,
    patch: {
      expectedVersion?: number;
      displayName?: string;
      status?: ModuleLifecycleStatus;
      implementationStatus?: ModuleImplementationStatus;
      employeeCompletionStatus?: PlatformModuleRecord['employeeCompletionStatus'];
      operationalHealth?: ModuleOperationalHealthStatus;
      apiBasePath?: string;
    },
    actor: { actorId: string; actorRole: string; correlationId: string },
  ): PlatformModuleRecord {
    const existing = this.getModuleByIdOrCode(moduleIdOrCode);
    if (
      patch.expectedVersion === undefined ||
      !Number.isInteger(patch.expectedVersion) ||
      patch.expectedVersion !== existing.version
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        message: `Expected version ${patch.expectedVersion ?? 'missing'} does not match current module version ${existing.version}.`,
      });
    }

    const nextImplStatus = patch.implementationStatus ?? existing.implementationStatus;
    const nextLifecycle = patch.status ?? existing.status;
    const nextHealth = patch.operationalHealth ?? existing.operationalHealth;
    const isPlannedOrUnverified = NON_OPERATIONAL_IMPL_STATUSES.has(nextImplStatus);

    if (
      isPlannedOrUnverified &&
      (nextLifecycle === 'HEALTHY' || nextHealth === 'HEALTHY')
    ) {
      throw new PlatformApplicationError({
        code: 'PLANNED_MODULE_CANNOT_BE_OPERATIONAL',
        category: 'BUSINESS_RULE',
        message: `Planned or unverified module '${existing.moduleCode}' cannot transition to HEALTHY operational state.`,
      });
    }

    const updated: PlatformModuleRecord = {
      ...existing,
      displayName: patch.displayName ? patch.displayName.trim() : existing.displayName,
      status: nextLifecycle,
      implementationStatus: nextImplStatus,
      employeeCompletionStatus:
        patch.employeeCompletionStatus ?? existing.employeeCompletionStatus,
      operationalHealth: nextHealth,
      isOperational: !isPlannedOrUnverified && nextLifecycle === 'HEALTHY',
      apiBasePath: patch.apiBasePath ? patch.apiBasePath.trim() : existing.apiBasePath,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.modules.set(existing.moduleId, updated);
    this.recordAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      permissionUsed: 'platform:admin:write',
      operation: 'module.update',
      targetResourceType: 'MODULE',
      targetResourceId: existing.moduleId,
      correlationId: actor.correlationId,
      previousVersion: existing.version,
      newVersion: updated.version,
    });
    this.flushToDisk();
    return structuredClone(updated);
  }

  // ============================================================================
  // D02 — Service Dependency Registry & Startup Cycle Detection
  // ============================================================================

  public getDependencyById(dependencyId: string): ServiceDependencyRecord {
    const dep = this.dependencies.get((dependencyId ?? '').trim());
    if (!dep) {
      throw new PlatformApplicationError({
        code: 'DEPENDENCY_NOT_FOUND',
        category: 'NOT_FOUND',
        message: `Service dependency '${dependencyId}' not found.`,
      });
    }
    return structuredClone(dep);
  }

  public listDependencies(params?: {
    limit?: number;
    cursor?: string;
    sourceModule?: string;
    criticality?: string;
  }): { items: ServiceDependencyRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 30, maxLimit: 50 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;

    const all = Array.from(this.dependencies.values())
      .filter((d) => {
        if (params?.sourceModule && d.sourceModule !== params.sourceModule) return false;
        if (params?.criticality && d.criticality !== params.criticality) return false;
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    const filtered = decoded ? all.filter((d) => d.id > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((d) => structuredClone(d));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];

    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.id,
              docId: last.id,
              direction: 'asc',
            })
          : null,
    };
  }

  public registerDependency(
    input: {
      id?: string;
      sourceModule: string;
      targetModule: string;
      dependencyType: ServiceDependencyRecord['dependencyType'];
      criticality: ServiceDependencyRecord['criticality'];
      requiredForStartup: boolean;
      requiredForRequests: boolean;
      fallbackStrategy: ServiceDependencyRecord['fallbackStrategy'];
      fallbackReference?: string | null;
      timeoutMs?: number;
      maxRetries?: number;
      healthCheckReference?: string;
      status?: ServiceDependencyRecord['status'];
    },
    actor: { actorId: string; actorRole: string; correlationId: string },
  ): ServiceDependencyRecord {
    const src = this.findModuleByCode(input.sourceModule);
    const tgt = this.findModuleByCode(input.targetModule);
    if (!src || !tgt) {
      throw new PlatformApplicationError({
        code: 'UNRESOLVED_DEPENDENCY_MODULE_REFERENCE',
        category: 'VALIDATION',
        message: `Both sourceModule ('${input.sourceModule}') and targetModule ('${input.targetModule}') must reference registered modules.`,
      });
    }
    if (src.moduleCode === tgt.moduleCode) {
      throw new PlatformApplicationError({
        code: 'SELF_DEPENDENCY_NOT_ALLOWED',
        category: 'VALIDATION',
        message: `Module '${src.moduleCode}' cannot declare a dependency on itself.`,
      });
    }

    for (const existing of this.dependencies.values()) {
      if (
        existing.sourceModule === src.moduleCode &&
        existing.targetModule === tgt.moduleCode &&
        existing.dependencyType === input.dependencyType
      ) {
        throw new PlatformApplicationError({
          code: 'DUPLICATE_DEPENDENCY_EDGE',
          category: 'CONFLICT',
          message: `Dependency from '${src.moduleCode}' to '${tgt.moduleCode}' (${input.dependencyType}) already exists.`,
        });
      }
    }

    if (
      (input.fallbackStrategy === 'QUEUE_FOR_RETRY' ||
        input.fallbackStrategy === 'SAFE_DEGRADED_READ') &&
      (!input.fallbackReference || !input.fallbackReference.trim())
    ) {
      throw new PlatformApplicationError({
        code: 'MISSING_FALLBACK_REFERENCE',
        category: 'VALIDATION',
        message: `Fallback strategy '${input.fallbackStrategy}' requires a non-empty fallbackReference.`,
      });
    }

    const nowIso = new Date().toISOString();
    const id =
      input.id?.trim() ||
      `dep_${src.moduleCode.replace(/-/g, '_')}_to_${tgt.moduleCode.replace(/-/g, '_')}_${input.dependencyType.toLowerCase()}`;

    const candidate: ServiceDependencyRecord = {
      id,
      sourceModule: src.moduleCode,
      targetModule: tgt.moduleCode,
      dependencyType: input.dependencyType,
      criticality: input.criticality,
      isOptional: input.criticality === 'OPTIONAL' || (!input.requiredForStartup && !input.requiredForRequests),
      requiredForStartup: Boolean(input.requiredForStartup),
      requiredForRequests: Boolean(input.requiredForRequests),
      fallbackStrategy: input.fallbackStrategy,
      fallbackReference: input.fallbackReference?.trim() ?? null,
      timeoutPolicy: {
        timeoutMs: Math.min(30000, Math.max(100, Number(input.timeoutMs ?? 2500))),
        maxRetries: Math.min(5, Math.max(0, Number(input.maxRetries ?? 2))),
      },
      circuitBreakerPolicy: {
        enabled: true,
        failureThreshold: 5,
        openDurationMs: 30000,
      },
      healthCheckReference: input.healthCheckReference?.trim() || tgt.healthCheckReference,
      // Unknown availability defaults to UNKNOWN rather than fabricating AVAILABLE
      status: input.status ?? (tgt.isOperational ? 'UNKNOWN' : 'UNKNOWN'),
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const candidateDeps = [...Array.from(this.dependencies.values()), candidate];
    const graphValidation = this.computeDependencyGraph(candidateDeps);
    if (graphValidation.startupCyclesDetected.length > 0) {
      throw new PlatformApplicationError({
        code: 'REQUIRED_STARTUP_DEPENDENCY_CYCLE',
        category: 'BUSINESS_RULE',
        httpStatus: 409,
        message: `Registering required startup dependency '${src.moduleCode} -> ${tgt.moduleCode}' introduces a startup cycle: ${graphValidation.startupCyclesDetected[0].join(' -> ')}.`,
      });
    }

    this.dependencies.set(id, candidate);
    this.recordAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      permissionUsed: 'platform:admin:write',
      operation: 'dependency.register',
      targetResourceType: 'DEPENDENCY',
      targetResourceId: id,
      correlationId: actor.correlationId,
      previousVersion: null,
      newVersion: 1,
    });
    this.flushToDisk();
    return structuredClone(candidate);
  }

  public updateDependency(
    dependencyId: string,
    patch: {
      expectedVersion?: number;
      criticality?: ServiceDependencyRecord['criticality'];
      requiredForStartup?: boolean;
      requiredForRequests?: boolean;
      status?: ServiceDependencyRecord['status'];
    },
    actor: { actorId: string; actorRole: string; correlationId: string },
  ): ServiceDependencyRecord {
    const existing = this.getDependencyById(dependencyId);
    if (
      patch.expectedVersion === undefined ||
      patch.expectedVersion !== existing.version
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        message: `Expected version ${patch.expectedVersion ?? 'missing'} does not match current dependency version ${existing.version}.`,
      });
    }

    const nextCrit = patch.criticality ?? existing.criticality;
    const nextStartup = patch.requiredForStartup ?? existing.requiredForStartup;
    const nextRequests = patch.requiredForRequests ?? existing.requiredForRequests;

    const updated: ServiceDependencyRecord = {
      ...existing,
      criticality: nextCrit,
      requiredForStartup: nextStartup,
      requiredForRequests: nextRequests,
      isOptional: nextCrit === 'OPTIONAL' || (!nextStartup && !nextRequests),
      status: patch.status ?? existing.status,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    const candidateDeps = Array.from(this.dependencies.values()).map((d) =>
      d.id === existing.id ? updated : d,
    );
    const graphValidation = this.computeDependencyGraph(candidateDeps);
    if (graphValidation.startupCyclesDetected.length > 0) {
      throw new PlatformApplicationError({
        code: 'REQUIRED_STARTUP_DEPENDENCY_CYCLE',
        category: 'BUSINESS_RULE',
        httpStatus: 409,
        message: `Updating dependency '${existing.id}' introduces a required startup cycle: ${graphValidation.startupCyclesDetected[0].join(' -> ')}.`,
      });
    }

    this.dependencies.set(existing.id, updated);
    this.recordAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      permissionUsed: 'platform:admin:write',
      operation: 'dependency.update',
      targetResourceType: 'DEPENDENCY',
      targetResourceId: existing.id,
      correlationId: actor.correlationId,
      previousVersion: existing.version,
      newVersion: updated.version,
    });
    this.flushToDisk();
    return structuredClone(updated);
  }

  public computeDependencyGraph(
    customDeps?: readonly ServiceDependencyRecord[],
  ): DependencyGraphValidationResult {
    const deps = customDeps ?? Array.from(this.dependencies.values());
    const moduleCodes = new Set(Array.from(this.modules.values()).map((m) => m.moduleCode));
    const unresolvedModuleReferences: string[] = [];
    const duplicateEdges: string[] = [];
    const seenEdgeKeys = new Set<string>();

    const startupAdj = new Map<string, string[]>();
    for (const code of moduleCodes) startupAdj.set(code, []);

    let startupRequiredEdges = 0;
    let optionalEdges = 0;

    for (const d of deps) {
      if (!moduleCodes.has(d.sourceModule)) {
        unresolvedModuleReferences.push(d.sourceModule);
      }
      if (!moduleCodes.has(d.targetModule)) {
        unresolvedModuleReferences.push(d.targetModule);
      }
      const edgeKey = `${d.sourceModule}->${d.targetModule}:${d.dependencyType}`;
      if (seenEdgeKeys.has(edgeKey)) {
        duplicateEdges.push(edgeKey);
      }
      seenEdgeKeys.add(edgeKey);

      if (d.requiredForStartup) {
        startupRequiredEdges += 1;
        const list = startupAdj.get(d.sourceModule) ?? [];
        list.push(d.targetModule);
        startupAdj.set(d.sourceModule, list);
      }
      if (d.isOptional) {
        optionalEdges += 1;
      }
    }

    // Deterministic DFS cycle detection on startup-required edges
    const startupCyclesDetected: string[][] = [];
    const visitState = new Map<string, 0 | 1 | 2>();
    const pathStack: string[] = [];

    const sortedNodes = Array.from(startupAdj.keys()).sort();
    const dfs = (node: string) => {
      visitState.set(node, 1);
      pathStack.push(node);
      const neighbors = (startupAdj.get(node) ?? []).slice().sort();
      for (const next of neighbors) {
        const state = visitState.get(next) ?? 0;
        if (state === 0) {
          dfs(next);
        } else if (state === 1) {
          const idx = pathStack.indexOf(next);
          if (idx !== -1) {
            startupCyclesDetected.push([...pathStack.slice(idx), next]);
          }
        }
      }
      pathStack.pop();
      visitState.set(node, 2);
    };

    for (const node of sortedNodes) {
      if ((visitState.get(node) ?? 0) === 0) {
        dfs(node);
      }
    }

    // Topological order when acyclic
    const topologicalStartupOrder: string[] = [];
    if (startupCyclesDetected.length === 0) {
      const visited = new Set<string>();
      const postOrder = (node: string) => {
        visited.add(node);
        for (const next of (startupAdj.get(node) ?? []).slice().sort()) {
          if (!visited.has(next)) postOrder(next);
        }
        topologicalStartupOrder.push(node);
      };
      for (const node of sortedNodes) {
        if (!visited.has(node)) postOrder(node);
      }
    }

    return {
      valid:
        startupCyclesDetected.length === 0 &&
        unresolvedModuleReferences.length === 0 &&
        duplicateEdges.length === 0,
      totalNodes: moduleCodes.size,
      totalEdges: deps.length,
      startupRequiredEdges,
      optionalEdges,
      startupCyclesDetected,
      unresolvedModuleReferences,
      duplicateEdges,
      topologicalStartupOrder: topologicalStartupOrder.slice(0, 60),
    };
  }

  // ============================================================================
  // D03 — Source-of-Truth and Domain Ownership Registry & Resolution Service
  // ============================================================================

  public resolveEntityOwnership(entityType: string): DomainOwnershipRecord {
    const clean = (entityType ?? '').trim().toUpperCase();
    const record = this.ownerships.get(clean);
    if (!record) {
      throw new PlatformApplicationError({
        code: 'OWNERSHIP_NOT_FOUND',
        category: 'NOT_FOUND',
        message: `No authoritative domain ownership definition registered for entityType '${clean}'.`,
      });
    }
    return structuredClone(record);
  }

  public listOwnerships(params?: {
    limit?: number;
    cursor?: string;
    owningEmployee?: string;
  }): { items: DomainOwnershipRecord[]; nextCursor: string | null } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 30, maxLimit: 50 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;

    const all = Array.from(this.ownerships.values())
      .filter((o) => {
        if (params?.owningEmployee && o.owningEmployee !== params.owningEmployee) return false;
        return true;
      })
      .sort((a, b) => a.entityType.localeCompare(b.entityType));

    const filtered = decoded ? all.filter((o) => o.entityType > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((o) => structuredClone(o));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];

    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.entityType,
              docId: last.entityType,
              direction: 'asc',
            })
          : null,
    };
  }

  public registerOwnership(
    input: {
      entityType: string;
      owningEmployee: EmployeeId;
      owningModuleCode: string;
      authoritativePersistenceProvider: DomainOwnershipRecord['authoritativePersistenceProvider'];
      authoritativeCollectionOrTable: string;
      mutationServiceReference: string;
      readModelReferences?: string[];
      derivedDataReferences?: string[];
      retentionOwner?: EmployeeId;
      tenantOwnershipClassification: DomainOwnershipRecord['tenantOwnershipClassification'];
      consistencyClassification?: DomainOwnershipRecord['consistencyClassification'];
    },
    actor: { actorId: string; actorRole: string; correlationId: string },
  ): DomainOwnershipRecord {
    const entityType = (input.entityType ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,80}$/.test(entityType)) {
      throw new PlatformApplicationError({
        code: 'INVALID_ENTITY_TYPE',
        category: 'VALIDATION',
        message: 'entityType must be 3–80 uppercase alphanumeric or underscore characters.',
      });
    }
    if (this.ownerships.has(entityType)) {
      throw new PlatformApplicationError({
        code: 'DUPLICATE_AUTHORITATIVE_OWNERSHIP',
        category: 'CONFLICT',
        httpStatus: 409,
        message: `Entity type '${entityType}' already has an authoritative owner ('${this.ownerships.get(entityType)?.owningEmployee}').`,
      });
    }
    const mod = this.findModuleByCode(input.owningModuleCode);
    if (!mod || mod.owner !== input.owningEmployee) {
      throw new PlatformApplicationError({
        code: 'INVALID_OWNERSHIP_MODULE_REFERENCE',
        category: 'VALIDATION',
        message: `owningModuleCode '${input.owningModuleCode}' must exist and belong to '${input.owningEmployee}'.`,
      });
    }
    if (!input.mutationServiceReference || !input.mutationServiceReference.trim()) {
      throw new PlatformApplicationError({
        code: 'MISSING_MUTATION_SERVICE_REFERENCE',
        category: 'VALIDATION',
        message: 'mutationServiceReference is required for domain ownership registration.',
      });
    }

    const nowIso = new Date().toISOString();
    const record: DomainOwnershipRecord = {
      id: `own_${input.owningEmployee.toLowerCase()}_${entityType.toLowerCase()}`,
      entityType,
      owningEmployee: input.owningEmployee,
      owningModuleCode: mod.moduleCode,
      implementationState: mod.isOperational ? 'ESTABLISHED_OPERATIONAL' : 'PLANNED_FUTURE_PHASE',
      authoritativePersistenceProvider: input.authoritativePersistenceProvider,
      authoritativeCollectionOrTable: input.authoritativeCollectionOrTable.trim(),
      mutationServiceReference: input.mutationServiceReference.trim(),
      readModelReferences: input.readModelReferences ?? [],
      derivedDataReferences: input.derivedDataReferences ?? [],
      replicationPolicy: 'ASYNC_EVENT_PROJECTION',
      reconciliationProcessReference: `platform-integration-resilience.reconcile.${entityType.toLowerCase()}`,
      retentionOwner: input.retentionOwner ?? 'EMP_72',
      legalHoldPrecedenceEnforcedBy: 'EMP_72',
      tenantOwnershipClassification: input.tenantOwnershipClassification,
      consistencyClassification:
        input.consistencyClassification ?? 'TRANSACTIONAL_WITHIN_PROVIDER',
      versioningStrategy: 'OPTIMISTIC_RECORD_VERSION',
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.ownerships.set(entityType, record);
    this.recordAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      permissionUsed: 'platform:admin:write',
      operation: 'ownership.register',
      targetResourceType: 'OWNERSHIP',
      targetResourceId: record.id,
      correlationId: actor.correlationId,
      previousVersion: null,
      newVersion: 1,
    });
    this.flushToDisk();
    return structuredClone(record);
  }

  public updateOwnership(
    ownershipIdOrEntityType: string,
    patch: {
      expectedVersion?: number;
      owningEmployee?: EmployeeId;
      mutationServiceReference?: string;
      readModelReferences?: string[];
      tenantOwnershipClassification?: DomainOwnershipRecord['tenantOwnershipClassification'];
    },
    actor: { actorId: string; actorRole: string; correlationId: string },
  ): DomainOwnershipRecord {
    const clean = (ownershipIdOrEntityType ?? '').trim();
    let existing = this.ownerships.get(clean.toUpperCase()) ?? null;
    if (!existing) {
      for (const item of this.ownerships.values()) {
        if (item.id === clean) {
          existing = item;
          break;
        }
      }
    }
    if (!existing) {
      throw new PlatformApplicationError({
        code: 'OWNERSHIP_NOT_FOUND',
        category: 'NOT_FOUND',
        message: `Ownership record '${clean}' not found.`,
      });
    }

    if (
      patch.expectedVersion === undefined ||
      patch.expectedVersion !== existing.version
    ) {
      throw new PlatformApplicationError({
        code: 'VERSION_CONFLICT',
        category: 'CONFLICT',
        httpStatus: 409,
        message: `Expected version ${patch.expectedVersion ?? 'missing'} does not match current ownership version ${existing.version}.`,
      });
    }

    const protectedOwner = PROTECTED_CORE_OWNERSHIP[existing.entityType];
    if (
      protectedOwner &&
      patch.owningEmployee &&
      patch.owningEmployee !== protectedOwner
    ) {
      throw new PlatformApplicationError({
        code: 'IMMUTABLE_DOMAIN_AUTHORITY_VIOLATION',
        category: 'BUSINESS_RULE',
        httpStatus: 422,
        message: `Entity '${existing.entityType}' is permanently governed by '${protectedOwner}' and cannot be reassigned to '${patch.owningEmployee}'.`,
      });
    }

    const updated: DomainOwnershipRecord = {
      ...existing,
      mutationServiceReference: patch.mutationServiceReference
        ? patch.mutationServiceReference.trim()
        : existing.mutationServiceReference,
      readModelReferences: patch.readModelReferences ?? existing.readModelReferences,
      tenantOwnershipClassification:
        patch.tenantOwnershipClassification ?? existing.tenantOwnershipClassification,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.ownerships.set(existing.entityType, updated);
    this.recordAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      permissionUsed: 'platform:admin:write',
      operation: 'ownership.update',
      targetResourceType: 'OWNERSHIP',
      targetResourceId: existing.id,
      correlationId: actor.correlationId,
      previousVersion: existing.version,
      newVersion: updated.version,
    });
    this.flushToDisk();
    return structuredClone(updated);
  }

  // ============================================================================
  // D07 & D08 — Contract Metadata Accessors
  // ============================================================================

  public listApiContracts(params?: { limit?: number; cursor?: string }): {
    items: ApiContractMetadataRecord[];
    nextCursor: string | null;
  } {
    const page = normalizePaginationParams(
      { limit: params?.limit, cursor: params?.cursor },
      { defaultLimit: 30, maxLimit: 50 },
    );
    const decoded = page.cursor ? decodePaginationCursor(page.cursor) : null;
    const all = Array.from(this.apiContracts.values()).sort((a, b) =>
      a.contractId.localeCompare(b.contractId),
    );
    const filtered = decoded ? all.filter((c) => c.contractId > decoded.docId) : all;
    const slice = filtered.slice(0, page.limit).map((c) => structuredClone(c));
    const hasMore = filtered.length > page.limit;
    const last = slice[slice.length - 1];
    return {
      items: slice,
      nextCursor:
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.contractId,
              docId: last.contractId,
              direction: 'asc',
            })
          : null,
    };
  }

  public getApiContractById(contractId: string): ApiContractMetadataRecord {
    const item = this.apiContracts.get((contractId ?? '').trim());
    if (!item) {
      throw new PlatformApplicationError({
        code: 'API_CONTRACT_NOT_FOUND',
        category: 'NOT_FOUND',
        message: `API contract '${contractId}' not found.`,
      });
    }
    return structuredClone(item);
  }

  public registerApiContract(contract: ApiContractMetadataRecord): ApiContractMetadataRecord {
    const moduleCodes = new Set(Array.from(this.modules.values()).map((m) => m.moduleCode));
    validateApiContractMetadata(contract, moduleCodes);
    this.apiContracts.set(contract.contractId, structuredClone(contract));
    this.flushToDisk();
    return structuredClone(contract);
  }

  public listEventContracts(): EventContractMetadataRecord[] {
    return Array.from(this.eventContracts.values()).map((e) => structuredClone(e));
  }
}

let defaultPlatformStoreInstance: PlatformFoundationRegistryStore | null = null;

export function getDefaultPlatformFoundationStore(): PlatformFoundationRegistryStore {
  if (!defaultPlatformStoreInstance) {
    defaultPlatformStoreInstance = new PlatformFoundationRegistryStore({
      persistenceFilePath: null,
      autoSeed: true,
    });
  }
  return defaultPlatformStoreInstance;
}
