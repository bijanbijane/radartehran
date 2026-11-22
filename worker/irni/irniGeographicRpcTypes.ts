/**
 * Provider-neutral structural mirror of IRNI Radar Geographic Read Port v1.
 *
 * Keep this contract synchronized with:
 * Iran-Neighborhood-Intelligence/src/services/geographic-registry/radar-read-port-v1.ts
 *
 * This is a TypeScript RPC surface only. It does not create or activate a Cloudflare
 * Service Binding. A live binding may be added only after the IRNI Worker name and
 * deployment environment are verified.
 */

export type IrniGeographicPersistenceErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'VERSION_CONFLICT'
  | 'VALIDATION_FAILURE'
  | 'TRANSACTION_FAILURE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'STORAGE_UNAVAILABLE'
  | 'PERMISSION_DENIED';

export interface IrniGeographicPersistenceError {
  readonly code: IrniGeographicPersistenceErrorCode;
  readonly entityType:
    | 'VARIABLE_DEFINITION'
    | 'VARIABLE_CATEGORY'
    | 'DATASET_SOURCE'
    | 'DATASET_VERSION'
    | 'EXTRACTED_RECORD'
    | 'CANONICAL_RECORD'
    | 'CANONICAL_RECORD_VERSION'
    | 'SOURCE_MAPPING'
    | 'PROPERTY_IDENTITY'
    | 'LISTING_PROPERTY_RELATIONSHIP'
    | 'TRANSFORMATION_RECORD'
    | 'VALIDATION_RESULT'
    | 'VALIDATION_RULE_DEFINITION'
    | 'LIFECYCLE_TRANSITION'
    | 'HUMAN_REVIEW_RECORD'
    | 'AUDIT_EVENT'
    | 'SCHEMA_TAXONOMY_VERSION'
    | 'TRANSACTION'
    | 'SCHEMA'
    | 'SYSTEM';
  readonly entityId: string | null;
  readonly messageFa: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export type IrniGeographicPersistenceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IrniGeographicPersistenceError };

export interface IrniBoundaryVersionReference {
  readonly boundaryVersionId: string;
  readonly sourceDatasetId: string;
  readonly originalGeometryReference: string;
  readonly geometryFormat:
    | 'GEOJSON'
    | 'SHAPEFILE'
    | 'GEODATABASE'
    | 'WGS84_POINT'
    | 'NONE';
  readonly coordinateReferenceSystem: string;
  readonly coordinateSemantics:
    | 'POLYGON_BOUNDARY'
    | 'CENTROID_POINT'
    | 'POPULATED_PLACE_POINT'
    | 'REFERENCE_ONLY';
  readonly geometryVersion: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly recordedAt: string;
  readonly precisionOrScale: string | null;
  readonly validationStatus: 'VALIDATED' | 'REFERENCED_NOT_PARSED' | 'UNVERIFIED' | 'DISPUTED';
  readonly pointCoordinates?: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly areaSqKm?: number | null;
}

export interface IrniSourceNativeIdentifier {
  readonly identifierNamespaceCode: string;
  readonly sourceNativeId: string;
  readonly classificationSystemId: string;
  readonly sourceDatasetId: string;
  readonly sourceDatasetVersion: string;
  readonly firstObservedAt: string;
  readonly isPrimaryAnchorSource: boolean;
}

export interface IrniOriginalSourceNameAssertion {
  readonly sourceDatasetId: string;
  readonly sourceRecordKey: string;
  readonly originalName: string;
  readonly languageCode: 'fa' | 'en' | 'und';
  readonly sourceClassificationLabel: string;
}

export interface IrniProvenanceEvidenceReference {
  readonly provenanceId: string;
  readonly sourceDatasetId: string;
  readonly sourceDatasetVersion: string;
  readonly sourceRecordKey: string;
  readonly datasetSha256: string;
  readonly observedAt: string;
  readonly authorityAssessment: string;
}

export interface IrniCanonicalGeographicEntity {
  readonly geographicEntityId: string;
  readonly identityAnchor: string;
  readonly identityAnchorType: 'TYPE_A_SOURCE_NATIVE' | 'TYPE_B_REGISTRY_FALLBACK';
  readonly entityType: string;
  readonly classificationSystemId: string;
  readonly canonicalNameFa: string;
  readonly alternativeNamesFa: readonly string[];
  readonly originalSourceNames: readonly IrniOriginalSourceNameAssertion[];
  readonly nameEn: string | null;
  readonly parentGeographicEntityId: string | null;
  readonly provinceGeographicEntityId: string | null;
  readonly sourceNativeIdentifiers: readonly IrniSourceNativeIdentifier[];
  readonly sourceDatasetReferences: readonly string[];
  readonly sourceRecordReferences: readonly string[];
  readonly provenanceReferences: readonly IrniProvenanceEvidenceReference[];
  readonly relationshipReferences: readonly string[];
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly recordedAt: string;
  readonly supersededAt: string | null;
  readonly identityStatus:
    | 'CONFIRMED_CANONICAL'
    | 'RETIRED_MERGED'
    | 'RETIRED_SPLIT_ORIGIN'
    | 'RETIRED_DUPLICATE'
    | 'HISTORICALLY_RETIRED'
    | 'DISPUTED';
  readonly verificationStatus:
    | 'VERIFIED_OFFICIAL_PRIMARY'
    | 'VERIFIED_OFFICIAL_DERIVED'
    | 'VERIFIED_INTERNATIONAL_STANDARD'
    | 'VERIFIED_SECONDARY_GAZETTEER'
    | 'PROVISIONAL_UNVERIFIED'
    | 'DISPUTED'
    | 'REQUIRES_REVIEW'
    | 'NOT_VERIFIED';
  readonly lifecycleStatus:
    | 'ACTIVE'
    | 'HISTORICAL'
    | 'MERGED'
    | 'SPLIT'
    | 'RETIRED'
    | 'SUPERSEDED'
    | 'UNKNOWN';
  readonly boundaryStatus:
    | 'EXACT_BOUNDARY_AVAILABLE'
    | 'APPROXIMATE_BOUNDARY_AVAILABLE'
    | 'POINT_LOCATION_ONLY'
    | 'REFERENCE_ONLY'
    | 'BOUNDARY_UNAVAILABLE'
    | 'BOUNDARY_DISPUTED'
    | 'BOUNDARY_OUTDATED';
  readonly boundaryVersionReferences: readonly IrniBoundaryVersionReference[];
  readonly schemaVersion: string;
  readonly createdAt: string;
  readonly lastVerifiedAt: string | null;
  readonly isSyntheticFixture: boolean;
}

export interface IrniGeographicRelationship {
  readonly relationshipId: string;
  readonly sourceGeographicEntityId: string;
  readonly targetGeographicEntityId: string;
  readonly relationshipType:
    | 'ADMINISTRATIVELY_CONTAINS'
    | 'LOCATED_WITHIN'
    | 'URBAN_SUBDIVISION_OF'
    | 'RURAL_SETTLEMENT_WITHIN'
    | 'NEIGHBORHOOD_OF'
    | 'ALTERNATIVE_CLASSIFICATION_OF'
    | 'HISTORICALLY_PART_OF'
    | 'REPLACED_BY'
    | 'MERGED_INTO'
    | 'SPLIT_INTO'
    | 'OVERLAPS'
    | 'ADJACENT_TO';
  readonly classificationSystemId: string;
  readonly sourceDatasetId: string;
  readonly evidenceReference: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly recordedAt: string;
  readonly supersededAt: string | null;
  readonly verificationStatus: IrniCanonicalGeographicEntity['verificationStatus'];
  readonly schemaVersion: string;
}

export interface IrniGeographicIdResolutionResult {
  readonly queryIdentifier: string;
  readonly resolved: boolean;
  readonly canonicalGeographicEntityId: string | null;
  readonly resolutionPath:
    | 'DIRECT_ACTIVE_CANONICAL'
    | 'RETIRED_CANONICAL_REDIRECT'
    | 'LEGACY_ALIAS'
    | 'NOT_FOUND';
  readonly registryRevision: number;
}

export interface IrniGeographicRegistryMetadata {
  readonly contractVersion: '1.0.0';
  readonly contractState: 'CONTRACT_FINALIZED_RUNTIME_NOT_IMPLEMENTED' | 'ACTIVE';
  readonly canonicalIdentityContractVersion: string;
  readonly idAlgorithmVersion: string;
  readonly geographicSchemaVersion: string;
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly integrityVerified: boolean;
}

export interface IrniGeographicEntityFilter {
  readonly entityType?: string;
  readonly classificationSystemId?: string;
  readonly parentGeographicEntityId?: string;
  readonly provinceGeographicEntityId?: string;
}

export interface IrniCursorPageRequest {
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly sortBy?: string;
  readonly sortDirection?: 'ASC' | 'DESC';
}

export interface IrniCursorPageResult<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly previousCursor: string | null;
  readonly hasMore: boolean;
  readonly pageSize: number;
  readonly totalMatchedCount: number;
  readonly appliedSort: {
    readonly field: string;
    readonly direction: 'ASC' | 'DESC';
  };
}

export interface IrniGeographicEntityPage {
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly page: IrniCursorPageResult<IrniCanonicalGeographicEntity>;
}

export interface IrniGeographicRelationshipSnapshot {
  readonly registryRevision: number;
  readonly registryChecksum: string;
  readonly relationships: readonly IrniGeographicRelationship[];
}

export type IrniGeographicIdentifierQuery =
  | {
      readonly kind: 'CANONICAL_OR_RETIRED_IDENTIFIER';
      readonly identifier: string;
    }
  | {
      readonly kind: 'RADAR_LEGACY_ALIAS';
      readonly alias: {
        readonly legacySystemCode: 'TEHRAN_RADAR';
        readonly legacyIdentifierValue: string;
      };
    };

/**
 * Structural RPC stub for the deployed IRNI WorkerEntrypoint.
 * Implementations are supplied by Cloudflare Workers Service Binding at runtime.
 */
export interface IrniGeographicRpcBinding {
  getApprovedRegistryMetadata(): Promise<
    IrniGeographicPersistenceResult<IrniGeographicRegistryMetadata>
  >;
  getApprovedEntityByCanonicalId(
    geographicEntityId: string,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniCanonicalGeographicEntity>>;
  resolveIdentifier(
    query: IrniGeographicIdentifierQuery,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniGeographicIdResolutionResult>>;
  listApprovedEntitiesPaginated(
    filter: IrniGeographicEntityFilter,
    page: IrniCursorPageRequest,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniGeographicEntityPage>>;
  listApprovedRelationshipsForEntity(
    geographicEntityId: string,
    expectedRegistryRevision: number,
  ): Promise<IrniGeographicPersistenceResult<IrniGeographicRelationshipSnapshot>>;
}

export type IrniGeographicRpcFailureCode =
  | 'IRNI_RPC_BINDING_UNAVAILABLE'
  | 'IRNI_RPC_RUNTIME_UNAVAILABLE'
  | 'IRNI_RPC_CONTRACT_MISMATCH'
  | 'IRNI_RPC_REGISTRY_UNVERIFIED'
  | 'IRNI_RPC_INVALID_RESPONSE'
  | 'IRNI_RPC_INVALID_PARAMETERS';
