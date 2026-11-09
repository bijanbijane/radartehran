import crypto from 'crypto';
import { CoreApiError, runDurableTransaction } from '../core';
import type {
  CurrencyUnit,
  EvidenceReviewDecisionInput,
  MarketEvidenceRecord,
  MarketEvidenceSourceType,
  NeighborhoodBaselineRecord,
  NeighborhoodMarketIntelligenceIndicators,
  PropertyCategory,
  PropertyValuationInput,
  PropertyValuationResult,
  RecalculationJobRecord,
  ValuationModelConfiguration,
  ValuationModuleDependencies,
  ValuationSnapshotRecord,
  ValuationTransactionType,
} from './types';
import {
  computeReproducibleInputHash,
  validateEvidenceReviewInput,
  validateValuationInput,
} from './validation';
import {
  buildMarketEvidenceRecord,
  computeMedian,
  computeNeighborhoodBaselineFromEvidence,
  computePercentile,
  createDefaultModelConfiguration,
  selectAndScoreComparables,
} from './evidenceAndComparableEngine';
import { computeHedonicValuationCore } from './hedonicPricingAndExplainEngine';

export function createValuationService(deps: ValuationModuleDependencies) {
  const snapshotsCollection = deps.snapshotsCollection ?? 'valuationSnapshots';
  const nowFn = deps.now ?? (() => new Date());

  // In-memory state synced with durable txRunner when provided
  const evidenceStore = new Map<string, MarketEvidenceRecord>();
  const baselineCache = new Map<string, NeighborhoodBaselineRecord>();
  const snapshotStore = new Map<string, ValuationSnapshotRecord>();
  const configHistory: ValuationModelConfiguration[] = [
    createDefaultModelConfiguration(nowFn().toISOString()),
  ];
  const recalculationJobs = new Map<string, RecalculationJobRecord>();
  const activeNeighborhoodRecalcLocks = new Set<string>();

  function getActiveConfig(modelVersionOverride?: string): ValuationModelConfiguration {
    if (modelVersionOverride) {
      const match = [...configHistory]
        .reverse()
        .find((c) => c.modelVersion === modelVersionOverride || c.id === modelVersionOverride);
      if (match) return structuredClone(match);
    }
    const active = configHistory.find((c) => c.status === 'ACTIVE') ?? configHistory[configHistory.length - 1];
    return structuredClone(active);
  }

  function invalidateNeighborhoodCache(params: { cityId: string; hoodId?: number }) {
    for (const [key, val] of baselineCache.entries()) {
      if (val.cityId === params.cityId && (params.hoodId === undefined || val.hoodId === params.hoodId)) {
        baselineCache.delete(key);
      }
    }
  }

  async function ingestMarketEvidence(params: {
    sourceType: MarketEvidenceSourceType;
    sourceRecordId: string;
    cityId: string;
    districtId?: string;
    hoodId: number;
    subNeighborhoodId?: string;
    propertyCategory: PropertyCategory;
    transactionType: ValuationTransactionType;
    sqm: number;
    landAreaSqm?: number;
    buildYear?: number;
    floor?: number;
    bedrooms?: number;
    hasElevator?: boolean;
    hasParking?: boolean;
    hasStorage?: boolean;
    renovationCondition?: MarketEvidenceRecord['renovationCondition'];
    coordinates?: { lat: number; lng: number };
    rawCurrencyUnit?: CurrencyUnit;
    rawTotalAmount: number;
    rawMonthlyRentAmount?: number;
    privateParticipantRef?: string;
    confidentialNotes?: string;
    observedAtIso?: string;
  }): Promise<MarketEvidenceRecord> {
    if (!params.sourceRecordId || !params.cityId || params.sqm <= 0 || params.rawTotalAmount <= 0) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid market evidence input parameters.');
    }
    const nowIso = nowFn().toISOString();
    const config = getActiveConfig();
    const record = buildMarketEvidenceRecord({
      ...params,
      existingEvidence: Array.from(evidenceStore.values()),
      config,
      nowIso,
    });
    evidenceStore.set(record.id, record);
    invalidateNeighborhoodCache({ cityId: record.cityId, hoodId: record.hoodId });
    return structuredClone(record);
  }

  async function reviewMarketEvidence(params: {
    actorUid: string;
    decision: EvidenceReviewDecisionInput;
  }): Promise<MarketEvidenceRecord> {
    const val = validateEvidenceReviewInput(params.decision);
    if (!val.ok || !val.value) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid evidence review input.', val.issues);
    }
    const d = val.value;
    const existing = evidenceStore.get(d.evidenceId);
    if (!existing) {
      throw new CoreApiError('NOT_FOUND', 404, `Market evidence '${d.evidenceId}' not found.`);
    }

    const nowIso = nowFn().toISOString();
    const updated: MarketEvidenceRecord = structuredClone(existing);
    updated.reviewedByUid = params.actorUid;
    updated.reviewedAtIso = nowIso;
    updated.reviewReason = d.reason;

    if (d.action === 'APPROVE') {
      updated.verificationStatus = 'VERIFIED';
      updated.outlierFlag = false;
    } else if (d.action === 'REJECT') {
      updated.verificationStatus = 'REJECTED';
    } else if (d.action === 'RESTORE') {
      updated.verificationStatus = 'RESTORED';
      updated.outlierFlag = false;
    } else if (d.action === 'CORRECT' && d.correctedTotalMillion !== undefined) {
      const prevTotal = updated.normalizedTotalMillion;
      if (d.correctedSqm && d.correctedSqm > 0) {
        updated.sqm = d.correctedSqm;
      }
      updated.normalizedTotalMillion = Number(d.correctedTotalMillion.toFixed(2));
      updated.normalizedPricePerSqmMillion = Number((updated.normalizedTotalMillion / Math.max(1, updated.sqm)).toFixed(3));
      updated.verificationStatus = 'CORRECTED';
      updated.outlierFlag = false;
      updated.correctionHistory = [
        ...(updated.correctionHistory ?? []),
        {
          correctedByUid: params.actorUid,
          correctedAtIso: nowIso,
          reason: d.reason,
          previousTotalMillion: prevTotal,
          newTotalMillion: updated.normalizedTotalMillion,
        },
      ];
    }

    evidenceStore.set(updated.id, updated);
    invalidateNeighborhoodCache({ cityId: updated.cityId, hoodId: updated.hoodId });
    return structuredClone(updated);
  }

  function listMarketEvidence(params: {
    cityId?: string;
    hoodId?: number;
    propertyCategory?: PropertyCategory;
    includePrivateFields?: boolean;
  }): MarketEvidenceRecord[] {
    const all = Array.from(evidenceStore.values()).filter((e) => {
      if (params.cityId && e.cityId !== params.cityId) return false;
      if (params.hoodId !== undefined && e.hoodId !== params.hoodId) return false;
      if (params.propertyCategory && e.propertyCategory !== params.propertyCategory) return false;
      return true;
    });
    return all.map((e) => {
      const copy = structuredClone(e);
      if (!params.includePrivateFields) {
        delete copy.privateParticipantRef;
        delete copy.confidentialNotes;
      }
      return copy;
    });
  }

  async function computeNeighborhoodBaseline(params: {
    cityId: string;
    districtId?: string;
    hoodId: number;
    subNeighborhoodId?: string;
    propertyCategory?: PropertyCategory;
    transactionType?: ValuationTransactionType;
  }): Promise<NeighborhoodBaselineRecord> {
    const propertyCategory = params.propertyCategory ?? 'residential';
    const transactionType = params.transactionType ?? 'sale';
    const cacheKey = `${params.cityId}:${params.hoodId}:${params.subNeighborhoodId ?? ''}:${propertyCategory}:${transactionType}`;
    const cached = baselineCache.get(cacheKey);
    if (cached) return structuredClone(cached);

    const benchmark = await deps.dataConsumer.getNeighborhoodBenchmark({
      cityId: params.cityId,
      hoodId: params.hoodId,
    });
    const config = getActiveConfig();
    const baseline = computeNeighborhoodBaselineFromEvidence({
      cityId: params.cityId,
      districtId: params.districtId,
      hoodId: params.hoodId,
      subNeighborhoodId: params.subNeighborhoodId,
      hoodName: benchmark?.hoodName ?? `Hood #${params.hoodId}`,
      propertyCategory,
      transactionType,
      evidenceRecords: Array.from(evidenceStore.values()),
      benchmarkFallbackPerSqmMillion: benchmark?.basePricePerSqmMillion,
      config,
      nowIso: nowFn().toISOString(),
    });
    baselineCache.set(cacheKey, baseline);
    return structuredClone(baseline);
  }

  async function estimatePropertyValue(
    rawInput: unknown,
    options?: { includeDiagnostics?: boolean },
  ): Promise<PropertyValuationResult> {
    const validated = validateValuationInput(rawInput);
    if (!validated.ok || !validated.value) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid property valuation input.', validated.issues);
    }

    const input = validated.value;
    const config = getActiveConfig(input.modelVersionOverride);
    const nowIso = nowFn().toISOString();
    const valuationDateIso = input.valuationDateIso ?? nowIso;

    const benchmark = await deps.dataConsumer.getNeighborhoodBenchmark({
      cityId: input.cityId,
      hoodId: input.hoodId,
    });

    const txType = input.transactionType ?? 'sale';
    const ingestedEvidence = Array.from(evidenceStore.values()).filter(
      (e) =>
        e.cityId === input.cityId &&
        e.propertyCategory === input.propertyCategory &&
        e.transactionType === txType,
    );

    if (!benchmark && ingestedEvidence.length === 0) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        `Neighborhood benchmark not found for city '${input.cityId}' hood #${input.hoodId}.`,
      );
    }

    let geographicFallbackLevel: 'sub_neighborhood' | 'neighborhood' | 'district' | 'city' = 'neighborhood';
    let basePsm =
      input.propertyCategory === 'land'
        ? (benchmark?.baseLandPricePerSqmMillion ?? benchmark?.basePricePerSqmMillion ?? 0)
        : (benchmark?.basePricePerSqmMillion ?? 0);
    const baseRahn80m = benchmark?.baseRahn80mMillion ?? (basePsm > 0 ? basePsm * 10 : 1200);

    if (ingestedEvidence.length > 0 && !benchmark) {
      const baseline = computeNeighborhoodBaselineFromEvidence({
        cityId: input.cityId,
        districtId: input.districtId,
        hoodId: input.hoodId,
        subNeighborhoodId: input.subNeighborhoodId,
        hoodName: input.hoodName ?? `Hood #${input.hoodId}`,
        propertyCategory: input.propertyCategory,
        transactionType: txType,
        evidenceRecords: Array.from(evidenceStore.values()),
        config,
        nowIso,
      });
      geographicFallbackLevel = baseline.geographicLevel;
      if (baseline.weightedPricePerSqmMillion > 0) {
        // Divide by category multiplier since computeHedonicValuationCore applies categoryMultiplier
        const catMult = config.categoryMultipliers[input.propertyCategory] ?? 1.0;
        basePsm = Number((baseline.weightedPricePerSqmMillion / catMult).toFixed(2));
      }
    } else if (input.subNeighborhoodId) {
      const subHits = ingestedEvidence.filter((e) => e.subNeighborhoodId === input.subNeighborhoodId && e.hoodId === input.hoodId && !e.outlierFlag && e.verificationStatus !== 'REJECTED');
      if (subHits.length >= config.minComparableSampleCount) {
        geographicFallbackLevel = 'sub_neighborhood';
      }
    }

    const consumerComps = await deps.dataConsumer.queryComparableListings({
      cityId: input.cityId,
      hoodId: input.hoodId,
      propertyCategory: input.propertyCategory,
      transactionType: txType,
      sqm: input.sqm,
      limit: 25,
    });

    const ingestedComps = ingestedEvidence
      .filter((e) => e.hoodId === input.hoodId)
      .map((e) => ({
        id: e.id,
        sqm: e.sqm,
        priceNumericMillion: e.normalizedTotalMillion,
        buildYear: e.buildYear,
        hoodId: e.hoodId,
        coordinates: e.coordinates,
        sourceType: e.sourceType,
        observedAtIso: e.observedAtIso,
        isVerifiedTransaction: e.isCompletedTransaction,
        outlierFlag: e.outlierFlag,
        duplicateOfEvidenceId: e.duplicateOfEvidenceId,
        verificationStatus: e.verificationStatus,
      }));

    const combinedRawComps = [...consumerComps, ...ingestedComps];

    const { comparables, includedComparables, outlierExcludedIds, duplicateExcludedIds } =
      selectAndScoreComparables({
        input,
        rawCandidates: combinedRawComps,
        baselinePerSqmMillion: basePsm * (config.categoryMultipliers[input.propertyCategory] ?? 1.0),
        config,
        valuationDateIso,
      });

    return computeHedonicValuationCore({
      input,
      hoodName: input.hoodName ?? benchmark?.hoodName ?? `Hood #${input.hoodId}`,
      basePricePerSqmMillion: basePsm,
      baseRahn80mMillion: baseRahn80m,
      geographicFallbackLevel,
      comparables,
      includedComparables,
      outlierExcludedIds,
      duplicateExcludedIds,
      config,
      nowIso,
      includeDiagnostics: options?.includeDiagnostics,
    });
  }

  async function getNeighborhoodMarketIndicators(params: {
    cityId: string;
    hoodId: number;
    propertyCategory?: PropertyCategory;
  }): Promise<NeighborhoodMarketIntelligenceIndicators> {
    const benchmark = await deps.dataConsumer.getNeighborhoodBenchmark({
      cityId: params.cityId,
      hoodId: params.hoodId,
    });
    if (!benchmark) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        `Neighborhood benchmark not found for city '${params.cityId}' hood #${params.hoodId}.`,
      );
    }

    const rawComps = await deps.dataConsumer.queryComparableListings({
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory ?? 'residential',
      transactionType: 'sale',
      sqm: 100,
      limit: 50,
    });

    const psmList: number[] = [];
    let outlierExcludedCount = 0;

    for (const c of rawComps) {
      if (c.sqm <= 0 || c.priceNumericMillion <= 0) continue;
      const psm = c.priceNumericMillion / c.sqm;
      if (Math.abs(psm - benchmark.basePricePerSqmMillion) / benchmark.basePricePerSqmMillion > 0.45) {
        outlierExcludedCount++;
      } else {
        psmList.push(psm);
      }
    }

    const medianPsm = psmList.length > 0 ? computeMedian(psmList) : benchmark.basePricePerSqmMillion;
    const avgPsm =
      psmList.length > 0
        ? psmList.reduce((acc, v) => acc + v, 0) / psmList.length
        : benchmark.basePricePerSqmMillion;
    const p25 = psmList.length > 0 ? computePercentile(psmList, 0.25) : benchmark.basePricePerSqmMillion * 0.92;
    const p75 = psmList.length > 0 ? computePercentile(psmList, 0.75) : benchmark.basePricePerSqmMillion * 1.08;

    const sampleSufficiency =
      psmList.length >= 10 ? 'sufficient' : psmList.length >= 3 ? 'limited' : 'insufficient';

    return {
      cityId: params.cityId,
      hoodId: params.hoodId,
      hoodName: benchmark.hoodName,
      zone: benchmark.zone,
      medianAskingPricePerSqmMillion: Number(medianPsm.toFixed(2)),
      averageAskingPricePerSqmMillion: Number(avgPsm.toFixed(2)),
      p25PricePerSqmMillion: Number(p25.toFixed(2)),
      p75PricePerSqmMillion: Number(p75.toFixed(2)),
      activeListingCount: psmList.length,
      outlierExcludedCount,
      priceChange30dPct: 2.4,
      marketHeatStatus: psmList.length >= 15 ? 'hot' : 'balanced',
      sampleSufficiency,
      freshnessTimestampIso: benchmark.lastUpdatedIso,
    };
  }

  async function persistValuationSnapshot(params: {
    input: PropertyValuationInput;
    result: PropertyValuationResult;
    ownerUid?: string;
    evidenceIdsUsed?: string[];
  }): Promise<ValuationSnapshotRecord | null> {
    const record: ValuationSnapshotRecord = {
      id: params.result.id,
      ownerUid: params.ownerUid,
      input: structuredClone(params.input),
      result: structuredClone(params.result),
      reproducibleHash: computeReproducibleInputHash(params.input),
      modelVersion: params.result.modelVersion,
      configVersion: params.result.configVersion,
      evidenceIdsUsed: params.evidenceIdsUsed ?? params.result.comparables.filter((c) => c.included).map((c) => c.listingId),
      createdAtIso: nowFn().toISOString(),
    };
    snapshotStore.set(record.id, record);

    if (!deps.txRunner) return structuredClone(record);

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'valuation.persistSnapshot' },
      async (tx) => {
        tx.set(
          `${snapshotsCollection}/${record.id}`,
          record as unknown as Record<string, unknown>,
          { merge: true },
        );
      },
    );
    return structuredClone(record);
  }

  async function getValuationSnapshot(snapshotId: string): Promise<ValuationSnapshotRecord> {
    const inMem = snapshotStore.get(snapshotId);
    if (inMem) return structuredClone(inMem);
    if (deps.txRunner) {
      const fromDb = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'valuation.getSnapshot' },
        async (tx) => {
          const snap = await tx.get<ValuationSnapshotRecord>(`${snapshotsCollection}/${snapshotId}`);
          return snap.exists && snap.data ? snap.data : null;
        },
      );
      if (fromDb) return structuredClone(fromDb);
    }
    throw new CoreApiError('NOT_FOUND', 404, `Valuation snapshot '${snapshotId}' not found.`);
  }

  async function reproduceHistoricalValuation(snapshotId: string): Promise<{
    originalSnapshot: ValuationSnapshotRecord;
    reproducedResult: PropertyValuationResult;
    isDeterministicMatch: boolean;
  }> {
    const snap = await getValuationSnapshot(snapshotId);
    const reproduced = await estimatePropertyValue({
      ...snap.input,
      modelVersionOverride: snap.modelVersion,
      valuationDateIso: snap.result.valuationDateIso,
    });
    const isDeterministicMatch =
      Math.abs(reproduced.estimatedTotalMillion - snap.result.estimatedTotalMillion) < 0.01 &&
      computeReproducibleInputHash(snap.input) === snap.reproducibleHash;
    return {
      originalSnapshot: snap,
      reproducedResult: reproduced,
      isDeterministicMatch,
    };
  }

  async function upsertModelConfiguration(params: {
    actorUid: string;
    modelVersion: string;
    changeReason: string;
    updates: Partial<
      Pick<
        ValuationModelConfiguration,
        | 'categoryMultipliers'
        | 'renovationWeightsPct'
        | 'elevatorWeightPct'
        | 'parkingWeightPct'
        | 'storageWeightPct'
        | 'maxSingleFactorContributionPct'
        | 'maxTotalAdjustmentPct'
        | 'monthlyInflationTrendPct'
        | 'rahnToRentMonthlyRatePct'
        | 'furnishedRentalPremiumPct'
      >
    >;
  }): Promise<ValuationModelConfiguration> {
    if (!params.modelVersion || params.changeReason.trim().length < 3) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'modelVersion and changeReason are required.');
    }
    if (
      params.updates.maxSingleFactorContributionPct !== undefined &&
      (params.updates.maxSingleFactorContributionPct <= 0 || params.updates.maxSingleFactorContributionPct > 80)
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'maxSingleFactorContributionPct must be between 1 and 80.');
    }
    if (
      params.updates.rahnToRentMonthlyRatePct !== undefined &&
      (params.updates.rahnToRentMonthlyRatePct <= 0 || params.updates.rahnToRentMonthlyRatePct > 10)
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'rahnToRentMonthlyRatePct must be between 0.1 and 10.');
    }

    const currentActive = getActiveConfig();
    for (const c of configHistory) {
      if (c.status === 'ACTIVE') c.status = 'SUPERSEDED';
    }

    const nextConfig: ValuationModelConfiguration = {
      ...currentActive,
      ...params.updates,
      categoryMultipliers: {
        ...currentActive.categoryMultipliers,
        ...(params.updates.categoryMultipliers ?? {}),
      },
      renovationWeightsPct: {
        ...currentActive.renovationWeightsPct,
        ...(params.updates.renovationWeightsPct ?? {}),
      },
      id: `val_cfg_${crypto.randomBytes(4).toString('hex')}`,
      modelVersion: params.modelVersion.trim(),
      configVersion: currentActive.configVersion + 1,
      status: 'ACTIVE',
      createdByUid: params.actorUid,
      createdAtIso: nowFn().toISOString(),
      changeReason: params.changeReason.trim(),
      previousConfigId: currentActive.id,
    };

    configHistory.push(nextConfig);
    return structuredClone(nextConfig);
  }

  async function rollbackModelConfiguration(params: {
    actorUid: string;
    targetConfigId?: string;
    reason: string;
  }): Promise<ValuationModelConfiguration> {
    if (configHistory.length < 2) {
      throw new CoreApiError('CONFLICT', 409, 'No previous model configuration available to roll back to.');
    }
    const currentIdx = configHistory.findIndex((c) => c.status === 'ACTIVE');
    const current = currentIdx >= 0 ? configHistory[currentIdx] : configHistory[configHistory.length - 1];
    const target = params.targetConfigId
      ? configHistory.find((c) => c.id === params.targetConfigId)
      : configHistory.find((c) => c.id === current.previousConfigId) ?? configHistory[configHistory.length - 2];

    if (!target) {
      throw new CoreApiError('NOT_FOUND', 404, 'Target model configuration for rollback was not found.');
    }

    current.status = 'ROLLED_BACK';
    const restored: ValuationModelConfiguration = {
      ...structuredClone(target),
      id: `val_cfg_rb_${crypto.randomBytes(4).toString('hex')}`,
      configVersion: current.configVersion + 1,
      status: 'ACTIVE',
      createdByUid: params.actorUid,
      createdAtIso: nowFn().toISOString(),
      changeReason: `Rollback to ${target.modelVersion}: ${params.reason}`,
      previousConfigId: current.id,
    };
    configHistory.push(restored);
    return structuredClone(restored);
  }

  function listModelConfigurations(): ValuationModelConfiguration[] {
    return structuredClone(configHistory);
  }

  async function runRecalculationJob(params: {
    actorUid: string;
    idempotencyKey: string;
    cityId: string;
    hoodId?: number;
    propertyCategory?: PropertyCategory;
    reason: string;
  }): Promise<RecalculationJobRecord> {
    // Idempotency check
    for (const existing of recalculationJobs.values()) {
      if (existing.idempotencyKey === params.idempotencyKey) {
        return structuredClone(existing);
      }
    }

    const lockKey = `${params.cityId}:${params.hoodId ?? 'all'}`;
    if (activeNeighborhoodRecalcLocks.has(lockKey)) {
      throw new CoreApiError('CONFLICT', 409, `Concurrent recalculation already in progress for ${lockKey}.`);
    }

    activeNeighborhoodRecalcLocks.add(lockKey);
    const nowIso = nowFn().toISOString();
    const job: RecalculationJobRecord = {
      id: `recalc_${crypto.randomBytes(6).toString('hex')}`,
      idempotencyKey: params.idempotencyKey,
      cityId: params.cityId,
      hoodId: params.hoodId,
      propertyCategory: params.propertyCategory,
      reason: params.reason,
      status: 'RUNNING',
      recalculatedSnapshotsCount: 0,
      recalculatedBaselinesCount: 0,
      requestedByUid: params.actorUid,
      createdAtIso: nowIso,
    };
    recalculationJobs.set(job.id, job);

    try {
      invalidateNeighborhoodCache({ cityId: params.cityId, hoodId: params.hoodId });
      if (params.hoodId !== undefined) {
        await computeNeighborhoodBaseline({
          cityId: params.cityId,
          hoodId: params.hoodId,
          propertyCategory: params.propertyCategory ?? 'residential',
        });
        job.recalculatedBaselinesCount = 1;
      }

      // Note: Historical snapshots are preserved immutably; we count matching snapshots without overwriting them
      let matchingSnapshots = 0;
      for (const snap of snapshotStore.values()) {
        if (
          snap.input.cityId === params.cityId &&
          (params.hoodId === undefined || snap.input.hoodId === params.hoodId)
        ) {
          matchingSnapshots++;
        }
      }
      job.recalculatedSnapshotsCount = matchingSnapshots;
      job.status = 'COMPLETED';
      job.completedAtIso = nowFn().toISOString();
      recalculationJobs.set(job.id, job);
      return structuredClone(job);
    } finally {
      activeNeighborhoodRecalcLocks.delete(lockKey);
    }
  }

  return {
    estimatePropertyValue,
    getNeighborhoodMarketIndicators,
    persistValuationSnapshot,
    getValuationSnapshot,
    reproduceHistoricalValuation,
    ingestMarketEvidence,
    reviewMarketEvidence,
    listMarketEvidence,
    computeNeighborhoodBaseline,
    invalidateNeighborhoodCache,
    getActiveModelConfiguration: () => getActiveConfig(),
    upsertModelConfiguration,
    rollbackModelConfiguration,
    listModelConfigurations,
    runRecalculationJob,
  };
}

export type ValuationService = ReturnType<typeof createValuationService>;
