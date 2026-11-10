/** @file src/cells/valuation-authority/robustValuationEngine.ts — Stage 2.2 Manipulation-Resistant Valuation Cell */
import crypto from 'node:crypto';
import {
  calculateHedonicValuation,
  getCurrentJalaliYear,
  FAST_SALE_FACTOR,
  type HedonicInputParams,
  type HedonicRenovationStatus,
  type HedonicValuationResult,
} from '../../data/hedonicPricingEngine';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { clampNumber, validateCityParam } from '../../utils/security';
import { deepSyncedOverrides } from '../../utils/serverMarketPulseEngine';

export type ValuationSourceType = 'VERIFIED_DEAL' | 'APPROVED_BARGAIN' | 'VERIFIED_CLAIM' | 'AI_SEED';

export const SOURCE_CREDIBILITY_WEIGHTS: Readonly<Record<ValuationSourceType, number>> = {
  VERIFIED_DEAL: 5.0,
  APPROVED_BARGAIN: 2.0,
  VERIFIED_CLAIM: 1.5,
  AI_SEED: 1.0,
} as const;

export const RECENCY_HALF_LIFE_DAYS = 30;
export const MAD_OUTLIER_THRESHOLD_MULTIPLIER = 2.5;
export const ZERO_MAD_RELATIVE_BANDWIDTH_FLOOR = 0.025;

export interface RawPriceObservation {
  id: string;
  priceSqm: number;
  sourceType: ValuationSourceType;
  recordedAtIso?: string;
  ageDays?: number;
  recordedCityIndex?: number;
  currentCityIndex?: number;
}

export interface EvaluatedPriceObservation extends RawPriceObservation {
  normalizedPriceSqm: number;
  absDeviationFromMedian: number;
  isOutlier: boolean;
  sourceWeight: number;
  recencyDecayFactor: number;
  combinedWeight: number;
}

export interface RobustNeighborhoodPriceSummary {
  medianPriceSqm: number;
  madValue: number;
  madUpperBoundSqm: number;
  madLowerBoundSqm: number;
  p25PriceSqm: number;
  p75PriceSqm: number;
  weightedReferencePriceSqm: number;
  weightedReferencePriceIntlText: string;
  inlierCount: number;
  outlierCount: number;
  evaluatedObservations: EvaluatedPriceObservation[];
}

export interface ServerValuationSealInput {
  cityId?: string;
  hoodId: number;
  sqm: number;
  buildYear: number;
  renovationStatus?: HedonicRenovationStatus;
  floor?: number;
  totalFloors?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  sellerAskingTotalMillion?: number;
  intlCurrency?: IntlCurrencyCode;
}

export interface ServerValuationSealResult {
  sealId: string;
  sealSignature: string;
  issuedAtIso: string;
  cityId: string;
  hoodId: number;
  hoodName: string;
  fastSaleFactor: number;
  hedonicValuation: HedonicValuationResult;
  hedonicTotalIntlText: string;
}

export function normalizePriceByCityIndex(rawPriceSqm: number, recordedCityIndex: number, currentCityIndex: number): number {
  if (!Number.isFinite(rawPriceSqm) || rawPriceSqm <= 0) return 0;
  if (!Number.isFinite(recordedCityIndex) || recordedCityIndex <= 0) return Number(rawPriceSqm.toFixed(2));
  if (!Number.isFinite(currentCityIndex) || currentCityIndex <= 0) return Number(rawPriceSqm.toFixed(2));
  const ratio = clampNumber(currentCityIndex / recordedCityIndex, 0.25, 4.0, 1.0);
  return Number((rawPriceSqm * ratio).toFixed(2));
}

export function computeMedian(values: readonly number[]): number {
  const valid = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 1 ? valid[mid] : Number(((valid[mid - 1] + valid[mid]) / 2).toFixed(4));
}

export function computePercentile(sortedValues: readonly number[], percentile0To100: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const p = clampNumber(percentile0To100, 0, 100, 50) / 100;
  const idx = p * (sortedValues.length - 1);
  const lower = Math.floor(idx), upper = Math.ceil(idx);
  if (lower === upper) return sortedValues[lower];
  const weight = idx - lower;
  return Number((sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(2));
}

export function computeExponentialRecencyDecay(ageDays: number, halfLifeDays: number = RECENCY_HALF_LIFE_DAYS): number {
  const safeAge = Math.max(0, Number.isFinite(ageDays) ? ageDays : 0);
  const safeHalfLife = Math.max(1, Number.isFinite(halfLifeDays) && halfLifeDays > 0 ? halfLifeDays : RECENCY_HALF_LIFE_DAYS);
  return Number(Math.exp(-(Math.LN2 / safeHalfLife) * safeAge).toFixed(6));
}

function resolveAgeDays(obs: RawPriceObservation, nowMs: number = Date.now()): number {
  if (typeof obs.ageDays === 'number' && Number.isFinite(obs.ageDays) && obs.ageDays >= 0) return obs.ageDays;
  if (obs.recordedAtIso) {
    const parsed = Date.parse(obs.recordedAtIso);
    if (Number.isFinite(parsed)) return Math.max(0, (nowMs - parsed) / (24 * 60 * 60 * 1000));
  }
  return 0;
}

export function filterOutliersUsingMAD(
  observations: readonly RawPriceObservation[],
  options?: { nowMs?: number; intlCurrency?: IntlCurrencyCode },
): RobustNeighborhoodPriceSummary {
  const nowMs = options?.nowMs ?? Date.now();
  const intlCurrency: IntlCurrencyCode = options?.intlCurrency ?? 'USD';
  const normalizedList = observations
    .filter((obs) => obs && Number.isFinite(obs.priceSqm) && obs.priceSqm > 0)
    .map((obs) => {
      const normalizedPriceSqm =
        typeof obs.recordedCityIndex === 'number' && typeof obs.currentCityIndex === 'number'
          ? normalizePriceByCityIndex(obs.priceSqm, obs.recordedCityIndex, obs.currentCityIndex)
          : Number(obs.priceSqm.toFixed(2));
      return { obs, normalizedPriceSqm };
    });

  if (normalizedList.length === 0) {
    return {
      medianPriceSqm: 0, madValue: 0, madUpperBoundSqm: 0, madLowerBoundSqm: 0, p25PriceSqm: 0, p75PriceSqm: 0,
      weightedReferencePriceSqm: 0, weightedReferencePriceIntlText: formatMillionTomanAsIntlCurrency(0, intlCurrency, 'fa'),
      inlierCount: 0, outlierCount: 0, evaluatedObservations: [],
    };
  }

  const prices = normalizedList.map((item) => item.normalizedPriceSqm);
  const medianPriceSqm = computeMedian(prices);
  const absDeviations = prices.map((p) => Math.abs(p - medianPriceSqm));
  const madValue = computeMedian(absDeviations);
  const maxAllowedDeviation = madValue > 0
    ? MAD_OUTLIER_THRESHOLD_MULTIPLIER * madValue
    : Number((medianPriceSqm * ZERO_MAD_RELATIVE_BANDWIDTH_FLOOR).toFixed(4));

  const evaluatedObservations: EvaluatedPriceObservation[] = normalizedList.map(({ obs, normalizedPriceSqm }) => {
    const absDeviationFromMedian = Number(Math.abs(normalizedPriceSqm - medianPriceSqm).toFixed(4));
    const isOutlier = normalizedList.length >= 3 && absDeviationFromMedian > maxAllowedDeviation;
    const sourceWeight = SOURCE_CREDIBILITY_WEIGHTS[obs.sourceType] ?? SOURCE_CREDIBILITY_WEIGHTS.AI_SEED;
    const recencyDecayFactor = computeExponentialRecencyDecay(resolveAgeDays(obs, nowMs));
    const combinedWeight = isOutlier ? 0 : Number((sourceWeight * recencyDecayFactor).toFixed(6));
    return { ...obs, normalizedPriceSqm, absDeviationFromMedian, isOutlier, sourceWeight, recencyDecayFactor, combinedWeight };
  });

  const inliers = evaluatedObservations.filter((item) => !item.isOutlier);
  const sortedInlierPrices = (inliers.length > 0 ? inliers : evaluatedObservations).map((item) => item.normalizedPriceSqm).sort((a, b) => a - b);
  const p25PriceSqm = computePercentile(sortedInlierPrices, 25);
  const p75PriceSqm = computePercentile(sortedInlierPrices, 75);

  let weightedSum = 0, weightTotal = 0;
  for (const item of inliers) {
    weightedSum += item.normalizedPriceSqm * item.combinedWeight;
    weightTotal += item.combinedWeight;
  }
  const weightedReferencePriceSqm = weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(2)) : Number(medianPriceSqm.toFixed(2));

  return {
    medianPriceSqm: Number(medianPriceSqm.toFixed(2)),
    madValue: Number(madValue.toFixed(4)),
    madUpperBoundSqm: Number((medianPriceSqm + maxAllowedDeviation).toFixed(2)),
    madLowerBoundSqm: Number(Math.max(0, medianPriceSqm - maxAllowedDeviation).toFixed(2)),
    p25PriceSqm, p75PriceSqm, weightedReferencePriceSqm,
    weightedReferencePriceIntlText: formatMillionTomanAsIntlCurrency(weightedReferencePriceSqm, intlCurrency, 'fa'),
    inlierCount: inliers.length,
    outlierCount: evaluatedObservations.length - inliers.length,
    evaluatedObservations,
  };
}

function buildSealCanonicalPayload(cityId: string, hv: HedonicValuationResult, fastSaleFactor: number = FAST_SALE_FACTOR): string {
  return [cityId, hv.hoodId, hv.sqm, hv.buildYear, hv.floor, hv.renovationStatus, hv.hedonicPerSqm, hv.hedonicTotalMillion, hv.fastSaleTotalMillion, fastSaleFactor].join('|');
}

export function computeServerValuationSeal(input: ServerValuationSealInput): ServerValuationSealResult {
  const cityId = validateCityParam(input.cityId, 'tehran') as CityId;
  const cityHoods = MULTI_CITY_CONFIGS[cityId]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const rawHood = cityHoods.find((h) => h.id === input.hoodId) ?? INITIAL_NEIGHBORHOODS.find((h) => h.id === input.hoodId) ?? INITIAL_NEIGHBORHOODS[0];
  const liveOverrideBuySqm = deepSyncedOverrides[cityId]?.[rawHood.id]?.buyPerSqm;
  const neighborhood = typeof liveOverrideBuySqm === 'number' && liveOverrideBuySqm > 0 ? { ...rawHood, buyPerSqm: liveOverrideBuySqm } : rawHood;
  const safeTotalFloors = clampNumber(input.totalFloors ?? 5, 1, 40, 5);
  const safeFloor = clampNumber(input.floor ?? 2, -1, safeTotalFloors, Math.min(2, safeTotalFloors));
  const safeSellerAsk = typeof input.sellerAskingTotalMillion === 'number' && Number.isFinite(input.sellerAskingTotalMillion) && input.sellerAskingTotalMillion > 0
    ? input.sellerAskingTotalMillion : undefined;

  const hedonicParams: HedonicInputParams = {
    neighborhood,
    sqm: clampNumber(input.sqm, 30, 600, 90),
    buildYear: clampNumber(input.buildYear, 1365, getCurrentJalaliYear() + 1, getCurrentJalaliYear() - 5),
    renovationStatus: input.renovationStatus ?? 'standard',
    floor: safeFloor,
    totalFloors: safeTotalFloors,
    hasElevator: input.hasElevator ?? true,
    hasParking: input.hasParking ?? true,
    hasStorage: input.hasStorage ?? true,
    sellerAskingTotalMillion: safeSellerAsk,
  };

  const hedonicValuation = calculateHedonicValuation(hedonicParams);
  const issuedAtIso = new Date().toISOString();
  const canonicalPayload = buildSealCanonicalPayload(cityId, hedonicValuation, FAST_SALE_FACTOR);
  const sealSecret = process.env.VALUATION_SEAL_SECRET || 'radar-stage2-canonical-valuation-seal-v1';
  const sealSignature = crypto.createHmac('sha256', sealSecret).update(canonicalPayload, 'utf8').digest('hex');
  const sealId = `SEAL-${cityId.toUpperCase()}-H${hedonicValuation.hoodId}-${sealSignature.slice(0, 10).toUpperCase()}`;
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';

  return {
    sealId, sealSignature, issuedAtIso, cityId,
    hoodId: hedonicValuation.hoodId, hoodName: hedonicValuation.hoodName,
    fastSaleFactor: FAST_SALE_FACTOR, hedonicValuation,
    hedonicTotalIntlText: formatMillionTomanAsIntlCurrency(hedonicValuation.hedonicTotalMillion, intlCurrency, 'fa'),
  };
}

export function verifyServerValuationSeal(seal: Pick<ServerValuationSealResult, 'cityId' | 'sealSignature' | 'fastSaleFactor' | 'hedonicValuation'>): boolean {
  if (!seal || typeof seal.sealSignature !== 'string' || !/^[0-9a-f]{64}$/i.test(seal.sealSignature) || !seal.hedonicValuation) return false;
  const sealSecret = process.env.VALUATION_SEAL_SECRET || 'radar-stage2-canonical-valuation-seal-v1';
  const canonicalPayload = buildSealCanonicalPayload(validateCityParam(seal.cityId, 'tehran'), seal.hedonicValuation, seal.fastSaleFactor || FAST_SALE_FACTOR);
  const expectedHex = crypto.createHmac('sha256', sealSecret).update(canonicalPayload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(seal.sealSignature.toLowerCase(), 'utf8'), Buffer.from(expectedHex.toLowerCase(), 'utf8'));
}
