/** @file src/features/valuation/types/valuation.types.ts — Structured Stage 20 Valuation Workspace Types */
import type { HedonicRenovationStatus, HedonicValuationResult } from '../../../data/hedonicPricingEngine';

export type ValuationPropertyCategory = 'residential_apartment' | 'residential_villa' | 'commercial' | 'office' | 'land';
export type ValuationPurpose = 'sale' | 'rent' | 'current_value';
export type StreetTierId = 'luxury' | 'balanced' | 'economic';
export type InputOrigin = 'user_provided' | 'system_retrieved' | 'verified' | 'estimated';
export type ValuationLocationPrecision = 'approximate' | 'neighborhood' | 'exact';
export type ValuationOriginField = 'sqm' | 'buildYear' | 'floor' | 'renovationStatus' | 'amenities' | 'sellerAsking';
export type FieldOriginMap = Record<ValuationOriginField, InputOrigin>;

export const INPUT_ORIGIN_LABELS_FA: Record<InputOrigin, string> = {
  user_provided: 'اظهارشده توسط کاربر',
  system_retrieved: 'استخراج‌شده از آگهی (غیررسمی)',
  verified: 'تأییدشده ثبتی',
  estimated: 'برآورد تقریبی سیستم',
};

export const LOCATION_PRECISION_LABELS_FA: Record<ValuationLocationPrecision, string> = {
  approximate: 'محدوده تقریبی خیابان / زیرپهنه',
  neighborhood: 'در سطح کل محله',
  exact: 'پلاک یا نقطه دقیق ثبت‌شده',
};

export interface ValuationWorkspaceInput {
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
}

export interface ComparableEvidenceItem {
  id: string;
  title: string;
  street: string;
  sqm: number;
  askPerSqmMillion: number;
  similarityScore: number;
  similarityReason: string;
  evidenceKind: 'curated_asking' | 'neighborhood_baseline';
}

export interface SampleSufficiencyAssessment {
  level: 'sufficient' | 'limited' | 'baseline_only';
  observedSamplesCount: number;
  verifiedTransactionCount: 0;
  labelFa: string;
  explanationFa: string;
}

export interface ModelUncertaintyAssessment {
  level: 'low' | 'moderate' | 'high';
  bandPercent: number;
  labelFa: string;
  rationaleFa: string;
}

export interface ModelValidationAssessment {
  status: 'rule_based_uncalibrated_against_deeds';
  labelFa: string;
  explanationFa: string;
}

export interface ValuationResultSnapshot {
  modelId: string;
  modelVersion: string;
  methodologyVersion: string;
  dataSnapshotId: string;
  calculatedAtIso: string;
}

export interface ValuationWorkspaceResult {
  scopeSupported: boolean;
  unsupportedReasonFa?: string;
  modelVersion: string;
  snapshot: ValuationResultSnapshot;
  hedonic: HedonicValuationResult | null;
  v64NeighborhoodDealPerSqm: number;
  comparables: ComparableEvidenceItem[];
  sufficiency: SampleSufficiencyAssessment;
  completenessPercent: number;
  uncertainty: ModelUncertaintyAssessment;
  validation: ModelValidationAssessment;
}

export interface SavedValuationReport {
  id: string;
  savedAtIso: string;
  hoodName: string;
  modelVersion: string;
  dataSnapshotId?: string;
  input: ValuationWorkspaceInput;
  hedonicTotalMillion: number;
  hedonicPerSqm: number;
  fastSaleTotalMillion: number;
  sensitivityMinMillion: number;
  sensitivityMaxMillion: number;
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
  rent: 'برآورد ارزش رهن و اجاره',
  current_value: 'بررسی ارزش برآوردی فعلی',
};
