/**
 * Fail-closed Radar consumer for IRNI's internal read-only Workers RPC v1.
 *
 * IMPORTANT:
 * - This client only uses the typed Service Binding RPC stub.
 * - It does not fall back to IRNI_API_BASE_URL / HTTPS or local geography fixtures.
 * - Every data read first verifies contract activation, registry integrity, and
 *   the caller's pinned registry revision.
 * - No D1 handle, SQL, or write method exists in this module.
 */
import type {
  IrniCanonicalGeographicEntity,
  IrniCursorPageRequest,
  IrniGeographicEntityFilter,
  IrniGeographicEntityPage,
  IrniGeographicIdentifierQuery,
  IrniGeographicIdResolutionResult,
  IrniGeographicPersistenceError,
  IrniGeographicPersistenceErrorCode,
  IrniGeographicPersistenceResult,
  IrniGeographicRegistryMetadata,
  IrniGeographicRelationshipSnapshot,
  IrniGeographicRpcBinding,
  IrniGeographicRpcFailureCode,
  IrniGeographicRelationship,
} from './irniGeographicRpcTypes';

export const IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION = '1.0.0' as const;

const ACCEPTED_VERIFICATION_STATUSES = new Set([
  'VERIFIED_OFFICIAL_PRIMARY',
  'VERIFIED_OFFICIAL_DERIVED',
  'VERIFIED_INTERNATIONAL_STANDARD',
  'VERIFIED_SECONDARY_GAZETTEER',
]);

const PERSISTENCE_ERROR_CODES = new Set<IrniGeographicPersistenceErrorCode>([
  'NOT_FOUND',
  'DUPLICATE',
  'VERSION_CONFLICT',
  'VALIDATION_FAILURE',
  'TRANSACTION_FAILURE',
  'IDEMPOTENCY_CONFLICT',
  'STORAGE_UNAVAILABLE',
  'PERMISSION_DENIED',
]);

type RecordValue = Record<string, unknown>;
type DataValidator<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
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

function invalidResponse<T>(
  messageFa = 'پاسخ RPC مرجع جغرافیایی IRNI با قرارداد نسخه ۱ سازگار نیست.',
): IrniGeographicPersistenceResult<T> {
  return {
    ok: false,
    error: {
      code: 'STORAGE_UNAVAILABLE',
      entityType: 'SYSTEM',
      entityId: null,
      messageFa,
      retryable: false,
      details: {
        failureCode: 'IRNI_RPC_INVALID_RESPONSE' satisfies IrniGeographicRpcFailureCode,
        contractVersion: IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
      },
    },
  };
}

function unavailable<T>(
  failureCode: IrniGeographicRpcFailureCode,
  messageFa: string,
  retryable = true,
  details: Readonly<Record<string, string | number | boolean | null>> = {},
): IrniGeographicPersistenceResult<T> {
  return {
    ok: false,
    error: {
      code: 'STORAGE_UNAVAILABLE',
      entityType: 'SYSTEM',
      entityId: null,
      messageFa,
      retryable,
      details: {
        failureCode,
        contractVersion: IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
        ...details,
      },
    },
  };
}

function versionConflict<T>(
  expectedRevision: number,
  actualRevision: number,
): IrniGeographicPersistenceResult<T> {
  return {
    ok: false,
    error: {
      code: 'VERSION_CONFLICT',
      entityType: 'SYSTEM',
      entityId: null,
      messageFa: 'نسخه رجیستری جغرافیایی IRNI در فاصله درخواست تغییر کرده است؛ صفحه‌بندی باید از نسخه واحد آغاز شود.',
      retryable: true,
      details: {
        expectedRegistryRevision: expectedRevision,
        actualRegistryRevision: actualRevision,
      },
    },
  };
}

function parsePersistenceResult<T>(
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

function isMetadata(value: unknown): value is IrniGeographicRegistryMetadata {
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

function isApprovedCanonicalEntity(
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

function isResolution(value: unknown): value is IrniGeographicIdResolutionResult {
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

function isEntityPage(value: unknown): value is IrniGeographicEntityPage {
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

function isGeographicRelationship(value: unknown): value is IrniGeographicRelationship {
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

function isRelationshipSnapshot(
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

export interface IrniGeographicRpcClientOptions {
  readonly binding?: IrniGeographicRpcBinding;
}

export class IrniGeographicRpcClient {
  private readonly binding?: IrniGeographicRpcBinding;

  constructor(options: IrniGeographicRpcClientOptions = {}) {
    this.binding = options.binding;
  }

  public isConfigured(): boolean {
    return typeof this.binding === 'object' && this.binding !== null;
  }

  private missingBinding<T>(): IrniGeographicPersistenceResult<T> {
    return unavailable<T>(
      'IRNI_RPC_BINDING_UNAVAILABLE',
      'اتصال داخلی Workers RPC به مرجع جغرافیایی IRNI تنظیم نشده است؛ هیچ مسیر HTTPS یا داده محلی جایگزین نمی‌شود.',
      false,
    );
  }

  private async invoke<T>(
    operation: () => Promise<unknown>,
    validateValue: DataValidator<T>,
  ): Promise<IrniGeographicPersistenceResult<T>> {
    if (!this.binding) return this.missingBinding<T>();

    try {
      const raw = await operation();
      return parsePersistenceResult(raw, validateValue);
    } catch {
      return unavailable<T>(
        'IRNI_RPC_RUNTIME_UNAVAILABLE',
        'فراخوانی داخلی Workers RPC به مرجع جغرافیایی IRNI ناموفق بود؛ داده جایگزین استفاده نشد.',
        true,
      );
    }
  }

  public getApprovedRegistryMetadata(): Promise<
    IrniGeographicPersistenceResult<IrniGeographicRegistryMetadata>
  > {
    if (!this.binding) {
      return Promise.resolve(this.missingBinding<IrniGeographicRegistryMetadata>());
    }
    return this.invoke(
      () => this.binding!.getApprovedRegistryMetadata(),
      isMetadata,
    );
  }

  private async assertReadableRevision(
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceError | null> {
    if (!isPositiveSafeInteger(expectedRegistryRevision)) {
      return unavailable<never>(
        'IRNI_RPC_INVALID_PARAMETERS',
        'نسخه رجیستری مورد انتظار باید یک عدد صحیح مثبت و امن باشد.',
        false,
      ).error;
    }

    const metadata = await this.getApprovedRegistryMetadata();
    if (!metadata.ok) return metadata.error;

    if (
      metadata.value.contractState !== 'ACTIVE' ||
      metadata.value.integrityVerified !== true
    ) {
      return unavailable<never>(
        metadata.value.contractState === 'ACTIVE'
          ? 'IRNI_RPC_REGISTRY_UNVERIFIED'
          : 'IRNI_RPC_CONTRACT_MISMATCH',
        'قرارداد RPC مرجع جغرافیایی IRNI فعال و یکپارچگی رجیستری تأیید نشده است؛ خواندن داده مسدود شد.',
        true,
        {
          contractState: metadata.value.contractState,
          integrityVerified: metadata.value.integrityVerified,
          registryRevision: metadata.value.registryRevision,
        },
      ).error;
    }

    if (metadata.value.registryRevision !== expectedRegistryRevision) {
      return versionConflict<never>(
        expectedRegistryRevision,
        metadata.value.registryRevision,
      ).error;
    }

    return null;
  }

  public async getApprovedEntityByCanonicalId(
    geographicEntityId: string,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniCanonicalGeographicEntity>> {
    if (!isNonEmptyString(geographicEntityId) || geographicEntityId.length > 128) {
      return unavailable(
        'IRNI_RPC_INVALID_PARAMETERS',
        'شناسه canonical جغرافیایی نامعتبر است.',
        false,
      );
    }

    const gate = await this.assertReadableRevision(expectedRegistryRevision);
    if (gate) return { ok: false, error: gate };

    return this.invoke(
      () => this.binding!.getApprovedEntityByCanonicalId(
        geographicEntityId,
        expectedRegistryRevision,
      ),
      isApprovedCanonicalEntity,
    );
  }

  public async resolveIdentifier(
    query: IrniGeographicIdentifierQuery,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniGeographicIdResolutionResult>> {
    if (!this.isValidIdentifierQuery(query)) {
      return unavailable(
        'IRNI_RPC_INVALID_PARAMETERS',
        'ساختار شناسه ورودی برای حل canonical در IRNI نامعتبر است.',
        false,
      );
    }

    const gate = await this.assertReadableRevision(expectedRegistryRevision);
    if (gate) return { ok: false, error: gate };

    return this.invoke(
      () => this.binding!.resolveIdentifier(query, expectedRegistryRevision),
      isResolution,
    );
  }

  public async listApprovedEntitiesPaginated(
    filter: IrniGeographicEntityFilter,
    page: IrniCursorPageRequest,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniGeographicEntityPage>> {
    if (!isRecord(filter) || !isRecord(page)) {
      return unavailable(
        'IRNI_RPC_INVALID_PARAMETERS',
        'فیلتر یا پارامتر صفحه‌بندی جغرافیایی نامعتبر است.',
        false,
      );
    }

    const gate = await this.assertReadableRevision(expectedRegistryRevision);
    if (gate) return { ok: false, error: gate };

    return this.invoke(
      () => this.binding!.listApprovedEntitiesPaginated(
        filter,
        page,
        expectedRegistryRevision,
      ),
      isEntityPage,
    );
  }

  public async listApprovedRelationshipsForEntity(
    geographicEntityId: string,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniGeographicRelationshipSnapshot>> {
    if (!isNonEmptyString(geographicEntityId) || geographicEntityId.length > 128) {
      return unavailable(
        'IRNI_RPC_INVALID_PARAMETERS',
        'شناسه canonical جغرافیایی برای دریافت روابط نامعتبر است.',
        false,
      );
    }

    const gate = await this.assertReadableRevision(expectedRegistryRevision);
    if (gate) return { ok: false, error: gate };

    return this.invoke(
      () => this.binding!.listApprovedRelationshipsForEntity(
        geographicEntityId,
        expectedRegistryRevision,
      ),
      isRelationshipSnapshot,
    );
  }

  private isValidIdentifierQuery(query: IrniGeographicIdentifierQuery): boolean {
    if (!isRecord(query)) return false;

    if (query.kind === 'CANONICAL_OR_RETIRED_IDENTIFIER') {
      return isNonEmptyString(query.identifier) && query.identifier.length <= 128;
    }

    if (query.kind !== 'RADAR_LEGACY_ALIAS' || !isRecord(query.alias)) return false;
    return (
      query.alias.legacySystemCode === 'TEHRAN_RADAR' &&
      isNonEmptyString(query.alias.legacyIdentifierValue) &&
      query.alias.legacyIdentifierValue.length <= 256
    );
  }
}

export function createIrniGeographicRpcClientFromEnv(
  env: { readonly IRNI_GEOGRAPHY?: IrniGeographicRpcBinding },
): IrniGeographicRpcClient {
  return new IrniGeographicRpcClient({ binding: env.IRNI_GEOGRAPHY });
}
