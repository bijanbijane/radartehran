/**
 * @file src/features/discovery/services/discoverPricingEngine.ts
 * @description Stage 185: Pure financial computation, budget bracket evaluation, sorting, and freshness metadata for ProductDiscoverView.
 * All calculations stay strictly in Million Toman and are invariant to display currency / area-unit toggles.
 */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  buildNeighborhoodListingSamples,
  lookupMatchingDatedReferencePrice,
} from '../../../data/neighborhoodListingSamples';
import type { AggregatedMarketMetrics } from '../../../data/realMarketPriceAggregator';
import type { CityId } from '../../../types/models';

export type DiscoverBudgetMode = 'rent' | 'buy';
export type DiscoverSortMode = 'score' | 'price_asc' | 'price_desc' | 'rahn_asc' | 'air';
export type DiscoverPriceBracketId = 'all' | 'under5b' | '5to10b' | '10to20b' | 'luxury';
export type DiscoverDataFreshnessKind =
  | 'live_observed'
  | 'internal_reference_dated'
  | 'internal_reference_undated';

export interface DiscoverBracketDefinition {
  id: DiscoverPriceBracketId;
  minInclusiveMillion: number | null;
  maxInclusiveMillion: number | null;
  minExclusiveMillion?: number | null;
}

export const DISCOVER_BUY_BRACKETS: ReadonlyArray<DiscoverBracketDefinition> = [
  { id: 'all', minInclusiveMillion: null, maxInclusiveMillion: null },
  { id: 'under5b', minInclusiveMillion: 0, maxInclusiveMillion: null },
  { id: '5to10b', minInclusiveMillion: 5000, maxInclusiveMillion: 10000 },
  { id: '10to20b', minInclusiveMillion: null, minExclusiveMillion: 10000, maxInclusiveMillion: 20000 },
  { id: 'luxury', minInclusiveMillion: null, minExclusiveMillion: 20000, maxInclusiveMillion: null },
];

export const DISCOVER_RENT_BRACKETS: ReadonlyArray<DiscoverBracketDefinition> = [
  { id: 'all', minInclusiveMillion: null, maxInclusiveMillion: null },
  { id: 'under5b', minInclusiveMillion: 0, maxInclusiveMillion: null },
  { id: '5to10b', minInclusiveMillion: 1000, maxInclusiveMillion: 2000 },
  { id: '10to20b', minInclusiveMillion: null, minExclusiveMillion: 2000, maxInclusiveMillion: 4000 },
  { id: 'luxury', minInclusiveMillion: null, minExclusiveMillion: 4000, maxInclusiveMillion: null },
];

export interface DiscoverFreshnessMetadata {
  kind: DiscoverDataFreshnessKind;
  observedCount: number;
  validObservedCount: number;
  sourceUpdatedLabelFa: string | null;
  sourceUpdatedLabelEn: string | null;
  acquisitionTimestampIso: string | null;
  calculationStageFa: string;
  isReferenceDateEstimated: false;
}

export interface DiscoverComputedResult {
  hoodId: number;
  mode: DiscoverBudgetMode;
  targetSqm: number | null;
  isValidTargetSqm: boolean;
  askingBuyPerSqmMillion: number | null;
  scenarioDealPerSqmMillion: number | null;
  baseRahn80mMillion: number | null;
  scaledDepositMillion: number | null;
  askingTotalMillion: number | null;
  scenarioTotalMillion: number | null;
  effectiveBudgetValueMillion: number | null;
  bracketMatched: Exclude<DiscoverPriceBracketId, 'all'> | null;
  freshness: DiscoverFreshnessMetadata;
}

export function isValidPositiveMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function sanitizeTargetSqm(targetSqm: unknown): number | null {
  if (typeof targetSqm !== 'number' || !Number.isFinite(targetSqm) || targetSqm <= 0) {
    return null;
  }
  return targetSqm;
}

export function calculateDiscoverPurchaseTotal(
  pricePerSqmMillion: unknown,
  targetSqm: unknown,
): number | null {
  if (!isValidPositiveMetric(pricePerSqmMillion)) return null;
  const safeSqm = sanitizeTargetSqm(targetSqm);
  if (safeSqm === null) return null;
  return Math.round(pricePerSqmMillion * safeSqm);
}

export function calculateDiscoverDepositForTargetArea(
  rahn80mMillion: unknown,
  targetSqm: unknown,
): number | null {
  if (!isValidPositiveMetric(rahn80mMillion)) return null;
  const safeSqm = sanitizeTargetSqm(targetSqm);
  if (safeSqm === null) return null;
  return Math.round(rahn80mMillion * (safeSqm / 80));
}

export function resolveDiscoverFreshness(
  hood: Pick<EvaluatedNeighborhood, 'id' | 'name' | 'buyPerSqm' | 'bargains'>,
  cityId: CityId | string,
  metrics?: AggregatedMarketMetrics | null,
): DiscoverFreshnessMetadata {
  const liveSamples = buildNeighborhoodListingSamples(hood);
  const validObservedCount = metrics?.eligibleObservedCount ?? liveSamples.length;
  const observedCount = metrics?.observedSampleCount ?? liveSamples.length;

  let latestIso: string | null = null;
  let latestMs = -Infinity;
  for (const sample of liveSamples) {
    if (!sample.createdAtIso) continue;
    const ms = Date.parse(sample.createdAtIso);
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = sample.createdAtIso;
    }
  }

  if (observedCount > 0) {
    return {
      kind: 'live_observed',
      observedCount,
      validObservedCount,
      sourceUpdatedLabelFa: latestIso
        ? `نمونه زنده (${observedCount} آگهی)`
        : `نمونه زنده (${observedCount} آگهی بدون زمان ثبت)`,
      sourceUpdatedLabelEn: latestIso
        ? `Live samples (${observedCount})`
        : `Live samples (${observedCount}, timestamp unrecorded)`,
      acquisitionTimestampIso: latestIso,
      calculationStageFa: 'تجمیع مدل v6.4 (غیرثبتی)',
      isReferenceDateEstimated: false,
    };
  }

  const refRow = lookupMatchingDatedReferencePrice(String(cityId), hood.id, hood.buyPerSqm);
  if (refRow) {
    return {
      kind: 'internal_reference_dated',
      observedCount: 0,
      validObservedCount: 0,
      sourceUpdatedLabelFa: `مرجع داخلی · بازبینی ${refRow.asOfJalali}`,
      sourceUpdatedLabelEn: `Internal ref · review ${refRow.asOfJalali}`,
      acquisitionTimestampIso: null,
      calculationStageFa: 'خط مبنای مرجع داخلی',
      isReferenceDateEstimated: false,
    };
  }

  return {
    kind: 'internal_reference_undated',
    observedCount: 0,
    validObservedCount: 0,
    sourceUpdatedLabelFa: 'قیمت مرجع داخلی (بدون تاریخ به‌روزرسانی)',
    sourceUpdatedLabelEn: 'Internal reference price (date unrecorded)',
    acquisitionTimestampIso: null,
    calculationStageFa: 'خط مبنای مرجع داخلی',
    isReferenceDateEstimated: false,
  };
}

export function resolveDiscoverBudgetValue(params: {
  hood: Pick<EvaluatedNeighborhood, 'buyPerSqm' | 'rahn80m'>;
  mode: DiscoverBudgetMode;
  targetSqm: number;
  scenarioDealPerSqm?: number | null;
}): {
  totalMillion: number | null;
  depositMillion: number | null;
  scenarioPerSqmMillion: number | null;
} {
  const scenarioPerSqmMillion = isValidPositiveMetric(params.scenarioDealPerSqm)
    ? params.scenarioDealPerSqm
    : isValidPositiveMetric(params.hood.buyPerSqm)
      ? params.hood.buyPerSqm
      : null;
  const depositMillion = calculateDiscoverDepositForTargetArea(params.hood.rahn80m, params.targetSqm);
  const totalMillion =
    params.mode === 'rent'
      ? depositMillion
      : calculateDiscoverPurchaseTotal(scenarioPerSqmMillion, params.targetSqm);

  return { totalMillion, depositMillion, scenarioPerSqmMillion };
}

export function classifyDiscoverPriceBracket(
  amountMillion: number | null,
  mode: DiscoverBudgetMode,
): Exclude<DiscoverPriceBracketId, 'all'> | null {
  if (!isValidPositiveMetric(amountMillion)) return null;
  if (mode === 'rent') {
    if (amountMillion < 1000) return 'under5b';
    if (amountMillion <= 2000) return '5to10b';
    if (amountMillion <= 4000) return '10to20b';
    return 'luxury';
  }
  if (amountMillion < 5000) return 'under5b';
  if (amountMillion <= 10000) return '5to10b';
  if (amountMillion <= 20000) return '10to20b';
  return 'luxury';
}

export function matchesDiscoverPriceBracket(
  hood: Pick<EvaluatedNeighborhood, 'rahn80m' | 'buyPerSqm'>,
  mode: DiscoverBudgetMode,
  targetSqm: number,
  scenarioDealPerSqm: number | null | undefined,
  bracket: DiscoverPriceBracketId,
): boolean {
  if (bracket === 'all') return true;
  const { totalMillion } = resolveDiscoverBudgetValue({
    hood,
    mode,
    targetSqm,
    scenarioDealPerSqm,
  });
  const matched = classifyDiscoverPriceBracket(totalMillion, mode);
  return matched === bracket;
}

export function compareDiscoverNeighborhoods(
  a: Pick<EvaluatedNeighborhood, 'id' | 'overallScore' | 'air' | 'buyPerSqm' | 'rahn80m'>,
  b: Pick<EvaluatedNeighborhood, 'id' | 'overallScore' | 'air' | 'buyPerSqm' | 'rahn80m'>,
  sortBy: DiscoverSortMode,
  targetSqm: number,
  dealPriceByHoodId: ReadonlyMap<number, number>,
): number {
  if (sortBy === 'score') return b.overallScore - a.overallScore;
  if (sortBy === 'air') return b.air - a.air;
  if (sortBy === 'rahn_asc') {
    const depA = calculateDiscoverDepositForTargetArea(a.rahn80m, targetSqm);
    const depB = calculateDiscoverDepositForTargetArea(b.rahn80m, targetSqm);
    return (depA ?? Number.POSITIVE_INFINITY) - (depB ?? Number.POSITIVE_INFINITY);
  }
  const priceA = isValidPositiveMetric(dealPriceByHoodId.get(a.id))
    ? dealPriceByHoodId.get(a.id)!
    : isValidPositiveMetric(a.buyPerSqm)
      ? a.buyPerSqm
      : null;
  const priceB = isValidPositiveMetric(dealPriceByHoodId.get(b.id))
    ? dealPriceByHoodId.get(b.id)!
    : isValidPositiveMetric(b.buyPerSqm)
      ? b.buyPerSqm
      : null;
  if (sortBy === 'price_asc') {
    return (priceA ?? Number.POSITIVE_INFINITY) - (priceB ?? Number.POSITIVE_INFINITY);
  }
  return (priceB ?? Number.NEGATIVE_INFINITY) - (priceA ?? Number.NEGATIVE_INFINITY);
}

export function computeDiscoverNeighborhoodResult(params: {
  hood: Pick<EvaluatedNeighborhood, 'id' | 'name' | 'buyPerSqm' | 'rahn80m' | 'bargains'>;
  cityId: CityId | string;
  mode: DiscoverBudgetMode;
  targetSqm: number;
  scenarioDealPerSqm?: number | null;
  metrics?: AggregatedMarketMetrics | null;
}): DiscoverComputedResult {
  const safeSqm = sanitizeTargetSqm(params.targetSqm);
  const askingBuyPerSqmMillion = isValidPositiveMetric(params.hood.buyPerSqm) ? params.hood.buyPerSqm : null;
  const scenarioDealPerSqmMillion = isValidPositiveMetric(params.scenarioDealPerSqm)
    ? params.scenarioDealPerSqm
    : askingBuyPerSqmMillion;
  const baseRahn80mMillion = isValidPositiveMetric(params.hood.rahn80m) ? params.hood.rahn80m : null;
  const scaledDepositMillion = calculateDiscoverDepositForTargetArea(baseRahn80mMillion, safeSqm);
  const askingTotalMillion = calculateDiscoverPurchaseTotal(askingBuyPerSqmMillion, safeSqm);
  const scenarioTotalMillion = calculateDiscoverPurchaseTotal(scenarioDealPerSqmMillion, safeSqm);
  const effectiveBudgetValueMillion =
    params.mode === 'rent' ? scaledDepositMillion : scenarioTotalMillion;

  return {
    hoodId: params.hood.id,
    mode: params.mode,
    targetSqm: safeSqm,
    isValidTargetSqm: safeSqm !== null,
    askingBuyPerSqmMillion,
    scenarioDealPerSqmMillion,
    baseRahn80mMillion,
    scaledDepositMillion,
    askingTotalMillion,
    scenarioTotalMillion,
    effectiveBudgetValueMillion,
    bracketMatched: classifyDiscoverPriceBracket(effectiveBudgetValueMillion, params.mode),
    freshness: resolveDiscoverFreshness(params.hood, params.cityId, params.metrics),
  };
}
