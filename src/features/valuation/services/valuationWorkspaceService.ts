/** @file src/features/valuation/services/valuationWorkspaceService.ts — Stages 89–96 Hedonic Valuation Orchestrator, Input Provenance & Purpose Separation */
import { resolveCityIdForNeighborhood, type CityId } from '../../../data/multiCityData';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { getNeighborhoodDeepInsight } from '../../../data/neighborhoodInsights';
import { calculateHedonicValuation, getCurrentJalaliYear } from '../../../data/hedonicPricingEngine';
import { buildValuationComparables } from './valuationComparablesService';
import {
  buildValuationSummaryCopyText,
  deleteValuationReport,
  generateValuationReportId,
  getMyValuationReports,
  getValuationReport,
  loadSavedValuationReports,
  persistSavedValuationReports,
  saveValuationReport,
  validateAndMigrateSavedValuationReports,
} from './valuationStorageAndApiClient';
import type {
  CurrentValueResult,
  FieldOriginMap,
  ModelUncertaintyAssessment,
  ModelValidationAssessment,
  RentValuationResult,
  SaleValuationResult,
  SavedValuationReport,
  ValuationDataSnapshot,
  ValuationGeographicScope,
  ValuationInputValidationResult,
  ValuationPurposeResult,
  ValuationWorkspaceInput,
  ValuationWorkspaceResult,
} from '../types/valuation.types';

export {
  buildValuationSummaryCopyText,
  deleteValuationReport,
  generateValuationReportId,
  getMyValuationReports,
  getValuationReport,
  loadSavedValuationReports,
  persistSavedValuationReports,
  saveValuationReport,
  validateAndMigrateSavedValuationReports,
};

export const VALUATION_MODEL_ID = 'RADAR_HEDONIC_V1';
export const VALUATION_MODEL_VERSION = 'Hedonic Rule Heuristic v1405.1';
export const VALUATION_METHODOLOGY_VERSION = 'hedonic_rule_1405_1';
export const VALUATION_DATA_SNAPSHOT_ID = 'snapshot-tehran-curated-1405';

export const DEFAULT_INPUT_ORIGINS: FieldOriginMap = {
  sqm: 'default_assumption',
  buildYear: 'default_assumption',
  floor: 'default_assumption',
  renovationStatus: 'default_assumption',
  amenities: 'default_assumption',
  sellerAsking: 'default_assumption',
};

function normalizePersianDigits(raw: string): string {
  return raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function createDefaultValuationInput(
  hoodId: number,
  overrides: Partial<ValuationWorkspaceInput> = {},
  cityId?: CityId,
): ValuationWorkspaceInput {
  const resolvedCity = cityId ?? overrides.cityId ?? resolveCityIdForNeighborhood(hoodId);
  return {
    cityId: resolvedCity,
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
    ...overrides,
    inputOrigins: {
      ...DEFAULT_INPUT_ORIGINS,
      ...(overrides.inputOrigins || {}),
    },
  };
}

/** Stage 89.5: Selective text extractor — only fills explicitly mentioned fields and tags them system_retrieved */
export function extractValuationSpecsFromAdText(
  adText: string,
  currentInput: ValuationWorkspaceInput,
  _hoodBuyPerSqm?: number,
): { patch: Partial<ValuationWorkspaceInput>; summaryFa: string } {
  const text = normalizePersianDigits(adText);
  const patch: Partial<ValuationWorkspaceInput> = {};
  const nextOrigins: FieldOriginMap = { ...currentInput.inputOrigins };
  const extractedLabels: string[] = [];

  const sqmMatch = text.match(/(\d{2,4})\s*(?:متر|مترمربع|m2|m²)/i);
  if (sqmMatch) {
    const val = Number(sqmMatch[1]);
    if (Number.isFinite(val) && val >= 20 && val <= 2000) {
      patch.sqm = val;
      nextOrigins.sqm = 'system_retrieved';
      extractedLabels.push(`متراژ ${val} متر`);
    }
  }

  const yearMatch = text.match(/(?:ساخت|تولید|سال)?\s*(13\d{2}|140[0-9])/);
  if (yearMatch) {
    const yr = Number(yearMatch[1]);
    if (yr >= 1330 && yr <= getCurrentJalaliYear() + 1) {
      patch.buildYear = yr;
      nextOrigins.buildYear = 'system_retrieved';
      extractedLabels.push(`سال ساخت ${yr}`);
    }
  }

  const floorPairMatch = text.match(/طبقه\s*(-?\d{1,2})\s*(?:از|\/)\s*(\d{1,2})/);
  const floorSingleMatch = text.match(/طبقه\s*(-?\d{1,2})/);
  if (floorPairMatch) {
    const fl = Number(floorPairMatch[1]);
    const tf = Number(floorPairMatch[2]);
    if (Number.isFinite(fl) && Number.isFinite(tf) && tf >= 1 && fl >= -2 && fl <= tf) {
      patch.floor = fl;
      patch.totalFloors = tf;
      nextOrigins.floor = 'system_retrieved';
      extractedLabels.push(`طبقه ${fl} از ${tf}`);
    }
  } else if (floorSingleMatch) {
    const fl = Number(floorSingleMatch[1]);
    if (Number.isFinite(fl) && fl >= -2 && fl <= 60) {
      patch.floor = fl;
      if (fl > currentInput.totalFloors) patch.totalFloors = fl;
      nextOrigins.floor = 'system_retrieved';
      extractedLabels.push(`طبقه ${fl}`);
    }
  }

  let amenitiesTouched = false;
  if (/پارکینگ/.test(text)) {
    patch.hasParking = !/بدون\s*پارکینگ|فاقد\s*پارکینگ/.test(text);
    amenitiesTouched = true;
  }
  if (/آسانسور/.test(text)) {
    patch.hasElevator = !/بدون\s*آسانسور|فاقد\s*آسانسور/.test(text);
    amenitiesTouched = true;
  }
  if (/انباری/.test(text)) {
    patch.hasStorage = !/بدون\s*انباری|فاقد\s*انباری/.test(text);
    amenitiesTouched = true;
  }
  if (amenitiesTouched) {
    nextOrigins.amenities = 'system_retrieved';
    extractedLabels.push('امکانات سندی');
  }

  const askMatch = text.match(/(\d+(?:[.,/]\d+)?)\s*میلیارد/);
  if (askMatch) {
    const cleanNum = askMatch[1].replace(/[,/]/g, '.');
    if (Number.isFinite(Number(cleanNum)) && Number(cleanNum) > 0) {
      patch.sellerAskingBillion = cleanNum;
      nextOrigins.sellerAsking = 'system_retrieved';
      extractedLabels.push(`قیمت اعلامی ${cleanNum} میلیارد`);
    }
  }

  if (extractedLabels.length > 0) {
    patch.inputOrigins = nextOrigins;
  }

  const summaryFa =
    extractedLabels.length > 0
      ? `استخراج‌شده از متن آگهی (نیازمند تأیید): ${extractedLabels.join(' · ')}`
      : 'مشخصه عددی صریحی در متن یافت نشد؛ مقادیر فعلی بدون تغییر ماندند.';
  return { patch, summaryFa };
}

export function validateValuationWorkspaceInput(input: ValuationWorkspaceInput): ValuationInputValidationResult {
  const fieldErrors: ValuationInputValidationResult['fieldErrors'] = {};
  const maxYear = getCurrentJalaliYear() + 1;

  if (!Number.isFinite(input.sqm) || input.sqm < 20 || input.sqm > 2000) {
    fieldErrors.sqm = 'متراژ باید بین ۲۰ تا ۲۰۰۰ مترمربع باشد.';
  }
  if (!Number.isFinite(input.buildYear) || input.buildYear < 1320 || input.buildYear > maxYear) {
    fieldErrors.buildYear = `سال ساخت باید بین ۱۳۲۰ تا ${maxYear} باشد.`;
  }
  if (!Number.isFinite(input.totalFloors) || input.totalFloors < 1 || input.totalFloors > 60) {
    fieldErrors.totalFloors = 'تعداد کل طبقات باید بین ۱ تا ۶۰ باشد.';
  }
  if (!Number.isFinite(input.floor) || input.floor < -2 || input.floor > Math.max(1, input.totalFloors)) {
    fieldErrors.floor = 'شماره طبقه نمی‌تواند بیشتر از کل طبقات یا کمتر از ۲- باشد.';
  }
  if (input.sellerAskingBillion.trim().length > 0) {
    const parsedAsk = Number.parseFloat(normalizePersianDigits(input.sellerAskingBillion));
    if (!Number.isFinite(parsedAsk) || parsedAsk <= 0) {
      fieldErrors.sellerAsking = 'قیمت اعلامی فروشنده باید عدد مثبت معتبر (میلیارد تومان) باشد.';
    }
  }

  const originValues = Object.values(input.inputOrigins);
  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    hasDefaultAssumptions: originValues.some((o) => o === 'default_assumption'),
    hasUnconfirmedExtractedFields: originValues.some((o) => o === 'system_retrieved'),
  };
}

function buildInputFingerprint(cityId: CityId, input: ValuationWorkspaceInput): string {
  return [
    cityId,
    input.hoodId,
    input.propertyCategory,
    input.purpose,
    input.streetTier,
    input.sqm,
    input.buildYear,
    input.renovationStatus,
    input.floor,
    input.totalFloors,
    Number(input.hasParking),
    Number(input.hasElevator),
    Number(input.hasStorage),
  ].join(':');
}

function computeProvenanceWeightedCompleteness(input: ValuationWorkspaceInput): number {
  const originWeight = (origin: FieldOriginMap[keyof FieldOriginMap]): number => {
    if (origin === 'verified' || origin === 'user_provided') return 1;
    if (origin === 'system_retrieved') return 0.65;
    if (origin === 'estimated') return 0.45;
    if (origin === 'default_assumption') return 0.25;
    return 0.1;
  };
  const coreWeights = [
    input.sqm > 0 ? originWeight(input.inputOrigins.sqm) : 0,
    input.buildYear >= 1340 ? originWeight(input.inputOrigins.buildYear) : 0,
    input.floor >= -2 ? originWeight(input.inputOrigins.floor) : 0,
    originWeight(input.inputOrigins.renovationStatus),
    originWeight(input.inputOrigins.amenities),
  ];
  const avg = coreWeights.reduce((sum, w) => sum + w, 0) / coreWeights.length;
  return Math.round(avg * 100);
}

export function evaluateWorkspaceValuation(
  input: ValuationWorkspaceInput,
  hood: EvaluatedNeighborhood,
  cityId?: CityId,
): ValuationWorkspaceResult {
  const resolvedCity = cityId ?? input.cityId ?? resolveCityIdForNeighborhood(hood.id);
  const inputValidation = validateValuationWorkspaceInput(input);
  const geographicScope: ValuationGeographicScope = {
    cityId: resolvedCity,
    neighborhoodId: hood.id,
    canonicalNeighborhoodId: `${resolvedCity}:${hood.id}`,
  };

  const {
    comparables,
    supplementaryComparables,
    neighborhoodBaselineEvidence,
    sufficiency,
    v64NeighborhoodDealPerSqm,
  } = buildValuationComparables(hood, input.sqm, input);

  const nowIso = new Date().toISOString();
  const dataSnapshotId = `snapshot-${resolvedCity}-curated-1405`;
  const inputFingerprint = buildInputFingerprint(resolvedCity, input);
  const snapshot: ValuationDataSnapshot = {
    snapshotId: `snap-${resolvedCity}-h${hood.id}-${Date.now().toString(36)}`,
    dataSnapshotId,
    cityId: resolvedCity,
    neighborhoodId: hood.id,
    canonicalNeighborhoodId: geographicScope.canonicalNeighborhoodId,
    datasetVersion: `curated-${resolvedCity}-1405.08`,
    modelId: VALUATION_MODEL_ID,
    modelVersion: VALUATION_MODEL_VERSION,
    methodologyVersion: VALUATION_METHODOLOGY_VERSION,
    dataAsOfIso: '2026-11-01T00:00:00.000Z',
    calculatedAtIso: nowIso,
    comparableIds: comparables.map((c) => c.id),
    sourceIds: Array.from(new Set(comparables.map((c) => c.sourceId || 'src-radar-listings').concat('src-hedonic-v64'))),
    inputFingerprint,
  };

  const validation: ModelValidationAssessment = {
    status: 'rule_based_uncalibrated_against_deeds',
    labelFa: 'مبتنی بر ضرایب قاعده‌محور (بدون اعتبارسنجی ثبتی)',
    explanationFa: 'به دلیل نبود فید عمومی اسناد رسمی معامله، این مدل با داده‌های رسمی دفترخانه بازآزمایی (Backtest) نشده است.',
  };

  const precisionPenalty = input.locationPrecision === 'neighborhood' ? 1.5 : 0;
  const samplePenalty = sufficiency.level === 'baseline_only' ? 2.0 : sufficiency.level === 'limited' ? 1.0 : 0;
  const purposePenalty = input.purpose === 'rent' ? 2.0 : 0;
  const bandPercent = Number((3.5 + precisionPenalty + samplePenalty + purposePenalty).toFixed(1));

  const uncertainty: ModelUncertaintyAssessment = {
    level: bandPercent >= 5.5 ? 'high' : 'moderate',
    bandPercent,
    labelFa: bandPercent >= 5.5 ? `عدم‌قطعیت بالا (±${bandPercent}٪)` : `عدم‌قطعیت متوسط (±${bandPercent}٪)`,
    rationaleFa:
      input.locationPrecision === 'neighborhood'
        ? 'دقت موقعیت در سطح کل محله انتخاب شده و اسناد رسمی معامله در دسترس نیست؛ بنابراین بازه حساسیت عریض‌تر است.'
        : 'برآورد بدون دسترسی به معاملات ثبت‌شده و با حساسیت پارامتری وضعیت نگهداری و خرده‌محله محاسبه شده است.',
    methodologyNoteFa: 'بازه حساسیت بر اساس عدم‌قطعیت مکانی، تعداد شواهد کامل و خطای پارامتری ضرایب هدونیک محاسبه شده است.',
  };

  if (input.propertyCategory !== 'residential_apartment' && input.propertyCategory !== 'residential_villa') {
    return {
      scopeSupported: false,
      unsupportedReasonFa:
        'مدل ارزش‌گذاری هدونیک رادار منحصراً برای واحدهای مسکونی کالیبره شده است. برای املاک تجاری، اداری یا زمین از برآوردهای مسکونی استفاده نمی‌شود و نیازمند ارزیابی حضوری یا داده‌های تخصصی صنفی است.',
      inputValidation,
      geographicScope,
      modelVersion: VALUATION_MODEL_VERSION,
      snapshot,
      hedonic: null,
      purposeResult: null,
      v64NeighborhoodDealPerSqm,
      comparables: [],
      supplementaryComparables: [],
      neighborhoodBaselineEvidence,
      sufficiency,
      completenessPercent: 100,
      uncertainty,
      validation,
    };
  }

  const microHoods = getNeighborhoodDeepInsight(hood).microHoods;
  const activeTier = microHoods.find((m) => m.tier === input.streetTier);
  const parsedAsk = Number.parseFloat(normalizePersianDigits(input.sellerAskingBillion));
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

  let purposeResult: ValuationPurposeResult;
  if (input.purpose === 'rent') {
    const rahnBand = bandPercent / 100;
    const rentRes: RentValuationResult = {
      kind: 'rent',
      estimationMode: 'neighborhood_index_limited_estimate',
      estimatedFullRahnMillion: hedonic.estimatedRahnMillion,
      sensitivityRahnRangeMillion: {
        min: Math.round(hedonic.estimatedRahnMillion * (1 - rahnBand)),
        max: Math.round(hedonic.estimatedRahnMillion * (1 + rahnBand)),
      },
      monthlyRentEquivalentMillion: null,
      conversionRateMonthlyPercent: null,
      conversionRateSourceFa: 'تبدیل اجاره ماهانه نیازمند نرخ توافقی طرفین است و ثابت ۳٪ فرض نمی‌شود.',
      methodologyLimitationFa: 'برآورد رهن کامل بر اساس شاخص رهن محله و متراژ است و از داده‌های ریز اجاره‌بها کالیبره نشده است.',
    };
    purposeResult = rentRes;
  } else if (input.purpose === 'current_value') {
    const curRes: CurrentValueResult = {
      kind: 'current_value',
      definitionKind: 'current_market_sale_estimate',
      definitionLabelFa: 'ارزش روز فروش نقدی دارایی در شرایط عادی بازار',
      referenceDateIso: snapshot.dataAsOfIso,
      estimatedAssetTotalMillion: hedonic.hedonicTotalMillion,
      estimatedAssetTotalBillion: hedonic.hedonicTotalBillion,
      estimatedAssetPerSqmMillion: hedonic.hedonicPerSqm,
      sensitivityRangeMillion: hedonic.sensitivityRangeMillion,
    };
    purposeResult = curRes;
  } else {
    const saleRes: SaleValuationResult = {
      kind: 'sale',
      estimatedSaleTotalMillion: hedonic.hedonicTotalMillion,
      estimatedSaleTotalBillion: hedonic.hedonicTotalBillion,
      estimatedSalePerSqmMillion: hedonic.hedonicPerSqm,
      sensitivityRangeMillion: hedonic.sensitivityRangeMillion,
      fastSaleTotalMillion: hedonic.fastSaleTotalMillion,
      fastSaleSupported: true,
      sellerPriceComparison: hedonic.sellerPriceEvaluation,
    };
    purposeResult = saleRes;
  }

  return {
    scopeSupported: true,
    inputValidation,
    geographicScope,
    modelVersion: VALUATION_MODEL_VERSION,
    snapshot,
    hedonic,
    purposeResult,
    v64NeighborhoodDealPerSqm,
    comparables,
    supplementaryComparables,
    neighborhoodBaselineEvidence,
    sufficiency,
    completenessPercent: computeProvenanceWeightedCompleteness(input),
    uncertainty,
    validation,
  };
}

export function createSavedValuationReport(
  input: ValuationWorkspaceInput,
  hoodName: string,
  result: ValuationWorkspaceResult,
  uid?: string | null,
): SavedValuationReport | null {
  if (!result.scopeSupported || !result.hedonic || !result.hedonic.isValid) return null;
  const h = result.hedonic;
  const nowIso = result.snapshot.calculatedAtIso;
  return {
    id: generateValuationReportId(),
    reportVersion: 2,
    savedAtIso: nowIso,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    ownerUserId: uid || undefined,
    storageScope: uid ? 'account_synced' : 'device_local',
    cityId: result.geographicScope.cityId,
    neighborhoodId: result.geographicScope.neighborhoodId,
    hoodName,
    purpose: input.purpose,
    modelVersion: result.modelVersion,
    dataSnapshotId: result.snapshot.dataSnapshotId,
    snapshot: result.snapshot,
    inputFingerprint: result.snapshot.inputFingerprint,
    input: { ...input, cityId: result.geographicScope.cityId, inputOrigins: { ...input.inputOrigins } },
    hedonicTotalMillion: h.hedonicTotalMillion,
    hedonicPerSqm: h.hedonicPerSqm,
    estimatedRahnMillion: input.purpose === 'rent' ? h.estimatedRahnMillion : undefined,
    fastSaleTotalMillion: h.fastSaleTotalMillion,
    sensitivityMinMillion: h.sensitivityRangeMillion.min,
    sensitivityMaxMillion: h.sensitivityRangeMillion.max,
    isHypotheticalScenario: Boolean(input.isHypotheticalScenario),
  };
}
