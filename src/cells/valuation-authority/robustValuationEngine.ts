/**
 * @file src/cells/valuation-authority/robustValuationEngine.ts
 * @description Stage 2.2 — Manipulation-Resistant Valuation Cell (MAD Outlier Engine & Server Hedonic Seal)
 */
import crypto from 'node:crypto';
import {
  calculateHedonicValuation,
  FAST_SALE_FACTOR,
  type HedonicInputParams,
  type HedonicRenovationStatus,
  type HedonicValuationResult,
} from '../../data/hedonicPricingEngine';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { clampNumber, validateCityParam } from '../../utils/security';

export type ValuationSourceType = 'VERIFIED_DEAL' | 'APPROVED_BARGAIN' | 'VERIFIED_CLAIM' | 'AI_SEED';

export const SOURCE_CREDIBILITY_WEIGHTS: Readonly<Record<ValuationSourceType, number>> = {
  VERIFIED_DEAL: 5.0,
  APPROVED_BARGAIN: 2.0,
  VERIFIED_CLAIM: 1.5,
  AI_SEED: 1.0,
} as const;

export const RECENCY_HALF_LIFE_DAYS = 30;
export const MAD_OUTLIER_THRESHOLD_MULTIPLIER = 2.5;

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

/**
 * Adjusts a historical price observation using the ratio of current city index to recorded city index.
 */
export function normalizePriceByCityIndex(
  rawPriceSqm: number,
  recordedCityIndex: number,
  currentCityIndex: number,
): number {
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
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedValues[lower];
  const weight = idx - lower;
  return Number((sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(2));
}

/**
 * Computes exponential recency decay exp(-lambda * delta_t) with a 30-day half-life.
 */
export function computeExponentialRecencyDecay(ageDays: number, halfLifeDays: number = RECENCY_HALF_LIFE_DAYS): number {
  const safeAge = Math.max(0, Number.isFinite(ageDays) ? ageDays : 0);
  const safeHalfLife = Math.max(1, Number.isFinite(halfLifeDays) && halfLifeDays > 0 ? halfLifeDays : RECENCY_HALF_LIFE_DAYS);
  const lambda = Math.LN2 / safeHalfLife;
  return Number(Math.exp(-lambda * safeAge).toFixed(6));
}

function resolveAgeDays(obs: RawPriceObservation, nowMs: number = Date.now()): number {
  if (typeof obs.ageDays === 'number' && Number.isFinite(obs.ageDays) && obs.ageDays >= 0) {
    return obs.ageDays;
  }
  if (obs.recordedAtIso) {
    const parsed = Date.parse(obs.recordedAtIso);
    if (Number.isFinite(parsed)) {
      return Math.max(0, (nowMs - parsed) / (24 * 60 * 60 * 1000));
    }
  }
  return 0;
}

/**
 * Filters price observations using Median Absolute Deviation (MAD):
 * M = Median(P), MAD = Median(|P_i - M|), Outlier if |P_i - M| > 2.5 * MAD.
 * Then computes the weighted reference price from non-outlier observations using
 * source credibility weight * exponential 30-day half-life decay.
 */
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
      medianPriceSqm: 0, madValue: 0, madUpperBoundSqm: 0, madLowerBoundSqm: 0,
      p25PriceSqm: 0, p75PriceSqm: 0, weightedReferencePriceSqm: 0,
      weightedReferencePriceIntlText: formatMillionTomanAsIntlCurrency(0, intlCurrency, 'fa'),
      inlierCount: 0, outlierCount: 0, evaluatedObservations: [],
    };
  }

  const prices = normalizedList.map((item) => item.normalizedPriceSqm);
  const medianPriceSqm = computeMedian(prices);
  const absDeviations = prices.map((p) => Math.abs(p - medianPriceSqm));
  const madValue = computeMedian(absDeviations);
  const maxAllowedDeviation = MAD_OUTLIER_THRESHOLD_MULTIPLIER * madValue;

  const evaluatedObservations: EvaluatedPriceObservation[] = normalizedList.map(({ obs, normalizedPriceSqm }) => {
    const absDeviationFromMedian = Number(Math.abs(normalizedPriceSqm - medianPriceSqm).toFixed(4));
    const isOutlier = normalizedList.length >= 3 && absDeviationFromMedian > maxAllowedDeviation;
    const sourceWeight = SOURCE_CREDIBILITY_WEIGHTS[obs.sourceType] ?? SOURCE_CREDIBILITY_WEIGHTS.AI_SEED;
    const ageDays = resolveAgeDays(obs, nowMs);
    const recencyDecayFactor = computeExponentialRecencyDecay(ageDays);
    const combinedWeight = isOutlier ? 0 : Number((sourceWeight * recencyDecayFactor).toFixed(6));

    return {
      ...obs,
      normalizedPriceSqm,
      absDeviationFromMedian,
      isOutlier,
      sourceWeight,
      recencyDecayFactor,
      combinedWeight,
    };
  });

  const inliers = evaluatedObservations.filter((item) => !item.isOutlier);
  const sortedInlierPrices = (inliers.length > 0 ? inliers : evaluatedObservations)
    .map((item) => item.normalizedPriceSqm)
    .sort((a, b) => a - b);

  const p25PriceSqm = computePercentile(sortedInlierPrices, 25);
  const p75PriceSqm = computePercentile(sortedInlierPrices, 75);

  let weightedSum = 0;
  let weightTotal = 0;
  for (const item of inliers) {
    weightedSum += item.normalizedPriceSqm * item.combinedWeight;
    weightTotal += item.combinedWeight;
  }

  const weightedReferencePriceSqm =
    weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(2)) : Number(medianPriceSqm.toFixed(2));

  return {
    medianPriceSqm: Number(medianPriceSqm.toFixed(2)),
    madValue: Number(madValue.toFixed(4)),
    madUpperBoundSqm: Number((medianPriceSqm + maxAllowedDeviation).toFixed(2)),
    madLowerBoundSqm: Number(Math.max(0, medianPriceSqm - maxAllowedDeviation).toFixed(2)),
    p25PriceSqm,
    p75PriceSqm,
    weightedReferencePriceSqm,
    weightedReferencePriceIntlText: formatMillionTomanAsIntlCurrency(weightedReferencePriceSqm, intlCurrency, 'fa'),
    inlierCount: inliers.length,
    outlierCount: evaluatedObservations.length - inliers.length,
    evaluatedObservations,
  };
}

/**
 * Generates an official server-signed Hedonic valuation seal using `calculateHedonicValuation`.
 */
export function computeServerValuationSeal(input: ServerValuationSealInput): ServerValuationSealResult {
  const cityId = validateCityParam(input.cityId, 'tehran');
  const cityHoods = MULTI_CITY_CONFIGS[cityId]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const neighborhood =
    cityHoods.find((h) => h.id === input.hoodId) ??
    INITIAL_NEIGHBORHOODS.find((h) => h.id === input.hoodId) ??
    INITIAL_NEIGHBORHOODS[0];

  const hedonicParams: HedonicInputParams = {
    neighborhood,
    sqm: clampNumber(input.sqm, 30, 600, 90),
    buildYear: clampNumber(input.buildYear, 1365, 1405, 1400),
    renovationStatus: input.renovationStatus ?? 'standard',
    floor: clampNumber(input.floor ?? 2, -1, 30, 2),
    totalFloors: clampNumber(input.totalFloors ?? 5, 1, 40, 5),
    hasElevator: input.hasElevator ?? true,
    hasParking: input.hasParking ?? true,
    hasStorage: input.hasStorage ?? true,
    sellerAskingTotalMillion: input.sellerAskingTotalMillion,
  };

  const hedonicValuation = calculateHedonicValuation(hedonicParams);
  const issuedAtIso = new Date().toISOString();
  const canonicalPayload = [
    cityId,
    hedonicValuation.hoodId,
    hedonicValuation.sqm,
    hedonicValuation.buildYear,
    hedonicValuation.floor,
    hedonicValuation.renovationStatus,
    hedonicValuation.hedonicPerSqm,
    hedonicValuation.hedonicTotalMillion,
    hedonicValuation.fastSaleTotalMillion,
    FAST_SALE_FACTOR,
  ].join('|');

  const sealSecret = process.env.VALUATION_SEAL_SECRET || 'radar-stage2-canonical-valuation-seal-v1';
  const sealSignature = crypto.createHmac('sha256', sealSecret).update(canonicalPayload, 'utf8').digest('hex');
  const sealId = `SEAL-${cityId.toUpperCase()}-H${hedonicValuation.hoodId}-${sealSignature.slice(0, 10).toUpperCase()}`;
  const intlCurrency: IntlCurrencyCode = input.intlCurrency ?? 'USD';

  return {
    sealId,
    sealSignature,
    issuedAtIso,
    cityId,
    hoodId: hedonicValuation.hoodId,
    hoodName: hedonicValuation.hoodName,
    fastSaleFactor: FAST_SALE_FACTOR,
    hedonicValuation,
    hedonicTotalIntlText: formatMillionTomanAsIntlCurrency(hedonicValuation.hedonicTotalMillion, intlCurrency, 'fa'),
  };
}
