import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../core';

export type PropertyAssetCategory =
  | 'residential_apartment'
  | 'residential_house'
  | 'villa'
  | 'land'
  | 'commercial_property'
  | 'office_property'
  | 'retail_unit'
  | 'industrial_property'
  | 'warehouse'
  | 'mixed_use'
  | 'under_construction';

export type BuildingStructuralType =
  | 'concrete_frame'
  | 'steel_frame'
  | 'masonry'
  | 'prefabricated';

export type BuildingCompletionStatus =
  | 'completed'
  | 'under_construction'
  | 'renovation_in_progress';

export type UnitUsageType =
  | 'residential'
  | 'commercial'
  | 'office'
  | 'storage'
  | 'parking';

export type AssetRecordStatus = 'active' | 'archived' | 'merged' | 'under_review';

export type ProvenanceSource =
  | 'user_submission'
  | 'listing_extraction'
  | 'external_import'
  | 'admin_verified';

export type VerificationStatus =
  | 'unverified'
  | 'algorithm_matched'
  | 'admin_reviewed'
  | 'officially_verified';

export type BuildingCondition =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'needs_renovation'
  | 'demolition_grade';

export type RenovationStatus =
  | 'luxury_renovated'
  | 'renovated'
  | 'standard'
  | 'unrenovated';

export type LandUseClassification =
  | 'residential'
  | 'commercial'
  | 'mixed'
  | 'agricultural'
  | 'industrial';

export interface GeographicRef {
  cityId: string;
  districtId?: number;
  hoodId: number;
  streetText?: string;
}

export interface ExactLocationPrivate {
  latitude?: number;
  longitude?: number;
  postalCode?: string;
  exactUnitAddress?: string;
}

export interface AssetAmenities {
  hasParking?: boolean;
  hasElevator?: boolean;
  hasStorage?: boolean;
  hasBalcony?: boolean;
}

export interface CommercialCharacteristics {
  commercialPermitNumber?: string;
  frontageMeters?: number;
  ceilingHeightMeters?: number;
  footTrafficGrade?: 'high' | 'medium' | 'low';
}

export interface StoredPropertyAsset {
  id: string;
  category: PropertyAssetCategory;
  subtype: string;
  geographicRef: GeographicRef;
  buildingId?: string;
  unitId?: string;
  parcelId?: string;
  areaSqm: number;
  landAreaSqm?: number;
  constructionYear?: number;
  floorNumber?: number;
  totalFloors?: number;
  roomCount?: number;
  buildingCondition?: BuildingCondition;
  renovationStatus?: RenovationStatus;
  amenities: AssetAmenities;
  commercialCharacteristics?: CommercialCharacteristics;
  status: AssetRecordStatus;
  mergedIntoAssetId?: string;
  aliases: string[];
  provenance: {
    source: ProvenanceSource;
    sourceRef?: string;
    verificationStatus: VerificationStatus;
    lastVerifiedAtIso?: string;
  };
  exactLocationPrivate?: ExactLocationPrivate;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface StoredBuilding {
  id: string;
  buildingType: 'residential' | 'commercial' | 'office' | 'mixed';
  geographicRef: GeographicRef;
  nameOrTitle?: string;
  totalFloors: number;
  unitsCount?: number;
  constructionYear?: number;
  structuralType?: BuildingStructuralType;
  commonFacilities: string[];
  completionStatus: BuildingCompletionStatus;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface StoredBuildingUnit {
  id: string;
  parentBuildingId: string;
  unitNumberOrRef: string;
  floor: number;
  areaSqm: number;
  usageType: UnitUsageType;
  roomCount?: number;
  status: 'active' | 'archived';
  createdAtIso: string;
  updatedAtIso: string;
}

export interface StoredLandParcel {
  id: string;
  geographicRef: GeographicRef;
  areaSqm: number;
  landUseClassification: LandUseClassification;
  zoningCode?: string;
  developmentStatus: 'vacant' | 'developed' | 'brownfield' | 'agricultural';
  frontageMeters?: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface StoredAssetListingLink {
  id: string;
  assetId: string;
  listingId: string;
  listingSourceModule: string;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReason: string;
  verified: boolean;
  linkedAtIso: string;
  linkedByUid: string;
}

export interface StoredDuplicateMatchCandidate {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  similarityScore: number;
  matchReasons: string[];
  status: 'pending_review' | 'approved_merged' | 'rejected_distinct';
  reviewedByUid?: string;
  reviewedAtIso?: string;
  createdAtIso: string;
}

export interface StoredAssetHistoryRecord {
  id: string;
  assetId: string;
  changeType: 'created' | 'attribute_updated' | 'merged' | 'listing_linked' | 'listing_unlinked';
  actorUid: string;
  timestampIso: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  note?: string;
}

export interface PublicPropertyAssetView {
  id: string;
  category: PropertyAssetCategory;
  subtype: string;
  geographicRef: {
    cityId: string;
    hoodId: number;
    districtId?: number;
  };
  areaSqm: number;
  landAreaSqm?: number;
  constructionYear?: number;
  floorNumber?: number;
  totalFloors?: number;
  roomCount?: number;
  amenities: AssetAmenities;
  status: AssetRecordStatus;
  verificationStatus: VerificationStatus;
}

export interface BargainsListingConsumerAdapter {
  getListingSummary: (listingId: string) => Promise<{
    id: string;
    cityId: string;
    hoodId: number;
    sqm: number;
    buildYear?: number;
    floor?: number;
    totalFloors?: number;
  } | null>;
}

export interface GeographyReferenceAdapter {
  verifyNeighborhoodExists: (cityId: string, hoodId: number) => Promise<{ exists: boolean; hoodName?: string }>;
}

export interface PropertyRegistryRepositoryAdapter {
  saveAsset: (asset: StoredPropertyAsset) => Promise<void>;
  getAsset: (id: string) => Promise<StoredPropertyAsset | null>;
  queryAssetsByNeighborhood: (cityId: string, hoodId: number) => Promise<StoredPropertyAsset[]>;
  saveBuilding: (building: StoredBuilding) => Promise<void>;
  getBuilding: (id: string) => Promise<StoredBuilding | null>;
  saveUnit: (unit: StoredBuildingUnit) => Promise<void>;
  getUnitsByBuilding: (buildingId: string) => Promise<StoredBuildingUnit[]>;
  saveParcel: (parcel: StoredLandParcel) => Promise<void>;
  getParcel: (id: string) => Promise<StoredLandParcel | null>;
  saveListingLink: (link: StoredAssetListingLink) => Promise<void>;
  deleteListingLink: (linkId: string) => Promise<void>;
  getListingLinksByAsset: (assetId: string) => Promise<StoredAssetListingLink[]>;
  saveDuplicateCandidate: (cand: StoredDuplicateMatchCandidate) => Promise<void>;
  getDuplicateCandidate: (id: string) => Promise<StoredDuplicateMatchCandidate | null>;
  saveHistoryRecord: (record: StoredAssetHistoryRecord) => Promise<void>;
  getHistoryRecords: (assetId: string) => Promise<StoredAssetHistoryRecord[]>;
}

export interface PropertyRegistryModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  idempotencyStore: IdempotencyStoreAdapter;
  auditSink: AuditEventSink;
  repository: PropertyRegistryRepositoryAdapter;
  geographyAdapter: GeographyReferenceAdapter;
  bargainsAdapter?: BargainsListingConsumerAdapter;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
}
