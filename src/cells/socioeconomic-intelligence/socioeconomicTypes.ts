/**
 * @file src/cells/socioeconomic-intelligence/socioeconomicTypes.ts
 * @description Stage 2.2 — Socioeconomic Intelligence Rollup Cell Type Definitions
 * Schema for `/neighborhoodResearchRollups/{cityId}_{hoodId}_{periodKey}`.
 */
import type { CityId } from '../../types/models';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import type { RawPriceObservation, RobustNeighborhoodPriceSummary } from '../valuation-authority/robustValuationEngine';

export const K_ANONYMITY_MIN_DISTINCT_SESSIONS = 15;

export interface ResearchBehavioralEvent {
  sessionId: string;
  cityId?: CityId | string;
  hoodId: number;
  /** Sampling probability p_i in (0, 1], used for Horvitz-Thompson weight w_i = 1 / p_i */
  samplingProbability?: number;
  searcherBudgetPerSqm?: number;
  observedListingPriceSqm?: number;
  activeAttentionMs?: number;
  liked?: boolean;
  unliked?: boolean;
  previousHoodId?: number | null;
  nextHoodId?: number | null;
  recordedAtIso?: string;
}

export interface DisplacementFlowEntry {
  hoodId: number;
  hoodName: string;
  weightedCount: number;
  sharePct: number;
}

export interface NeighborhoodDisplacementMatrix {
  topInflowFromHoodIds: DisplacementFlowEntry[];
  topOutflowToHoodIds: DisplacementFlowEntry[];
}

/**
 * Firestore document schema for `/neighborhoodResearchRollups/{cityId}_{hoodId}_{periodKey}`
 */
export interface NeighborhoodResearchRollupDocument {
  rollupId: string;
  cityId: CityId;
  hoodId: number;
  hoodName: string;
  periodKey: string;
  distinctSessionCount: number;
  kAnonymitySatisfied: boolean;
  kAnonymityThreshold: number;
  totalWeightedSampleSize: number;

  // Manipulation-resistant MAD price metrics (always available from public market observations)
  medianPriceSqm: number;
  p25PriceSqm: number;
  p75PriceSqm: number;
  madValue: number;
  weightedReferencePriceSqm: number;
  medianPriceIntlText: string;
  outlierRejectedCount: number;

  // Socioeconomic & Behavioral indices (strictly null when distinctSessionCount < 15)
  affordabilityStressIndex: number | null;
  priceAttentionElasticity: number | null;
  hesitationRatePct: number | null;
  displacementMatrix: NeighborhoodDisplacementMatrix | null;

  // Academic & Institutional Citation
  citationCode: string;
  citationTextFa: string;
  updatedAtIso: string;
}

export interface BuildNeighborhoodRollupInput {
  cityId?: CityId | string;
  hoodId: number;
  periodKey?: string;
  priceObservations?: RawPriceObservation[];
  behavioralEvents?: ResearchBehavioralEvent[];
  intlCurrency?: IntlCurrencyCode;
}

export interface BuildNeighborhoodRollupResult {
  rollup: NeighborhoodResearchRollupDocument;
  priceSummary: RobustNeighborhoodPriceSummary;
}

export function formatRollupPriceIntl(priceSqm: number, currency: IntlCurrencyCode = 'USD'): string {
  return formatMillionTomanAsIntlCurrency(priceSqm, currency, 'fa');
}
