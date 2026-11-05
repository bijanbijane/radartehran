import { calculateHedonicValuation, FAST_SALE_FACTOR, getCurrentJalaliYear, HEDONIC_RENOVATION_OPTIONS, type HedonicRenovationStatus, } from './hedonicPricingEngine'; import type { EvaluatedNeighborhood, Neighborhood } from './neighborhoods'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; export const HEDONIC_FORMULA_ID = 'tehran-radar-hedonic-econometric-model' as const; export const HEDONIC_FORMULA_VERSION = '2.4.0' as const; export const BASELINE_DATASET_VERSION = '2026.10-5city-104hoods-v1' as const; export interface ReproducibleValuationInputs { areaSqm: number; buildingAgeYears: number; floorNumber: number; totalFloors: number; hasElevator: boolean;
  hasParking: boolean; hasStorage: boolean; isRenovated: boolean; renovationStatus?: HedonicRenovationStatus; referenceJalaliYear?: number; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }
export interface ValuationCalculationTrace { traceId: string; formulaId: string; formulaVersion: string; baselineDatasetVersion: string; calculatedAtIso: string; referenceJalaliYear: number; hoodId: number; hoodName: string;
  hoodBasePerSqm: number; hoodBaseRahn80m: number; inputs: ReproducibleValuationInputs; appliedCoefficients: { ageImpactPercent: number; renovationBaseImpactPercent: number; effectiveRenovationPercent: number; floorImpactPercent: number; sqmImpactPercent: number;
    amenitiesImpactPercent: number; netAdjustmentPercent: number; fastSaleFactor: number; sensitivityBandPercent: number; }; unitDefinitions: { monetaryUnit: 'MILLION_TOMAN'; macroMonetaryUnit: 'BILLION_TOMAN';
    areaUnit: 'SQUARE_METER'; calendarSystem: 'SOLAR_HIJRI_JALALI'; }; uncertaintyDisclosure: {
    sensitivityBandPercent: number; isStatisticalConfidenceInterval: false; methodologyNote: string; };
  outputs: { hedonicPerSqm: number; hedonicTotalMillion: number; hedonicTotalBillion: number;
    hoodAverageTotalMillion: number; fastSaleTotalMillion: number; estimatedRahnMillion: number;
    sensitivityRangeMillion: { min: number; max: number }; displayAreaUnitLabel?: string; hedonicTotalIntlText?: string;
  };
  reproducibilityDigest: string;
}
function computeDigest(payload: string): string {
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `trc_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}
export function buildReproducibleValuationTrace(
  hood: Neighborhood | EvaluatedNeighborhood,
  inputs: ReproducibleValuationInputs,
  calculatedAtIso = new Date().toISOString(),
): ValuationCalculationTrace {
  const referenceJalaliYear = inputs.referenceJalaliYear ?? getCurrentJalaliYear();
  const buildYear = Math.max(1365, referenceJalaliYear - Math.max(0, inputs.buildingAgeYears));
  const renovationStatus: HedonicRenovationStatus =
    inputs.renovationStatus ?? (inputs.isRenovated ? HEDONIC_RENOVATION_OPTIONS[0].id : HEDONIC_RENOVATION_OPTIONS[2].id);
  const evaluated = calculateHedonicValuation({
    neighborhood: hood, sqm: inputs.areaSqm, buildYear, renovationStatus, floor: inputs.floorNumber,
    totalFloors: inputs.totalFloors, hasElevator: inputs.hasElevator, hasParking: inputs.hasParking,
    hasStorage: inputs.hasStorage, currentJalaliYear: referenceJalaliYear,
  });
  const renoOpt =
    HEDONIC_RENOVATION_OPTIONS.find((r) => r.id === renovationStatus) || HEDONIC_RENOVATION_OPTIONS[2];
  const getPct = (id: 'age' | 'renovation' | 'floor' | 'sqm' | 'amenities') =>
    evaluated.factors.find((f) => f.id === id)?.impactPercent ?? 0;
  const hoodBasePerSqm = Math.max(
    15,
    Number((hood as EvaluatedNeighborhood)?.baseBuyPerSqm ?? hood.buyPerSqm) || 120,
  );
  const hoodBaseRahn80m = Math.max(100, Number(hood.rahn80m) || 1200);
  const appliedCoefficients = {
    ageImpactPercent: getPct('age'),
    renovationBaseImpactPercent: renoOpt.baseImpactPercent,
    effectiveRenovationPercent: getPct('renovation'),
    floorImpactPercent: getPct('floor'),
    sqmImpactPercent: getPct('sqm'),
    amenitiesImpactPercent: getPct('amenities'),
    netAdjustmentPercent: evaluated.netAdjustmentPercent,
    fastSaleFactor: FAST_SALE_FACTOR,
    sensitivityBandPercent: 3.5,
  };
  const coreOutputs = {
    hedonicPerSqm: evaluated.hedonicPerSqm,
    hedonicTotalMillion: evaluated.hedonicTotalMillion,
    hedonicTotalBillion: evaluated.hedonicTotalBillion,
    hoodAverageTotalMillion: evaluated.hoodAverageTotalMillion,
    fastSaleTotalMillion: evaluated.fastSaleTotalMillion,
    estimatedRahnMillion: evaluated.estimatedRahnMillion,
    sensitivityRangeMillion: { ...evaluated.sensitivityRangeMillion },
  };
  const normalizedInputs: ReproducibleValuationInputs = {
    areaSqm: inputs.areaSqm, buildingAgeYears: inputs.buildingAgeYears, floorNumber: inputs.floorNumber,
    totalFloors: inputs.totalFloors, hasElevator: inputs.hasElevator, hasParking: inputs.hasParking,
    hasStorage: inputs.hasStorage, isRenovated: inputs.isRenovated, renovationStatus, referenceJalaliYear,
    ...(inputs.areaUnit ? { areaUnit: inputs.areaUnit } : {}),
    ...(inputs.intlCurrency ? { intlCurrency: inputs.intlCurrency } : {}),
  };
  const { areaUnit: _au, intlCurrency: _ic, ...canonicalInputs } = normalizedInputs;
  const canonical = JSON.stringify({
    formulaId: HEDONIC_FORMULA_ID, formulaVersion: HEDONIC_FORMULA_VERSION, baselineDatasetVersion: BASELINE_DATASET_VERSION,
    referenceJalaliYear, hoodId: hood.id, hoodBasePerSqm, hoodBaseRahn80m,
    inputs: canonicalInputs, appliedCoefficients, outputs: coreOutputs,
  });
  const reproducibilityDigest = computeDigest(canonical);
  const activeAreaUnit = inputs.areaUnit ?? getStoredAreaUnit();
  const activeCurrency = inputs.intlCurrency ?? getStoredIntlCurrency();
  const outputs = {
    ...coreOutputs,
    displayAreaUnitLabel: formatAreaUnitLabel(activeAreaUnit),
    hedonicTotalIntlText: activeCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(evaluated.hedonicTotalMillion, activeCurrency) : undefined,
  };
  return {
    traceId: `val_${hood.id}_${reproducibilityDigest}`,
    formulaId: HEDONIC_FORMULA_ID,
    formulaVersion: HEDONIC_FORMULA_VERSION,
    baselineDatasetVersion: BASELINE_DATASET_VERSION,
    calculatedAtIso,
    referenceJalaliYear,
    hoodId: hood.id,
    hoodName: hood.name,
    hoodBasePerSqm,
    hoodBaseRahn80m,
    inputs: normalizedInputs,
    appliedCoefficients,
    unitDefinitions: {
      monetaryUnit: 'MILLION_TOMAN',
      macroMonetaryUnit: 'BILLION_TOMAN',
      areaUnit: 'SQUARE_METER',
      calendarSystem: 'SOLAR_HIJRI_JALALI',
    },
    uncertaintyDisclosure: {
      sensitivityBandPercent: 3.5,
      isStatisticalConfidenceInterval: false,
      methodologyNote:
        'دامنه حساسیت ±۳.۵٪ بازه تلورانس مذاکره کارشناسی حول خروجی مدل هدونیک است و فاصله اطمینان آماری نیست.',
    },
    outputs,
    reproducibilityDigest,
  };
}
export function verifyValuationTraceReproducibility(
  storedTrace: ValuationCalculationTrace,
  currentHood: Neighborhood | EvaluatedNeighborhood,
): {
  reproducible: boolean;
  reason: 'REPRODUCIBLE_EXACT' | 'FORMULA_VERSION_MISMATCH' | 'BASELINE_DRIFT' | 'OUTPUT_MISMATCH';
} {
  if (storedTrace.formulaVersion !== HEDONIC_FORMULA_VERSION) {
    return { reproducible: false, reason: 'FORMULA_VERSION_MISMATCH' };
  }
  const currentBase = Math.max(15, Number((currentHood as EvaluatedNeighborhood)?.baseBuyPerSqm ?? currentHood.buyPerSqm) || 120);
  if (Math.abs(currentBase - storedTrace.hoodBasePerSqm) > 0.001) {
    return { reproducible: false, reason: 'BASELINE_DRIFT' };
  }
  const recomputed = buildReproducibleValuationTrace(
    currentHood,
    storedTrace.inputs,
    storedTrace.calculatedAtIso,
  );
  if (recomputed.reproducibilityDigest !== storedTrace.reproducibilityDigest) {
    return { reproducible: false, reason: 'OUTPUT_MISMATCH' };
  }
  return { reproducible: true, reason: 'REPRODUCIBLE_EXACT' };
}
export const MIN_COMPARABLE_SAMPLES = 3;
export type ComparisonMethodologyKind =
  | 'NEIGHBORHOOD_BASELINE_COMPARISON'
  | 'COMPARABLE_LISTING_COMPARISON'
  | 'VERIFIED_TRANSACTION_COMPARISON';
export interface CandidateComparableListing {
  id: string;
  neighborhoodId: number;
  cityKey: string;
  areaSqm: number;
  buildingAgeYears: number;
  pricePerSqmMillion: number;
  totalPriceMillion: number;
  hasElevator: boolean;
  hasParking: boolean;
  listedAtIso: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REJECTED' | 'DUPLICATE';
}
export interface SubjectPropertySpec {
  subjectId?: string;
  neighborhoodId: number;
  cityKey: string;
  areaSqm: number;
  buildingAgeYears: number;
  hasElevator: boolean;
  hasParking: boolean;
}
export interface EvaluatedComparable extends CandidateComparableListing {
  similarityScore: number;
  selectionReasons: string[];
}
export interface ComparableSelectionReport {
  comparisonKind: ComparisonMethodologyKind;
  dataProvenance: 'ASKING_LISTING_PRICES_NOT_TRANSACTIONS' | 'NEIGHBORHOOD_BASELINE_ONLY';
  sufficientComparablesFound: boolean;
  selectedComparables: EvaluatedComparable[];
  excludedCount: number;
  medianPerSqmMillion: number;
  weightedAveragePerSqmMillion: number;
  disclosures: string[];
}
export function evaluateComparableProperties(
  subject: SubjectPropertySpec,
  referenceHood: Neighborhood,
  candidates: CandidateComparableListing[],
  nowMs = Date.now(),
): ComparableSelectionReport {
  const maxStaleMs = 90 * 24 * 60 * 60 * 1000;
  const seenFingerprints = new Set<string>();
  let excludedCount = 0;
  const validSameCityAndType: CandidateComparableListing[] = [];
  for (const c of candidates) {
    if (subject.subjectId && c.id === subject.subjectId) {
      excludedCount++;
      continue;
    }
    if (c.status !== 'ACTIVE' || c.cityKey !== subject.cityKey || !Number.isFinite(c.pricePerSqmMillion) || c.pricePerSqmMillion <= 0 || !Number.isFinite(c.areaSqm) || c.areaSqm <= 0) {
      excludedCount++;
      continue;
    }
    if (c.areaSqm < subject.areaSqm * 0.65 || c.areaSqm > subject.areaSqm * 1.45) {
      excludedCount++;
      continue;
    }
    const listedMs = Date.parse(c.listedAtIso);
    if (!Number.isFinite(listedMs) || nowMs - listedMs > maxStaleMs || listedMs > nowMs + 86_400_000) {
      excludedCount++;
      continue;
    }
    const fp = `${c.neighborhoodId}:${Math.round(c.areaSqm)}:${Math.round(c.pricePerSqmMillion)}`;
    if (seenFingerprints.has(fp)) {
      excludedCount++;
      continue;
    }
    seenFingerprints.add(fp);
    validSameCityAndType.push(c);
  }
  let filtered = validSameCityAndType;
  if (validSameCityAndType.length >= 4) {
    const sortedRates = [...validSameCityAndType].map((x) => x.pricePerSqmMillion).sort((a, b) => a - b);
    const q1 = sortedRates[Math.floor(sortedRates.length * 0.25)];
    const q3 = sortedRates[Math.floor(sortedRates.length * 0.75)];
    const iqr = Math.max(5, q3 - q1);
    filtered = validSameCityAndType.filter((x) => {
      const ok = x.pricePerSqmMillion >= q1 - 1.8 * iqr && x.pricePerSqmMillion <= q3 + 1.8 * iqr;
      if (!ok) excludedCount++;
      return ok;
    });
  }
  const scored: EvaluatedComparable[] = filtered
    .map((c) => {
      const reasons: string[] = [];
      let score = 100;
      if (c.neighborhoodId === subject.neighborhoodId) {
        reasons.push('هم‌محله با ملک هدف');
      } else {
        score -= 18;
        reasons.push('محله همجوار در همان شهر');
      }
      const areaDiffRatio = Math.abs(c.areaSqm - subject.areaSqm) / Math.max(1, subject.areaSqm);
      score -= Math.round(areaDiffRatio * 40);
      reasons.push(`اختلاف متراژ ${Math.round(areaDiffRatio * 100)}٪`);
      const ageDiff = Math.abs(c.buildingAgeYears - subject.buildingAgeYears);
      score -= Math.min(20, ageDiff * 2);
      if (c.hasParking === subject.hasParking && c.hasElevator === subject.hasElevator) {
        reasons.push('امکانات پارکینگ و آسانسور مشابه');
      } else {
        score -= 8;
      }
      return {
        ...c,
        similarityScore: Math.max(10, score),
        selectionReasons: reasons,
      };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 6);
  if (scored.length < MIN_COMPARABLE_SAMPLES) {
    return {
      comparisonKind: 'NEIGHBORHOOD_BASELINE_COMPARISON',
      dataProvenance: 'NEIGHBORHOOD_BASELINE_ONLY',
      sufficientComparablesFound: false,
      selectedComparables: scored,
      excludedCount,
      medianPerSqmMillion: referenceHood.buyPerSqm,
      weightedAveragePerSqmMillion: referenceHood.buyPerSqm,
      disclosures: [
        `تعداد نمونه‌های مشابه واجد شرایط (${scored.length} مورد) کمتر از حد نصاب آماری (${MIN_COMPARABLE_SAMPLES} مورد) است؛ بنابراین فقط میانگین پایه محله گزارش شد.`,
      ],
    };
  }
  const sortedPrices = scored.map((s) => s.pricePerSqmMillion).sort((a, b) => a - b);
  const mid = Math.floor(sortedPrices.length / 2);
  const medianPerSqmMillion =
    sortedPrices.length % 2 !== 0
      ? sortedPrices[mid]
      : Number(((sortedPrices[mid - 1] + sortedPrices[mid]) / 2).toFixed(1));
  const totalWeight = scored.reduce((acc, s) => acc + s.similarityScore, 0);
  const weightedAveragePerSqmMillion = Number(
    (scored.reduce((acc, s) => acc + s.pricePerSqmMillion * s.similarityScore, 0) / Math.max(1, totalWeight)).toFixed(1),
  );
  return {
    comparisonKind: 'COMPARABLE_LISTING_COMPARISON', dataProvenance: 'ASKING_LISTING_PRICES_NOT_TRANSACTIONS', sufficientComparablesFound: true, selectedComparables: scored, excludedCount, medianPerSqmMillion, weightedAveragePerSqmMillion, disclosures: [
      'املاک مشابه انتخاب‌شده مبتنی بر قیمت‌های پیشنهادی آگهی‌های فعال (Asking Prices) هستند و معامله قطعی ثبت‌شده در سامانه ثبت املاک محسوب نمی‌شوند.', ], }; }