/**
 * @file server/modules/market-analytics/repositoryAndService.ts
 * @description Persistence Adapter Interface and Orchestration Service for Market Analytics (Employee 10).
 * Separates pure analytical computation from database storage of derived analytical projections.
 */

import type { SupportedCityId } from '../geography';
import {
  adaptApprovedBargainToObservation,
  adaptCrowdClaimToObservation,
  DEFAULT_VALUATION_MODEL_SPEC,
} from './dataQualityAndOutliers';
import type { ComparableSelectionCriteria } from './comparablesAndAdjustments';
import { computePropertyOrNeighborhoodValuation } from './valuationEngine';
import {
  compareNeighborhoodMarkets,
  computeHistoricalMarketTrends,
  computeNeighborhoodMarketIndicators,
  type NeighborhoodComparisonOutput,
  type NeighborhoodMarketIndicatorsOutput,
} from './marketIndicatorsAndTrends';
import type {
  ApprovedBargainListingContract,
  CrowdMarketObservationContract,
  HistoricalTrendSeriesOutput,
  MarketMode,
  MarketObservationRecord,
  SubjectPropertySpecs,
  SupplyDemandInputMetrics,
  ValuationModelVersionSpec,
  VersionedValuationOutput,
} from './types';

/**
 * Storage contract for persisting versioned valuation outputs and derived projections.
 * Canonical upstream records remain owned by Bargains, Geography, and Crowd Claims.
 */
export interface MarketAnalyticsRepository {
  saveValuationOutput(output: VersionedValuationOutput): Promise<void>;
  getValuationByResultId(resultId: string): Promise<VersionedValuationOutput | null>;
  getValuationByReproducibilityHash(hash: string): Promise<VersionedValuationOutput | null>;
  listValuationsForNeighborhood(
    cityId: SupportedCityId,
    hoodId: number,
    marketMode?: MarketMode
  ): Promise<VersionedValuationOutput[]>;
  saveTrendSeries(series: HistoricalTrendSeriesOutput): Promise<void>;
  getTrendSeries(
    cityId: SupportedCityId,
    hoodId: number,
    marketMode: MarketMode,
    modelVersion?: string
  ): Promise<HistoricalTrendSeriesOutput | null>;
}

/**
 * Deterministic in-memory repository for derived analytical projections.
 */
export class InMemoryMarketAnalyticsRepository implements MarketAnalyticsRepository {
  private readonly valuationsById = new Map<string, VersionedValuationOutput>();
  private readonly valuationsByHash = new Map<string, VersionedValuationOutput>();
  private readonly trendsByKey = new Map<string, HistoricalTrendSeriesOutput>();

  public async saveValuationOutput(output: VersionedValuationOutput): Promise<void> {
    this.valuationsById.set(output.resultId, output);
    this.valuationsByHash.set(output.reproducibilityHash, output);
  }

  public async getValuationByResultId(resultId: string): Promise<VersionedValuationOutput | null> {
    return this.valuationsById.get(resultId) ?? null;
  }

  public async getValuationByReproducibilityHash(hash: string): Promise<VersionedValuationOutput | null> {
    return this.valuationsByHash.get(hash) ?? null;
  }

  public async listValuationsForNeighborhood(
    cityId: SupportedCityId,
    hoodId: number,
    marketMode?: MarketMode
  ): Promise<VersionedValuationOutput[]> {
    const composite = `${cityId}:${hoodId}`;
    const results: VersionedValuationOutput[] = [];
    for (const v of this.valuationsById.values()) {
      if (v.reference.compositeNeighborhoodId !== composite) continue;
      if (marketMode && v.marketMode !== marketMode) continue;
      results.push(v);
    }
    return results.sort((a, b) => b.valuationTimestampIso.localeCompare(a.valuationTimestampIso));
  }

  public async saveTrendSeries(series: HistoricalTrendSeriesOutput): Promise<void> {
    const key = `${series.compositeNeighborhoodId}|${series.marketMode}|${series.modelVersion}`;
    this.trendsByKey.set(key, series);
  }

  public async getTrendSeries(
    cityId: SupportedCityId,
    hoodId: number,
    marketMode: MarketMode,
    modelVersion = DEFAULT_VALUATION_MODEL_SPEC.modelVersion
  ): Promise<HistoricalTrendSeriesOutput | null> {
    const key = `${cityId}:${hoodId}|${marketMode}|${modelVersion}`;
    return this.trendsByKey.get(key) ?? null;
  }
}

export interface UpstreamEvidenceSourcesInput {
  directObservations?: ReadonlyArray<MarketObservationRecord>;
  approvedBargains?: ReadonlyArray<ApprovedBargainListingContract>;
  crowdObservations?: ReadonlyArray<CrowdMarketObservationContract>;
}

/**
 * Pure helper to assemble normalized observations from approved upstream module contracts.
 */
export function collectObservationsFromContracts(
  sources: UpstreamEvidenceSourcesInput
): MarketObservationRecord[] {
  const combined: MarketObservationRecord[] = [];
  if (sources.directObservations) {
    combined.push(...sources.directObservations);
  }
  if (sources.approvedBargains) {
    for (const b of sources.approvedBargains) {
      const adapted = adaptApprovedBargainToObservation(b);
      if (adapted) combined.push(adapted);
    }
  }
  if (sources.crowdObservations) {
    for (const c of sources.crowdObservations) {
      const adapted = adaptCrowdClaimToObservation(c);
      if (adapted) combined.push(adapted);
    }
  }
  return combined;
}

/**
 * High-level Market Analytics Service coordinating pure engines with projection storage.
 */
export class MarketAnalyticsService {
  private readonly repository: MarketAnalyticsRepository;
  private readonly modelSpec: ValuationModelVersionSpec;

  constructor(
    repository: MarketAnalyticsRepository = new InMemoryMarketAnalyticsRepository(),
    modelSpec: ValuationModelVersionSpec = DEFAULT_VALUATION_MODEL_SPEC
  ) {
    this.repository = repository;
    this.modelSpec = modelSpec;
  }

  public getModelSpec(): ValuationModelVersionSpec {
    return this.modelSpec;
  }

  public async evaluatePropertyOrNeighborhood(params: {
    subject: SubjectPropertySpecs;
    evidence: UpstreamEvidenceSourcesInput;
    valuationTimestampIso: string;
    criteria?: ComparableSelectionCriteria;
    persistResult?: boolean;
  }): Promise<VersionedValuationOutput> {
    const observations = collectObservationsFromContracts(params.evidence);
    const result = computePropertyOrNeighborhoodValuation({
      subject: params.subject,
      observations,
      valuationTimestampIso: params.valuationTimestampIso,
      modelSpec: this.modelSpec,
      criteria: params.criteria,
    });

    if (params.persistResult !== false) {
      await this.repository.saveValuationOutput(result);
    }
    return result;
  }

  public async analyzeNeighborhoodIndicators(params: {
    cityId: SupportedCityId;
    hoodId: number;
    evidence: UpstreamEvidenceSourcesInput;
    computedAtIso: string;
    supplyDemandInput?: SupplyDemandInputMetrics | null;
    persistResult?: boolean;
  }): Promise<NeighborhoodMarketIndicatorsOutput> {
    const observations = collectObservationsFromContracts(params.evidence);
    const indicators = computeNeighborhoodMarketIndicators({
      cityId: params.cityId,
      hoodId: params.hoodId,
      observations,
      computedAtIso: params.computedAtIso,
      supplyDemandInput: params.supplyDemandInput,
      modelSpec: this.modelSpec,
    });

    if (params.persistResult !== false) {
      await this.repository.saveValuationOutput(indicators.saleAnalysis);
      await this.repository.saveValuationOutput(indicators.rentalAnalysis);
    }
    return indicators;
  }

  public async analyzeHistoricalTrends(params: {
    cityId: SupportedCityId;
    hoodId: number;
    marketMode: MarketMode;
    periods: ReadonlyArray<{ periodKey: string; periodStartIso: string; periodEndIso: string }>;
    evidence: UpstreamEvidenceSourcesInput;
    computedAtIso: string;
    minSamplesPerPeriod?: number;
    persistResult?: boolean;
  }): Promise<HistoricalTrendSeriesOutput> {
    const observations = collectObservationsFromContracts(params.evidence);
    const series = computeHistoricalMarketTrends({
      cityId: params.cityId,
      hoodId: params.hoodId,
      marketMode: params.marketMode,
      periods: params.periods,
      observations,
      computedAtIso: params.computedAtIso,
      minSamplesPerPeriod: params.minSamplesPerPeriod,
      modelSpec: this.modelSpec,
    });

    if (params.persistResult !== false) {
      await this.repository.saveTrendSeries(series);
    }
    return series;
  }

  public async compareNeighborhoods(params: {
    neighborhoodA: {
      cityId: SupportedCityId;
      hoodId: number;
      evidence: UpstreamEvidenceSourcesInput;
      supplyDemandInput?: SupplyDemandInputMetrics | null;
    };
    neighborhoodB: {
      cityId: SupportedCityId;
      hoodId: number;
      evidence: UpstreamEvidenceSourcesInput;
      supplyDemandInput?: SupplyDemandInputMetrics | null;
    };
    computedAtIso: string;
  }): Promise<NeighborhoodComparisonOutput> {
    const indA = await this.analyzeNeighborhoodIndicators({
      ...params.neighborhoodA,
      computedAtIso: params.computedAtIso,
    });
    const indB = await this.analyzeNeighborhoodIndicators({
      ...params.neighborhoodB,
      computedAtIso: params.computedAtIso,
    });
    return compareNeighborhoodMarkets({
      neighborhoodA: indA,
      neighborhoodB: indB,
      computedAtIso: params.computedAtIso,
    });
  }

  public getRepository(): MarketAnalyticsRepository {
    return this.repository;
  }
}

export const defaultMarketAnalyticsService = new MarketAnalyticsService();
