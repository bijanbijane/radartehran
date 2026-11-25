/** Structural, provider-neutral mirror of IRNI geographic read RPC v2. */
export type IrniRpcErrorCode =
  | 'NOT_FOUND' | 'DUPLICATE' | 'VERSION_CONFLICT' | 'VALIDATION_FAILURE'
  | 'TRANSACTION_FAILURE' | 'IDEMPOTENCY_CONFLICT' | 'STORAGE_UNAVAILABLE'
  | 'PERMISSION_DENIED';

export interface IrniRpcError {
  readonly code: IrniRpcErrorCode;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly messageFa: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}
export type IrniRpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IrniRpcError };

export interface IrniRpcMetadataV2 {
  readonly contractVersion: '2.0.0';
  readonly contractState: 'ACTIVE';
  readonly canonicalIdentityContractVersion: string;
  readonly idAlgorithmVersion: string;
  readonly geographicSchemaVersion: string;
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly integrityVerified: true;
  readonly canonicalEntityCount: number;
  readonly relationshipCount: number;
  readonly identityAnchorCount: number;
  readonly sourceMappingCount: number;
  readonly legacyAliasCount: number;
}
export interface IrniRpcEntityV2 {
  readonly geographicEntityId: string;
  readonly identityAnchor: string;
  readonly identityAnchorType: 'TYPE_A_SOURCE_NATIVE' | 'TYPE_B_REGISTRY_FALLBACK';
  readonly entityType: string;
  readonly classificationSystemId: string;
  readonly canonicalNameFa: string;
  readonly alternativeNamesFa: readonly string[];
  readonly nameEn: string | null;
  readonly parentGeographicEntityId: string | null;
  readonly parentNameFa: string | null;
  readonly provinceGeographicEntityId: string | null;
  readonly provinceNameFa: string | null;
  readonly sourceNativeIdentifiers: readonly {
    readonly identifierNamespaceCode: string;
    readonly sourceNativeId: string;
    readonly sourceDatasetId: string;
    readonly isPrimaryAnchorSource: boolean;
  }[];
  readonly sourceDatasetReferences: readonly string[];
  readonly identityStatus: 'CONFIRMED_CANONICAL';
  readonly verificationStatus: 'VERIFIED_OFFICIAL_PRIMARY' | 'VERIFIED_OFFICIAL_DERIVED' | 'VERIFIED_INTERNATIONAL_STANDARD' | 'VERIFIED_SECONDARY_GAZETTEER';
  readonly lifecycleStatus: 'ACTIVE';
  readonly boundaryStatus: string;
  readonly pointCoordinates: { readonly latitude: number; readonly longitude: number } | null;
  readonly areaSqKm: number | null;
  readonly boundaryReference: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly recordedAt: string;
  readonly schemaVersion: string;
  readonly isSyntheticFixture: false;
  readonly metadataCoverage: Readonly<Record<string, string>>;
  readonly registryIdentity: {
    readonly identityAnchor: string;
    readonly anchorType: 'TYPE_A_SOURCE_NATIVE' | 'TYPE_B_REGISTRY_FALLBACK';
    readonly issuedOrderIndex: number;
    readonly issuedAtRegistryRevision: number;
    readonly identityStatus: 'CONFIRMED_CANONICAL';
    readonly retiredAtRegistryRevision: null;
    readonly retiredReason: null;
    readonly survivingGeographicEntityId: null;
  };
}
export interface IrniRpcRelationshipV2 {
  readonly relationshipId: string;
  readonly sourceGeographicEntityId: string;
  readonly targetGeographicEntityId: string;
  readonly relationshipType: string;
  readonly classificationSystemId: string;
  readonly sourceDatasetId: string;
  readonly evidenceReference: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly recordedAt: string;
  readonly supersededAt: string | null;
  readonly verificationStatus: string;
  readonly schemaVersion: string;
}
export interface IrniRpcPageRequestV2 {
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly sortBy?: 'canonicalNameFa' | 'geographicEntityId' | 'issuedOrderIndex';
  readonly sortDirection?: 'ASC' | 'DESC';
}
export interface IrniRpcEntityFilterV2 {
  readonly entityType?: string;
  readonly classificationSystemId?: string;
  readonly parentGeographicEntityId?: string;
  readonly provinceGeographicEntityId?: string;
  readonly canonicalNameQuery?: string;
}
export interface IrniRpcEntityPageV2 {
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly page: {
    readonly items: readonly IrniRpcEntityV2[];
    readonly nextCursor: string | null;
    readonly previousCursor: string | null;
    readonly hasMore: boolean;
    readonly pageSize: number;
    readonly totalMatchedCount: number;
    readonly appliedSort: { readonly field: string; readonly direction: 'ASC' | 'DESC' };
  };
}
export interface IrniRpcRelationshipSnapshotV2 {
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly relationships: readonly IrniRpcRelationshipV2[];
}
export type IrniRpcLegacySystemCode = 'TEHRAN_RADAR' | 'LEGACY_IRAN_NEIGHBORHOOD_ID' | 'RETIRED_CANONICAL_ID' | 'OTHER_LEGACY';

export interface IrniRpcLegacyAliasV2 {
  readonly aliasId: string;
  readonly legacySystemCode: IrniRpcLegacySystemCode;
  readonly legacyIdentifierValue: string;
  readonly canonicalGeographicEntityId: string;
  readonly aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS';
  readonly resolutionEvidenceRef: string;
  readonly recordedAtRegistryRevision: number;
  readonly automaticResolutionEligible: boolean;
}
export interface IrniRpcLegacyAliasSnapshotV2 {
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly aliases: readonly IrniRpcLegacyAliasV2[];
}
export type IrniRpcIdentifierQueryV2 =
  | { readonly kind: 'CANONICAL_OR_RETIRED_IDENTIFIER'; readonly identifier: string }
  | { readonly kind: 'RADAR_LEGACY_ALIAS'; readonly alias: { readonly legacySystemCode: 'TEHRAN_RADAR'; readonly legacyIdentifierValue: string } };
export interface IrniGeographicRpcBindingV2 {
  getApprovedRegistryMetadata(): Promise<IrniRpcResult<IrniRpcMetadataV2>>;
  getApprovedEntityByCanonicalId(id: string, expectedRevision: number): Promise<IrniRpcResult<IrniRpcEntityV2>>;
  resolveIdentifier(query: IrniRpcIdentifierQueryV2, expectedRevision: number): Promise<IrniRpcResult<{
    readonly queryIdentifier: string;
    readonly resolved: boolean;
    readonly canonicalGeographicEntityId: string | null;
    readonly resolutionPath: 'DIRECT_ACTIVE_CANONICAL' | 'RETIRED_CANONICAL_REDIRECT' | 'LEGACY_ALIAS' | 'NOT_FOUND';
    readonly registryRevision: number;
  }>>;
  listApprovedEntitiesPaginated(filter: IrniRpcEntityFilterV2, page: IrniRpcPageRequestV2, expectedRevision: number): Promise<IrniRpcResult<IrniRpcEntityPageV2>>;
  listApprovedRelationshipsForEntity(id: string, expectedRevision: number): Promise<IrniRpcResult<IrniRpcRelationshipSnapshotV2>>;
  listApprovedLegacyAliases(systemCode: IrniRpcLegacySystemCode | undefined, expectedRevision: number): Promise<IrniRpcResult<IrniRpcLegacyAliasSnapshotV2>>;
}
