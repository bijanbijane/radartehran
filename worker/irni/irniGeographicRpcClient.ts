/**
 * Fail-closed Radar consumer for IRNI's internal read-only Workers RPC v1.
 *
 * This client never falls back to HTTPS or a local geography fixture. Each data
 * read is pinned to one verified IRNI registry revision.
 */
import type {
  IrniCanonicalGeographicEntity,
  IrniCursorPageRequest,
  IrniGeographicEntityFilter,
  IrniGeographicEntityPage,
  IrniGeographicIdentifierQuery,
  IrniGeographicIdResolutionResult,
  IrniGeographicPersistenceError,
  IrniGeographicPersistenceResult,
  IrniGeographicRegistryMetadata,
  IrniGeographicRelationshipSnapshot,
  IrniGeographicRpcBinding,
  IrniGeographicRpcFailureCode,
} from './irniGeographicRpcTypes';

import {
  type DataValidator,
  failureError,
  hasOwn,
  invalidResponse,
  isApprovedCanonicalEntity,
  isEntityPage,
  isMetadata,
  isNonEmptyString,
  isRecord,
  isRelationshipSnapshot,
  isResolution,
  isVersionedRadarLegacyIdentifier,
  parsePersistenceResult,
  unavailable,
  isPositiveSafeInteger,
  IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
} from './irniGeographicRpcValidation';
export { IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION } from './irniGeographicRpcValidation';

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
  ): Promise<
    | { readonly ok: true; readonly metadata: IrniGeographicRegistryMetadata }
    | { readonly ok: false; readonly error: IrniGeographicPersistenceError }
  > {
    if (!isPositiveSafeInteger(expectedRegistryRevision)) {
      return {
        ok: false,
        error: failureError(
          'VALIDATION_FAILURE',
          'نسخه رجیستری مورد انتظار باید یک عدد صحیح مثبت و امن باشد.',
          false,
          { failureCode: 'IRNI_RPC_INVALID_PARAMETERS' },
        ),
      };
    }

    const metadata = await this.getApprovedRegistryMetadata();
    if (!metadata.ok) return { ok: false, error: metadata.error };

    if (
      metadata.value.contractState !== 'ACTIVE' ||
      metadata.value.integrityVerified !== true
    ) {
      const failureCode: IrniGeographicRpcFailureCode =
        metadata.value.contractState === 'ACTIVE'
          ? 'IRNI_RPC_REGISTRY_UNVERIFIED'
          : 'IRNI_RPC_CONTRACT_MISMATCH';
      return {
        ok: false,
        error: failureError(
          'STORAGE_UNAVAILABLE',
          'قرارداد RPC مرجع جغرافیایی IRNI فعال و یکپارچگی رجیستری تأیید نشده است؛ خواندن داده مسدود شد.',
          true,
          {
            failureCode,
            contractState: metadata.value.contractState,
            integrityVerified: metadata.value.integrityVerified,
            registryRevision: metadata.value.registryRevision,
          },
        ),
      };
    }

    if (metadata.value.registryRevision !== expectedRegistryRevision) {
      return {
        ok: false,
        error: failureError(
          'VERSION_CONFLICT',
          'نسخه رجیستری جغرافیایی IRNI در فاصله درخواست تغییر کرده است؛ صفحه‌بندی باید از نسخه واحد آغاز شود.',
          true,
          {
            expectedRegistryRevision,
            actualRegistryRevision: metadata.value.registryRevision,
          },
        ),
      };
    }

    return { ok: true, metadata: metadata.value };
  }

  private enforceSnapshotIdentity<T extends {
    readonly registryRevision: number;
    readonly registryChecksum: string;
  }>(
    result: IrniGeographicPersistenceResult<T>,
    expectedMetadata: IrniGeographicRegistryMetadata,
  ): IrniGeographicPersistenceResult<T> {
    if (!result.ok) return result;

    if (result.value.registryRevision !== expectedMetadata.registryRevision) {
      return {
        ok: false,
        error: failureError(
          'VERSION_CONFLICT',
          'نسخه صفحه یا روابط دریافتی با نسخه رجیستری تأییدشده یکسان نیست؛ پاسخ رد شد.',
          true,
          {
            expectedRegistryRevision: expectedMetadata.registryRevision,
            actualRegistryRevision: result.value.registryRevision,
          },
        ),
      };
    }

    if (result.value.registryChecksum !== expectedMetadata.registryChecksum) {
      return {
        ok: false,
        error: failureError(
          'STORAGE_UNAVAILABLE',
          'Checksum صفحه یا روابط دریافتی با checksum رجیستری تأییدشده یکسان نیست؛ پاسخ رد شد.',
          false,
          {
            failureCode: 'IRNI_RPC_REGISTRY_UNVERIFIED',
            registryRevision: expectedMetadata.registryRevision,
            expectedRegistryChecksum: expectedMetadata.registryChecksum,
            actualRegistryChecksum: result.value.registryChecksum,
          },
        ),
      };
    }

    return result;
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
    if (!gate.ok) return { ok: false, error: gate.error };

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
    if (!gate.ok) return { ok: false, error: gate.error };

    const result = await this.invoke(
      () => this.binding!.resolveIdentifier(query, expectedRegistryRevision),
      isResolution,
    );
    if (!result.ok) return result;

    if (result.value.registryRevision !== gate.metadata.registryRevision) {
      return {
        ok: false,
        error: failureError(
          'VERSION_CONFLICT',
          'نتیجه حل شناسه متعلق به revision مورد انتظار نیست؛ پاسخ رد شد.',
          true,
          {
            expectedRegistryRevision: gate.metadata.registryRevision,
            actualRegistryRevision: result.value.registryRevision,
          },
        ),
      };
    }

    return result;
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
    if (!gate.ok) return { ok: false, error: gate.error };

    const result = await this.invoke(
      () => this.binding!.listApprovedEntitiesPaginated(
        filter,
        page,
        expectedRegistryRevision,
      ),
      isEntityPage,
    );
    return this.enforceSnapshotIdentity(result, gate.metadata);
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
    if (!gate.ok) return { ok: false, error: gate.error };

    const result = await this.invoke(
      () => this.binding!.listApprovedRelationshipsForEntity(
        geographicEntityId,
        expectedRegistryRevision,
      ),
      isRelationshipSnapshot,
    );
    return this.enforceSnapshotIdentity(result, gate.metadata);
  }

  private isValidIdentifierQuery(query: IrniGeographicIdentifierQuery): boolean {
    if (!isRecord(query) || !hasOwn(query, 'kind')) return false;

    if (query.kind === 'CANONICAL_OR_RETIRED_IDENTIFIER') {
      return (
        hasOwn(query, 'identifier') &&
        isNonEmptyString(query.identifier) &&
        query.identifier.length <= 128
      );
    }

    if (
      query.kind !== 'RADAR_LEGACY_ALIAS' ||
      !hasOwn(query, 'alias') ||
      !isRecord(query.alias) ||
      !hasOwn(query.alias, 'legacySystemCode') ||
      !hasOwn(query.alias, 'legacyIdentifierValue')
    ) {
      return false;
    }

    return (
      query.alias.legacySystemCode === 'TEHRAN_RADAR' &&
      isVersionedRadarLegacyIdentifier(query.alias.legacyIdentifierValue)
    );
  }
}

export function createIrniGeographicRpcClientFromEnv(
  env: { readonly IRNI_GEOGRAPHY?: IrniGeographicRpcBinding },
): IrniGeographicRpcClient {
  return new IrniGeographicRpcClient({ binding: env.IRNI_GEOGRAPHY });
}
