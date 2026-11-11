/**
 * @file server/modules/platform-foundation/configAndContracts.ts
 * @description Deliverables D06 (Typed Environment Configuration), D07 (Shared API Contract Metadata),
 * and D08 (Shared Event Contract Metadata & Canonical Event Envelope).
 */

import { randomUUID } from 'node:crypto';
import { SECRET_ENV_KEYS } from '../../../src/utils/serverRuntimeEnvStore';
import { PlatformApplicationError } from './contextAndErrors';
import { INITIAL_EVENT_CONTRACTS, INITIAL_PLATFORM_MODULES } from './seedCatalogs';
import type {
  ApiContractMetadataRecord,
  CanonicalEventEnvelope,
  EmployeeId,
  EnvironmentValidationReport,
  EventContractMetadataRecord,
  RuntimeEnvironmentName,
} from './types';

const VALID_EMPLOYEE_IDS = new Set<string>(INITIAL_PLATFORM_MODULES.map((m) => m.owner));
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/**
 * D06 — Centralized Typed Environment Configuration Validator
 */
export function validatePlatformEnvironmentConfig(
  rawEnv: Record<string, string | undefined> = process.env,
): EnvironmentValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawNodeEnv = (rawEnv.NODE_ENV ?? 'development').trim().toLowerCase();
  const allowedEnvs = new Set(['development', 'test', 'staging', 'production']);
  if (!allowedEnvs.has(rawNodeEnv)) {
    errors.push(`INVALID_NODE_ENV: Unsupported NODE_ENV '${rawNodeEnv}'.`);
  }
  const environment: RuntimeEnvironmentName = allowedEnvs.has(rawNodeEnv)
    ? (rawNodeEnv as RuntimeEnvironmentName)
    : 'development';

  const rawPort = rawEnv.PORT ? Number(rawEnv.PORT) : 3000;
  if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
    errors.push(`INVALID_PORT: PORT must be an integer between 1 and 65535.`);
  }
  const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 3000;

  const firebaseProjectId =
    (rawEnv.FIREBASE_PROJECT_ID || rawEnv.VITE_FIREBASE_PROJECT_ID || '').trim() || null;
  const firestoreConfigured = Boolean(firebaseProjectId);

  const storageBackendRaw = (rawEnv.OBJECT_STORAGE_BACKEND ?? 'local').trim().toLowerCase();
  if (storageBackendRaw !== 'local' && storageBackendRaw !== 's3' && storageBackendRaw !== 'r2') {
    errors.push(
      `INVALID_OBJECT_STORAGE_BACKEND: Unsupported OBJECT_STORAGE_BACKEND '${storageBackendRaw}'.`,
    );
  }
  const objectStorageBackend: 'local' | 's3_or_r2' =
    storageBackendRaw === 's3' || storageBackendRaw === 'r2' ? 's3_or_r2' : 'local';

  if (objectStorageBackend === 's3_or_r2') {
    if (!rawEnv.S3_BUCKET && !rawEnv.CF_R2_BUCKET) {
      errors.push(
        'MISSING_OBJECT_STORAGE_BUCKET: S3_BUCKET or CF_R2_BUCKET is required when OBJECT_STORAGE_BACKEND is s3 or r2.',
      );
    }
  }

  // Production-specific strict checks: never allow dev fallbacks or emulators in production
  if (environment === 'production') {
    if (!firestoreConfigured) {
      errors.push(
        'MISSING_PRODUCTION_FIRESTORE_PROJECT: FIREBASE_PROJECT_ID is required in production.',
      );
    }
    if (rawEnv.FIRESTORE_EMULATOR_HOST || rawEnv.FIREBASE_AUTH_EMULATOR_HOST) {
      errors.push(
        'UNSAFE_PRODUCTION_EMULATOR: Firebase/Firestore emulators must not be enabled in production.',
      );
    }
    const adminSecret = (rawEnv.ADMIN_API_SECRET ?? '').trim();
    if (
      adminSecret &&
      (adminSecret === 'dev' ||
        adminSecret === 'changeme' ||
        adminSecret === 'test' ||
        adminSecret.length < 16)
    ) {
      errors.push(
        'INSECURE_PRODUCTION_SECRET: ADMIN_API_SECRET uses an insecure or short fallback value in production.',
      );
    }
    if (!rawEnv.ADMIN_API_SECRET && !rawEnv.PRIMARY_ADMIN_EMAIL) {
      errors.push(
        'MISSING_PRODUCTION_ADMIN_CREDENTIAL: At least one of PRIMARY_ADMIN_EMAIL or ADMIN_API_SECRET must be configured in production.',
      );
    }
  }

  // Frontend/Server separation check: ensure no server secret key is exposed via VITE_ prefix
  const secretKeySet = new Set<string>(Array.from(SECRET_ENV_KEYS));
  for (const [key, val] of Object.entries(rawEnv)) {
    if (!val || !key.startsWith('VITE_')) continue;
    const stripped = key.slice('VITE_'.length);
    if (
      secretKeySet.has(stripped) ||
      /SECRET|PRIVATE_KEY|SERVICE_ACCOUNT|PASSWORD|(?:WEBHOOK|BOT|CASPER_HUB|HUB)_TOKEN|GEMINI_API_KEY|ADMIN_API_KEY/i.test(key)
    ) {
      errors.push(
        `FRONTEND_SECRET_EXPOSURE: Server secret variable '${key}' must not use the client-exposed VITE_ prefix.`,
      );
    }
  }

  const cloudflareBindings = {
    d1Configured: Boolean((rawEnv.CF_D1_DATABASE_ID ?? '').trim()),
    r2Configured: Boolean((rawEnv.CF_R2_BUCKET ?? '').trim()),
    queuesConfigured: Boolean((rawEnv.CF_QUEUE_NAME ?? '').trim()),
    kvConfigured: Boolean((rawEnv.CF_KV_NAMESPACE_ID ?? '').trim()),
    workflowsConfigured: Boolean((rawEnv.CF_WORKFLOW_NAME ?? '').trim()),
  };

  if (!cloudflareBindings.r2Configured && environment === 'staging') {
    warnings.push('Optional Cloudflare R2 binding is not configured in staging.');
  }

  return {
    valid: errors.length === 0,
    environment,
    config: {
      environment,
      port,
      firestoreConfigured,
      firebaseProjectId,
      objectStorageBackend,
      cloudflareBindings,
      aiGatewayConfigured: Boolean((rawEnv.GEMINI_API_KEY ?? '').trim()),
      primaryAdminConfigured: Boolean(
        (rawEnv.PRIMARY_ADMIN_EMAIL ?? '').trim() || (rawEnv.ADMIN_API_SECRET ?? '').trim(),
      ),
    },
    errors,
    warnings,
  };
}

/**
 * D07 — Initial Shared API Contract Metadata Catalog
 */
export const INITIAL_API_CONTRACT_METADATA: readonly ApiContractMetadataRecord[] = [
  {
    contractId: 'api_admin_platform_modules_list',
    method: 'GET',
    path: '/api/admin/platform/modules',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'List registered platform modules with bounded cursor pagination',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:read',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'PlatformModuleListQuerySchema',
    responseSchemaRef: 'PlatformModuleListResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'VALIDATION_FAILED'],
    idempotencyPolicy: 'NOT_APPLICABLE',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'BOUNDED_CURSOR',
    maxPageSize: 50,
    dataClassification: 'INTERNAL',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_admin_platform_modules_get',
    method: 'GET',
    path: '/api/admin/platform/modules/:moduleId',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'Retrieve a registered platform module by moduleId or moduleCode',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:read',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'PlatformModuleGetParamsSchema',
    responseSchemaRef: 'PlatformModuleResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND'],
    idempotencyPolicy: 'NOT_APPLICABLE',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'NONE',
    maxPageSize: null,
    dataClassification: 'INTERNAL',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_admin_platform_modules_create',
    method: 'POST',
    path: '/api/admin/platform/modules',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'Register a new platform module entry with ownership and status validation',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:write',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'PlatformModuleCreateRequestSchema',
    responseSchemaRef: 'PlatformModuleResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'VALIDATION_FAILED', 'VERSION_CONFLICT'],
    idempotencyPolicy: 'RECOMMENDED',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'NONE',
    maxPageSize: null,
    dataClassification: 'CRITICAL_SECURITY',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_admin_platform_modules_patch',
    method: 'PATCH',
    path: '/api/admin/platform/modules/:moduleId',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'Update a platform module entry with optimistic concurrency control',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:write',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'PlatformModuleUpdateRequestSchema',
    responseSchemaRef: 'PlatformModuleResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND', 'VERSION_CONFLICT'],
    idempotencyPolicy: 'RECOMMENDED',
    optimisticConcurrencyRequired: true,
    paginationPolicy: 'NONE',
    maxPageSize: null,
    dataClassification: 'CRITICAL_SECURITY',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_admin_platform_dependencies_list',
    method: 'GET',
    path: '/api/admin/platform/dependencies',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'List registered service dependencies with bounded pagination',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:read',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'ServiceDependencyListQuerySchema',
    responseSchemaRef: 'ServiceDependencyListResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'VALIDATION_FAILED'],
    idempotencyPolicy: 'NOT_APPLICABLE',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'BOUNDED_CURSOR',
    maxPageSize: 50,
    dataClassification: 'INTERNAL',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_admin_platform_dependencies_graph',
    method: 'GET',
    path: '/api/admin/platform/dependencies/graph',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'Compute deterministic service dependency graph and startup-cycle check',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:read',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'DependencyGraphQuerySchema',
    responseSchemaRef: 'DependencyGraphResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED'],
    idempotencyPolicy: 'NOT_APPLICABLE',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'NONE',
    maxPageSize: null,
    dataClassification: 'INTERNAL',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_admin_platform_ownership_resolve',
    method: 'GET',
    path: '/api/admin/platform/ownership/:entityType/resolve',
    apiVersion: 'admin-v1',
    owningEmployee: 'EMP_80',
    owningModuleCode: 'platform-integration-resilience',
    summary: 'Resolve single authoritative domain owner for a canonical entityType',
    authenticationRequired: true,
    requiredRoleOrPermission: 'platform:admin:read',
    tenantContextRequirement: 'PLATFORM_ADMIN_GLOBAL',
    requestSchemaRef: 'OwnershipResolveParamsSchema',
    responseSchemaRef: 'OwnershipResolveResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'RESOURCE_NOT_FOUND'],
    idempotencyPolicy: 'NOT_APPLICABLE',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'NONE',
    maxPageSize: null,
    dataClassification: 'INTERNAL',
    deprecated: false,
    sunsetDateIso: null,
  },
  {
    contractId: 'api_v1_my_bargains_create',
    method: 'POST',
    path: '/api/my-bargains',
    apiVersion: 'v1',
    owningEmployee: 'EMP_58',
    owningModuleCode: 'listing-lifecycle',
    summary: 'Create a property listing owned by the authenticated publisher',
    authenticationRequired: true,
    requiredRoleOrPermission: 'verified_user',
    tenantContextRequirement: 'OPTIONAL_SCOPED',
    requestSchemaRef: 'ListingCreateRequestSchema',
    responseSchemaRef: 'ListingResponseSchema',
    errorCodes: ['AUTHENTICATION_REQUIRED', 'VALIDATION_FAILED'],
    idempotencyPolicy: 'RECOMMENDED',
    optimisticConcurrencyRequired: false,
    paginationPolicy: 'NONE',
    maxPageSize: null,
    dataClassification: 'INTERNAL',
    deprecated: false,
    sunsetDateIso: null,
  },
];

export function validateApiContractMetadata(
  contract: ApiContractMetadataRecord,
  registeredModuleCodes?: ReadonlySet<string>,
): void {
  if (!contract.contractId || typeof contract.contractId !== 'string') {
    throw new PlatformApplicationError({
      code: 'INVALID_API_CONTRACT_ID',
      category: 'VALIDATION',
      message: 'API contract metadata requires a non-empty contractId.',
    });
  }
  if (!contract.path || !contract.path.startsWith('/api/')) {
    throw new PlatformApplicationError({
      code: 'INVALID_API_CONTRACT_PATH',
      category: 'VALIDATION',
      message: `API contract path '${contract.path}' must start with '/api/'.`,
    });
  }
  if (!VALID_EMPLOYEE_IDS.has(contract.owningEmployee)) {
    throw new PlatformApplicationError({
      code: 'INVALID_API_CONTRACT_OWNER',
      category: 'VALIDATION',
      message: `Unknown owningEmployee '${contract.owningEmployee}' on API contract '${contract.contractId}'.`,
    });
  }
  if (registeredModuleCodes && !registeredModuleCodes.has(contract.owningModuleCode)) {
    throw new PlatformApplicationError({
      code: 'UNREGISTERED_API_CONTRACT_MODULE',
      category: 'VALIDATION',
      message: `API contract '${contract.contractId}' references unregistered module '${contract.owningModuleCode}'.`,
    });
  }
  if (
    contract.paginationPolicy === 'BOUNDED_CURSOR' &&
    (!contract.maxPageSize || contract.maxPageSize <= 0 || contract.maxPageSize > 100)
  ) {
    throw new PlatformApplicationError({
      code: 'INVALID_API_CONTRACT_PAGINATION',
      category: 'VALIDATION',
      message: `API contract '${contract.contractId}' with BOUNDED_CURSOR must define maxPageSize between 1 and 100.`,
    });
  }
}

/**
 * D08 — Canonical Event Envelope Builder & Validator
 */
export function createCanonicalEventEnvelope<TPayload extends Record<string, unknown>>(input: {
  eventType: string;
  eventVersion: string;
  sourceModule: string;
  owningEmployee: EmployeeId;
  aggregateType: string;
  aggregateId: string;
  tenantId?: string | null;
  correlationId: string;
  causationId?: string | null;
  payloadReference: string;
  schemaReference: string;
  payload: TPayload;
  occurredAt?: string;
  publishedAt?: string | null;
}): CanonicalEventEnvelope<TPayload> {
  const nowIso = new Date().toISOString();
  const envelope: CanonicalEventEnvelope<TPayload> = {
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    eventType: input.eventType.trim(),
    eventVersion: input.eventVersion.trim(),
    occurredAt: input.occurredAt ?? nowIso,
    publishedAt: input.publishedAt ?? nowIso,
    sourceModule: input.sourceModule.trim(),
    owningEmployee: input.owningEmployee,
    aggregateType: input.aggregateType.trim(),
    aggregateId: input.aggregateId.trim(),
    tenantId: input.tenantId ?? null,
    correlationId: input.correlationId.trim(),
    causationId: input.causationId ?? null,
    payloadReference: input.payloadReference.trim(),
    schemaReference: input.schemaReference.trim(),
    payload: input.payload,
  };
  validateCanonicalEventEnvelope(envelope);
  return envelope;
}

export function validateCanonicalEventEnvelope(
  envelope: CanonicalEventEnvelope,
  contract?: EventContractMetadataRecord,
): void {
  if (!envelope.eventId || !envelope.eventType || !SEMVER_REGEX.test(envelope.eventVersion)) {
    throw new PlatformApplicationError({
      code: 'INVALID_EVENT_ENVELOPE_IDENTITY',
      category: 'VALIDATION',
      message: 'Canonical event envelope requires valid eventId, eventType, and semver eventVersion.',
    });
  }
  if (!Number.isFinite(Date.parse(envelope.occurredAt))) {
    throw new PlatformApplicationError({
      code: 'INVALID_EVENT_TIMESTAMP',
      category: 'VALIDATION',
      message: 'occurredAt must be a valid ISO-8601 timestamp.',
    });
  }
  if (!envelope.sourceModule || !VALID_EMPLOYEE_IDS.has(envelope.owningEmployee)) {
    throw new PlatformApplicationError({
      code: 'INVALID_EVENT_SOURCE_MODULE',
      category: 'VALIDATION',
      message: 'Canonical event envelope requires valid sourceModule and owningEmployee.',
    });
  }
  if (!envelope.aggregateType || !envelope.aggregateId || !envelope.correlationId) {
    throw new PlatformApplicationError({
      code: 'MISSING_EVENT_CORRELATION_OR_AGGREGATE',
      category: 'VALIDATION',
      message: 'Canonical event envelope requires aggregateType, aggregateId, and correlationId.',
    });
  }
  if (!envelope.payloadReference || !envelope.schemaReference) {
    throw new PlatformApplicationError({
      code: 'MISSING_EVENT_SCHEMA_REFERENCE',
      category: 'VALIDATION',
      message: 'Canonical event envelope requires payloadReference and schemaReference.',
    });
  }

  const matchedContract =
    contract ?? INITIAL_EVENT_CONTRACTS.find((c) => c.eventType === envelope.eventType);
  if (matchedContract) {
    if (matchedContract.sourceModule !== envelope.sourceModule) {
      throw new PlatformApplicationError({
        code: 'EVENT_SOURCE_OWNERSHIP_MISMATCH',
        category: 'INTEGRITY',
        message: `Event '${envelope.eventType}' is owned by '${matchedContract.sourceModule}', not '${envelope.sourceModule}'.`,
      });
    }
    if (envelope.payload && typeof envelope.payload === 'object') {
      for (const reqField of matchedContract.requiredPayloadFields) {
        if (!(reqField in envelope.payload) || envelope.payload[reqField] === undefined) {
          throw new PlatformApplicationError({
            code: 'MISSING_REQUIRED_EVENT_PAYLOAD_FIELD',
            category: 'VALIDATION',
            message: `Event '${envelope.eventType}' is missing required payload field '${reqField}'.`,
          });
        }
      }
    }
  }
}

export function validateEventContractCompatibility(
  previousContract: EventContractMetadataRecord,
  nextContract: EventContractMetadataRecord,
): { compatible: boolean; breakingReasons: string[] } {
  const breakingReasons: string[] = [];
  if (previousContract.eventType !== nextContract.eventType) {
    breakingReasons.push('eventType cannot change across versions of the same contract.');
  }
  if (previousContract.owningEmployee !== nextContract.owningEmployee) {
    breakingReasons.push('owningEmployee cannot be reassigned without an explicit ownership migration.');
  }
  const prevMajor = Number(previousContract.eventVersion.split('.')[0]);
  const nextMajor = Number(nextContract.eventVersion.split('.')[0]);
  if (prevMajor === nextMajor) {
    for (const field of previousContract.requiredPayloadFields) {
      if (!nextContract.requiredPayloadFields.includes(field)) {
        breakingReasons.push(
          `Required field '${field}' was removed without incrementing the major eventVersion.`,
        );
      }
    }
  }
  return {
    compatible: breakingReasons.length === 0,
    breakingReasons,
  };
}
