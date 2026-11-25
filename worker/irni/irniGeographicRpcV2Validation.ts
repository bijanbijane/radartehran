import type {
  IrniRpcEntityPageV2,
  IrniRpcEntityV2,
  IrniRpcError,
  IrniRpcLegacyAliasSnapshotV2,
  IrniRpcMetadataV2,
  IrniRpcRelationshipSnapshotV2,
  IrniRpcResult,
} from './irniGeographicRpcV2Types';

type RecordValue = Record<string, unknown>;
const ERROR_CODES = new Set([
  'NOT_FOUND', 'DUPLICATE', 'VERSION_CONFLICT', 'VALIDATION_FAILURE',
  'TRANSACTION_FAILURE', 'IDEMPOTENCY_CONFLICT', 'STORAGE_UNAVAILABLE',
  'PERMISSION_DENIED',
]);
const VERIFICATION = new Set([
  'VERIFIED_OFFICIAL_PRIMARY', 'VERIFIED_OFFICIAL_DERIVED',
  'VERIFIED_INTERNATIONAL_STANDARD', 'VERIFIED_SECONDARY_GAZETTEER',
]);
const BOUNDARY = new Set([
  'EXACT_BOUNDARY_AVAILABLE', 'APPROXIMATE_BOUNDARY_AVAILABLE',
  'POINT_LOCATION_ONLY', 'REFERENCE_ONLY', 'BOUNDARY_UNAVAILABLE',
  'BOUNDARY_DISPUTED', 'BOUNDARY_OUTDATED',
]);

export function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isText(value: unknown, max = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
}
function isNullableText(value: unknown, max = 4096): value is string | null {
  return value === null || isText(value, max);
}
function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isHexChecksum(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
function isEntity(value: unknown): value is IrniRpcEntityV2 {
  if (!isRecord(value)) return false;
  const coordinates = value.pointCoordinates;
  const validCoordinates = coordinates === null || (
    isRecord(coordinates) &&
    typeof coordinates.latitude === 'number' && Number.isFinite(coordinates.latitude) &&
    typeof coordinates.longitude === 'number' && Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 && coordinates.longitude <= 180
  );
  const sourceIds = value.sourceNativeIdentifiers;
  const validSourceIds = Array.isArray(sourceIds) && sourceIds.every(item =>
    isRecord(item) &&
    isText(item.identifierNamespaceCode, 128) &&
    isText(item.sourceNativeId, 256) &&
    isText(item.sourceDatasetId, 256) &&
    typeof item.isPrimaryAnchorSource === 'boolean'
  );
  return isText(value.geographicEntityId, 256) &&
    isText(value.identityAnchor, 512) &&
    (value.identityAnchorType === 'TYPE_A_SOURCE_NATIVE' || value.identityAnchorType === 'TYPE_B_REGISTRY_FALLBACK') &&
    isText(value.entityType, 128) &&
    isText(value.classificationSystemId, 256) &&
    isText(value.canonicalNameFa, 512) &&
    isStringArray(value.alternativeNamesFa) &&
    isNullableText(value.nameEn, 512) &&
    isNullableText(value.parentGeographicEntityId, 256) &&
    isNullableText(value.parentNameFa, 512) &&
    isNullableText(value.provinceGeographicEntityId, 256) &&
    isNullableText(value.provinceNameFa, 512) &&
    validSourceIds &&
    isStringArray(value.sourceDatasetReferences) &&
    value.identityStatus === 'CONFIRMED_CANONICAL' &&
    typeof value.verificationStatus === 'string' && VERIFICATION.has(value.verificationStatus) &&
    value.lifecycleStatus === 'ACTIVE' &&
    typeof value.boundaryStatus === 'string' && BOUNDARY.has(value.boundaryStatus) &&
    validCoordinates &&
    (value.areaSqKm === null || (typeof value.areaSqKm === 'number' && Number.isFinite(value.areaSqKm) && value.areaSqKm >= 0)) &&
    isNullableText(value.boundaryReference, 2048) &&
    isNullableText(value.validFrom, 128) &&
    isNullableText(value.validTo, 128) &&
    isText(value.recordedAt, 128) &&
    isText(value.schemaVersion, 128) &&
    value.isSyntheticFixture === false &&
    isRecord(value.metadataCoverage) &&
    Object.values(value.metadataCoverage).every(item => typeof item === 'string') &&
    isRecord(value.registryIdentity) &&
    value.registryIdentity.identityAnchor === value.identityAnchor &&
    value.registryIdentity.anchorType === value.identityAnchorType &&
    typeof value.registryIdentity.issuedOrderIndex === 'number' && Number.isSafeInteger(value.registryIdentity.issuedOrderIndex) && value.registryIdentity.issuedOrderIndex > 0 &&
    typeof value.registryIdentity.issuedAtRegistryRevision === 'number' && Number.isSafeInteger(value.registryIdentity.issuedAtRegistryRevision) && value.registryIdentity.issuedAtRegistryRevision > 0 &&
    value.registryIdentity.identityStatus === 'CONFIRMED_CANONICAL' &&
    value.registryIdentity.retiredAtRegistryRevision === null &&
    value.registryIdentity.retiredReason === null &&
    value.registryIdentity.survivingGeographicEntityId === null;
}
function isRelationship(value: unknown): boolean {
  return isRecord(value) &&
    isText(value.relationshipId, 256) &&
    isText(value.sourceGeographicEntityId, 256) &&
    isText(value.targetGeographicEntityId, 256) &&
    isText(value.relationshipType, 128) &&
    isText(value.classificationSystemId, 256) &&
    isText(value.sourceDatasetId, 256) &&
    isText(value.evidenceReference, 2048) &&
    isNullableText(value.validFrom, 128) &&
    isNullableText(value.validTo, 128) &&
    isText(value.recordedAt, 128) &&
    isNullableText(value.supersededAt, 128) &&
    typeof value.verificationStatus === 'string' && VERIFICATION.has(value.verificationStatus) &&
    isText(value.schemaVersion, 128);
}
export function isMetadata(value: unknown): value is IrniRpcMetadataV2 {
  return isRecord(value) &&
    value.contractVersion === '2.0.0' &&
    value.contractState === 'ACTIVE' &&
    isText(value.canonicalIdentityContractVersion, 128) &&
    isText(value.idAlgorithmVersion, 128) &&
    isText(value.geographicSchemaVersion, 128) &&
    typeof value.registryRevision === 'number' && Number.isSafeInteger(value.registryRevision) && value.registryRevision > 0 &&
    isHexChecksum(value.registryChecksum) &&
    value.integrityVerified === true &&
    isSafeCount(value.canonicalEntityCount) &&
    isSafeCount(value.relationshipCount) &&
    isSafeCount(value.identityAnchorCount) &&
    isSafeCount(value.sourceMappingCount) &&
    isSafeCount(value.legacyAliasCount);
}
export function isEntityPage(value: unknown): value is IrniRpcEntityPageV2 {
  if (!isRecord(value) || !isSafeCount(value.registryRevision) || !isHexChecksum(value.registryChecksum) || !isRecord(value.page)) return false;
  const page = value.page;
  return Array.isArray(page.items) && page.items.every(isEntity) &&
    (page.nextCursor === null || isText(page.nextCursor, 2048)) &&
    (page.previousCursor === null || isText(page.previousCursor, 2048)) &&
    typeof page.hasMore === 'boolean' &&
    isSafeCount(page.pageSize) &&
    isSafeCount(page.totalMatchedCount) &&
    isRecord(page.appliedSort) &&
    isText(page.appliedSort.field, 64) &&
    (page.appliedSort.direction === 'ASC' || page.appliedSort.direction === 'DESC');
}
export function isRelationshipSnapshot(value: unknown): value is IrniRpcRelationshipSnapshotV2 {
  return isRecord(value) &&
    isSafeCount(value.registryRevision) &&
    isHexChecksum(value.registryChecksum) &&
    Array.isArray(value.relationships) &&
    value.relationships.every(isRelationship);
}
export function isAliasSnapshot(value: unknown): value is IrniRpcLegacyAliasSnapshotV2 {
  return isRecord(value) &&
    isSafeCount(value.registryRevision) &&
    isHexChecksum(value.registryChecksum) &&
    Array.isArray(value.aliases) &&
    value.aliases.every(alias => isRecord(alias) &&
      isText(alias.aliasId, 256) &&
      isText(alias.legacySystemCode, 128) &&
      isText(alias.legacyIdentifierValue, 256) &&
      isText(alias.canonicalGeographicEntityId, 256) &&
      alias.aliasStatus === 'ACTIVE_COMPATIBILITY_ALIAS' &&
      isText(alias.resolutionEvidenceRef, 2048) &&
      isSafeCount(alias.recordedAtRegistryRevision) &&
      typeof alias.automaticResolutionEligible === 'boolean');
}
export function isResolution(value: unknown): value is {
  queryIdentifier: string; resolved: boolean; canonicalGeographicEntityId: string | null;
  resolutionPath: 'DIRECT_ACTIVE_CANONICAL' | 'RETIRED_CANONICAL_REDIRECT' | 'LEGACY_ALIAS' | 'NOT_FOUND';
  registryRevision: number;
} {
  return isRecord(value) &&
    isText(value.queryIdentifier, 256) &&
    typeof value.resolved === 'boolean' &&
    isNullableText(value.canonicalGeographicEntityId, 256) &&
    ['DIRECT_ACTIVE_CANONICAL', 'RETIRED_CANONICAL_REDIRECT', 'LEGACY_ALIAS', 'NOT_FOUND'].includes(String(value.resolutionPath)) &&
    typeof value.registryRevision === 'number' && Number.isSafeInteger(value.registryRevision) && value.registryRevision > 0 &&
    (value.resolved ? value.canonicalGeographicEntityId !== null : value.canonicalGeographicEntityId === null);
}
function isError(value: unknown): value is IrniRpcError {
  return isRecord(value) &&
    typeof value.code === 'string' && ERROR_CODES.has(value.code) &&
    isText(value.entityType, 128) &&
    isNullableText(value.entityId, 256) &&
    isText(value.messageFa, 2048) &&
    typeof value.retryable === 'boolean' &&
    (value.details === undefined || isRecord(value.details));
}
export function parseResult<T>(raw: unknown, validate: (value: unknown) => value is T): IrniRpcResult<T> | null {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') return null;
  if (raw.ok) return validate(raw.value) ? { ok: true, value: raw.value } : null;
  return isError(raw.error) ? { ok: false, error: raw.error } : null;
}
export function isApprovedEntity(value: unknown): value is IrniRpcEntityV2 {
  return isEntity(value);
}
