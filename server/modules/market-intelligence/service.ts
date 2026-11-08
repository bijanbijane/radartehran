import crypto from 'crypto';
import { CoreApiError } from '../core';
import type { PropertyCategory, ValuationTransactionType } from '../valuation';
import { computeMedian } from '../valuation';
import {
  computeTemporalMarketSeries,
  computeValidatedMarketIndicators,
  createDefaultMarketIntelligenceConfig,
} from './indicatorsAndTemporalEngine';
import {
  compareGeographicAreas,
  computeMarketSegments,
  computeShortTermMarketForecast,
  detectMarketAnomalies,
} from './segmentationComparisonAndAnomalyEngine';
import type {
  AggregationJobRecord,
  GeographicComparisonEntry,
  MarketAnomalyRecord,
  MarketEvidenceEventInput,
  MarketGeographicLevel,
  MarketIntelligenceConfig,
  MarketIntelligenceDependencies,
  MarketSegmentBucket,
  NeighborhoodMarketProfile,
  ShortTermMarketForecast,
  TemporalMarketSeriesResult,
  TimeGranularity,
  ValidatedMarketIndicators,
} from './types';

export function createMarketIntelligenceService(deps: MarketIntelligenceDependencies = {}) {
  const nowFn = deps.now ?? (() => new Date());

  const eventStore = new Map<string, MarketEvidenceEventInput>();
  const profileCache = new Map<string, NeighborhoodMarketProfile>();
  // Versioned materialized analytical snapshots (never overwritten on recalculation)
  const materializedHistory = new Map<string, ValidatedMarketIndicators[]>();
  const anomalyStore = new Map<string, MarketAnomalyRecord>();
  const jobStore = new Map<string, AggregationJobRecord>();
  const activeAggregationLocks = new Set<string>();

  let currentConfig: MarketIntelligenceConfig = createDefaultMarketIntelligenceConfig(
    nowFn().toISOString(),
  );
  let currentAggregationVersion = 1;

  function invalidateHoodCache(cityId: string, hoodId?: number) {
    for (const [k, v] of profileCache.entries()) {
      if (v.cityId === cityId && (hoodId === undefined || v.hoodId === hoodId)) {
        profileCache.delete(k);
      }
    }
  }

  function ingestEvidenceEvents(events: MarketEvidenceEventInput[]): {
    ingestedCount: number;
    affectedNeighborhoodKeys: string[];
  } {
    const affected = new Set<string>();
    let ingestedCount = 0;
    for (const ev of events) {
      if (!ev.id || !ev.cityId || ev.sqm <= 0) continue;
      // Never persist private participant IDs into derived analytical memory
      const sanitized: MarketEvidenceEventInput = structuredClone(ev);
      delete sanitized.privateParticipantId;
      eventStore.set(sanitized.id, sanitized);
      ingestedCount++;
      affected.add(`${sanitized.cityId}:${sanitized.hoodId}`);
      invalidateHoodCache(sanitized.cityId, sanitized.hoodId);
    }
    return {
      ingestedCount,
      affectedNeighborhoodKeys: Array.from(affected),
    };
  }

  function filterScopedEvents(params: {
    cityId: string;
    districtId?: string;
    hoodId?: number;
    subNeighborhoodId?: string;
    streetName?: string;
    propertyCategory?: PropertyCategory;
    transactionType?: ValuationTransactionType;
    periodStartIso?: string;
    periodEndIso?: string;
  }): MarketEvidenceEventInput[] {
    const startMs = params.periodStartIso ? Date.parse(params.periodStartIso) : 0;
    const endMs = params.periodEndIso ? Date.parse(params.periodEndIso) : Number.MAX_SAFE_INTEGER;

    return Array.from(eventStore.values()).filter((e) => {
      if (e.cityId !== params.cityId) return false;
      if (params.districtId && e.districtId !== params.districtId) return false;
      if (params.hoodId !== undefined && e.hoodId !== params.hoodId) return false;
      if (params.subNeighborhoodId && e.subNeighborhoodId !== params.subNeighborhoodId) return false;
      if (params.streetName && e.streetName !== params.streetName) return false;
      if (params.propertyCategory && e.propertyCategory !== params.propertyCategory) return false;
      if (params.transactionType && e.transactionType !== params.transactionType) return false;
      const obsMs = Date.parse(e.observedAtIso);
      if (Number.isFinite(obsMs) && (obsMs < startMs || obsMs > endMs)) return false;
      return true;
    });
  }

  function getMarketIndicators(params: {
    geographicLevel?: MarketGeographicLevel;
    cityId: string;
    districtId?: string;
    hoodId?: number;
    hoodName?: string;
    subNeighborhoodId?: string;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    periodStartIso?: string;
    periodEndIso?: string;
    isPublicRequest?: boolean;
  }): ValidatedMarketIndicators {
    const nowIso = nowFn().toISOString();
    const periodEndIso = params.periodEndIso ?? nowIso;
    const periodStartIso =
      params.periodStartIso ??
      new Date(Date.parse(periodEndIso) - 90 * 24 * 60 * 60 * 1000).toISOString();

    const scopedEvents = filterScopedEvents({
      cityId: params.cityId,
      districtId: params.districtId,
      hoodId: params.hoodId,
      subNeighborhoodId: params.subNeighborhoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      periodStartIso,
      periodEndIso,
    });

    const pairedRentalEventsForYield =
      params.transactionType === 'sale'
        ? filterScopedEvents({
            cityId: params.cityId,
            districtId: params.districtId,
            hoodId: params.hoodId,
            propertyCategory: params.propertyCategory,
            transactionType: 'rent',
            periodStartIso,
            periodEndIso,
          })
        : undefined;

    const geographicLevel: MarketGeographicLevel =
      params.geographicLevel ??
      (params.subNeighborhoodId
        ? 'sub_neighborhood'
        : params.hoodId !== undefined
          ? 'neighborhood'
          : params.districtId
            ? 'district'
            : 'city');

    const result = computeValidatedMarketIndicators({
      geographicLevel,
      cityId: params.cityId,
      districtId: params.districtId,
      hoodId: params.hoodId,
      hoodName: params.hoodName ?? scopedEvents.find((e) => e.hoodName)?.hoodName,
      subNeighborhoodId: params.subNeighborhoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      periodStartIso,
      periodEndIso,
      scopedEvents,
      pairedRentalEventsForYield,
      config: currentConfig,
      aggregationVersion: currentAggregationVersion,
      nowIso,
      suppressSmallSamplesForPublic: params.isPublicRequest ?? false,
    });

    if (params.isPublicRequest && result.lineage) {
      // Do not expose raw sourceRecordIds on public endpoints
      result.lineage = {
        ...result.lineage,
        sourceRecordIds: [],
      };
    }

    return result;
  }

  function getTemporalMarketSeries(params: {
    cityId: string;
    hoodId?: number;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    granularity: TimeGranularity;
    periodStartIso: string;
    periodEndIso: string;
  }): TemporalMarketSeriesResult {
    const events = filterScopedEvents({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
    });

    return computeTemporalMarketSeries({
      ...params,
      events,
      config: currentConfig,
    });
  }

  function getNeighborhoodMarketProfile(params: {
    cityId: string;
    hoodId: number;
    hoodName?: string;
    periodStartIso?: string;
    periodEndIso?: string;
    isPublicRequest?: boolean;
  }): NeighborhoodMarketProfile {
    const cacheKey = `${params.cityId}:${params.hoodId}:${params.isPublicRequest ? 'pub' : 'adm'}`;
    if (!params.periodStartIso && !params.periodEndIso) {
      const cached = profileCache.get(cacheKey);
      if (cached) return structuredClone(cached);
    }

    const nowIso = nowFn().toISOString();
    const periodEndIso = params.periodEndIso ?? nowIso;
    const periodStartIso =
      params.periodStartIso ??
      new Date(Date.parse(periodEndIso) - 180 * 24 * 60 * 60 * 1000).toISOString();

    const saleIndicators = getMarketIndicators({
      cityId: params.cityId,
      hoodId: params.hoodId,
      hoodName: params.hoodName,
      propertyCategory: 'residential',
      transactionType: 'sale',
      periodStartIso,
      periodEndIso,
      isPublicRequest: params.isPublicRequest,
    });

    const rentalIndicators = getMarketIndicators({
      cityId: params.cityId,
      hoodId: params.hoodId,
      hoodName: params.hoodName,
      propertyCategory: 'residential',
      transactionType: 'rent',
      periodStartIso,
      periodEndIso,
      isPublicRequest: params.isPublicRequest,
    });

    const allHoodEvents = filterScopedEvents({
      cityId: params.cityId,
      hoodId: params.hoodId,
      periodStartIso,
      periodEndIso,
    });

    const categories: PropertyCategory[] = ['residential', 'commercial', 'office', 'industrial', 'land_development'];
    const categoryBreakdown = categories
      .map((cat) => {
        const catEvents = allHoodEvents.filter((e) => e.propertyCategory === cat && e.sqm > 0);
        const psms = catEvents
          .map((e) => (e.completedPriceMillion ?? e.askingPriceMillion ?? 0) / e.sqm)
          .filter((v) => v > 0);
        const minCount = params.isPublicRequest ? currentConfig.minSampleThresholdPublic : 1;
        return {
          propertyCategory: cat,
          observationCount: catEvents.length,
          medianPsmMillion: psms.length >= minCount ? Number(computeMedian(psms).toFixed(2)) : null,
        };
      })
      .filter((c) => c.observationCount > 0);

    const segments = computeMarketSegments({
      events: allHoodEvents,
      config: currentConfig,
      suppressSmallSamples: params.isPublicRequest ?? true,
    });

    const saleSeries = getTemporalMarketSeries({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: 'residential',
      transactionType: 'sale',
      granularity: 'monthly',
      periodStartIso,
      periodEndIso,
    });

    const totalObs = saleIndicators.reliability.observationCount + rentalIndicators.reliability.observationCount;
    const coverageLevel: NeighborhoodMarketProfile['coverageLevel'] =
      totalObs >= 15
        ? 'comprehensive'
        : totalObs >= 6
          ? 'moderate'
          : totalObs >= currentConfig.minSampleThresholdPublic
            ? 'sparse'
            : 'insufficient';

    const growth = saleSeries.overallGrowthPct;
    const direction: NeighborhoodMarketProfile['recentTrendSummary']['direction'] =
      growth === null
        ? 'insufficient_data'
        : growth > 2
          ? 'upward'
          : growth < -2
            ? 'downward'
            : 'stable';

    const profile: NeighborhoodMarketProfile = {
      cityId: params.cityId,
      hoodId: params.hoodId,
      hoodName: params.hoodName ?? saleIndicators.hoodName ?? `Hood #${params.hoodId}`,
      boundaryReference: `bnd:${params.cityId}:hood:${params.hoodId}:v1`,
      saleIndicators,
      rentalIndicators,
      categoryBreakdown,
      segments,
      recentTrendSummary: {
        priceChangePct: growth,
        rentChangePct: null,
        direction,
      },
      coverageLevel,
      lastUpdatedAtIso: nowIso,
      methodologyVersion: currentConfig.methodologyVersion,
    };

    if (!params.periodStartIso && !params.periodEndIso) {
      profileCache.set(cacheKey, structuredClone(profile));
    }
    return profile;
  }

  function getMarketSegmentsForScope(params: {
    cityId: string;
    hoodId?: number;
    propertyCategory?: PropertyCategory;
    transactionType?: ValuationTransactionType;
    suppressSmallSamples?: boolean;
  }): MarketSegmentBucket[] {
    const events = filterScopedEvents({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
    });
    return computeMarketSegments({
      events,
      config: currentConfig,
      suppressSmallSamples: params.suppressSmallSamples ?? true,
    });
  }

  function compareNeighborhoods(params: {
    cityId: string;
    hoodIds: number[];
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    periodStartIso?: string;
    periodEndIso?: string;
  }): GeographicComparisonEntry[] {
    const indicators = params.hoodIds.map((hoodId) =>
      getMarketIndicators({
        cityId: params.cityId,
        hoodId,
        propertyCategory: params.propertyCategory,
        transactionType: params.transactionType,
        periodStartIso: params.periodStartIso,
        periodEndIso: params.periodEndIso,
        isPublicRequest: false,
      }),
    );
    return compareGeographicAreas({
      indicatorsByHood: indicators,
      config: currentConfig,
    });
  }

  function detectAndStoreAnomalies(params: {
    cityId: string;
    hoodId?: number;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    granularity?: TimeGranularity;
    periodStartIso: string;
    periodEndIso: string;
  }): MarketAnomalyRecord[] {
    const series = getTemporalMarketSeries({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      granularity: params.granularity ?? 'monthly',
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
    });
    const rawEvents = filterScopedEvents({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
    });
    const detected = detectMarketAnomalies({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      series,
      rawEvents,
      config: currentConfig,
      nowIso: nowFn().toISOString(),
    });
    for (const a of detected) {
      anomalyStore.set(a.id, a);
    }
    return structuredClone(detected);
  }

  function reviewAnomaly(params: {
    actorUid: string;
    anomalyId: string;
    decision: 'APPROVED_PUBLIC' | 'DISMISSED_FALSE_POSITIVE' | 'INTERNAL_DATA_ISSUE';
    notes: string;
  }): MarketAnomalyRecord {
    const existing = anomalyStore.get(params.anomalyId);
    if (!existing) {
      throw new CoreApiError('NOT_FOUND', 404, `Anomaly '${params.anomalyId}' not found.`);
    }
    const updated: MarketAnomalyRecord = {
      ...structuredClone(existing),
      reviewStatus: params.decision,
      publiclyApproved: params.decision === 'APPROVED_PUBLIC',
      reviewedByUid: params.actorUid,
      reviewedAtIso: nowFn().toISOString(),
      reviewNotes: params.notes,
    };
    anomalyStore.set(updated.id, updated);
    return structuredClone(updated);
  }

  function listAnomalies(params: {
    cityId?: string;
    hoodId?: number;
    onlyPubliclyApproved?: boolean;
  }): MarketAnomalyRecord[] {
    return Array.from(anomalyStore.values())
      .filter((a) => {
        if (params.cityId && a.cityId !== params.cityId) return false;
        if (params.hoodId !== undefined && a.hoodId !== params.hoodId) return false;
        if (params.onlyPubliclyApproved && !a.publiclyApproved) return false;
        return true;
      })
      .map((a) => structuredClone(a));
  }

  function getShortTermForecast(params: {
    cityId: string;
    hoodId: number;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    periodStartIso: string;
    periodEndIso: string;
    horizonMonths?: number;
  }): ShortTermMarketForecast {
    const series = getTemporalMarketSeries({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      granularity: 'monthly',
      periodStartIso: params.periodStartIso,
      periodEndIso: params.periodEndIso,
    });
    return computeShortTermMarketForecast({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      transactionType: params.transactionType,
      series,
      horizonMonths: params.horizonMonths,
      config: currentConfig,
      nowIso: nowFn().toISOString(),
    });
  }

  async function runAggregationJob(params: {
    actorUid: string;
    idempotencyKey: string;
    jobType: AggregationJobRecord['jobType'];
    cityId: string;
    hoodIds: number[];
    propertyCategory?: PropertyCategory;
    periodStartIso?: string;
    periodEndIso?: string;
  }): Promise<AggregationJobRecord> {
    for (const existing of jobStore.values()) {
      if (existing.idempotencyKey === params.idempotencyKey) {
        return structuredClone(existing);
      }
    }

    const lockKey = `${params.cityId}:${params.hoodIds.slice().sort().join(',')}`;
    if (activeAggregationLocks.has(lockKey)) {
      throw new CoreApiError('CONFLICT', 409, `Concurrent aggregation job already running for ${lockKey}.`);
    }

    activeAggregationLocks.add(lockKey);
    const startedAtIso = nowFn().toISOString();
    try {
      currentAggregationVersion += 1;
      const cat = params.propertyCategory ?? 'residential';
      let processedCount = 0;

      for (const hoodId of params.hoodIds) {
        invalidateHoodCache(params.cityId, hoodId);
        const saleSnap = getMarketIndicators({
          cityId: params.cityId,
          hoodId,
          propertyCategory: cat,
          transactionType: 'sale',
          periodStartIso: params.periodStartIso,
          periodEndIso: params.periodEndIso,
          isPublicRequest: false,
        });
        const key = `${params.cityId}:${hoodId}:${cat}:sale`;
        const historyList = materializedHistory.get(key) ?? [];
        // Preserve all historical versions immutably
        historyList.push(structuredClone(saleSnap));
        materializedHistory.set(key, historyList);
        processedCount += 1;
      }

      const job: AggregationJobRecord = {
        id: `agg_job_${crypto.randomBytes(6).toString('hex')}`,
        idempotencyKey: params.idempotencyKey,
        jobType: params.jobType,
        cityId: params.cityId,
        hoodIds: [...params.hoodIds],
        propertyCategory: cat,
        status: 'COMPLETED',
        processedSnapshotsCount: processedCount,
        newAggregationVersion: currentAggregationVersion,
        requestedByUid: params.actorUid,
        startedAtIso,
        completedAtIso: nowFn().toISOString(),
      };
      jobStore.set(job.id, job);
      return structuredClone(job);
    } finally {
      activeAggregationLocks.delete(lockKey);
    }
  }

  function listMaterializedHistory(params: {
    cityId: string;
    hoodId: number;
    propertyCategory?: PropertyCategory;
    transactionType?: ValuationTransactionType;
  }): ValidatedMarketIndicators[] {
    const key = `${params.cityId}:${params.hoodId}:${params.propertyCategory ?? 'residential'}:${params.transactionType ?? 'sale'}`;
    return structuredClone(materializedHistory.get(key) ?? []);
  }

  function updateConfiguration(params: {
    actorUid: string;
    updates: Partial<
      Pick<
        MarketIntelligenceConfig,
        | 'methodologyVersion'
        | 'minSampleThresholdPublic'
        | 'minSampleThresholdRanking'
        | 'minBucketsForForecast'
        | 'anomalyPriceSpikeThresholdPct'
        | 'anomalyVolumeSpikeThresholdPct'
        | 'staleEvidenceThresholdDays'
      >
    >;
  }): MarketIntelligenceConfig {
    if (
      params.updates.minSampleThresholdPublic !== undefined &&
      (params.updates.minSampleThresholdPublic < 2 || params.updates.minSampleThresholdPublic > 100)
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'minSampleThresholdPublic must be between 2 and 100.');
    }
    currentConfig = {
      ...currentConfig,
      ...params.updates,
      configVersion: currentConfig.configVersion + 1,
      updatedByUid: params.actorUid,
      updatedAtIso: nowFn().toISOString(),
    };
    profileCache.clear();
    return structuredClone(currentConfig);
  }

  return {
    ingestEvidenceEvents,
    getMarketIndicators,
    getTemporalMarketSeries,
    getNeighborhoodMarketProfile,
    getMarketSegmentsForScope,
    compareNeighborhoods,
    detectAndStoreAnomalies,
    reviewAnomaly,
    listAnomalies,
    getShortTermForecast,
    runAggregationJob,
    listMaterializedHistory,
    updateConfiguration,
    getConfiguration: () => structuredClone(currentConfig),
    isNeighborhoodProfileCached: (cityId: string, hoodId: number, isPublic = true) =>
      profileCache.has(`${cityId}:${hoodId}:${isPublic ? 'pub' : 'adm'}`),
  };
}

export type MarketIntelligenceService = ReturnType<typeof createMarketIntelligenceService>;
