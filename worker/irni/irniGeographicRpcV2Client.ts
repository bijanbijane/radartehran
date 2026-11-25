import type {
  IrniGeographicRpcBindingV2,
  IrniRpcEntityFilterV2,
  IrniRpcEntityPageV2,
  IrniRpcEntityV2,
  IrniRpcError,
  IrniRpcIdentifierQueryV2,
  IrniRpcLegacyAliasSnapshotV2,
  IrniRpcMetadataV2,
  IrniRpcPageRequestV2,
  IrniRpcRelationshipSnapshotV2,
  IrniRpcResult,
} from './irniGeographicRpcV2Types';
import {
  isAliasSnapshot,
  isEntityPage,
  isMetadata,
  isApprovedEntity,
  isRelationshipSnapshot,
  isResolution,
  parseResult,
} from './irniGeographicRpcV2Validation';

function failure(
  code: IrniRpcError['code'],
  messageFa: string,
  retryable = false,
  details: IrniRpcError['details'] = {},
): IrniRpcResult<never> {
  return {
    ok: false,
    error: {
      code,
      entityType: 'SYSTEM',
      entityId: null,
      messageFa,
      retryable,
      details: { contractVersion: '2.0.0', ...(details ?? {}) },
    },
  };
}

function positiveRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function isVersionedRadarAlias(query: IrniRpcIdentifierQueryV2): boolean {
  if (query.kind !== 'RADAR_LEGACY_ALIAS') return true;
  const value = query.alias.legacyIdentifierValue;
  return query.alias.legacySystemCode === 'TEHRAN_RADAR' &&
    value.length > 0 && value.length <= 256 && value.trim() === value &&
    (
      /^radar:city-hood:v1:[a-z][a-z0-9_-]{0,63}:[1-9][0-9]{0,8}$/.test(value) ||
      /^radar:geography-catalog:v1:hood%3A[a-z][a-z0-9_-]{0,63}%3A[1-9][0-9]{0,8}$/.test(value) ||
      /^radar:urban-intelligence:v1:[a-z][a-z0-9_-]{0,63}%3Ahood%3A[1-9][0-9]{0,8}$/.test(value)
    );
}

export class IrniGeographicRpcV2Client {
  constructor(private readonly binding?: IrniGeographicRpcBindingV2) {}

  isConfigured(): boolean {
    return typeof this.binding === 'object' && this.binding !== null;
  }

  private missingBinding<T>(): IrniRpcResult<T> {
    return failure(
      'STORAGE_UNAVAILABLE',
      'اتصال داخلی Workers RPC به رجیستری IRNI پیکربندی نشده است؛ هیچ API یا داده محلی جایگزین نمی‌شود.',
      false,
      { failureCode: 'IRNI_RPC_BINDING_UNAVAILABLE' },
    );
  }

  private async invoke<T>(
    operation: () => Promise<unknown>,
    validate: (value: unknown) => value is T,
  ): Promise<IrniRpcResult<T>> {
    if (!this.binding) return this.missingBinding<T>();
    try {
      const parsed = parseResult<T>(await operation(), validate);
      return parsed ?? failure(
        'STORAGE_UNAVAILABLE',
        'پاسخ Workers RPC با قرارداد نسخه ۲ سازگار نیست؛ داده رد شد.',
        false,
        { failureCode: 'IRNI_RPC_INVALID_RESPONSE' },
      );
    } catch {
      return failure(
        'STORAGE_UNAVAILABLE',
        'فراخوانی داخلی Workers RPC به مرجع IRNI ناموفق بود؛ داده جایگزین استفاده نشد.',
        true,
        { failureCode: 'IRNI_RPC_RUNTIME_UNAVAILABLE' },
      );
    }
  }

  async getApprovedRegistryMetadata(): Promise<IrniRpcResult<IrniRpcMetadataV2>> {
    return this.invoke(() => this.binding!.getApprovedRegistryMetadata(), isMetadata);
  }

  private async gate(expectedRevision: number): Promise<
    | { readonly ok: true; readonly metadata: IrniRpcMetadataV2 }
    | { readonly ok: false; readonly error: IrniRpcError }
  > {
    if (!positiveRevision(expectedRevision)) {
      const result = failure('VALIDATION_FAILURE', 'نسخه مورد انتظار رجیستری معتبر نیست.');
      return { ok: false, error: result.error };
    }
    const result = await this.getApprovedRegistryMetadata();
    if (!result.ok) return { ok: false, error: result.error };
    const metadata = result.value;
    if (
      metadata.contractVersion !== '2.0.0' ||
      metadata.contractState !== 'ACTIVE' ||
      metadata.integrityVerified !== true ||
      !/^[a-f0-9]{64}$/i.test(metadata.registryChecksum)
    ) {
      const resultError = failure(
        'STORAGE_UNAVAILABLE',
        'نسخه قرارداد یا یکپارچگی رجیستری IRNI تأیید نشده است؛ خواندن متوقف شد.',
        false,
        { failureCode: 'IRNI_RPC_REGISTRY_UNVERIFIED', registryRevision: metadata.registryRevision },
      );
      return { ok: false, error: resultError.error };
    }
    if (metadata.registryRevision !== expectedRevision) {
      const resultError = failure(
        'VERSION_CONFLICT',
        'نسخه رجیستری تغییر کرده است؛ ابتدا فراداده تازه دریافت شود.',
        true,
        { expectedRegistryRevision: expectedRevision, actualRegistryRevision: metadata.registryRevision },
      );
      return { ok: false, error: resultError.error };
    }
    return { ok: true, metadata };
  }

  private verifySnapshot<T extends { readonly registryRevision: number; readonly registryChecksum: string }>(
    result: IrniRpcResult<T>,
    metadata: IrniRpcMetadataV2,
  ): IrniRpcResult<T> {
    if (!result.ok) return result;
    if (
      result.value.registryRevision !== metadata.registryRevision ||
      result.value.registryChecksum !== metadata.registryChecksum
    ) {
      return failure(
        'VERSION_CONFLICT',
        'پاسخ با نسخه و checksum تأییدشده رجیستری یکسان نیست؛ داده رد شد.',
        true,
        {
          expectedRegistryRevision: metadata.registryRevision,
          actualRegistryRevision: result.value.registryRevision,
          expectedRegistryChecksum: metadata.registryChecksum,
          actualRegistryChecksum: result.value.registryChecksum,
        },
      );
    }
    return result;
  }

  async getApprovedEntityByCanonicalId(
    id: string,
    expectedRevision: number,
  ): Promise<IrniRpcResult<IrniRpcEntityV2>> {
    if (!id || id.length > 256 || id.trim() !== id) {
      return failure('VALIDATION_FAILURE', 'شناسه canonical معتبر نیست.');
    }
    const gate = await this.gate(expectedRevision);
    if (!gate.ok) return { ok: false, error: gate.error };
    const result = await this.invoke(
      () => this.binding!.getApprovedEntityByCanonicalId(id, expectedRevision),
      isApprovedEntity,
    );
    if (result.ok && result.value.geographicEntityId !== id) {
      return failure('STORAGE_UNAVAILABLE', 'شناسه موجودیت پاسخ با درخواست یکسان نیست.', false, { failureCode: 'IRNI_RPC_INVALID_RESPONSE' });
    }
    return result;
  }

  async resolveIdentifier(
    query: IrniRpcIdentifierQueryV2,
    expectedRevision: number,
  ): Promise<IrniRpcResult<{
    readonly queryIdentifier: string;
    readonly resolved: boolean;
    readonly canonicalGeographicEntityId: string | null;
    readonly resolutionPath: 'DIRECT_ACTIVE_CANONICAL' | 'RETIRED_CANONICAL_REDIRECT' | 'LEGACY_ALIAS' | 'NOT_FOUND';
    readonly registryRevision: number;
  }>> {
    if (
      !query ||
      (query.kind !== 'CANONICAL_OR_RETIRED_IDENTIFIER' && query.kind !== 'RADAR_LEGACY_ALIAS') ||
      (query.kind === 'RADAR_LEGACY_ALIAS' && !isVersionedRadarAlias(query))
    ) return failure('VALIDATION_FAILURE', 'نوع یا مقدار شناسه برای حل canonical معتبر نیست.');
    const gate = await this.gate(expectedRevision);
    if (!gate.ok) return { ok: false, error: gate.error };
    const result = await this.invoke(
      () => this.binding!.resolveIdentifier(query, expectedRevision),
      isResolution,
    );
    if (result.ok && result.value.registryRevision !== gate.metadata.registryRevision) {
      return failure('VERSION_CONFLICT', 'نتیجه حل شناسه متعلق به revision مورد انتظار نیست.', true);
    }
    return result;
  }

  async listApprovedEntitiesPaginated(
    filter: IrniRpcEntityFilterV2,
    page: IrniRpcPageRequestV2,
    expectedRevision: number,
  ): Promise<IrniRpcResult<IrniRpcEntityPageV2>> {
    if (!filter || typeof filter !== 'object' || !page || typeof page !== 'object') {
      return failure('VALIDATION_FAILURE', 'فیلتر یا پارامتر صفحه‌بندی معتبر نیست.');
    }
    if (filter.canonicalNameQuery !== undefined && (!filter.canonicalNameQuery || filter.canonicalNameQuery.length > 80 || filter.canonicalNameQuery.trim() !== filter.canonicalNameQuery)) {
      return failure('VALIDATION_FAILURE', 'عبارت جست‌وجوی نام باید بین ۱ تا ۸۰ نویسه باشد.');
    }
    if (
      page.limit !== undefined && (!Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > 100) ||
      page.cursor !== undefined && page.cursor !== null && (page.cursor.length > 2048 || page.cursor.trim() !== page.cursor) ||
      page.sortBy !== undefined && page.sortBy !== 'canonicalNameFa' && page.sortBy !== 'geographicEntityId' && page.sortBy !== 'issuedOrderIndex' ||
      page.sortDirection !== undefined && page.sortDirection !== 'ASC' && page.sortDirection !== 'DESC'
    ) return failure('VALIDATION_FAILURE', 'پارامترهای صفحه‌بندی خارج از قرارداد مجاز هستند.');
    const gate = await this.gate(expectedRevision);
    if (!gate.ok) return { ok: false, error: gate.error };
    const result = await this.invoke(
      () => this.binding!.listApprovedEntitiesPaginated(filter, page, expectedRevision),
      isEntityPage,
    );
    return this.verifySnapshot(result, gate.metadata);
  }

  async listApprovedRelationshipsForEntity(
    id: string,
    expectedRevision: number,
  ): Promise<IrniRpcResult<IrniRpcRelationshipSnapshotV2>> {
    if (!id || id.length > 256 || id.trim() !== id) {
      return failure('VALIDATION_FAILURE', 'شناسه موجودیت برای دریافت روابط معتبر نیست.');
    }
    const gate = await this.gate(expectedRevision);
    if (!gate.ok) return { ok: false, error: gate.error };
    const result = await this.invoke(
      () => this.binding!.listApprovedRelationshipsForEntity(id, expectedRevision),
      isRelationshipSnapshot,
    );
    return this.verifySnapshot(result, gate.metadata);
  }

  async listApprovedLegacyAliases(
    systemCode: string | undefined,
    expectedRevision: number,
  ): Promise<IrniRpcResult<IrniRpcLegacyAliasSnapshotV2>> {
    if (systemCode !== undefined && !['TEHRAN_RADAR', 'LEGACY_IRAN_NEIGHBORHOOD_ID', 'RETIRED_CANONICAL_ID', 'OTHER_LEGACY'].includes(systemCode)) {
      return failure('VALIDATION_FAILURE', 'namespace شناسه legacy معتبر نیست.');
    }
    const gate = await this.gate(expectedRevision);
    if (!gate.ok) return { ok: false, error: gate.error };
    const result = await this.invoke(
      () => this.binding!.listApprovedLegacyAliases(systemCode, expectedRevision),
      isAliasSnapshot,
    );
    return this.verifySnapshot(result, gate.metadata);
  }
}

export function createIrniGeographicRpcV2ClientFromEnv(env: {
  readonly IRNI_GEOGRAPHY?: IrniGeographicRpcBindingV2;
}): IrniGeographicRpcV2Client {
  return new IrniGeographicRpcV2Client(env.IRNI_GEOGRAPHY);
}
