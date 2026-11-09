import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  NormalizedTimestamp,
  TransactionRunnerAdapter,
} from '../../core';

export type MarketGeographicLevel = 'CITY' | 'DISTRICT' | 'NEIGHBORHOOD';

export interface CanonicalMarketGeographicEntity {
  geographicEntityId: string;
  cityId: string;
  provinceId: string;
  districtId?: string;
  numericNeighborhoodId?: number;
  level: MarketGeographicLevel;
  nameFa: string;
  nameEn: string;
  boundaryVersion: string;
  crs: 'EPSG:4326';
}

export interface MarketGeographicLookup {
  geographicEntityId?: string;
  cityId?: string;
  districtId?: string;
  numericNeighborhoodId?: number;
  nameFa?: string;
  boundaryVersion?: string;
}

/**
 * Adapter contract for the Geography module (Section 5 & 20).
 */
export interface MarketGeographyReadAdapter {
  resolveMarketGeography(lookup: MarketGeographicLookup): Promise<{
    resolved: boolean;
    ambiguous: boolean;
    candidateEntityIds?: string[];
    entity?: CanonicalMarketGeographicEntity;
  }>;
}

export type MarketTransactionMode = 'SALE' | 'RENTAL';
export type PropertyUseCategory = 'RESIDENTIAL' | 'COMMERCIAL';
export type PropertyFormCategory = 'APARTMENT' | 'HOUSE' | 'OFFICE' | 'RETAIL_SHOP';
export type ConstructionStageCategory = 'NEW_CONSTRUCTION' | 'EXISTING_PROPERTY';
export type SizeBandCategory = 'SMALL_UNDER_75' | 'MEDIUM_75_TO_130' | 'LARGE_OVER_130';
export type AgeBandCategory = 'NEW_0_TO_3' | 'ESTABLISHED_4_TO_15' | 'OLDER_OVER_15';

export type RawListingLifecycleState =
  | 'ACTIVE'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'REACTIVATED';

export interface RawMarketListingObservation {
  listingId: string;
  /** Canonical property ID used to deduplicate multiple advertisements for the same property (Section 7) */
  canonicalPropertyRefId: string;
  geographicEntityId: string;
  reportingPeriodKey: string;
  marketType: MarketTransactionMode;
  propertyUse: PropertyUseCategory;
  propertyForm: PropertyFormCategory;
  constructionStage: ConstructionStageCategory;
  listedAreaSqm: number | null;
  verifiedAreaSqm: number | null;
  constructionAgeYears: number | null;
  lifecycleState: RawListingLifecycleState;
  publishedAtIso: string;
  firstObservedAtIso: string;
  reactivatedAtIso?: string;
  priorActiveDaysBeforeReactivation?: number;
  withdrawnOrExpiredAtIso?: string;
  currency: 'TOMAN' | 'IRT' | 'IRR';
  initialSaleAskingTotal?: number | null;
  currentSaleAskingTotal?: number | null;
  monthlyAskingRent?: number | null;
  askingSecurityDeposit?: number | null;
  sourceDatasetId: string;
  sourceObservedAtIso: string;
}

/**
 * Adapter contract for Property Search and Bargains listing inventory (Sections 7, 9, 10, 20).
 */
export interface MarketListingSupplyReadAdapter {
  listListingObservations(params: {
    geographicEntityId: string;
    reportingPeriodKey: string;
    marketType?: MarketTransactionMode;
  }): Promise<RawMarketListingObservation[]>;
}

export type TransactionVerificationClassification =
  | 'AUTHORITATIVELY_CONFIRMED_COMPLETED'
  | 'AGREED_PENDING_COMPLETION'
  | 'REPORTED_UNVERIFIED';

export interface RawMarketTransactionObservation {
  transactionId: string;
  canonicalPropertyRefId: string;
  linkedListingId?: string;
  geographicEntityId: string;
  reportingPeriodKey: string;
  marketType: MarketTransactionMode;
  propertyUse: PropertyUseCategory;
  propertyForm: PropertyFormCategory;
  constructionStage: ConstructionStageCategory;
  listedAreaSqm: number | null;
  verifiedAreaSqm: number | null;
  constructionAgeYears: number | null;
  verificationClassification: TransactionVerificationClassification;
  currency: 'TOMAN' | 'IRT' | 'IRR';
  askingPriceTotal?: number | null;
  agreedPriceTotal?: number | null;
  confirmedTransactionPriceTotal?: number | null;
  agreedMonthlyRent?: number | null;
  confirmedMonthlyRent?: number | null;
  agreedSecurityDeposit?: number | null;
  confirmedSecurityDeposit?: number | null;
  listingPublishedAtIso?: string;
  firstOfferSubmittedAtIso?: string;
  agreementReachedAtIso?: string;
  completedAtIso?: string;
  sourceDatasetId: string;
  sourceObservedAtIso: string;
}

/**
 * Adapter contract for Property Transactions module (Sections 9, 10, 12, 20).
 */
export interface MarketTransactionsReadAdapter {
  listTransactionObservations(params: {
    geographicEntityId: string;
    reportingPeriodKey: string;
    marketType?: MarketTransactionMode;
  }): Promise<RawMarketTransactionObservation[]>;
}

export type DemandSignalClassification =
  | 'RAW_PAGE_VIEW_TELEMETRY'
  | 'SUBMITTED_INQUIRY'
  | 'QUALIFIED_INQUIRY'
  | 'SUBMITTED_OFFER'
  | 'ACCEPTED_AGREEMENT';

export interface RawMarketDemandSignal {
  signalId: string;
  /** Hashed actor identifier used strictly to deduplicate repeat actions by the same user (Section 8) */
  actorUidHash: string;
  geographicEntityId: string;
  reportingPeriodKey: string;
  marketType: MarketTransactionMode;
  propertyUse: PropertyUseCategory;
  propertyForm: PropertyFormCategory;
  signalType: DemandSignalClassification;
  occurredAtIso: string;
  sourceModule: 'BARGAINS' | 'BUYER_ALERTS' | 'PROPERTY_TRANSACTIONS' | 'TELEMETRY';
}

/**
 * Adapter contract for observable demand signals (Section 8 & 20).
 */
export interface MarketDemandSignalsReadAdapter {
  listDemandSignals(params: {
    geographicEntityId: string;
    reportingPeriodKey: string;
    marketType?: MarketTransactionMode;
  }): Promise<RawMarketDemandSignal[]>;
}

export interface VerifiedMacroeconomicPeriodRecord {
  reportingPeriodKey: string;
  basePeriodKey: string;
  cpiIndexBase100: number | null;
  constructionCostIndexBase100: number | null;
  referenceAnnualInterestRatePct: number | null;
  usdExchangeRateToman: number | null;
  sourceAuthority: string;
  observedAtIso: string;
  verified: boolean;
}

/**
 * Adapter contract for Macroeconomic & Inflation Context (Section 18).
 */
export interface MacroeconomicSeriesReadAdapter {
  getMacroeconomicRecord(reportingPeriodKey: string): Promise<VerifiedMacroeconomicPeriodRecord | null>;
}

export interface MarketIntelligenceModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  adminStore?: DelegatedAdminStoreAdapter | null;
  tokenVerifier?: FirebaseTokenVerifierAdapter | null;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
  geography: MarketGeographyReadAdapter;
  listingSupply?: MarketListingSupplyReadAdapter;
  transactions?: MarketTransactionsReadAdapter;
  demandSignals?: MarketDemandSignalsReadAdapter;
  macroeconomic?: MacroeconomicSeriesReadAdapter;
}

export type { NormalizedTimestamp };
