/**
 * @file server/modules/property-registry/contracts/externalAdapters.ts
 * @description Explicit cross-module read-only and projection contracts for the Canonical Property Registry
 * (`server/modules/property-registry/`).
 *
 * Architectural rules:
 * - This module owns canonical physical property identity (`PARCEL`, `BUILDING`, `UNIT`, `OTHER_ASSET`)
 *   and structural relationships between them.
 * - It NEVER writes into Geography, Bargains, Valuation, Property Management, Due Diligence,
 *   Transactions, or Ingestion collections.
 * - It consumes canonical geographic validation from `GeographyReadAdapter` and source provenance
 *   metadata from `DataIngestionProvenanceReadAdapter`.
 */

export interface GeographicValidationResult {
  valid: boolean;
  provinceId: string;
  cityId: string;
  neighborhoodCompositeId: string | null;
  districtNumber: number | null;
  canonicalNeighborhoodNameFa: string | null;
  coordinateWithinCityBounds: boolean | null;
  validationNote?: string;
}

export interface GeographyReadAdapter {
  validateGeographicReference(input: {
    provinceId: string;
    cityId: string;
    neighborhoodCompositeId?: string | null;
    districtNumber?: number | null;
    coordinates?: { lat: number; lng: number } | null;
  }): Promise<GeographicValidationResult>;
}

export interface ImportedSourceRecordSummary {
  sourceRecordId: string;
  sourceSystemNamespace: string;
  jurisdiction: string;
  ingestedAtIso: string;
  sourceReliabilityTier: 'AUTHORITATIVE_OFFICIAL' | 'VERIFIED_PARTNER' | 'PLATFORM_INTERNAL' | 'USER_SUBMITTED' | 'UNVERIFIED_EXTERNAL';
  rawPayloadChecksum: string;
}

export interface DataIngestionProvenanceReadAdapter {
  getSourceRecordSummary(sourceRecordId: string): Promise<ImportedSourceRecordSummary | null>;
}

/**
 * Canonical read-only identity projection exposed to downstream modules:
 * - Bargains (listing-to-property identity references)
 * - Property Valuation (canonical asset references)
 * - Property Management (managed property and unit references)
 * - Property Due Diligence (property identity references in verification cases)
 * - Legal & Regulatory Intelligence (property and geographic applicability references)
 * - Property Risk (property exposure references)
 * - Building Sustainability (building and unit references)
 * - Development Projects (project-site and building references)
 * - Real Estate Transactions (property references used in transaction records)
 * - Urban Intelligence (geographic aggregation linkages)
 */
export interface CanonicalPropertyIdentityProjection {
  canonicalId: string;
  resolvedActiveCanonicalId: string;
  entityKind: 'PARCEL' | 'BUILDING' | 'UNIT' | 'OTHER_ASSET';
  registrationStatus:
    | 'ACTIVE_CANONICAL'
    | 'PROVISIONAL_INCOMPLETE'
    | 'MERGED_REDIRECT'
    | 'SPLIT_RETIRED'
    | 'DEMOLISHED_ARCHIVED'
    | 'REPLACED_ARCHIVED'
    | 'DISPUTED_CONFLICT';
  parentBuildingId: string | null;
  associatedParcelIds: string[];
  provinceId: string;
  cityId: string;
  neighborhoodCompositeId: string | null;
  districtNumber: number | null;
  redactedPublicAddressSummary: string;
  identityConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'PROVISIONAL';
  verificationStatus: 'OFFICIAL_VERIFIED' | 'MULTI_SOURCE_CORROBORATED' | 'SINGLE_SOURCE_REPORTED' | 'UNVERIFIED' | 'CONFLICTING';
  recordVersion: number;
  updatedAtIso: string;
}
