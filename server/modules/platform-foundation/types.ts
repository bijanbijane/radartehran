/**
 * @file server/modules/platform-foundation/types.ts
 * @description Phase 1 Canonical Shared Platform Foundation Types (D01–D11)
 * Governing Employee 53–80 module boundaries, service dependencies, domain ownership,
 * execution context, canonical errors, environment configuration, API/event contracts,
 * architecture validation, and additive migration artifacts.
 */

export type EmployeeId =
  | 'EMP_53' | 'EMP_54' | 'EMP_55' | 'EMP_56' | 'EMP_57' | 'EMP_58' | 'EMP_59'
  | 'EMP_60' | 'EMP_61' | 'EMP_62' | 'EMP_63' | 'EMP_64' | 'EMP_65' | 'EMP_66'
  | 'EMP_67' | 'EMP_68' | 'EMP_69' | 'EMP_70' | 'EMP_71' | 'EMP_72' | 'EMP_73'
  | 'EMP_74' | 'EMP_75' | 'EMP_76' | 'EMP_77' | 'EMP_78' | 'EMP_79' | 'EMP_80';

export type ProgramPhaseId =
  | 'PHASE_01' | 'PHASE_02' | 'PHASE_03' | 'PHASE_04' | 'PHASE_05' | 'PHASE_06'
  | 'PHASE_07' | 'PHASE_08' | 'PHASE_09' | 'PHASE_10' | 'PHASE_11';

export type EmployeeCompletionStatus =
  | 'NOT_STARTED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'IMPLEMENTED'
  | 'TESTED'
  | 'VALIDATED'
  | 'OPERATIONALLY_VERIFIED'
  | 'BLOCKED';

export type ModuleImplementationStatus =
  | 'PLANNED'
  | 'UNVERIFIED'
  | 'NOT_STARTED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'IMPLEMENTED'
  | 'TESTED'
  | 'VALIDATED'
  | 'OPERATIONALLY_VERIFIED'
  | 'BLOCKED';

export type ModuleLifecycleStatus =
  | 'INITIALIZING'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'DISABLED'
  | 'MAINTENANCE';

export type ModuleOperationalHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'UNKNOWN'
  | 'INITIALIZING'
  | 'NOT_PROVISIONED';

export type SecurityClassificationLevel =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RESTRICTED_FINANCIAL_OR_LEGAL'
  | 'CRITICAL_SECURITY';

/**
 * D01 — Canonical Platform Module Registry Record
 */
export interface PlatformModuleRecord {
  moduleId: string;
  moduleCode: string;
  displayName: string;
  owner: EmployeeId;
  assignedPhases: ProgramPhaseId[];
  version: number;
  semver: string;
  status: ModuleLifecycleStatus;
  implementationStatus: ModuleImplementationStatus;
  employeeCompletionStatus: EmployeeCompletionStatus;
  operationalHealth: ModuleOperationalHealthStatus;
  isOperational: boolean;
  apiBasePath: string;
  eventContracts: string[];
  dependencies: string[];
  requiredInfrastructure: string[];
  healthCheckReference: string;
  dataOwnership: string[];
  securityClassification: SecurityClassificationLevel;
  migrationCompatibility: 'BACKWARD_COMPATIBLE' | 'ADDITIVE_ONLY' | 'REQUIRES_MIGRATION';
  exclusiveCapabilities: string[];
  nonOwnedCapabilities: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * D02 — Service Dependency Registry Record
 */
export type ServiceDependencyType =
  | 'DATABASE'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'EVENT'
  | 'QUEUE'
  | 'EXTERNAL_API'
  | 'STORAGE'
  | 'CACHE'
  | 'ANALYTICS'
  | 'BILLING'
  | 'SEARCH'
  | 'DOCUMENTS'
  | 'COMPLIANCE'
  | 'OTHER';

export type DependencyCriticality = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'OPTIONAL';

export type DependencyRuntimeAvailability =
  | 'AVAILABLE'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface ServiceDependencyRecord {
  id: string;
  sourceModule: string;
  targetModule: string;
  dependencyType: ServiceDependencyType;
  criticality: DependencyCriticality;
  isOptional: boolean;
  requiredForStartup: boolean;
  requiredForRequests: boolean;
  fallbackStrategy: 'FAIL_CLOSED' | 'SAFE_DEGRADED_READ' | 'QUEUE_FOR_RETRY' | 'RETURN_STALE_WITH_TIMESTAMP' | 'SKIP_OPTIONAL';
  fallbackReference: string | null;
  timeoutPolicy: {
    timeoutMs: number;
    maxRetries: number;
  };
  circuitBreakerPolicy: {
    enabled: boolean;
    failureThreshold: number;
    openDurationMs: number;
  };
  healthCheckReference: string;
  status: DependencyRuntimeAvailability;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DependencyGraphValidationResult {
  valid: boolean;
  totalNodes: number;
  totalEdges: number;
  startupRequiredEdges: number;
  optionalEdges: number;
  startupCyclesDetected: string[][];
  unresolvedModuleReferences: string[];
  duplicateEdges: string[];
  topologicalStartupOrder: string[];
}

/**
 * D03 — Source-of-Truth and Domain Ownership Registry Record
 */
export type TenantOwnershipClassification =
  | 'PLATFORM_GLOBAL'
  | 'TENANT_OWNED'
  | 'ORGANIZATION_OWNED'
  | 'USER_OWNED'
  | 'SHARED_REFERENCE'
  | 'CONTROLLED_CROSS_TENANT';

export type PersistenceProviderKind =
  | 'FIRESTORE_AUTHORITATIVE'
  | 'FILE_BACKED_DURABLE_JSON'
  | 'OBJECT_STORAGE_R2_OR_LOCAL'
  | 'CLOUDFLARE_D1_PLANNED'
  | 'IN_MEMORY_WITH_DURABLE_SYNC';

export type DistributedConsistencyClassification =
  | 'STRONG_TRANSACTIONAL'
  | 'TRANSACTIONAL_WITHIN_PROVIDER'
  | 'EVENTUALLY_CONSISTENT'
  | 'WORKFLOW_COORDINATED'
  | 'READ_MODEL_DERIVED'
  | 'BEST_EFFORT_NONCRITICAL';

export interface DomainOwnershipRecord {
  id: string;
  entityType: string;
  owningEmployee: EmployeeId;
  owningModuleCode: string;
  implementationState: 'ESTABLISHED_OPERATIONAL' | 'PLANNED_FUTURE_PHASE';
  authoritativePersistenceProvider: PersistenceProviderKind;
  authoritativeCollectionOrTable: string;
  mutationServiceReference: string;
  readModelReferences: string[];
  derivedDataReferences: string[];
  replicationPolicy: 'NONE' | 'ASYNC_EVENT_PROJECTION' | 'READ_ONLY_CACHE';
  reconciliationProcessReference: string;
  retentionOwner: EmployeeId;
  legalHoldPrecedenceEnforcedBy: 'EMP_72';
  tenantOwnershipClassification: TenantOwnershipClassification;
  consistencyClassification: DistributedConsistencyClassification;
  versioningStrategy: 'OPTIMISTIC_RECORD_VERSION' | 'APPEND_ONLY_IMMUTABLE' | 'SNAPSHOT_VERSIONED';
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * D04 — Canonical Platform Execution Context
 */
export type ExecutionActorType =
  | 'ANONYMOUS'
  | 'AUTHENTICATED_USER'
  | 'ADMIN_OPERATOR'
  | 'PRIMARY_ADMIN'
  | 'SERVICE_ACCOUNT'
  | 'INTERNAL_SYSTEM';

export type RuntimeEnvironmentName = 'development' | 'test' | 'staging' | 'production';

export interface PlatformExecutionContext {
  requestId: string;
  correlationId: string;
  traceId: string | null;
  causationId: string | null;
  actorId: string | null;
  actorType: ExecutionActorType;
  actorRole: string;
  permissions: string[];
  sourceModule: string;
  operationName: string;
  environment: RuntimeEnvironmentName;
  // Downstream extension fields for Phase 2/3 (Employee 74)
  requestedTenantId: string | null;
  verifiedTenantId: string | null;
  verifiedOrganizationId: string | null;
  membershipId: string | null;
  tenantResolutionStatus: 'NOT_REQUESTED' | 'UNVERIFIED_CLIENT_HINT' | 'SERVER_VERIFIED';
  authorizationVersion: number;
  resolvedAt: string;
}

/**
 * D05 — Canonical Error Handling
 */
export type PlatformErrorCategory =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'TENANT_ISOLATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'RESOURCE_EXHAUSTED'
  | 'TIMEOUT'
  | 'INTEGRITY'
  | 'COMPLIANCE'
  | 'SECURITY'
  | 'INTERNAL';

export interface PlatformErrorCatalogEntry {
  code: string;
  category: PlatformErrorCategory;
  httpStatus: number;
  retryable: boolean;
  owningModule: string;
  defaultSafeMessage: string;
  description: string;
}

/**
 * D06 — Typed Environment Configuration
 */
export interface TypedPlatformEnvironmentConfig {
  environment: RuntimeEnvironmentName;
  port: number;
  firestoreConfigured: boolean;
  firebaseProjectId: string | null;
  objectStorageBackend: 'local' | 's3_or_r2';
  cloudflareBindings: {
    d1Configured: boolean;
    r2Configured: boolean;
    queuesConfigured: boolean;
    kvConfigured: boolean;
    workflowsConfigured: boolean;
  };
  aiGatewayConfigured: boolean;
  primaryAdminConfigured: boolean;
}

export interface EnvironmentValidationReport {
  valid: boolean;
  environment: RuntimeEnvironmentName;
  config: TypedPlatformEnvironmentConfig;
  errors: string[];
  warnings: string[];
}

/**
 * D07 — Shared API Contract Metadata
 */
export interface ApiContractMetadataRecord {
  contractId: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  apiVersion: 'v1' | 'v2' | 'admin-v1';
  owningEmployee: EmployeeId;
  owningModuleCode: string;
  summary: string;
  authenticationRequired: boolean;
  requiredRoleOrPermission: string;
  tenantContextRequirement: 'NONE' | 'OPTIONAL_SCOPED' | 'REQUIRED_TENANT_CONTEXT' | 'PLATFORM_ADMIN_GLOBAL';
  requestSchemaRef: string;
  responseSchemaRef: string;
  errorCodes: string[];
  idempotencyPolicy: 'NOT_APPLICABLE' | 'RECOMMENDED' | 'REQUIRED';
  optimisticConcurrencyRequired: boolean;
  paginationPolicy: 'NONE' | 'BOUNDED_CURSOR';
  maxPageSize: number | null;
  dataClassification: SecurityClassificationLevel;
  deprecated: boolean;
  sunsetDateIso: string | null;
}

/**
 * D08 — Shared Event Contract Metadata & Canonical Event Envelope
 */
export interface CanonicalEventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  occurredAt: string;
  publishedAt: string | null;
  sourceModule: string;
  owningEmployee: EmployeeId;
  aggregateType: string;
  aggregateId: string;
  tenantId: string | null;
  correlationId: string;
  causationId: string | null;
  payloadReference: string;
  schemaReference: string;
  payload?: TPayload;
}

export interface EventContractMetadataRecord {
  contractId: string;
  eventType: string;
  eventVersion: string;
  sourceModule: string;
  owningEmployee: EmployeeId;
  aggregateType: string;
  schemaReference: string;
  requiredPayloadFields: string[];
  compatiblePriorVersions: string[];
  tenantScoped: boolean;
  retentionOwner: EmployeeId;
  description: string;
}

/**
 * D11 — Additive Migration Artifact Record
 */
export interface MigrationArtifactRecord {
  migrationId: string;
  owningModule: string;
  owningEmployee: EmployeeId;
  description: string;
  sourceVersion: number;
  targetVersion: number;
  executionMode: 'ADDITIVE_IDEMPOTENT';
  executedAt: string;
  executionStatus: 'APPLIED' | 'ALREADY_APPLIED' | 'FAILED';
  validationStatus: 'VALIDATED' | 'FAILED';
  rollbackStrategy: string;
  checksum: string;
}
