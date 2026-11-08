/**
 * Employee 69 — Real Estate Search Intelligence, Discovery & Recommendation Engine Backend
 * (`server/modules/search-intelligence/types.ts`)
 *
 * Exclusive ownership: `server/modules/search-intelligence/`
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core/types';

export type IntelligentPropertyCategory =
  | 'residential'
  | 'commercial'
  | 'office'
  | 'land'
  | 'villa'
  | 'industrial';

export type IntelligentTransactionType =
  | 'buy'
  | 'rent'
  | 'full_mortgage'
  | 'pre_sale'
  | 'participatory';

export type HeatingCoolingSystemType =
  | 'chiller'
  | 'split_duct'
  | 'package_radiator'
  | 'cooler_heater'
  | 'underfloor_heating';

export type OwnershipDeedStatus =
  | 'single_leaf_official'
  | 'cooperative_contract'
  | 'endowment_awqaf'
  | 'power_of_attorney';

export type BuildingConditionClass =
  | 'new_unoccupied'
  | 'luxury_renovated'
  | 'standard_maintained'
  | 'needs_renovation';

export interface IndexedPropertyDocument {
  propertyId: string;
  listingId: string;
  canonicalVersion: number;
  ownerUid: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
  publicationStatus: 'PUBLISHED' | 'DRAFT' | 'UNPUBLISHED' | 'EXPIRED';
  availabilityStatus: 'AVAILABLE' | 'UNDER_OFFER' | 'SOLD' | 'RENTED' | 'OFF_MARKET';
  title: string;
  description: string;
  cityId: string;
  districtNumber: number;
  neighborhoodId: number;
  neighborhoodName: string;
  category: IntelligentPropertyCategory;
  subtype: string;
  transactionType: IntelligentTransactionType;
  askingPriceMillions: number;
  pricePerSqmMillions: number;
  estimatedValuationMillions: number;
  depositMillions: number;
  monthlyRentMillions: number;
  areaSqm: number;
  landAreaSqm: number | null;
  rooms: number;
  floorNumber: number;
  totalFloors: number;
  buildingAgeYears: number;
  hasParking: boolean;
  hasElevator: boolean;
  hasStorage: boolean;
  hasBalcony: boolean;
  nearMetro: boolean;
  heatingCoolingSystems: HeatingCoolingSystemType[];
  buildingCondition: BuildingConditionClass;
  ownershipDeedStatus: OwnershipDeedStatus;
  coordinates: { lat: number; lng: number };
  completenessScore: number; // 0..100
  dataQualityScore: number; // 0..100
  verifiedListing: boolean;
  isPaidPromotion: boolean;
  promotionCampaignId: string | null;
  publishedAtIso: string;
  updatedAtIso: string;
  indexedAtIso: string;
}

export interface IntelligentSearchQueryFilters {
  rawQueryText?: string;
  normalizedQueryText?: string;
  cityId?: string;
  districtNumber?: number;
  neighborhoodIds?: number[];
  excludedNeighborhoodIds?: number[];
  categories?: IntelligentPropertyCategory[];
  excludedCategories?: IntelligentPropertyCategory[];
  subtype?: string;
  transactionTypes?: IntelligentTransactionType[];
  minAskingPriceMillion?: number;
  maxAskingPriceMillion?: number;
  minDepositMillion?: number;
  maxDepositMillion?: number;
  minMonthlyRentMillion?: number;
  maxMonthlyRentMillion?: number;
  minAreaSqm?: number;
  maxAreaSqm?: number;
  minLandAreaSqm?: number;
  maxLandAreaSqm?: number;
  minBuildingAgeYears?: number;
  maxBuildingAgeYears?: number;
  minRooms?: number;
  maxRooms?: number;
  minFloor?: number;
  maxFloor?: number;
  minTotalFloors?: number;
  maxTotalFloors?: number;
  hasParking?: boolean;
  hasElevator?: boolean;
  hasStorage?: boolean;
  nearMetroOnly?: boolean;
  heatingCoolingSystems?: HeatingCoolingSystemType[];
  buildingConditions?: BuildingConditionClass[];
  ownershipDeedStatuses?: OwnershipDeedStatus[];
  verifiedOnly?: boolean;
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  radiusSearch?: {
    lat: number;
    lng: number;
    radiusMeters: number;
  };
  polygonVertices?: Array<{ lat: number; lng: number }>;
}

export type IntelligentSortMode =
  | 'relevance'
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'area_asc'
  | 'area_desc'
  | 'distance_asc';

export interface NaturalLanguageQueryInterpretation {
  originalQuery: string;
  normalizedQuery: string;
  tokens: string[];
  extractedFilters: IntelligentSearchQueryFilters;
  matchedSynonyms: Array<{ token: string; canonicalTerm: string }>;
  unparsedTokens: string[];
  isAmbiguous: boolean;
  ambiguityNotes: string[];
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW_AMBIGUOUS';
}

export interface RankingSignalWeights {
  queryRelevance: number;
  propertyTypeMatch: number;
  locationMatch: number;
  priceCompatibility: number;
  areaCompatibility: number;
  featureMatch: number;
  freshness: number;
  completeness: number;
  dataQuality: number;
  verificationBonus: number;
}

export interface RankingPolicyRecord {
  policyId: string;
  version: number;
  name: string;
  weights: RankingSignalWeights;
  active: boolean;
  updatedByUid: string;
  updatedAtIso: string;
}

export interface RankedPropertySearchHit {
  item: IndexedPropertyDocument;
  organicRelevanceScore: number;
  distanceMeters: number | null;
  isPaidPromotionPlacement: boolean;
  paidPromotionLabel: string | null;
  rankingExplanation: {
    policyId: string;
    policyVersion: number;
    factorBreakdown: Record<keyof RankingSignalWeights, number>;
    missingDataPenalties: string[];
  };
}

export interface SearchFacetBucketsView {
  totalAuthorizedMatches: number;
  aggregationStatus: 'OK' | 'ZERO_RESULTS';
  byCategory: Record<string, number>;
  byTransactionType: Record<string, number>;
  byNeighborhoodId: Record<string, { neighborhoodId: number; name: string; count: number }>;
  byRoomCount: Record<string, number>;
  byPriceRangeBucket: Record<string, number>;
  byAreaRangeBucket: Record<string, number>;
  byVerificationStatus: { verified: number; standard: number };
  byAmenities: { parking: number; elevator: number; storage: number; nearMetro: number };
}

export type SimilarityRelationshipCategory =
  | 'SIMILAR_PROPERTIES'
  | 'FINANCIALLY_COMPARABLE'
  | 'NEARBY_PROPERTIES'
  | 'ALTERNATIVE_LISTINGS';

export interface PropertySimilarityMatch {
  property: IndexedPropertyDocument;
  relationshipCategory: SimilarityRelationshipCategory;
  overallSimilarityScore: number; // 0..100
  financialComparabilityScore: number; // 0..100
  distanceMeters: number;
  explanationFactors: string[];
}

export interface IndexSynchronizationRecord {
  syncId: string;
  propertyId: string;
  eventId: string;
  eventType:
    | 'LISTING_CREATED'
    | 'LISTING_UPDATED'
    | 'PRICE_CHANGED'
    | 'AVAILABILITY_CHANGED'
    | 'PUBLICATION_CHANGED'
    | 'VERIFICATION_CHANGED'
    | 'LISTING_EXPIRED'
    | 'LISTING_DELETED_OR_RESTRICTED';
  canonicalVersion: number;
  status: 'SYNCHRONIZED' | 'SKIPPED_STALE_VERSION' | 'REMOVED_FROM_INDEX' | 'FAILED';
  syncedAtIso: string;
}

export interface SearchIntelligenceDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  idempotencyStore?: IdempotencyStoreAdapter;
  primaryAdminEmails?: string[];
}
