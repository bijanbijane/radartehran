/**
 * Runtime validators and error mapping for IRNI Geographic RPC v1.
 * Kept separate from the client to preserve the repository's module-size ratchet.
 */
import type {
  IrniCanonicalGeographicEntity,
  IrniGeographicEntityPage,
  IrniGeographicIdResolutionResult,
  IrniGeographicPersistenceError,
  IrniGeographicPersistenceErrorCode,
  IrniGeographicPersistenceResult,
  IrniGeographicRegistryMetadata,
  IrniGeographicRelationship,
  IrniGeographicRelationshipSnapshot,
  IrniGeographicRpcFailureCode,
} from './irniGeographicRpcTypes';

export const IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION = '1.0.0' as const;

const ACCEPTED_VERIFICATION_STATUSES = new Set([
  'VERIFIED_OFFICIAL_PRIMARY',
  'VERIFIED_OFFICIAL_DERIVED',
  'VERIFIED_INTERNATIONAL_STANDARD',
  'VERIFIED_SECONDARY_GAZETTEER',
]);

const RADAR_LEGACY_IDENTIFIER_PATTERNS: readonly RegExp[] = Object.freeze([
  /^radar:city-hood:v1:[a-z][a-z0-9_-]{0,63}:[1-9][0-9]{0,8}$/,
  /^radar:geography-catalog:v1:hood%3A[a-z][a-z0-9_-]{0,63}%3A[1-9][0-9]{0,8}$/,
  /^radar:urban-intelligence:v1:[a-z][a-z0-9_-]{0,63}%3Ahood%3A[1-9][0-9]{0,8}$/,
]);


type RecordValue = Record<string, unknown>;
export type DataValidator<T> = (value: unknown) => value is T;

export function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasOwn(value: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

export function isVersionedRadarLegacyIdentifier(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    value.length <= 256 &&
    RADAR_LEGACY_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function isHexSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isPersistenceError(value: unknown): value is IrniGeographicPersistenceError {
  if (!isRecord(value)) return false;
  return (
    PERSISTENCE_ERROR_CODES.has(value.code as IrniGeographicPersistenceErrorCode) &&
    isNonEmptyString(value.entityType) &&
    isStringOrNull(value.entityId) &&
    isNonEmptyString(value.messageFa) &&
    typeof value.retryable === 'boolean'
  );
}

export function failureError(
  code: IrniGeographicPersistenceErrorCode,
  messageFa: string,
  retryable: boolean,
  details: Readonly<Record<string, string | number | boolean | null>> = {},
): IrniGeographicPersistenceError {
  return {
    code,
    entityType: 'SYSTEM',
    entityId: null,
    messageFa,
    retryable,
    details,
  };
}

export function invalidResponse<T>(
  messageFa = 'پاسخ RPC مرجع جغرافیایی IRNI با قرارداد نسخه ۱ سازگار نیست.',
): IrniGeographicPersistenceResult<T> {
  return {
    ok: false,
    error: failureError(
      'STORAGE_UNAVAILABLE',
      messageFa,
      false,
      {
        failureCode: 'IRNI_RPC_INVALID_RESPONSE',
        contractVersion: IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
      },
    ),
  };
}

export function unavailable<T>(
  failureCode: IrniGeographicRpcFailureCode,
  messageFa: string,
  retryable = true,
  details: Readonly<Record<string, string | number | boolean | null>> = {},
): IrniGeographicPersistenceResult<T> {
  return {
    ok: false,
    error: failureError(
      'STORAGE_UNAVAILABLE',
      messageFa,
      retryable,
      {
        failureCode,
        contractVersion: IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
        ...details,
      },
    ),
  };
}

export function parsePersistenceResult<T>(
  raw: unknown,
  validateValue: DataValidator<T>,
): IrniGeographicPersistenceResult<T> {
  if (!isRecord(raw) || !hasOwn(raw, 'ok') || typeof raw.ok !== 'boolean') {
    return invalidResponse<T>();
  }

  if (raw.ok === false) {
    if (!hasOwn(raw, 'error') || !isPersistenceError(raw.error)) {
      return invalidResponse<T>();
    }
    return { ok: false, error: raw.error };
  }

  if (!hasOwn(raw, 'value') || !validateValue(raw.value)) {
    return invalidResponse<T>();
  }

  return { ok: true, value: raw.value };
}

export function isMetadata(value: unknown): value is IrniGeographicRegistryMetadata {
  if (!isRecord(value)) return false;
  return (
    value.contractVersion === IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION &&
    (value.contractState === 'ACTIVE' ||
      value.contractState === 'CONTRACT_FINALIZED_RUNTIME_NOT_IMPLEMENTED') &&
    isNonEmptyString(value.canonicalIdentityContractVersion) &&
    isNonEmptyString(value.idAlgorithmVersion) &&
    isNonEmptyString(value.geographicSchemaVersion) &&
    isPositiveSafeInteger(value.registryRevision) &&
    isHexSha256(value.registryChecksum) &&
    typeof value.integrityVerified === 'boolean'
  );
}

export function isApprovedCanonicalEntity(
  value: unknown,
): value is IrniCanonicalGeographicEntity {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.geographicEntityId) &&
    isNonEmptyString(value.identityAnchor) &&
    (value.identityAnchorType === 'TYPE_A_SOURCE_NATIVE' ||
      value.identityAnchorType === 'TYPE_B_REGISTRY_FALLBACK') &&
    isNonEmptyString(value.entityType) &&
    isNonEmptyString(value.classificationSystemId) &&
    isNonEmptyString(value.canonicalNameFa) &&
    Array.isArray(value.alternativeNamesFa) &&
    Array.isArray(value.originalSourceNames) &&
    isStringOrNull(value.nameEn) &&
    isStringOrNull(value.parentGeographicEntityId) &&
    isStringOrNull(value.provinceGeographicEntityId) &&
    Array.isArray(value.sourceNativeIdentifiers) &&
    Array.isArray(value.sourceDatasetReferences) &&
    Array.isArray(value.sourceRecordReferences) &&
    Array.isArray(value.provenanceReferences) &&
    Array.isArray(value.relationshipReferences) &&
    isStringOrNull(value.validFrom) &&
    isStringOrNull(value.validTo) &&
    isNonEmptyString(value.recordedAt) &&
    isStringOrNull(value.supersededAt) &&
    value.identityStatus === 'CONFIRMED_CANONICAL' &&
    typeof value.verificationStatus === 'string' &&
    ACCEPTED_VERIFICATION_STATUSES.has(value.verificationStatus) &&
    value.lifecycleStatus === 'ACTIVE' &&
    isNonEmptyString(value.boundaryStatus) &&
    Array.isArray(value.boundaryVersionReferences) &&
    isNonEmptyString(value.schemaVersion) &&
    isNonEmptyString(value.createdAt) &&
    isStringOrNull(value.lastVerifiedAt) &&
    value.isSyntheticFixture === false
  );
}

export function isResolution(value: unknown): value is IrniGeographicIdResolutionResult {
  if (!isRecord(value)) return false;
  const validPath =
    value.resolutionPath === 'DIRECT_ACTIVE_CANONICAL' ||
    value.resolutionPath === 'RETIRED_CANONICAL_REDIRECT' ||
    value.resolutionPath === 'LEGACY_ALIAS' ||
    value.resolutionPath === 'NOT_FOUND';
  return (
    isNonEmptyString(value.queryIdentifier) &&
    typeof value.resolved === 'boolean' &&
    isStringOrNull(value.canonicalGeographicEntityId) &&
    validPath &&
    isNonNegativeSafeInteger(value.registryRevision) &&
    (value.resolved
      ? value.canonicalGeographicEntityId !== null &&
        value.resolutionPath !== 'NOT_FOUND'
      : value.canonicalGeographicEntityId === null &&
        value.resolutionPath === 'NOT_FOUND')
  );
}

export function isEntityPage(value: unknown): value is IrniGeographicEntityPage {
  if (!isRecord(value) || !isRecord(value.page)) return false;
  return (
    isPositiveSafeInteger(value.registryRevision) &&
    isHexSha256(value.registryChecksum) &&
    Array.isArray(value.page.items) &&
    value.page.items.every(isApprovedCanonicalEntity) &&
    isStringOrNull(value.page.nextCursor) &&
    isStringOrNull(value.page.previousCursor) &&
    typeof value.page.hasMore === 'boolean' &&
    isNonNegativeSafeInteger(value.page.pageSize) &&
    isNonNegativeSafeInteger(value.page.totalMatchedCount) &&
    isRecord(value.page.appliedSort) &&
    isNonEmptyString(value.page.appliedSort.field) &&
    (value.page.appliedSort.direction === 'ASC' ||
      value.page.appliedSort.direction === 'DESC')
  );
}

export function isGeographicRelationship(value: unknown): value is IrniGeographicRelationship {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.relationshipId) &&
    isNonEmptyString(value.sourceGeographicEntityId) &&
    isNonEmptyString(value.targetGeographicEntityId) &&
    isNonEmptyString(value.relationshipType) &&
    isNonEmptyString(value.classificationSystemId) &&
    isNonEmptyString(value.sourceDatasetId) &&
    isNonEmptyString(value.evidenceReference) &&
    isStringOrNull(value.validFrom) &&
    isStringOrNull(value.validTo) &&
    isNonEmptyString(value.recordedAt) &&
    isStringOrNull(value.supersededAt) &&
    typeof value.verificationStatus === 'string' &&
    ACCEPTED_VERIFICATION_STATUSES.has(value.verificationStatus) &&
    isNonEmptyString(value.schemaVersion)
  );
}

export function isRelationshipSnapshot(
  value: unknown,
): value is IrniGeographicRelationshipSnapshot {
  return (
    isRecord(value) &&
    isPositiveSafeInteger(value.registryRevision) &&
    isHexSha256(value.registryChecksum) &&
    Array.isArray(value.relationships) &&
    value.relationships.every(isGeographicRelationship)
  );
}

