/** @file src/features/valuation/types/valuation.types.ts — Stages 89–96 Valuation Provenance, Purpose Separation, Comparables & Reproducible Snapshot Types */
import type { CityId } from '../../../data/multiCityData';
import type { HedonicRenovationStatus, HedonicValuationResult } from '../../../data/hedonicPricingEngine';

export type ValuationPropertyCategory =
  | 'residential_apartment'
  | 'residential_villa'
  | 'commercial'
  | 'office'
  | 'land';

export type ValuationPurpose = 'sale' | 'rent' | 'current_value';
export type StreetTierId = 'luxury' | 'balanced' | 'economic';

/** Stage 89.1: Expanded input provenance origins */
export type InputOrigin =
  | 'user_provided'
  | 'system_retrieved'
  | 'verified'
  | 'estimated'
  | 'default_assumption'
  | 'unknown';

export type ValuationLocationPrecision = 'approximate' | 'neighborhood' | 'exact';
export type ValuationOriginField =
  | 'sqm'
  | 'buildYear'
  | 'floor'
  | 'renovationStatus'
  | 'amenities'
  | 'sellerAsking';
export type FieldOriginMap = Record<ValuationOriginField, InputOrigin>;

export const INPUT_ORIGIN_LABELS_FA: Record<InputOrigin, string> = {
  user_provided: 'اظهارشده توسط کاربر',
  system_retrieved: 'استخراج‌شده از آگهی (نیازمند تأیید کاربر)',
  verified: 'تأییدشده ثبتی',
  estimated: 'برآورد تقریبی سیستم',
  default_assumption: 'پیش‌فرض فرضی سیستم',
  unknown: 'منشأ نامشخص',
};

export const LOCATION_PRECISION_LABELS_FA: Record<ValuationLocationPrecision, string> = {
  approximate: 'محدوده تقریبی خیابان / زیرپهنه',
  neighborhood: 'در سطح کل محله',
  exact: 'پلاک یا نقطه دقیق ثبت‌شده',
};

/** Stage 94.2: Canonical multi-city geographic scope */
export interface ValuationGeographicScope {
  cityId: CityId;
  neighborhoodId: number;
  canonicalNeighborhoodId: string;
}

export interface ValuationWorkspaceInput {
  cityId?: CityId;
  propertyCategory: ValuationPropertyCategory;
  purpose: ValuationPurpose;
  hoodId: number;
  streetTier: StreetTierId;
  locationPrecision: ValuationLocationPrecision;
  sqm: number;
  buildYear: number;
  renovationStatus: HedonicRenovationStatus;
  floor: number;
  totalFloors: number;
  hasElevator: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  sellerAskingBillion: string;
  inputOrigins: FieldOriginMap;
  isHypotheticalScenario?: boolean;
  scenarioId?: string;
}

export interface ValuationInputValidationResult {
  isValid: boolean;
  fieldErrors: Partial<Record<ValuationOriginField | 'totalFloors', string>>;
  hasDefaultAssumptions: boolean;
  hasUnconfirmedExtractedFields: boolean;
}

/** Stage 91.2: 5 distinct comparable evidence kinds */
export type ComparableEvidenceKind =
  | 'verified_transaction'
  | 'public_listing'
  | 'curated_listing'
  | 'neighborhood_baseline'
  | 'illustrative_scenario';

export const COMPARABLE_EVIDENCE_KIND_LABELS_FA: Record<ComparableEvidenceKind, string> = {
  verified_transaction: 'معامله تأییدشده ثبتی',
  public_listing: 'آگهی عمومی با منبع و تاریخ',
  curated_listing: 'فایل گردآوری و پالایش‌شده محله',
  neighborhood_baseline: 'شاخص مرجع کلان محله (غیرفایل)',
  illustrative_scenario: 'سناریوی نمونه آموزشی',
};

/** Stage 91.3: Traceable comparable evidence item without fabricated fields */
export interface ComparableEvidenceItem {
  id: string;
  title: string;
  street: string;
  evidenceKind: ComparableEvidenceKind;

  propertyId?: string;
  sourceId?: string;
  sourceUrl?: string;

  neighborhoodId: number;
  sqm?: number;
  buildYear?: number;
  floor?: number;

  priceTotalMillion?: number;
  pricePerSqmMillion?: number;
  /** Kept in sync with pricePerSqmMillion for UI compatibility when price exists */
  askPerSqmMillion: number;

  observedAt?: string;
  collectedAt?: string;
  lastVerifiedAt?: string;

  similarityScore: number;
  similarityReason: string;
  similarityFactors: string[];
  limitations: string[];
  isSupplementaryOnly?: boolean;
}

/** Stage 91.7: Separated listing vs transaction vs complete-record counts */
export interface SampleSufficiencyAssessment {
  level: 'sufficient' | 'limited' | 'baseline_only';
  observedSamplesCount: number;
  usableListingsCount: number;
  verifiedTransactionCount: number;
  recordsWithSqmCount: number;
  recordsWithPriceCount: number;
  recordsWithValidDateCount: number;
  labelFa: string;
  explanationFa: string;
}

export interface ModelUncertaintyAssessment {
  level: 'low' | 'moderate' | 'high';
  bandPercent: number;
  labelFa: string;
  rationaleFa: string;
  methodologyNoteFa: string;
}

/** Stage 92.4: Expandable model validation status */
export type ModelValidationStatus =
  | 'rule_based_uncalibrated_against_deeds'
  | 'limited_backtest'
  | 'documented_validation'
  | 'deprecated_under_review';

export interface ModelValidationAssessment {
  status: ModelValidationStatus;
  labelFa: string;
  explanationFa: string;
}

/** Stage 92.1 & 92.2: City-aware reproducible data & input snapshot */
export interface ValuationDataSnapshot {
  snapshotId: string;
  dataSnapshotId: string;
  cityId: CityId;
  neighborhoodId: number;
  canonicalNeighborhoodId: string;
  datasetVersion: string;
  modelId: string;
  modelVersion: string;
  methodologyVersion: string;
  dataAsOfIso: string;
  calculatedAtIso: string;
  comparableIds: string[];
  sourceIds: string[];
  inputFingerprint: string;
}

export type ValuationResultSnapshot = ValuationDataSnapshot;

/** Stage 90.1–90.4: Purpose-specific output contracts preventing Sale/Rent/CurrentValue conflation */
export interface SaleValuationResult {
  kind: 'sale';
  estimatedSaleTotalMillion: number;
  estimatedSaleTotalBillion: number;
  estimatedSalePerSqmMillion: number;
  sensitivityRangeMillion: { min: number; max: number };
  fastSaleTotalMillion: number;
  fastSaleSupported: boolean;
  sellerPriceComparison?: HedonicValuationResult['sellerPriceEvaluation'];
}

export interface RentValuationResult {
  kind: 'rent';
  estimationMode: 'neighborhood_index_limited_estimate';
  estimatedFullRahnMillion: number;
  sensitivityRahnRangeMillion: { min: number; max: number };
  monthlyRentEquivalentMillion: number | null;
  conversionRateMonthlyPercent: number | null;
  conversionRateSourceFa: string;
  methodologyLimitationFa: string;
}

export interface CurrentValueResult {
  kind: 'current_value';
  definitionKind: 'current_market_sale_estimate';
  definitionLabelFa: string;
  referenceDateIso: string;
  estimatedAssetTotalMillion: number;
  estimatedAssetTotalBillion: number;
  estimatedAssetPerSqmMillion: number;
  sensitivityRangeMillion: { min: number; max: number };
}

export type ValuationPurposeResult =
  | SaleValuationResult
  | RentValuationResult
  | CurrentValueResult;

export interface ValuationWorkspaceResult {
  scopeSupported: boolean;
  unsupportedReasonFa?: string;
  inputValidation: ValuationInputValidationResult;
  geographicScope: ValuationGeographicScope;
  modelVersion: string;
  snapshot: ValuationDataSnapshot;
  hedonic: HedonicValuationResult | null;
  purposeResult: ValuationPurposeResult | null;
  v64NeighborhoodDealPerSqm: number;
  comparables: ComparableEvidenceItem[];
  supplementaryComparables: ComparableEvidenceItem[];
  neighborhoodBaselineEvidence: ComparableEvidenceItem;
  sufficiency: SampleSufficiencyAssessment;
  completenessPercent: number;
  uncertainty: ModelUncertaintyAssessment;
  validation: ModelValidationAssessment;
}

/** Stage 93.3 & 93.7: Account-owned or device-local saved valuation report */
export interface SavedValuationReport {
  id: string;
  reportVersion: number;
  savedAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
  ownerUserId?: string;
  storageScope: 'account_synced' | 'device_local';
  cityId: CityId;
  neighborhoodId: number;
  hoodName: string;
  purpose: ValuationPurpose;
  modelVersion: string;
  dataSnapshotId: string;
  snapshot: ValuationDataSnapshot;
  inputFingerprint: string;
  input: ValuationWorkspaceInput;
  hedonicTotalMillion: number;
  hedonicPerSqm: number;
  estimatedRahnMillion?: number;
  fastSaleTotalMillion: number;
  sensitivityMinMillion: number;
  sensitivityMaxMillion: number;
  isHypotheticalScenario?: boolean;
  baseScenarioId?: string;
}

export const VALUATION_CATEGORY_LABELS_FA: Record<ValuationPropertyCategory, string> = {
  residential_apartment: 'آپارتمان مسکونی (پشتیبانی کامل)',
  residential_villa: 'خانه / ویلایی مسکونی (مقیاس هم‌ارز)',
  commercial: 'تجاری و مغازه (خارج از محدوده مدل)',
  office: 'اداری (خارج از محدوده مدل)',
  land: 'زمین و کلنگی (خارج از محدوده مدل)',
};

export const VALUATION_PURPOSE_LABELS_FA: Record<ValuationPurpose, string> = {
  sale: 'برآورد ارزش احتمالی فروش',
  rent: 'برآورد محدود رهن کامل (مبتنی بر شاخص محله)',
  current_value: 'ارزش جاری فروش دارایی (به نرخ داده‌های فعلی بازار)',
};
