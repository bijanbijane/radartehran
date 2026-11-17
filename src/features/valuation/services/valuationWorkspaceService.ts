/** @file src/features/valuation/services/valuationWorkspaceService.ts — Canonical Hedonic Wrapper, Quality Axes & Snapshots */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { getNeighborhoodDeepInsight } from '../../../data/neighborhoodInsights';
import { calculateHedonicValuation, getCurrentJalaliYear } from '../../../data/hedonicPricingEngine';
import { readScopedStorageJson, writeScopedStorageJson } from '../../account/services/accountStorageScope';
import { buildValuationComparables } from './valuationComparablesService';
import type {
  FieldOriginMap,
  ModelUncertaintyAssessment,
  ModelValidationAssessment,
  SavedValuationReport,
  ValuationWorkspaceInput,
  ValuationWorkspaceResult,
} from '../types/valuation.types';

const SAVED_VALUATIONS_KEY = 'radar_valuation_reports_v1';
export const VALUATION_MODEL_ID = 'RADAR_HEDONIC_V1';
export const VALUATION_MODEL_VERSION = 'Hedonic Rule Heuristic v1405.1';
export const VALUATION_METHODOLOGY_VERSION = 'hedonic_rule_1405_1';
export const VALUATION_DATA_SNAPSHOT_ID = 'snapshot-tehran-curated-1405';

export const DEFAULT_INPUT_ORIGINS: FieldOriginMap = {
  sqm: 'user_provided',
  buildYear: 'user_provided',
  floor: 'user_provided',
  renovationStatus: 'user_provided',
  amenities: 'user_provided',
  sellerAsking: 'user_provided',
};

export function createDefaultValuationInput(
  hoodId: number,
  overrides: Partial<ValuationWorkspaceInput> = {},
): ValuationWorkspaceInput {
  return {
    propertyCategory: 'residential_apartment',
    purpose: 'sale',
    hoodId,
    streetTier: 'balanced',
    locationPrecision: 'approximate',
    sqm: 85,
    buildYear: Math.max(1375, getCurrentJalaliYear() - 6),
    renovationStatus: 'renovated',
    floor: 3,
    totalFloors: 5,
    hasElevator: true,
    hasParking: true,
    hasStorage: true,
    sellerAskingBillion: '',
    inputOrigins: { ...DEFAULT_INPUT_ORIGINS, ...(overrides.inputOrigins || {}) },
    ...overrides,
  };
}

export function evaluateWorkspaceValuation(
  input: ValuationWorkspaceInput,
  hood: EvaluatedNeighborhood,
): ValuationWorkspaceResult {
  const { comparables, sufficiency, v64NeighborhoodDealPerSqm } = buildValuationComparables(hood, input.sqm);
  const snapshot = {
    modelId: VALUATION_MODEL_ID,
    modelVersion: VALUATION_MODEL_VERSION,
    methodologyVersion: VALUATION_METHODOLOGY_VERSION,
    dataSnapshotId: VALUATION_DATA_SNAPSHOT_ID,
    calculatedAtIso: new Date().toISOString(),
  };

  const validation: ModelValidationAssessment = {
    status: 'rule_based_uncalibrated_against_deeds',
    labelFa: 'مبتنی بر ضرایب قاعده‌محور (بدون اعتبارسنجی ثبتی)',
    explanationFa:
      'به دلیل نبود فید عمومی اسناد رسمی معامله، این مدل با داده‌های رسمی دفترخانه بازآزمایی (Backtest) نشده است.',
  };

  const precisionPenalty = input.locationPrecision === 'neighborhood' ? 1.5 : 0;
  const samplePenalty = sufficiency.level === 'baseline_only' ? 2.0 : sufficiency.level === 'limited' ? 1.0 : 0;
  const bandPercent = Number((3.5 + precisionPenalty + samplePenalty).toFixed(1));
  const uncertainty: ModelUncertaintyAssessment = {
    level: bandPercent >= 5.5 ? 'high' : 'moderate',
    bandPercent,
    labelFa: bandPercent >= 5.5 ? `عدم‌قطعیت بالا (±${bandPercent}٪)` : `عدم‌قطعیت متوسط (±${bandPercent}٪)`,
    rationaleFa:
      input.locationPrecision === 'neighborhood'
        ? 'دقت موقعیت در سطح کل محله انتخاب شده و اسناد رسمی معامله در دسترس نیست؛ بنابراین بازه حساسیت عریض‌تر است.'
        : 'برآورد بدون دسترسی به معاملات ثبت‌شده و با حساسیت پارامتری وضعیت نگهداری و خرده‌محله محاسبه شده است.',
  };

  if (input.propertyCategory !== 'residential_apartment' && input.propertyCategory !== 'residential_villa') {
    return {
      scopeSupported: false,
      unsupportedReasonFa:
        'مدل ارزش‌گذاری هدونیک رادار تهران منحصراً برای واحدهای مسکونی کالیبره شده است. برای املاک تجاری، اداری یا زمین از برآوردهای مسکونی استفاده نمی‌شود و نیازمند ارزیابی حضوری یا داده‌های تخصصی صنفی است.',
      modelVersion: VALUATION_MODEL_VERSION,
      snapshot,
      hedonic: null,
      v64NeighborhoodDealPerSqm,
      comparables: [],
      sufficiency,
      completenessPercent: 100,
      uncertainty,
      validation,
    };
  }

  const microHoods = getNeighborhoodDeepInsight(hood).microHoods;
  const activeTier = microHoods.find((m) => m.tier === input.streetTier);
  const parsedAsk = Number.parseFloat(input.sellerAskingBillion);
  const sellerAskingTotalMillion =
    Number.isFinite(parsedAsk) && parsedAsk > 0
      ? parsedAsk < 1000
        ? Math.round(parsedAsk * 1000)
        : Math.round(parsedAsk)
      : undefined;

  const hedonic = calculateHedonicValuation({
    neighborhood: hood,
    sqm: input.sqm,
    buildYear: input.buildYear,
    renovationStatus: input.renovationStatus,
    floor: input.floor,
    totalFloors: input.totalFloors,
    hasElevator: input.hasElevator,
    hasParking: input.hasParking,
    hasStorage: input.hasStorage,
    streetTier: input.streetTier,
    streetMultiplier: activeTier?.priceMultiplier,
    sellerAskingTotalMillion,
  });

  const filledCore =
    (input.sqm > 0 ? 1 : 0) +
    (input.buildYear >= 1340 ? 1 : 0) +
    (input.floor >= -2 ? 1 : 0) +
    (input.totalFloors >= 1 ? 1 : 0) +
    (input.sellerAskingBillion.trim() ? 1 : 0);
  const completenessPercent = Math.round((filledCore / 5) * 100);

  return {
    scopeSupported: true,
    modelVersion: VALUATION_MODEL_VERSION,
    snapshot,
    hedonic,
    v64NeighborhoodDealPerSqm,
    comparables,
    sufficiency,
    completenessPercent,
    uncertainty,
    validation,
  };
}

export function loadSavedValuationReports(uid?: string | null): SavedValuationReport[] {
  const items = readScopedStorageJson<unknown[]>(SAVED_VALUATIONS_KEY, [], uid);
  return Array.isArray(items) ? (items as SavedValuationReport[]) : [];
}

export function persistSavedValuationReports(reports: SavedValuationReport[], uid?: string | null): void {
  writeScopedStorageJson(SAVED_VALUATIONS_KEY, reports.slice(0, 25), uid);
}

export function createSavedValuationReport(
  input: ValuationWorkspaceInput,
  hoodName: string,
  result: ValuationWorkspaceResult,
): SavedValuationReport | null {
  if (!result.scopeSupported || !result.hedonic || !result.hedonic.isValid) return null;
  const h = result.hedonic;
  return {
    id: `val-${Date.now()}`,
    savedAtIso: result.snapshot.calculatedAtIso,
    hoodName,
    modelVersion: result.modelVersion,
    dataSnapshotId: result.snapshot.dataSnapshotId,
    input: { ...input, inputOrigins: { ...input.inputOrigins } },
    hedonicTotalMillion: h.hedonicTotalMillion,
    hedonicPerSqm: h.hedonicPerSqm,
    fastSaleTotalMillion: h.fastSaleTotalMillion,
    sensitivityMinMillion: h.sensitivityRangeMillion.min,
    sensitivityMaxMillion: h.sensitivityRangeMillion.max,
  };
}
