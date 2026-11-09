import crypto from 'crypto';
import {
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
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
  type NormalizedTimestamp,
  type PaginationParams,
  type TransactionContextLike,
} from '../../core';
import type {
  CanonicalUrbanGeographicEntity,
  GeographicLookupInput,
  SourceDatasetProvenanceRef,
  UrbanIntelligenceModuleDependencies,
} from '../contracts/externalAdapters';
import type {
  HistoricalIndicatorSnapshotRecord,
  IndicatorDefinitionRecord,
  IndicatorValueEnvelope,
  MeasurementUnitCode,
  ProfileCalculationJobRecord,
  UrbanIntelligenceProfileRecord,
} from '../domain/types';
import {
  CANONICAL_URBAN_INDICATOR_DEFINITIONS,
  CURRENT_URBAN_METHODOLOGY_VERSION,
  HISTORICAL_METHODOLOGY_VERSIONS,
  assertCompatibleMeasurementUnit,
  getIndicatorDefinitionById,
} from '../methodologies/methodologyRegistry';
import {
  evaluateDemographicIndicators,
  evaluateEconomicIndicators,
  evaluateHousingMarketIndicators,
  makeUnavailableEnvelope,
} from '../indicators/demographicAndEconomicEvaluators';
import {
  defaultHaversineSpatialAdapter,
  evaluateEnvironmentalAndInfrastructure,
  evaluateFacilityAccessSection,
  evaluateTransportationAndAmenities,
} from '../indicators/facilitiesEnvironmentAndInfraEvaluators';
import {
  analyzeHistoricalIndicatorSeries,
  buildProfileDataQualityAssessment,
  compareUrbanProfiles,
  type HistoricalTrendAnalysisResult,
  type NeighborhoodComparisonResult,
} from '../comparisons/comparisonAndTimeSeriesEngine';

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
  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last
      ? encodePaginationCursor({
          sortValue: last.sortEpochMs,
          docId: last.id,
          direction: pagination.direction,
        })
      : null;

  return { items: slice, hasMore, nextCursor, totalCount: items.length };
}

export function createUrbanIntelligenceService(deps: UrbanIntelligenceModuleDependencies) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());
  const nowTs = (): NormalizedTimestamp => normalizeFirestoreTimestamp(nowMs())!;
  const spatialAdapter = deps.spatial ?? defaultHaversineSpatialAdapter;

  const retryableTxRunner = {
    runTransaction<T>(workFn: Parameters<typeof deps.txRunner.runTransaction<T>>[0]): Promise<T> {
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'urban.idempotency_store', maxAttempts: 3 },
        workFn,
      );
    },
  };

  const idempotencyStore =
    deps.idempotencyStore ??
    createFirestoreIdempotencyStoreAdapter(retryableTxRunner, 'urbanIdempotencyLocks');

  async function resolveCanonicalAreaOrThrow(
    lookup: GeographicLookupInput,
  ): Promise<CanonicalUrbanGeographicEntity> {
    if (lookup.nameFa && !lookup.cityId && !lookup.geographicEntityId) {
      // Check via Geography adapter (which flags repeated names across cities)
      const outcome = await deps.geography.resolveGeographicEntity(lookup);
      if (outcome.ambiguous) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Ambiguous neighborhood name "${lookup.nameFa}" repeated across multiple cities (${(outcome.candidateEntityIds ?? []).join(', ')}); specify cityId or canonical geographicEntityId.`,
        );
      }
      if (!outcome.resolved || !outcome.entity) {
        throw new CoreApiError('NOT_FOUND', 404, `Geographic entity "${lookup.nameFa}" not found.`);
      }
      return outcome.entity;
    }

    const outcome = await deps.geography.resolveGeographicEntity(lookup);
    if (outcome.ambiguous) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Ambiguous geographic reference; candidates: ${(outcome.candidateEntityIds ?? []).join(', ')}.`,
      );
    }
    if (!outcome.resolved || !outcome.entity) {
      throw new CoreApiError(
        'NOT_FOUND',
        404,
        outcome.errorCode === 'UNSUPPORTED_BOUNDARY_VERSION'
          ? `Requested boundaryVersion "${lookup.boundaryVersion}" is not supported.`
          : 'Canonical geographic entity was not found in Geography module.',
      );
    }
    return outcome.entity;
  }

  async function sanitizeProfileForCallerAccess(
    profile: UrbanIntelligenceProfileRecord,
    principal?: AuthenticatedPrincipal | null,
    includeConfidentialSourceMetadata = false,
  ): Promise<UrbanIntelligenceProfileRecord> {
    if (includeConfidentialSourceMetadata) {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(
        principal,
        deps.adminStore,
        { primaryAdminEmails: deps.primaryAdminEmails },
      );
      if (!adminDecision.allowed) {
        throw new CoreApiError(
          adminDecision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
          adminDecision.status,
          'Access to confidential source metadata requires authorized admin or analyst privileges.',
        );
      }
      return profile;
    }

    // Strip confidentialSourceNotes for public / non-admin consumers (Section 21)
    return {
      ...profile,
      sourceProvenanceRefs: profile.sourceProvenanceRefs.map(
        ({ confidentialSourceNotes: _c, ...publicProv }) => publicProv,
      ),
    };
  }

  return {
    /**
     * Section 23 & 24: Request an authorized profile recalculation job.
     * Separates calculation execution from read-model retrieval, prevents duplicate snapshots,
     * and guarantees that failed calculations never publish partial profiles.
     */
    async requestAuthorizedProfileRecalculation(params: {
      principal: AuthenticatedPrincipal;
      lookup: GeographicLookupInput;
      reportingPeriodKey: string;
      methodologyVersion?: string;
      idempotencyKey: string;
      correlationId: string;
      simulateCalculationStepFailure?: boolean;
    }): Promise<{
      job: ProfileCalculationJobRecord;
      profile: UrbanIntelligenceProfileRecord;
      replayed: boolean;
    }> {
      if (!params.principal || !params.principal.uid || !params.principal.emailVerified) {
        throw new CoreApiError('UNAUTHENTICATED', 401, 'Authenticated verified principal required.');
      }

      const periodKey = sanitizeTextInput(params.reportingPeriodKey || '');
      if (!periodKey || periodKey.length < 4 || periodKey.length > 32) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Valid reportingPeriodKey is required.');
      }

      const methodologyVersion = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
      if (!HISTORICAL_METHODOLOGY_VERSIONS[methodologyVersion]) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Unknown methodologyVersion "${methodologyVersion}".`,
        );
      }

      const geo = await resolveCanonicalAreaOrThrow(params.lookup);

      const outcome = await executeIdempotentMutation<{
        job: ProfileCalculationJobRecord;
        profile: UrbanIntelligenceProfileRecord;
      }>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'urban.profile.recalculate',
        idempotencyKey: params.idempotencyKey,
        requestPayload: {
          geographicEntityId: geo.geographicEntityId,
          boundaryVersion: geo.boundaryVersion,
          reportingPeriodKey: periodKey,
          methodologyVersion,
        },
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const refEpochMs = nowMs();

          // 1. Gather source inputs via explicit read adapters (outside write transaction)
          const [demoSrc, econSrc, facilities, envSrc, infraSrc, crowdSummary, housingSummary] =
            await Promise.all([
              deps.dataIngestion
                ? deps.dataIngestion.getDemographicSourceRecord(geo.geographicEntityId, periodKey)
                : Promise.resolve(null),
              deps.dataIngestion
                ? deps.dataIngestion.getEconomicSourceRecord(geo.geographicEntityId, periodKey)
                : Promise.resolve(null),
              deps.dataIngestion
                ? deps.dataIngestion.listFacilitiesForArea(geo.geographicEntityId)
                : Promise.resolve([]),
              deps.dataIngestion
                ? deps.dataIngestion.getEnvironmentalSourceRecord(geo.geographicEntityId, periodKey)
                : Promise.resolve(null),
              deps.dataIngestion
                ? deps.dataIngestion.getInfrastructureAndDevelopmentRecord(
                    geo.geographicEntityId,
                    periodKey,
                  )
                : Promise.resolve(null),
              deps.crowdData
                ? deps.crowdData.getVerifiedCrowdObservationSummary(
                    geo.geographicEntityId,
                    periodKey,
                  )
                : Promise.resolve(null),
              deps.housingMarket
                ? deps.housingMarket.getAuthoritativeHousingMarketSummary(
                    geo.geographicEntityId,
                    periodKey,
                  )
                : Promise.resolve(null),
            ]);

          const provenanceList: SourceDatasetProvenanceRef[] = [];
          if (demoSrc) provenanceList.push(demoSrc.provenance);
          if (econSrc) provenanceList.push(econSrc.provenance);
          for (const f of facilities) {
            if (!provenanceList.some((p) => p.datasetId === f.provenance.datasetId)) {
              provenanceList.push(f.provenance);
            }
          }
          if (envSrc) provenanceList.push(envSrc.provenance);
          if (infraSrc) provenanceList.push(infraSrc.provenance);
          if (
            crowdSummary &&
            crowdSummary.epistemicClass === 'VERIFIED_MARKET_OBSERVATION' &&
            crowdSummary.publicationPolicySatisfied
          ) {
            provenanceList.push(crowdSummary.provenance);
          }
          if (housingSummary) provenanceList.push(housingSummary.provenance);

          const sourceDatasetRevisionsHash = computeRequestPayloadHash(
            provenanceList.map((p) => ({
              id: p.datasetId,
              rev: p.datasetRevision,
              period: p.reportingPeriodKey,
            })),
          ).slice(0, 24);

          const dedupSnapshotKey = `${geo.geographicEntityId}__${periodKey}__${methodologyVersion}__${geo.boundaryVersion}__${sourceDatasetRevisionsHash}`;
          const safeDedupId = crypto.createHash('sha256').update(dedupSnapshotKey).digest('hex').slice(0, 28);

          // Check if calculation step fails before publishing any profile
          if (params.simulateCalculationStepFailure) {
            const failTs = nowTs();
            const failedJobId = `urbjob_fail_${crypto.randomBytes(4).toString('hex')}`;
            await runDurableTransaction(
              deps.txRunner,
              { operationName: 'urban.job.record_failure', maxAttempts: 2 },
              async (tx) => {
                const failedJob: ProfileCalculationJobRecord = {
                  jobId: failedJobId,
                  geographicEntityId: geo.geographicEntityId,
                  reportingPeriodKey: periodKey,
                  methodologyVersion,
                  boundaryVersion: geo.boundaryVersion,
                  inputSnapshotHash: sourceDatasetRevisionsHash,
                  status: 'FAILED',
                  failureReason: 'Simulated calculation failure; partial profile publication prevented.',
                  requestedByUid: params.principal.uid,
                  attemptCount: 1,
                  createdAt: failTs,
                  updatedAt: failTs,
                };
                tx.set(`urbanCalculationJobs/${failedJobId}`, failedJob as unknown as Record<string, unknown>);
              },
            );
            throw new CoreApiError(
              'INTERNAL_ERROR',
              500,
              'Calculation job failed; no partial profile was published.',
            );
          }

          // 2. Pure reproducible indicator calculations
          const demographics = evaluateDemographicIndicators({
            geo,
            source: demoSrc,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });
          const availablePop =
            demographics.totalPopulation.availability === 'AVAILABLE'
              ? demographics.totalPopulation.value
              : null;

          const economics = evaluateEconomicIndicators({
            geo,
            source: econSrc,
            housingSummary,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });
          const educationAccess = evaluateFacilityAccessSection({
            domain: 'EDUCATION',
            geo,
            facilities,
            availablePopulation: availablePop,
            spatialAdapter,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });
          const healthcareAccess = evaluateFacilityAccessSection({
            domain: 'HEALTHCARE',
            geo,
            facilities,
            availablePopulation: availablePop,
            spatialAdapter,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });
          const { transportation, publicAmenities } = evaluateTransportationAndAmenities({
            geo,
            facilities,
            infra: infraSrc,
            availablePopulation: availablePop,
            spatialAdapter,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });
          const { environmental, infrastructure } = evaluateEnvironmentalAndInfrastructure({
            envSource: envSrc,
            infraSource: infraSrc,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });
          const housingMarket = evaluateHousingMarketIndicators({
            summary: housingSummary,
            referenceEpochMs: refEpochMs,
            methodologyVersion,
          });

          const sections = [
            demographics.sectionAvailable,
            economics.sectionAvailable,
            educationAccess.sectionAvailable,
            healthcareAccess.sectionAvailable,
            transportation.sectionAvailable,
            publicAmenities.sectionAvailable,
            environmental.sectionAvailable,
            infrastructure.sectionAvailable,
            housingMarket.sectionAvailable,
          ];
          const availableSectionCount = sections.filter(Boolean).length;

          const allEnvelopes: Array<IndicatorValueEnvelope<unknown>> = [
            demographics.totalPopulation,
            demographics.populationDensityPerSqKm,
            demographics.averageHouseholdSize,
            economics.businessActivityDensityPerSqKm,
            economics.housingPriceToAnnualIncomeRatio,
            educationAccess.operatingFacilitiesPer10kResidents,
            healthcareAccess.nearestVerifiedFacilityDistanceKm,
            transportation.transitStopDensityPerSqKm,
            publicAmenities.greenSpaceSqMetersPerResident,
            environmental.airQualityIndexAqi,
            housingMarket.saleAskingPricePerSqmMedian,
            housingMarket.confirmedSaleTransactionPricePerSqmMedian,
          ];

          const ts = nowTs();
          const dataQuality = buildProfileDataQualityAssessment({
            evaluatedAtIso: ts.iso,
            boundaryVerification: geo.boundaryVerification,
            provenanceList,
            envelopes: allEnvelopes,
            availableSectionCount,
            totalSectionCount: sections.length,
          });

          // 3. Persist profile, job, and historical time-series snapshots atomically
          const persisted = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'urban.profile.publish', maxAttempts: 3 },
            async (tx) => {
              // Prevent duplicate snapshot for identical calculation version, boundary, period, and input hash
              const existingDedupSnap = await tx.get<{
                jobId: string;
                profileId: string;
              }>(`urbanSnapshotDedupLocks/${safeDedupId}`);

              if (existingDedupSnap.exists && existingDedupSnap.data) {
                const prevProfile = await tx.get<UrbanIntelligenceProfileRecord>(
                  `urbanProfiles/${existingDedupSnap.data.profileId}`,
                );
                const prevJob = await tx.get<ProfileCalculationJobRecord>(
                  `urbanCalculationJobs/${existingDedupSnap.data.jobId}`,
                );
                if (prevProfile.exists && prevProfile.data && prevJob.exists && prevJob.data) {
                  return { job: prevJob.data, profile: prevProfile.data };
                }
              }

              const latestPtrPath = `urbanLatestProfileByArea/${encodeURIComponent(geo.geographicEntityId)}__${periodKey}`;
              const latestPtrSnap = await tx.get<{ profileId: string; profileVersion: number }>(
                latestPtrPath,
              );
              const nextProfileVersion =
                latestPtrSnap.exists && latestPtrSnap.data
                  ? latestPtrSnap.data.profileVersion + 1
                  : 1;

              const profileId = `urbprof_${safeDedupId}_v${nextProfileVersion}`;
              const jobId = `urbjob_${safeDedupId}`;

              const crowdSection =
                crowdSummary &&
                crowdSummary.epistemicClass === 'VERIFIED_MARKET_OBSERVATION' &&
                crowdSummary.publicationPolicySatisfied
                  ? {
                      verifiedObservationCount: crowdSummary.verifiedObservationCount,
                      perceivedQuietnessMedianScore1To10:
                        crowdSummary.perceivedQuietnessMedianScore1To10 !== null
                          ? ({
                              indicatorId: 'urb.crowd.quietness_median',
                              availability: 'AVAILABLE',
                              value: crowdSummary.perceivedQuietnessMedianScore1To10,
                              unit: 'SCORE_1_TO_10',
                              dataNature: 'DERIVED_ANALYTICAL_VALUE',
                              evidenceClass: 'VERIFIED_CROWD_OBSERVATION',
                              methodologyVersion,
                              qualityStatus: 'VERIFIED_SOURCE',
                              isStale: false,
                              provenanceRefs: [crowdSummary.provenance.datasetId],
                            } satisfies IndicatorValueEnvelope<number>)
                          : makeUnavailableEnvelope(
                              'urb.crowd.quietness_median',
                              'SCORE_1_TO_10',
                              'VERIFIED_CROWD_OBSERVATION',
                              'No crowd quietness score.',
                              methodologyVersion,
                            ),
                      perceivedParkingEaseMedianScore1To10:
                        crowdSummary.perceivedParkingEaseMedianScore1To10 !== null
                          ? ({
                              indicatorId: 'urb.crowd.parking_ease_median',
                              availability: 'AVAILABLE',
                              value: crowdSummary.perceivedParkingEaseMedianScore1To10,
                              unit: 'SCORE_1_TO_10',
                              dataNature: 'DERIVED_ANALYTICAL_VALUE',
                              evidenceClass: 'VERIFIED_CROWD_OBSERVATION',
                              methodologyVersion,
                              qualityStatus: 'VERIFIED_SOURCE',
                              isStale: false,
                              provenanceRefs: [crowdSummary.provenance.datasetId],
                            } satisfies IndicatorValueEnvelope<number>)
                          : makeUnavailableEnvelope(
                              'urb.crowd.parking_ease_median',
                              'SCORE_1_TO_10',
                              'VERIFIED_CROWD_OBSERVATION',
                              'No crowd parking score.',
                              methodologyVersion,
                            ),
                    }
                  : undefined;

              const profileDoc: UrbanIntelligenceProfileRecord = {
                profileId,
                geographicEntityId: geo.geographicEntityId,
                cityId: geo.cityId,
                provinceId: geo.provinceId,
                ...(geo.districtId ? { districtId: geo.districtId } : {}),
                geographicEntityType: geo.entityType,
                nameFa: geo.nameFa,
                nameEn: geo.nameEn,
                profileVersion: nextProfileVersion,
                boundaryVersion: geo.boundaryVersion,
                crs: geo.crs,
                reportingPeriodKey: periodKey,
                generatedAt: ts,
                methodologyVersion,
                sourceDatasetRevisionsHash,
                isPartialProfile: availableSectionCount < sections.length,
                demographics,
                economics,
                educationAccess,
                healthcareAccess,
                transportation,
                publicAmenities,
                environmental,
                infrastructure,
                housingMarket,
                ...(crowdSection ? { crowdObservationsSummary: crowdSection } : {}),
                dataQuality,
                sourceProvenanceRefs: provenanceList,
                knownLimitations: dataQuality.knownLimitations,
              };

              const jobDoc: ProfileCalculationJobRecord = {
                jobId,
                geographicEntityId: geo.geographicEntityId,
                reportingPeriodKey: periodKey,
                methodologyVersion,
                boundaryVersion: geo.boundaryVersion,
                inputSnapshotHash: sourceDatasetRevisionsHash,
                status: 'COMPLETED',
                producedProfileId: profileId,
                requestedByUid: params.principal.uid,
                attemptCount: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`urbanProfiles/${profileId}`, profileDoc as unknown as Record<string, unknown>);
              tx.set(latestPtrPath, { profileId, profileVersion: nextProfileVersion });
              tx.set(
                `urbanLatestProfileAnyPeriod/${encodeURIComponent(geo.geographicEntityId)}`,
                { profileId, reportingPeriodKey: periodKey },
              );
              tx.set(`urbanCalculationJobs/${jobId}`, jobDoc as unknown as Record<string, unknown>);
              tx.set(`urbanSnapshotDedupLocks/${safeDedupId}`, { jobId, profileId });

              // Persist historical indicator time-series snapshots (Section 18)
              const trackedTimeSeriesEnvelopes: Array<{
                env: IndicatorValueEnvelope<number>;
                prov?: SourceDatasetProvenanceRef;
              }> = [
                { env: demographics.totalPopulation, prov: demoSrc?.provenance },
                { env: demographics.populationDensityPerSqKm, prov: demoSrc?.provenance },
                { env: economics.businessActivityDensityPerSqKm, prov: econSrc?.provenance },
                { env: environmental.airQualityIndexAqi, prov: envSrc?.provenance },
                { env: housingMarket.saleAskingPricePerSqmMedian, prov: housingSummary?.provenance },
                {
                  env: housingMarket.confirmedSaleTransactionPricePerSqmMedian,
                  prov: housingSummary?.provenance,
                },
              ];

              for (const item of trackedTimeSeriesEnvelopes) {
                if (item.env.availability === 'UNAVAILABLE_MISSING_SOURCE' && !item.prov) continue;
                const seriesIdxPath = `urbanTimeSeriesIndex/${encodeURIComponent(geo.geographicEntityId)}__${item.env.indicatorId}`;
                const existingSeries = await loadIndexedDocs<HistoricalIndicatorSnapshotRecord>(
                  tx,
                  seriesIdxPath,
                  'urbanIndicatorSnapshots',
                );
                const samePeriodPrev = existingSeries
                  .filter((s) => s.reportingPeriodKey === periodKey)
                  .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];

                const nextRev = samePeriodPrev ? samePeriodPrev.revisionNumber + 1 : 1;
                const snapId = `urbsnap_${safeDedupId}_${item.env.indicatorId.replace(/\./g, '_')}_r${nextRev}`;
                const snapDoc: HistoricalIndicatorSnapshotRecord = {
                  snapshotId: snapId,
                  geographicEntityId: geo.geographicEntityId,
                  cityId: geo.cityId,
                  indicatorId: item.env.indicatorId,
                  value: item.env.value,
                  availability: item.env.availability,
                  unit: item.env.unit,
                  reportingPeriodKey: periodKey,
                  observationTimestampIso: item.prov?.observationTimestampIso ?? ts.iso,
                  sourceTimestampIso: item.prov?.sourcePublishedTimestampIso ?? ts.iso,
                  calculationTimestampIso: ts.iso,
                  methodologyVersion,
                  boundaryVersion: geo.boundaryVersion,
                  datasetRevision: item.prov?.datasetRevision ?? 'v1',
                  revisionNumber: nextRev,
                  ...(samePeriodPrev ? { supersedesSnapshotId: samePeriodPrev.snapshotId } : {}),
                  dataQualityStatus: item.env.qualityStatus,
                  provenanceRefs: item.env.provenanceRefs,
                  createdAt: ts,
                };
                tx.set(
                  `urbanIndicatorSnapshots/${snapId}`,
                  snapDoc as unknown as Record<string, unknown>,
                );
                await appendToIndex(tx, seriesIdxPath, snapId);
              }

              return { job: jobDoc, profile: profileDoc };
            },
          );

          return { statusCode: 201, body: persisted };
        },
      });

      return {
        job: outcome.body.job,
        profile: await sanitizeProfileForCallerAccess(outcome.body.profile, params.principal, false),
        replayed: outcome.replayed,
      };
    },

    async retrieveCalculationStatus(params: {
      jobId: string;
    }): Promise<ProfileCalculationJobRecord> {
      const check = requireSafeFirestoreId()(params.jobId, 'jobId');
      if (!check.ok || !check.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid jobId.', check.issues);
      }
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'urban.job.status', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<ProfileCalculationJobRecord>(
            `urbanCalculationJobs/${check.value}`,
          );
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Calculation job "${check.value}" not found.`);
          }
          return snap.data;
        },
      );
    },

    async retrieveProfileByLookup(params: {
      lookup: GeographicLookupInput;
      expectedEntityType?: 'CITY' | 'DISTRICT' | 'NEIGHBORHOOD';
      reportingPeriodKey?: string;
      principal?: AuthenticatedPrincipal | null;
      includeConfidentialSourceMetadata?: boolean;
    }): Promise<UrbanIntelligenceProfileRecord> {
      const geo = await resolveCanonicalAreaOrThrow(params.lookup);
      if (params.expectedEntityType && geo.entityType !== params.expectedEntityType) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Geographic entity "${geo.geographicEntityId}" is of type "${geo.entityType}", expected "${params.expectedEntityType}".`,
        );
      }

      const rawProfile = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'urban.profile.get', maxAttempts: 2 },
        async (tx) => {
          let periodKey = params.reportingPeriodKey;
          if (!periodKey) {
            const anyPtr = await tx.get<{ profileId: string; reportingPeriodKey: string }>(
              `urbanLatestProfileAnyPeriod/${encodeURIComponent(geo.geographicEntityId)}`,
            );
            if (!anyPtr.exists || !anyPtr.data) {
              throw new CoreApiError(
                'NOT_FOUND',
                404,
                `No generated intelligence profile found for "${geo.geographicEntityId}". Request a recalculation job first.`,
              );
            }
            periodKey = anyPtr.data.reportingPeriodKey;
          }

          const ptrSnap = await tx.get<{ profileId: string }>(
            `urbanLatestProfileByArea/${encodeURIComponent(geo.geographicEntityId)}__${periodKey}`,
          );
          if (!ptrSnap.exists || !ptrSnap.data) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `No profile found for "${geo.geographicEntityId}" in period "${periodKey}".`,
            );
          }

          const profSnap = await tx.get<UrbanIntelligenceProfileRecord>(
            `urbanProfiles/${ptrSnap.data.profileId}`,
          );
          if (!profSnap.exists || !profSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, 'Profile document missing.');
          }
          return profSnap.data;
        },
      );

      return sanitizeProfileForCallerAccess(
        rawProfile,
        params.principal,
        params.includeConfidentialSourceMetadata,
      );
    },

    async retrieveCityIntelligenceProfile(params: {
      cityId: string;
      reportingPeriodKey?: string;
      principal?: AuthenticatedPrincipal | null;
    }) {
      return this.retrieveProfileByLookup({
        lookup: { cityId: params.cityId, geographicEntityId: `${params.cityId}:city` },
        expectedEntityType: 'CITY',
        reportingPeriodKey: params.reportingPeriodKey,
        principal: params.principal,
      });
    },

    async retrieveDistrictIntelligenceProfile(params: {
      cityId: string;
      districtId: string;
      reportingPeriodKey?: string;
      principal?: AuthenticatedPrincipal | null;
    }) {
      return this.retrieveProfileByLookup({
        lookup: {
          cityId: params.cityId,
          districtId: params.districtId,
          geographicEntityId: `${params.cityId}:district:${params.districtId}`,
        },
        expectedEntityType: 'DISTRICT',
        reportingPeriodKey: params.reportingPeriodKey,
        principal: params.principal,
      });
    },

    async retrieveNeighborhoodIntelligenceProfile(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
      principal?: AuthenticatedPrincipal | null;
      includeConfidentialSourceMetadata?: boolean;
    }) {
      return this.retrieveProfileByLookup({
        lookup: params.lookup,
        expectedEntityType: 'NEIGHBORHOOD',
        reportingPeriodKey: params.reportingPeriodKey,
        principal: params.principal,
        includeConfidentialSourceMetadata: params.includeConfidentialSourceMetadata,
      });
    },

    async retrieveDemographicIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.demographics;
    },

    async retrieveEconomicIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.economics;
    },

    async retrieveEducationAccessIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.educationAccess;
    },

    async retrieveHealthcareAccessIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.healthcareAccess;
    },

    async retrieveTransportationIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.transportation;
    },

    async retrieveEnvironmentalIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.environmental;
    },

    async retrieveInfrastructureIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.infrastructure;
    },

    async retrievePublicAmenityIndicators(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.publicAmenities;
    },

    async retrieveHousingMarketIndicatorSummaries(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.housingMarket;
    },

    async retrieveDataQualityMetadata(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return p.dataQuality;
    },

    async retrieveProfileFreshnessInformation(params: {
      lookup: GeographicLookupInput;
      reportingPeriodKey?: string;
    }) {
      const p = await this.retrieveProfileByLookup(params);
      return {
        geographicEntityId: p.geographicEntityId,
        reportingPeriodKey: p.reportingPeriodKey,
        generatedAtIso: p.generatedAt.iso,
        temporalFreshness: p.dataQuality.temporalFreshness,
        sourceReliabilitySummary: p.dataQuality.sourceReliabilitySummary,
      };
    },

    async compareNeighborhoods(params: {
      lookups: Array<{ lookup: GeographicLookupInput; reportingPeriodKey?: string }>;
      allowStaleComparison?: boolean;
    }): Promise<NeighborhoodComparisonResult> {
      if (!Array.isArray(params.lookups) || params.lookups.length < 2) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'compareNeighborhoods requires at least two geographic areas.',
        );
      }

      const profiles: UrbanIntelligenceProfileRecord[] = [];
      for (const item of params.lookups) {
        const prof = await this.retrieveProfileByLookup({
          lookup: item.lookup,
          reportingPeriodKey: item.reportingPeriodKey,
        });
        profiles.push(prof);
      }

      const comparisonId = `urbcmp_${crypto.randomBytes(6).toString('hex')}`;
      return compareUrbanProfiles({
        comparisonId,
        profiles,
        generatedAtIso: nowTs().iso,
        allowStaleComparison: params.allowStaleComparison,
      });
    },

    async retrieveIndicatorDefinitions(params?: {
      category?: IndicatorDefinitionRecord['category'];
      query?: Record<string, unknown>;
    }): Promise<{
      items: IndicatorDefinitionRecord[];
      hasMore: boolean;
      nextCursor: string | null;
      totalCount: number;
    }> {
      const pagination = normalizePaginationParams(params?.query, { defaultLimit: 20, maxLimit: 50 });
      const filtered = params?.category
        ? CANONICAL_URBAN_INDICATOR_DEFINITIONS.filter((d) => d.category === params.category)
        : [...CANONICAL_URBAN_INDICATOR_DEFINITIONS];

      const wrapped = filtered.map((d, idx) => ({
        ...d,
        id: d.indicatorId,
        sortEpochMs: idx + 1,
      }));
      const paged = paginateItems(wrapped, { ...pagination, direction: 'asc' });
      return {
        ...paged,
        items: paged.items.map(({ id: _i, sortEpochMs: _s, ...rest }) => rest),
      };
    },

    async retrieveIndicatorHistory(params: {
      lookup: GeographicLookupInput;
      indicatorId: string;
      expectedUnit?: MeasurementUnitCode;
      query?: Record<string, unknown>;
    }): Promise<{
      trend: HistoricalTrendAnalysisResult;
      paginatedSnapshots: {
        items: HistoricalIndicatorSnapshotRecord[];
        hasMore: boolean;
        nextCursor: string | null;
        totalCount: number;
      };
    }> {
      getIndicatorDefinitionById(params.indicatorId);
      if (params.expectedUnit) {
        assertCompatibleMeasurementUnit(params.indicatorId, params.expectedUnit);
      }

      const geo = await resolveCanonicalAreaOrThrow(params.lookup);
      const pagination = normalizePaginationParams(params.query, { defaultLimit: 20, maxLimit: 50 });

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'urban.indicator.history', maxAttempts: 2 },
        async (tx) => {
          const seriesIdxPath = `urbanTimeSeriesIndex/${encodeURIComponent(geo.geographicEntityId)}__${params.indicatorId}`;
          const snapshots = await loadIndexedDocs<HistoricalIndicatorSnapshotRecord>(
            tx,
            seriesIdxPath,
            'urbanIndicatorSnapshots',
          );

          const trend = analyzeHistoricalIndicatorSeries({
            geographicEntityId: geo.geographicEntityId,
            indicatorId: params.indicatorId,
            snapshots,
          });

          const wrapped = snapshots.map((s) => ({
            ...s,
            id: s.snapshotId,
            sortEpochMs: Date.parse(s.observationTimestampIso) || s.createdAt.epochMs,
          }));
          const paged = paginateItems(wrapped, pagination);

          return {
            trend,
            paginatedSnapshots: {
              ...paged,
              items: paged.items.map(({ id: _i, sortEpochMs: _s, ...rest }) => rest),
            },
          };
        },
      );
    },

    retrieveMethodologyDocumentation(params?: { methodologyVersion?: string }) {
      const version = params?.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
      const versionMeta = HISTORICAL_METHODOLOGY_VERSIONS[version];
      if (!versionMeta) {
        throw new CoreApiError(
          'NOT_FOUND',
          404,
          `Methodology documentation for version "${version}" was not found.`,
        );
      }
      return {
        requestedVersion: versionMeta,
        allVersions: Object.values(HISTORICAL_METHODOLOGY_VERSIONS),
        spatialCapabilities: spatialAdapter.capabilities,
        spatialCrs: spatialAdapter.crs,
        indicatorDefinitions: CANONICAL_URBAN_INDICATOR_DEFINITIONS,
      };
    },
  };
}
