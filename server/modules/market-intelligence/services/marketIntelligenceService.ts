import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  computeRequestPayloadHash,
  createFirestoreIdempotencyStoreAdapter,
  decodePaginationCursor,
  encodePaginationCursor,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  normalizePaginationParams,
  requireSafeFirestoreId,
  runDurableTransaction,
  sanitizeTextInput,
  type AuthenticatedPrincipal,
  type NormalizedTimestamp,
  type PaginationParams,
  type TransactionContextLike,
} from '../../core';
import type {
  CanonicalMarketGeographicEntity,
  MarketGeographicLookup,
  MarketIntelligenceModuleDependencies,
} from '../contracts/externalAdapters';
import type {
  ForecastModelIdentifier,
  HypotheticalScenarioResultRecord,
  ImmutableMarketSnapshotRecord,
  MarketCalculationJobRecord,
  MarketForecastRecord,
  MarketPriceOrRentIndexRecord,
  MarketSegmentDefinitionRecord,
} from '../domain/types';
import {
  CANONICAL_MARKET_SEGMENTS,
  CURRENT_MARKET_METHODOLOGY_VERSION,
  evaluateHousingDemand,
  evaluateHousingSupply,
  evaluateMarketLiquidityAndAbsorption,
  evaluateRentalMarket,
  evaluateSaleMarket,
  matchesMarketSegment,
  resolveSegmentDefinition,
} from '../segmentation/segmentationAndSupplyDemandEngine';
import {
  compareMarketSnapshots,
  computeStratifiedMarketIndex,
  extractPerSqmObservationsFromListings,
  extractPerSqmObservationsFromTransactions,
  type GeographicMarketComparisonReport,
} from '../price-indices/indicesAndComparisonsEngine';
import {
  evaluateHypotheticalMarketScenario,
  generateChronologicalMarketForecast,
  type ChronologicalTimeSeriesPoint,
} from '../forecasting/forecastingAndScenarioEngine';

async function appendToIndex(
  tx: TransactionContextLike,
  indexPath: string,
  id: string,
): Promise<void> {
  const snap = await tx.get<{ ids?: string[] }>(indexPath);
  const existing = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  if (!existing.includes(id)) {
    tx.set(indexPath, { ids: [id, ...existing] });
  }
}

async function loadIndexedDocs<T>(
  tx: TransactionContextLike,
  indexPath: string,
  collectionPrefix: string,
): Promise<T[]> {
  const snap = await tx.get<{ ids?: string[] }>(indexPath);
  const ids = snap.exists && Array.isArray(snap.data?.ids) ? snap.data!.ids : [];
  const out: T[] = [];
  for (const id of ids) {
    const docSnap = await tx.get<T>(`${collectionPrefix}/${id}`);
    if (docSnap.exists && docSnap.data) out.push(docSnap.data);
  }
  return out;
}

function paginateItems<T extends { id: string; sortEpochMs: number }>(
  items: T[],
  pagination: PaginationParams,
): { items: T[]; hasMore: boolean; nextCursor: string | null; totalCount: number } {
  const sorted = [...items].sort((a, b) => {
    const diff =
      pagination.direction === 'asc'
        ? a.sortEpochMs - b.sortEpochMs
        : b.sortEpochMs - a.sortEpochMs;
    if (diff !== 0) return diff;
    return pagination.direction === 'asc'
      ? a.id.localeCompare(b.id)
      : b.id.localeCompare(a.id);
  });

  let filtered = sorted;
  if (pagination.cursor) {
    const decoded = decodePaginationCursor(pagination.cursor);
    if (!decoded) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid pagination cursor token.');
    }
    const cursorEpoch = Number(decoded.sortValue);
    filtered = sorted.filter((item) =>
      pagination.direction === 'asc'
        ? item.sortEpochMs > cursorEpoch ||
          (item.sortEpochMs === cursorEpoch && item.id > decoded.docId)
        : item.sortEpochMs < cursorEpoch ||
          (item.sortEpochMs === cursorEpoch && item.id < decoded.docId),
    );
  }

  const slice = filtered.slice(0, pagination.limit);
  const hasMore = filtered.length > pagination.limit;
  const lastItem = slice[slice.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodePaginationCursor({
          sortValue: lastItem.sortEpochMs,
          docId: lastItem.id,
          direction: pagination.direction,
        })
      : null;

  return { items: slice, hasMore, nextCursor, totalCount: sorted.length };
}

function requireValidId(raw: unknown, fieldName: string): string {
  const res = requireSafeFirestoreId()(raw, fieldName);
  if (!res.ok || !res.value) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Invalid Firestore ID for "${fieldName}".`,
      res.issues,
    );
  }
  return res.value;
}

export function createMarketIntelligenceService(deps: MarketIntelligenceModuleDependencies) {
  const nowEpochMs = () => (deps.nowFn ? deps.nowFn() : Date.now());
  const nowTs = (): NormalizedTimestamp => normalizeFirestoreTimestamp(nowEpochMs())!;

  const retrySafeTxRunner = {
    runTransaction: <T>(workFn: (tx: TransactionContextLike) => Promise<T>) =>
      runDurableTransaction(
        deps.txRunner,
        {
          operationName: 'market_intelligence_idempotency_tx',
          maxAttempts: 4,
          baseBackoffMs: 5,
        },
        workFn,
      ),
  };

  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(retrySafeTxRunner);

  async function resolveCanonicalGeographyOrThrow(
    lookup: MarketGeographicLookup,
  ): Promise<CanonicalMarketGeographicEntity> {
    const res = await deps.geography.resolveMarketGeography(lookup);
    if (res.ambiguous) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Geographic lookup is ambiguous across multiple cities or districts; specify geographicEntityId or cityId explicitly.',
        { candidateEntityIds: res.candidateEntityIds },
      );
    }
    if (!res.resolved || !res.entity) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        'Canonical market geographic entity could not be resolved.',
      );
    }
    return res.entity;
  }

  async function requireAdminOrAnalyst(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<AuthenticatedPrincipal> {
    const decision = await authorizePrincipal(
      principal,
      { minimumRole: 'delegated_admin' },
      deps.adminStore,
      deps.primaryAdminEmails ?? ['admin@radartehran.ir'],
    );
    if (!decision.allowed || !principal) {
      throw new CoreApiError(
        decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        decision.status === 401 ? 401 : 403,
        decision.reason ?? 'Admin or delegated market-intelligence analyst authority required.',
      );
    }
    return principal;
  }

  async function getLatestSnapshotForGeoAndSegment(params: {
    geographicEntityId: string;
    segmentId: string;
    reportingPeriodKey?: string;
  }): Promise<ImmutableMarketSnapshotRecord> {
    const geoId = requireValidId(params.geographicEntityId, 'geographicEntityId');
    const segId = requireValidId(params.segmentId, 'segmentId');

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_get_latest_snapshot', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snapshots = await loadIndexedDocs<ImmutableMarketSnapshotRecord>(
          tx,
          `market_intelligence_geo_index/${geoId}__${segId}`,
          'market_intelligence_snapshots',
        );
        const filtered = params.reportingPeriodKey
          ? snapshots.filter((s) => s.reportingPeriodKey === params.reportingPeriodKey)
          : snapshots;
        if (filtered.length === 0) {
          throw new CoreApiError(
            'NOT_FOUND',
            404,
            `No market snapshot found for geographicEntityId="${geoId}" and segmentId="${segId}".`,
          );
        }
        filtered.sort((a, b) => {
          const periodCmp = b.reportingPeriodKey.localeCompare(a.reportingPeriodKey);
          if (periodCmp !== 0) return periodCmp;
          return b.generatedAt.epochMs - a.generatedAt.epochMs;
        });
        return filtered[0]!;
      },
    );
  }

  /**
   * 1. Generate or recalculate a market snapshot (Idempotent, atomic, prevents partial snapshots on failure)
   */
  async function generateOrRecalculateMarketSnapshot(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    idempotencyKey: string;
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey: string;
    observationWindowStartIso: string;
    observationWindowEndIso: string;
    equivalentRentAnnualRatePct?: number;
    simulateStageFailureForTesting?: 'AFTER_SUPPLY' | 'AFTER_DEMAND' | 'AFTER_SALE_RENTAL';
  }): Promise<{
    job: MarketCalculationJobRecord;
    snapshot: ImmutableMarketSnapshotRecord;
    reusedExistingImmutableSnapshot: boolean;
  }> {
    const actor = await requireAdminOrAnalyst(params.principal);
    const segment = resolveSegmentDefinition(params.segmentId);
    const reportingPeriodKey = sanitizeTextInput(params.reportingPeriodKey).slice(0, 32);

    const outcome = await executeIdempotentMutation<{
      job: MarketCalculationJobRecord;
      snapshot: ImmutableMarketSnapshotRecord;
      reusedExistingImmutableSnapshot: boolean;
    }>({
      store: idempotencyStore,
      idempotencyKey: params.idempotencyKey,
      operation: 'market-intelligence:generate-snapshot',
      actorUid: actor.uid,
      requestPayload: {
        geographyLookup: params.geographyLookup,
        segmentId: segment.segmentId,
        reportingPeriodKey,
        observationWindowStartIso: params.observationWindowStartIso,
        observationWindowEndIso: params.observationWindowEndIso,
        equivalentRentAnnualRatePct: params.equivalentRentAnnualRatePct ?? null,
      },
      nowEpochMs: nowEpochMs(),
      mutationFn: async () => {
        const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);

        const [rawListingsAll, rawTransactionsAll, rawDemandSignalsAll] = await Promise.all([
          deps.listingSupply
            ? deps.listingSupply.listListingObservations({
                geographicEntityId: entity.geographicEntityId,
                reportingPeriodKey,
                marketType: segment.marketType,
              })
            : Promise.resolve([]),
          deps.transactions
            ? deps.transactions.listTransactionObservations({
                geographicEntityId: entity.geographicEntityId,
                reportingPeriodKey,
                marketType: segment.marketType,
              })
            : Promise.resolve([]),
          deps.demandSignals
            ? deps.demandSignals.listDemandSignals({
                geographicEntityId: entity.geographicEntityId,
                reportingPeriodKey,
                marketType: segment.marketType,
              })
            : Promise.resolve([]),
        ]);

        const matchingListings = rawListingsAll.filter((l) => matchesMarketSegment(l, segment));
        const matchingTransactions = rawTransactionsAll.filter((t) =>
          matchesMarketSegment(t, segment),
        );
        const matchingSignals = rawDemandSignalsAll.filter(
          (d) =>
            d.marketType === segment.marketType &&
            d.propertyUse === segment.propertyUse &&
            (segment.propertyForm === 'ALL_FORMS' || d.propertyForm === segment.propertyForm),
        );

        const inputSnapshotHash = computeRequestPayloadHash({
          geographicEntityId: entity.geographicEntityId,
          boundaryVersion: entity.boundaryVersion,
          segmentId: segment.segmentId,
          segmentVersion: segment.version,
          reportingPeriodKey,
          methodologyVersion: CURRENT_MARKET_METHODOLOGY_VERSION,
          listings: matchingListings.map((l) => ({
            id: l.listingId,
            prop: l.canonicalPropertyRefId,
            state: l.lifecycleState,
            ask: l.currentSaleAskingTotal ?? l.monthlyAskingRent ?? 0,
            dep: l.askingSecurityDeposit ?? 0,
          })),
          transactions: matchingTransactions.map((t) => ({
            id: t.transactionId,
            cls: t.verificationClassification,
            price: t.confirmedTransactionPriceTotal ?? t.agreedPriceTotal ?? 0,
            rent: t.confirmedMonthlyRent ?? 0,
          })),
          signalsCount: matchingSignals.length,
        });

        const deterministicSnapshotId = `mktsnap_${entity.geographicEntityId}_${segment.segmentId}_${reportingPeriodKey}_${inputSnapshotHash.slice(0, 12)}`;

        // Stage 1: Housing Supply
        const { supply, deduplicatedListings } = evaluateHousingSupply({
          rawListings: matchingListings,
          windowStartIso: params.observationWindowStartIso,
          windowEndIso: params.observationWindowEndIso,
        });

        if (params.simulateStageFailureForTesting === 'AFTER_SUPPLY') {
          throw new CoreApiError(
            'INTERNAL_ERROR',
            500,
            'SIMULATED_PARTIAL_CALCULATION_FAILURE: Aborted after supply stage; partial snapshot must never be persisted.',
          );
        }

        // Stage 2: Housing Demand
        const demand = evaluateHousingDemand({
          signals: matchingSignals,
        });

        if (params.simulateStageFailureForTesting === 'AFTER_DEMAND') {
          throw new CoreApiError(
            'INTERNAL_ERROR',
            500,
            'SIMULATED_PARTIAL_CALCULATION_FAILURE: Aborted after demand stage; partial snapshot must never be persisted.',
          );
        }

        // Stage 3: Sale / Rental Market Indicators
        const saleMarket =
          segment.marketType === 'SALE'
            ? evaluateSaleMarket({
                deduplicatedListings,
                transactions: matchingTransactions,
                minSampleThreshold: segment.minimumSampleSizeThreshold,
              })
            : undefined;

        const rentalMarket =
          segment.marketType === 'RENTAL'
            ? evaluateRentalMarket({
                deduplicatedListings,
                transactions: matchingTransactions,
                windowStartIso: params.observationWindowStartIso,
                windowEndIso: params.observationWindowEndIso,
                minSampleThreshold: segment.minimumSampleSizeThreshold,
                equivalentRentAnnualRatePct: params.equivalentRentAnnualRatePct,
              })
            : undefined;

        if (params.simulateStageFailureForTesting === 'AFTER_SALE_RENTAL') {
          throw new CoreApiError(
            'INTERNAL_ERROR',
            500,
            'SIMULATED_PARTIAL_CALCULATION_FAILURE: Aborted after sale/rental stage; partial snapshot must never be persisted.',
          );
        }

        // Stage 4: Liquidity & Supply Absorption
        const { liquidity, absorption } = evaluateMarketLiquidityAndAbsorption({
          marketType: segment.marketType,
          deduplicatedListings,
          transactions: matchingTransactions,
          timeWindowKey: reportingPeriodKey,
          windowStartIso: params.observationWindowStartIso,
          windowEndIso: params.observationWindowEndIso,
        });

        const totalSample =
          deduplicatedListings.length +
          matchingTransactions.filter(
            (t) => t.verificationClassification === 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
          ).length;

        const sourceDatasetIds = Array.from(
          new Set([
            ...matchingListings.map((l) => l.sourceDatasetId),
            ...matchingTransactions.map((t) => t.sourceDatasetId),
          ]),
        );

        const ts = nowTs();
        const ageDays =
          (ts.epochMs - Date.parse(params.observationWindowEndIso)) / 86_400_000;
        const isStale = ageDays > 180;

        const snapshot: ImmutableMarketSnapshotRecord = {
          snapshotId: deterministicSnapshotId,
          geographicEntityId: entity.geographicEntityId,
          cityId: entity.cityId,
          ...(entity.districtId ? { districtId: entity.districtId } : {}),
          geographicLevel: entity.level,
          boundaryVersion: entity.boundaryVersion,
          marketType: segment.marketType,
          segment,
          reportingPeriodKey,
          generatedAt: ts,
          observationWindowStartIso: params.observationWindowStartIso,
          observationWindowEndIso: params.observationWindowEndIso,
          eligibleObservationCount: totalSample,
          methodologyVersion: CURRENT_MARKET_METHODOLOGY_VERSION,
          inputSnapshotHash,
          supply,
          demand,
          ...(saleMarket ? { saleMarket } : {}),
          ...(rentalMarket ? { rentalMarket } : {}),
          liquidity,
          absorption,
          dataQuality: {
            classification:
              totalSample < segment.minimumSampleSizeThreshold
                ? 'INSUFFICIENT_SAMPLE'
                : isStale
                  ? 'STALE'
                  : matchingTransactions.some(
                        (t) =>
                          t.verificationClassification ===
                          'AUTHORITATIVELY_CONFIRMED_COMPLETED',
                      )
                    ? 'VERIFIED_SOURCE_DATA'
                    : 'REPORTED_NOT_INDEPENDENTLY_VERIFIED',
            sourceModules: ['geography', 'listing-supply', 'property-transactions', 'demand-signals'],
            sourceDatasetIds,
            sourceObservationDateIso: params.observationWindowEndIso,
            processingDateIso: ts.iso,
            methodologyVersion: CURRENT_MARKET_METHODOLOGY_VERSION,
            sampleSize: totalSample,
            geographicCoverage: entity.level,
            completenessRatio: totalSample >= segment.minimumSampleSizeThreshold ? 1 : 0.4,
            isStale,
            knownLimitations: [
              'Public asking prices reflect seller offering levels and are separated from completed transaction prices.',
              'Withdrawn or expired listings are never counted as completed sales or leases.',
              'Demand proxies exclude raw page-view telemetry and deduplicate repeat actors.',
            ],
          },
          provenanceRefs: sourceDatasetIds,
        };

        const persisted = await runDurableTransaction(
          deps.txRunner,
          {
            operationName: 'market_intelligence_persist_snapshot',
            maxAttempts: 4,
            baseBackoffMs: 5,
          },
          async (tx) => {
            const existingSnap = await tx.get<ImmutableMarketSnapshotRecord>(
              `market_intelligence_snapshots/${deterministicSnapshotId}`,
            );
            const jobId = `mktjob_${crypto.randomBytes(6).toString('hex')}`;
            const job: MarketCalculationJobRecord = {
              jobId,
              operation: 'GENERATE_MARKET_SNAPSHOT',
              geographicEntityId: entity.geographicEntityId,
              reportingPeriodKey,
              segmentId: segment.segmentId,
              inputSnapshotHash,
              status: 'COMPLETED',
              producedSnapshotId: deterministicSnapshotId,
              requestedByUid: actor.uid,
              createdAt: ts,
              updatedAt: ts,
            };

            tx.set(`market_intelligence_jobs/${jobId}`, job as unknown as Record<string, unknown>);

            if (existingSnap.exists && existingSnap.data) {
              return {
                job,
                snapshot: existingSnap.data,
                reusedExistingImmutableSnapshot: true,
              };
            }

            tx.set(
              `market_intelligence_snapshots/${deterministicSnapshotId}`,
              snapshot as unknown as Record<string, unknown>,
            );
            await appendToIndex(
              tx,
              `market_intelligence_geo_index/${entity.geographicEntityId}__${segment.segmentId}`,
              deterministicSnapshotId,
            );

            return {
              job,
              snapshot,
              reusedExistingImmutableSnapshot: false,
            };
          },
        );

        return { statusCode: 201, body: persisted };
      },
    });

    return outcome.body;
  }

  /**
   * 2. Retrieve market overview for a city, district, or neighborhood
   */
  async function retrieveMarketOverview(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey?: string;
  }): Promise<ImmutableMarketSnapshotRecord> {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    return getLatestSnapshotForGeoAndSegment({
      geographicEntityId: entity.geographicEntityId,
      segmentId: params.segmentId,
      reportingPeriodKey: params.reportingPeriodKey,
    });
  }

  /**
   * 3. Retrieve sale-market overview
   */
  async function retrieveSaleMarketOverview(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId?: string;
    reportingPeriodKey?: string;
  }) {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const snapshot = await getLatestSnapshotForGeoAndSegment({
      geographicEntityId: entity.geographicEntityId,
      segmentId: params.segmentId ?? 'seg_res_apt_sale_all',
      reportingPeriodKey: params.reportingPeriodKey,
    });
    if (snapshot.marketType !== 'SALE' || !snapshot.saleMarket) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Segment "${snapshot.segment.segmentId}" is not a SALE market segment.`,
      );
    }
    return {
      snapshotId: snapshot.snapshotId,
      geographicEntityId: snapshot.geographicEntityId,
      reportingPeriodKey: snapshot.reportingPeriodKey,
      segment: snapshot.segment,
      saleMarket: snapshot.saleMarket,
      supply: snapshot.supply,
      liquidity: snapshot.liquidity,
      absorption: snapshot.absorption,
      dataQuality: snapshot.dataQuality,
    };
  }

  /**
   * 4. Retrieve rental-market overview
   */
  async function retrieveRentalMarketOverview(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId?: string;
    reportingPeriodKey?: string;
  }) {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const snapshot = await getLatestSnapshotForGeoAndSegment({
      geographicEntityId: entity.geographicEntityId,
      segmentId: params.segmentId ?? 'seg_res_apt_rental_all',
      reportingPeriodKey: params.reportingPeriodKey,
    });
    if (snapshot.marketType !== 'RENTAL' || !snapshot.rentalMarket) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Segment "${snapshot.segment.segmentId}" is not a RENTAL market segment.`,
      );
    }
    return {
      snapshotId: snapshot.snapshotId,
      geographicEntityId: snapshot.geographicEntityId,
      reportingPeriodKey: snapshot.reportingPeriodKey,
      segment: snapshot.segment,
      rentalMarket: snapshot.rentalMarket,
      supply: snapshot.supply,
      liquidity: snapshot.liquidity,
      absorption: snapshot.absorption,
      dataQuality: snapshot.dataQuality,
    };
  }

  /**
   * 5. Retrieve market supply indicators
   */
  async function retrieveMarketSupplyIndicators(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey?: string;
  }) {
    const snap = await retrieveMarketOverview(params);
    return {
      snapshotId: snap.snapshotId,
      geographicEntityId: snap.geographicEntityId,
      reportingPeriodKey: snap.reportingPeriodKey,
      segmentId: snap.segment.segmentId,
      supply: snap.supply,
      dataQuality: snap.dataQuality,
    };
  }

  /**
   * 6. Retrieve market demand indicators
   */
  async function retrieveMarketDemandIndicators(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey?: string;
  }) {
    const snap = await retrieveMarketOverview(params);
    return {
      snapshotId: snap.snapshotId,
      geographicEntityId: snap.geographicEntityId,
      reportingPeriodKey: snap.reportingPeriodKey,
      segmentId: snap.segment.segmentId,
      demand: snap.demand,
      dataQuality: snap.dataQuality,
    };
  }

  /**
   * 7. Retrieve listing inventory history (Cursor Paginated)
   */
  async function retrieveListingInventoryHistory(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }) {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const pagination = normalizePaginationParams({
      limit: params.limit,
      cursor: params.cursor,
      direction: params.direction ?? 'desc',
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_inventory_history', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snapshots = await loadIndexedDocs<ImmutableMarketSnapshotRecord>(
          tx,
          `market_intelligence_geo_index/${entity.geographicEntityId}__${params.segmentId}`,
          'market_intelligence_snapshots',
        );
        const mapped = snapshots.map((s) => ({
          id: s.snapshotId,
          sortEpochMs: Date.parse(s.observationWindowEndIso) || s.generatedAt.epochMs,
          snapshotId: s.snapshotId,
          reportingPeriodKey: s.reportingPeriodKey,
          supply: s.supply,
          dataQuality: s.dataQuality,
        }));
        return paginateItems(mapped, pagination);
      },
    );
  }

  /**
   * 8. Retrieve transaction activity where available
   */
  async function retrieveTransactionActivity(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey?: string;
  }) {
    const snap = await retrieveMarketOverview(params);
    return {
      snapshotId: snap.snapshotId,
      geographicEntityId: snap.geographicEntityId,
      reportingPeriodKey: snap.reportingPeriodKey,
      marketType: snap.marketType,
      confirmedSaleTransactionCount: snap.saleMarket?.confirmedTransactionCount ?? null,
      confirmedSaleTransactionTotalVolume: snap.saleMarket?.confirmedTransactionTotalVolume ?? null,
      confirmedRentalAgreementCount: snap.rentalMarket?.confirmedRentalAgreementCount ?? null,
      agreedUnverifiedRentalCount: snap.rentalMarket?.agreedUnverifiedRentalCount ?? null,
      absorption: snap.absorption,
      dataQuality: snap.dataQuality,
    };
  }

  /**
   * 9. Retrieve asking-price distributions
   */
  async function retrieveAskingPriceDistributions(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId?: string;
    reportingPeriodKey?: string;
  }) {
    const saleOverview = await retrieveSaleMarketOverview(params);
    return {
      snapshotId: saleOverview.snapshotId,
      geographicEntityId: saleOverview.geographicEntityId,
      reportingPeriodKey: saleOverview.reportingPeriodKey,
      priceClassification: 'PUBLIC_ASKING_PRICE_ONLY' as const,
      areaBasisUsed: saleOverview.saleMarket.areaBasisUsed,
      askingPriceTotalDistribution: saleOverview.saleMarket.askingPriceTotalDistribution,
      askingPricePerSqmDistribution: saleOverview.saleMarket.askingPricePerSqmDistribution,
      medianListingPriceReductionPct: saleOverview.saleMarket.medianListingPriceReductionPct,
      disclaimer: saleOverview.saleMarket.askingVsTransactionSeparationDisclaimer,
    };
  }

  /**
   * 10. Retrieve confirmed transaction-price distributions
   */
  async function retrieveConfirmedTransactionPriceDistributions(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId?: string;
    reportingPeriodKey?: string;
  }) {
    const saleOverview = await retrieveSaleMarketOverview(params);
    return {
      snapshotId: saleOverview.snapshotId,
      geographicEntityId: saleOverview.geographicEntityId,
      reportingPeriodKey: saleOverview.reportingPeriodKey,
      priceClassification: 'AUTHORITATIVELY_CONFIRMED_COMPLETED_TRANSACTION_PRICE' as const,
      areaBasisUsed: saleOverview.saleMarket.areaBasisUsed,
      confirmedTransactionCount: saleOverview.saleMarket.confirmedTransactionCount,
      confirmedTransactionPriceTotalDistribution:
        saleOverview.saleMarket.confirmedTransactionPriceTotalDistribution,
      confirmedTransactionPricePerSqmDistribution:
        saleOverview.saleMarket.confirmedTransactionPricePerSqmDistribution,
      agreedPendingPricePerSqmDistribution:
        saleOverview.saleMarket.agreedPendingPricePerSqmDistribution,
      medianNegotiatedDiscountFromAskingPct:
        saleOverview.saleMarket.medianNegotiatedDiscountFromAskingPct,
      disclaimer: saleOverview.saleMarket.askingVsTransactionSeparationDisclaimer,
    };
  }

  /**
   * 11. Retrieve rental-market trends (maintaining deposit and monthly rent separately)
   */
  async function retrieveRentalMarketTrends(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId?: string;
  }) {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const segId = params.segmentId ?? 'seg_res_apt_rental_all';

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_rental_trends', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snapshots = await loadIndexedDocs<ImmutableMarketSnapshotRecord>(
          tx,
          `market_intelligence_geo_index/${entity.geographicEntityId}__${segId}`,
          'market_intelligence_snapshots',
        );
        const rentalSnaps = snapshots
          .filter((s) => s.marketType === 'RENTAL' && s.rentalMarket)
          .sort((a, b) => a.reportingPeriodKey.localeCompare(b.reportingPeriodKey));

        return {
          geographicEntityId: entity.geographicEntityId,
          segmentId: segId,
          points: rentalSnaps.map((s) => ({
            snapshotId: s.snapshotId,
            reportingPeriodKey: s.reportingPeriodKey,
            askingMonthlyRentMedian: s.rentalMarket!.askingMonthlyRentDistribution.median,
            askingSecurityDepositMedian: s.rentalMarket!.askingSecurityDepositDistribution.median,
            confirmedMonthlyRentMedian: s.rentalMarket!.confirmedMonthlyRentDistribution.median,
            confirmedSecurityDepositMedian:
              s.rentalMarket!.confirmedSecurityDepositDistribution.median,
            analyticalEquivalentRentReference: s.rentalMarket!.analyticalEquivalentRentReference,
          })),
          rentAndDepositSeparationDisclaimer:
            'RENTAL_MARKET_INVARIANT: Monthly rent and security deposit are always tracked and reported as separate series.',
        };
      },
    );
  }

  /**
   * 12. Compute and retrieve Stratified Laspeyres Price and Rent Indices
   */
  async function computeAndRetrievePriceAndRentIndex(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    indexType: MarketPriceOrRentIndexRecord['indexType'];
    basePeriodKey: string;
    reportingPeriodKey: string;
    previousNominalIndexValue?: number | null;
    previousRealIndexValue?: number | null;
  }): Promise<MarketPriceOrRentIndexRecord> {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const segment = resolveSegmentDefinition(params.segmentId);

    const isTransactionIndex =
      params.indexType === 'CONFIRMED_TRANSACTION_PRICE_SQM_INDEX' ||
      params.indexType === 'CONFIRMED_RENTAL_AGREEMENT_INDEX';

    let baseObs: Array<{ areaSqm: number | null; metricPerSqm: number | null }> = [];
    let currObs: Array<{ areaSqm: number | null; metricPerSqm: number | null }> = [];

    if (isTransactionIndex) {
      const [baseTx, currTx] = await Promise.all([
        deps.transactions
          ? deps.transactions.listTransactionObservations({
              geographicEntityId: entity.geographicEntityId,
              reportingPeriodKey: params.basePeriodKey,
              marketType: segment.marketType,
            })
          : Promise.resolve([]),
        deps.transactions
          ? deps.transactions.listTransactionObservations({
              geographicEntityId: entity.geographicEntityId,
              reportingPeriodKey: params.reportingPeriodKey,
              marketType: segment.marketType,
            })
          : Promise.resolve([]),
      ]);
      baseObs = extractPerSqmObservationsFromTransactions(
        baseTx.filter((t) => matchesMarketSegment(t, segment)),
      );
      currObs = extractPerSqmObservationsFromTransactions(
        currTx.filter((t) => matchesMarketSegment(t, segment)),
      );
    } else {
      const [baseList, currList] = await Promise.all([
        deps.listingSupply
          ? deps.listingSupply.listListingObservations({
              geographicEntityId: entity.geographicEntityId,
              reportingPeriodKey: params.basePeriodKey,
              marketType: segment.marketType,
            })
          : Promise.resolve([]),
        deps.listingSupply
          ? deps.listingSupply.listListingObservations({
              geographicEntityId: entity.geographicEntityId,
              reportingPeriodKey: params.reportingPeriodKey,
              marketType: segment.marketType,
            })
          : Promise.resolve([]),
      ]);
      baseObs = extractPerSqmObservationsFromListings(
        baseList.filter((l) => matchesMarketSegment(l, segment)),
        segment.marketType,
      );
      currObs = extractPerSqmObservationsFromListings(
        currList.filter((l) => matchesMarketSegment(l, segment)),
        segment.marketType,
      );
    }

    const [baseMacro, currentMacro] = await Promise.all([
      deps.macroeconomic
        ? deps.macroeconomic.getMacroeconomicRecord(params.basePeriodKey)
        : Promise.resolve(null),
      deps.macroeconomic
        ? deps.macroeconomic.getMacroeconomicRecord(params.reportingPeriodKey)
        : Promise.resolve(null),
    ]);

    const indexRecord = computeStratifiedMarketIndex({
      indexType: params.indexType,
      geographicEntityId: entity.geographicEntityId,
      segmentId: segment.segmentId,
      basePeriodKey: params.basePeriodKey,
      reportingPeriodKey: params.reportingPeriodKey,
      baseObservations: baseObs,
      currentObservations: currObs,
      baseMacro,
      currentMacro,
      previousNominalIndexValue: params.previousNominalIndexValue,
      previousRealIndexValue: params.previousRealIndexValue,
      minimumTotalSampleSize: segment.minimumSampleSizeThreshold,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_store_index', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `market_intelligence_indices/${indexRecord.indexId}`,
          indexRecord as unknown as Record<string, unknown>,
        );
      },
    );

    return indexRecord;
  }

  /**
   * 13. Retrieve market liquidity indicators
   */
  async function retrieveMarketLiquidityIndicators(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey?: string;
  }) {
    const snap = await retrieveMarketOverview(params);
    return {
      snapshotId: snap.snapshotId,
      geographicEntityId: snap.geographicEntityId,
      reportingPeriodKey: snap.reportingPeriodKey,
      segmentId: snap.segment.segmentId,
      liquidity: snap.liquidity,
      dataQuality: snap.dataQuality,
    };
  }

  /**
   * 14. Retrieve supply absorption indicators
   */
  async function retrieveSupplyAbsorptionIndicators(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    reportingPeriodKey?: string;
  }) {
    const snap = await retrieveMarketOverview(params);
    return {
      snapshotId: snap.snapshotId,
      geographicEntityId: snap.geographicEntityId,
      reportingPeriodKey: snap.reportingPeriodKey,
      segmentId: snap.segment.segmentId,
      absorption: snap.absorption,
      dataQuality: snap.dataQuality,
    };
  }

  /**
   * 15. Compare neighborhoods, districts, or cities
   */
  async function compareGeographicMarkets(params: {
    targets: Array<{
      geographyLookup: MarketGeographicLookup;
      segmentId: string;
      reportingPeriodKey?: string;
    }>;
  }): Promise<GeographicMarketComparisonReport> {
    if (params.targets.length < 2) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'At least 2 target markets are required for geographic market comparison.',
      );
    }
    const snapshots: ImmutableMarketSnapshotRecord[] = [];
    for (const t of params.targets) {
      const snap = await retrieveMarketOverview(t);
      snapshots.push(snap);
    }
    return compareMarketSnapshots({
      snapshots,
      generatedAtIso: nowTs().iso,
    });
  }

  /**
   * 16. Retrieve market segment definitions (Cursor Paginated)
   */
  async function retrieveMarketSegmentDefinitions(params?: {
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }): Promise<{
    items: MarketSegmentDefinitionRecord[];
    hasMore: boolean;
    nextCursor: string | null;
    totalCount: number;
  }> {
    const pagination = normalizePaginationParams({
      limit: params?.limit,
      cursor: params?.cursor,
      direction: params?.direction ?? 'asc',
    });
    const indexed = CANONICAL_MARKET_SEGMENTS.map((seg, idx) => ({
      ...seg,
      id: seg.segmentId,
      sortEpochMs: idx + 1,
    }));
    const page = paginateItems(indexed, pagination);
    return {
      items: page.items.map(({ id: _id, sortEpochMs: _sort, ...rest }) => rest),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
    };
  }

  /**
   * 17. Retrieve historical market snapshots (Cursor Paginated)
   */
  async function retrieveHistoricalMarketSnapshots(params: {
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    limit?: number;
    cursor?: string;
    direction?: 'asc' | 'desc';
  }) {
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const pagination = normalizePaginationParams({
      limit: params.limit,
      cursor: params.cursor,
      direction: params.direction ?? 'desc',
    });

    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_historical_snapshots', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snapshots = await loadIndexedDocs<ImmutableMarketSnapshotRecord>(
          tx,
          `market_intelligence_geo_index/${entity.geographicEntityId}__${params.segmentId}`,
          'market_intelligence_snapshots',
        );
        const mapped = snapshots.map((s) => ({
          ...s,
          id: s.snapshotId,
          sortEpochMs: Date.parse(s.observationWindowEndIso) || s.generatedAt.epochMs,
        }));
        const page = paginateItems(mapped, pagination);
        return {
          items: page.items.map(({ id: _id, sortEpochMs: _sort, ...rest }) => rest),
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          totalCount: page.totalCount,
        };
      },
    );
  }

  /**
   * 18. Request a market forecast for a supported segment and horizon
   */
  async function requestMarketForecast(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    targetMetric: MarketForecastRecord['targetMetric'];
    modelId?: ForecastModelIdentifier;
    historicalSeries: ChronologicalTimeSeriesPoint[];
    trainingCutoffPeriodKey: string;
    horizonPeriods: number;
  }): Promise<MarketForecastRecord> {
    await requireAdminOrAnalyst(params.principal);
    const entity = await resolveCanonicalGeographyOrThrow(params.geographyLookup);
    const segment = resolveSegmentDefinition(params.segmentId);

    const forecast = generateChronologicalMarketForecast({
      geographicEntityId: entity.geographicEntityId,
      segmentId: segment.segmentId,
      targetMetric: params.targetMetric,
      modelId: params.modelId,
      historicalSeries: params.historicalSeries,
      trainingCutoffPeriodKey: params.trainingCutoffPeriodKey,
      horizonPeriods: params.horizonPeriods,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_store_forecast', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `market_intelligence_forecasts/${forecast.forecastId}`,
          forecast as unknown as Record<string, unknown>,
        );
      },
    );

    return forecast;
  }

  /**
   * 19. Retrieve forecast evaluation and accuracy metrics
   */
  async function retrieveForecastEvaluation(params: { forecastId: string }) {
    const fId = requireValidId(params.forecastId, 'forecastId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_get_forecast_eval', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<MarketForecastRecord>(`market_intelligence_forecasts/${fId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Forecast "${fId}" not found.`);
        }
        return {
          forecastId: snap.data.forecastId,
          outputClassification: snap.data.outputClassification,
          modelId: snap.data.modelId,
          modelVersion: snap.data.modelVersion,
          modelDeprecated: snap.data.modelDeprecated,
          trainingStartPeriodKey: snap.data.trainingStartPeriodKey,
          trainingCutoffPeriodKey: snap.data.trainingCutoffPeriodKey,
          status: snap.data.status,
          evaluation: snap.data.evaluation,
          nonGuaranteeDisclaimer: snap.data.nonGuaranteeDisclaimer,
        };
      },
    );
  }

  /**
   * 20. Run a hypothetical scenario analysis (Explicitly separated from statistical forecasts)
   */
  async function runHypotheticalScenario(params: {
    principal: AuthenticatedPrincipal | null | undefined;
    geographyLookup: MarketGeographicLookup;
    segmentId: string;
    baselinePeriodKey?: string;
    scenarioName: string;
    supplyShockPct: number;
    demandInquiryShockPct: number;
    constructionCostShockPct: number;
    financingRateDeltaBps: number;
  }): Promise<HypotheticalScenarioResultRecord> {
    await requireAdminOrAnalyst(params.principal);
    const baselineSnapshot = await retrieveMarketOverview({
      geographyLookup: params.geographyLookup,
      segmentId: params.segmentId,
      reportingPeriodKey: params.baselinePeriodKey,
    });

    const scenario = evaluateHypotheticalMarketScenario({
      baselineSnapshot,
      scenarioName: sanitizeTextInput(params.scenarioName).slice(0, 120),
      supplyShockPct: params.supplyShockPct,
      demandInquiryShockPct: params.demandInquiryShockPct,
      constructionCostShockPct: params.constructionCostShockPct,
      financingRateDeltaBps: params.financingRateDeltaBps,
      nowTs: nowTs(),
    });

    await runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_store_scenario', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        tx.set(
          `market_intelligence_scenarios/${scenario.scenarioId}`,
          scenario as unknown as Record<string, unknown>,
        );
      },
    );

    return scenario;
  }

  /**
   * 21. Retrieve data-quality and provenance metadata for any market indicator/snapshot
   */
  async function retrieveDataQualityAndProvenanceMetadata(params: { snapshotId: string }) {
    const sId = requireValidId(params.snapshotId, 'snapshotId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_get_provenance', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<ImmutableMarketSnapshotRecord>(
          `market_intelligence_snapshots/${sId}`,
        );
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Market snapshot "${sId}" not found.`);
        }
        return {
          snapshotId: snap.data.snapshotId,
          geographicEntityId: snap.data.geographicEntityId,
          boundaryVersion: snap.data.boundaryVersion,
          segment: snap.data.segment,
          reportingPeriodKey: snap.data.reportingPeriodKey,
          methodologyVersion: snap.data.methodologyVersion,
          inputSnapshotHash: snap.data.inputSnapshotHash,
          dataQuality: snap.data.dataQuality,
          provenanceRefs: snap.data.provenanceRefs,
          generatedAt: snap.data.generatedAt,
        };
      },
    );
  }

  /**
   * 22. Retrieve calculation job status
   */
  async function retrieveCalculationJobStatus(params: {
    jobId: string;
  }): Promise<MarketCalculationJobRecord> {
    const jId = requireValidId(params.jobId, 'jobId');
    return runDurableTransaction(
      deps.txRunner,
      { operationName: 'market_intelligence_get_job', maxAttempts: 3, baseBackoffMs: 5 },
      async (tx) => {
        const snap = await tx.get<MarketCalculationJobRecord>(`market_intelligence_jobs/${jId}`);
        if (!snap.exists || !snap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Market calculation job "${jId}" not found.`);
        }
        return snap.data;
      },
    );
  }

  return {
    generateOrRecalculateMarketSnapshot,
    retrieveMarketOverview,
    retrieveSaleMarketOverview,
    retrieveRentalMarketOverview,
    retrieveMarketSupplyIndicators,
    retrieveMarketDemandIndicators,
    retrieveListingInventoryHistory,
    retrieveTransactionActivity,
    retrieveAskingPriceDistributions,
    retrieveConfirmedTransactionPriceDistributions,
    retrieveRentalMarketTrends,
    computeAndRetrievePriceAndRentIndex,
    retrieveMarketLiquidityIndicators,
    retrieveSupplyAbsorptionIndicators,
    compareGeographicMarkets,
    retrieveMarketSegmentDefinitions,
    retrieveHistoricalMarketSnapshots,
    requestMarketForecast,
    retrieveForecastEvaluation,
    runHypotheticalScenario,
    retrieveDataQualityAndProvenanceMetadata,
    retrieveCalculationJobStatus,
  };
}
