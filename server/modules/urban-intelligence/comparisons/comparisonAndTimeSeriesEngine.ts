import type {
  SourceDatasetProvenanceRef,
  SourceReliabilityClass,
  SourceVerificationState,
} from '../contracts/externalAdapters';
import type {
  DataQualityAssessment,
  DataQualityStatusCode,
  HistoricalIndicatorSnapshotRecord,
  IndicatorValueEnvelope,
  MeasurementUnitCode,
  UrbanIntelligenceProfileRecord,
} from '../domain/types';
import { round2 } from '../indicators/demographicAndEconomicEvaluators';

export interface DimensionComparisonEntry {
  dimensionKey: string;
  indicatorId: string;
  unit: MeasurementUnitCode;
  compatible: boolean;
  incompatibilityReason?:
    | 'INCOMPATIBLE_REPORTING_PERIOD'
    | 'MISSING_OR_SUPPRESSED_DATA'
    | 'STALE_SOURCE_DATA'
    | 'INCOMPATIBLE_UNIT';
  valuesByEntityId: Record<
    string,
    {
      value: number | null;
      availability: IndicatorValueEnvelope<number>['availability'];
      qualityStatus: DataQualityStatusCode;
      isStale: boolean;
      reportingPeriodKey: string;
      boundaryVersion: string;
    }
  >;
  minEntityId?: string;
  maxEntityId?: string;
  absoluteSpread?: number;
}

export interface NeighborhoodComparisonResult {
  comparisonId: string;
  comparedEntityIds: string[];
  generatedAtIso: string;
  reportingPeriodsConsistent: boolean;
  crsConsistent: boolean;
  normalizationMethod: 'NONE_RAW_COMPATIBLE_UNITS_ONLY';
  comparableDimensions: DimensionComparisonEntry[];
  incomparableDimensions: DimensionComparisonEntry[];
  antiRankingAndFairnessDisclaimer: string;
}

export function buildProfileDataQualityAssessment(params: {
  evaluatedAtIso: string;
  boundaryVerification: UrbanIntelligenceProfileRecord['dataQuality']['geographicCoverageStatus'];
  provenanceList: SourceDatasetProvenanceRef[];
  envelopes: Array<IndicatorValueEnvelope<unknown>>;
  availableSectionCount: number;
  totalSectionCount: number;
}): DataQualityAssessment {
  const staleIds = params.envelopes
    .filter((e) => e.isStale)
    .map((e) => e.indicatorId);
  const rejectedIds = params.envelopes
    .filter((e) => e.qualityStatus === 'REJECTED')
    .map((e) => e.indicatorId);
  const conflictingIds = params.envelopes
    .filter((e) => e.qualityStatus === 'CONFLICTING')
    .map((e) => e.indicatorId);

  const obsTimes = params.provenanceList
    .map((p) => Date.parse(p.observationTimestampIso))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const reliabilitySet = new Set<SourceReliabilityClass>();
  const verificationSet = new Set<SourceVerificationState>();
  for (const p of params.provenanceList) {
    reliabilitySet.add(p.reliabilityClass);
    verificationSet.add(p.verificationState);
  }

  const completenessRatio = round2(
    params.totalSectionCount > 0
      ? params.availableSectionCount / params.totalSectionCount
      : 0,
  );

  let overallStatus: DataQualityStatusCode = 'VERIFIED_SOURCE';
  if (params.availableSectionCount === 0) {
    overallStatus = 'INSUFFICIENT_DATA';
  } else if (rejectedIds.length > 0) {
    overallStatus = 'REJECTED';
  } else if (conflictingIds.length > 0) {
    overallStatus = 'CONFLICTING';
  } else if (staleIds.length > 0) {
    overallStatus = 'STALE';
  } else if (completenessRatio < 1) {
    overallStatus = 'INCOMPLETE';
  } else if (verificationSet.has('IMPORTED_NOT_INDEPENDENTLY_VERIFIED')) {
    overallStatus = 'IMPORTED_NOT_INDEPENDENTLY_VERIFIED';
  } else if (verificationSet.has('ESTIMATED_MODEL_OUTPUT')) {
    overallStatus = 'ESTIMATED';
  }

  const outlierFlags: string[] = [];
  for (const rId of rejectedIds) {
    outlierFlags.push(`REJECTED_EXTRAPOLATION_OR_INVALID:${rId}`);
  }
  for (const sId of staleIds) {
    outlierFlags.push(`STALE_OBSERVATION:${sId}`);
  }

  const limitations: string[] = [];
  if (completenessRatio < 1) {
    limitations.push(
      `Partial profile: ${params.availableSectionCount} of ${params.totalSectionCount} domain sections have source data.`,
    );
  }
  if (params.boundaryVerification !== 'VERIFIED_POLYGON_BOUNDARY') {
    limitations.push(
      `Geographic boundary is ${params.boundaryVerification}; area-based density metrics may be unavailable.`,
    );
  }
  if (staleIds.length > 0) {
    limitations.push(
      `Contains ${staleIds.length} stale indicator(s) exceeding their source freshness window.`,
    );
  }

  return {
    overallStatus,
    completenessRatio,
    availableSectionCount: params.availableSectionCount,
    totalSectionCount: params.totalSectionCount,
    temporalFreshness: {
      evaluatedAtIso: params.evaluatedAtIso,
      oldestObservationTimestampIso:
        obsTimes.length > 0 ? new Date(obsTimes[0]!).toISOString() : null,
      newestObservationTimestampIso:
        obsTimes.length > 0 ? new Date(obsTimes[obsTimes.length - 1]!).toISOString() : null,
      hasStaleIndicators: staleIds.length > 0,
      staleIndicatorIds: staleIds,
    },
    sourceReliabilitySummary: Array.from(reliabilitySet),
    sourceVerificationStates: Array.from(verificationSet),
    geographicCoverageStatus: params.boundaryVerification,
    internalConsistencyValid: conflictingIds.length === 0,
    unitCompatibilityValid: true,
    methodologyValid: rejectedIds.length === 0,
    outlierAndAnomalyFlags: outlierFlags,
    knownLimitations: limitations,
  };
}

export function compareUrbanProfiles(params: {
  comparisonId: string;
  profiles: UrbanIntelligenceProfileRecord[];
  generatedAtIso: string;
  allowStaleComparison?: boolean;
}): NeighborhoodComparisonResult {
  const entityIds = params.profiles.map((p) => p.geographicEntityId);
  const uniquePeriods = new Set(params.profiles.map((p) => p.reportingPeriodKey));
  const reportingPeriodsConsistent = uniquePeriods.size === 1;
  const uniqueCrs = new Set(params.profiles.map((p) => p.crs));
  const crsConsistent = uniqueCrs.size === 1;

  const extractors: Array<{
    dimensionKey: string;
    select: (p: UrbanIntelligenceProfileRecord) => IndicatorValueEnvelope<number>;
  }> = [
    {
      dimensionKey: 'populationDensityPerSqKm',
      select: (p) => p.demographics.populationDensityPerSqKm,
    },
    {
      dimensionKey: 'businessActivityDensityPerSqKm',
      select: (p) => p.economics.businessActivityDensityPerSqKm,
    },
    {
      dimensionKey: 'educationFacilitiesPer10k',
      select: (p) => p.educationAccess.operatingFacilitiesPer10kResidents,
    },
    {
      dimensionKey: 'healthcareNearestDistanceKm',
      select: (p) => p.healthcareAccess.nearestVerifiedFacilityDistanceKm,
    },
    {
      dimensionKey: 'transitStopDensityPerSqKm',
      select: (p) => p.transportation.transitStopDensityPerSqKm,
    },
    {
      dimensionKey: 'greenSpaceSqMetersPerResident',
      select: (p) => p.publicAmenities.greenSpaceSqMetersPerResident,
    },
    {
      dimensionKey: 'airQualityIndexAqi',
      select: (p) => p.environmental.airQualityIndexAqi,
    },
    {
      dimensionKey: 'verifiedOperatingAmenitiesCount',
      select: (p) => p.publicAmenities.verifiedOperatingAmenitiesCount,
    },
    {
      dimensionKey: 'saleAskingPricePerSqmMedian',
      select: (p) => p.housingMarket.saleAskingPricePerSqmMedian,
    },
  ];

  const comparableDimensions: DimensionComparisonEntry[] = [];
  const incomparableDimensions: DimensionComparisonEntry[] = [];

  for (const ext of extractors) {
    const firstEnv = ext.select(params.profiles[0]!);
    const valuesByEntityId: DimensionComparisonEntry['valuesByEntityId'] = {};
    let hasMissing = false;
    let hasStale = false;
    let unitMismatch = false;

    for (const prof of params.profiles) {
      const env = ext.select(prof);
      if (env.unit !== firstEnv.unit) unitMismatch = true;
      if (env.availability !== 'AVAILABLE' || env.value === null) hasMissing = true;
      if (env.isStale) hasStale = true;

      valuesByEntityId[prof.geographicEntityId] = {
        value: env.value,
        availability: env.availability,
        qualityStatus: env.qualityStatus,
        isStale: env.isStale,
        reportingPeriodKey: prof.reportingPeriodKey,
        boundaryVersion: prof.boundaryVersion,
      };
    }

    if (!reportingPeriodsConsistent) {
      incomparableDimensions.push({
        dimensionKey: ext.dimensionKey,
        indicatorId: firstEnv.indicatorId,
        unit: firstEnv.unit,
        compatible: false,
        incompatibilityReason: 'INCOMPATIBLE_REPORTING_PERIOD',
        valuesByEntityId,
      });
      continue;
    }

    if (unitMismatch) {
      incomparableDimensions.push({
        dimensionKey: ext.dimensionKey,
        indicatorId: firstEnv.indicatorId,
        unit: firstEnv.unit,
        compatible: false,
        incompatibilityReason: 'INCOMPATIBLE_UNIT',
        valuesByEntityId,
      });
      continue;
    }

    if (hasMissing) {
      incomparableDimensions.push({
        dimensionKey: ext.dimensionKey,
        indicatorId: firstEnv.indicatorId,
        unit: firstEnv.unit,
        compatible: false,
        incompatibilityReason: 'MISSING_OR_SUPPRESSED_DATA',
        valuesByEntityId,
      });
      continue;
    }

    if (hasStale && !params.allowStaleComparison) {
      incomparableDimensions.push({
        dimensionKey: ext.dimensionKey,
        indicatorId: firstEnv.indicatorId,
        unit: firstEnv.unit,
        compatible: false,
        incompatibilityReason: 'STALE_SOURCE_DATA',
        valuesByEntityId,
      });
      continue;
    }

    let minEntityId: string | undefined;
    let maxEntityId: string | undefined;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (const [eid, entry] of Object.entries(valuesByEntityId)) {
      const v = entry.value!;
      if (v < minVal) {
        minVal = v;
        minEntityId = eid;
      }
      if (v > maxVal) {
        maxVal = v;
        maxEntityId = eid;
      }
    }

    comparableDimensions.push({
      dimensionKey: ext.dimensionKey,
      indicatorId: firstEnv.indicatorId,
      unit: firstEnv.unit,
      compatible: true,
      valuesByEntityId,
      minEntityId,
      maxEntityId,
      absoluteSpread: round2(maxVal - minVal),
    });
  }

  return {
    comparisonId: params.comparisonId,
    comparedEntityIds: entityIds,
    generatedAtIso: params.generatedAtIso,
    reportingPeriodsConsistent,
    crsConsistent,
    normalizationMethod: 'NONE_RAW_COMPATIBLE_UNITS_ONLY',
    comparableDimensions,
    incomparableDimensions,
    antiRankingAndFairnessDisclaimer:
      'EXPLAINABLE_DIMENSION_COMPARISON_ONLY: Compares compatible physical and statistical units across aligned reporting periods. Never computes an arbitrary weighted composite score or discriminatory neighborhood quality ranking.',
  };
}

export interface HistoricalTrendAnalysisResult {
  geographicEntityId: string;
  indicatorId: string;
  unit: MeasurementUnitCode | null;
  activeLatestSeries: HistoricalIndicatorSnapshotRecord[];
  allRevisionsHistory: HistoricalIndicatorSnapshotRecord[];
  missingInterpolationPolicy: 'NO_INTERPOLATION_APPLIED';
  trendDirection: 'INCREASING' | 'DECREASING' | 'FLAT' | 'INSUFFICIENT_POINTS';
  absoluteChangeFirstToLast: number | null;
  percentageChangeFirstToLast: number | null;
}

export function analyzeHistoricalIndicatorSeries(params: {
  geographicEntityId: string;
  indicatorId: string;
  snapshots: HistoricalIndicatorSnapshotRecord[];
}): HistoricalTrendAnalysisResult {
  const allSorted = [...params.snapshots].sort((a, b) => {
    const pCmp = a.reportingPeriodKey.localeCompare(b.reportingPeriodKey);
    if (pCmp !== 0) return pCmp;
    return a.revisionNumber - b.revisionNumber;
  });

  // Group by reportingPeriodKey and select highest revisionNumber for active series while preserving all revisions
  const latestByPeriod = new Map<string, HistoricalIndicatorSnapshotRecord>();
  for (const snap of allSorted) {
    const existing = latestByPeriod.get(snap.reportingPeriodKey);
    if (!existing || snap.revisionNumber >= existing.revisionNumber) {
      latestByPeriod.set(snap.reportingPeriodKey, snap);
    }
  }

  const activeLatestSeries = Array.from(latestByPeriod.values()).sort((a, b) =>
    a.reportingPeriodKey.localeCompare(b.reportingPeriodKey),
  );

  const validNumericPoints = activeLatestSeries.filter(
    (s) => s.availability === 'AVAILABLE' && typeof s.value === 'number',
  );

  let trendDirection: HistoricalTrendAnalysisResult['trendDirection'] = 'INSUFFICIENT_POINTS';
  let absChange: number | null = null;
  let pctChange: number | null = null;

  if (validNumericPoints.length >= 2) {
    const first = validNumericPoints[0]!.value!;
    const last = validNumericPoints[validNumericPoints.length - 1]!.value!;
    absChange = round2(last - first);
    if (first !== 0) {
      pctChange = round2(((last - first) / Math.abs(first)) * 100);
    }
    trendDirection =
      absChange > 0 ? 'INCREASING' : absChange < 0 ? 'DECREASING' : 'FLAT';
  }

  return {
    geographicEntityId: params.geographicEntityId,
    indicatorId: params.indicatorId,
    unit: allSorted[0]?.unit ?? null,
    activeLatestSeries,
    allRevisionsHistory: allSorted,
    missingInterpolationPolicy: 'NO_INTERPOLATION_APPLIED',
    trendDirection,
    absoluteChangeFirstToLast: absChange,
    percentageChangeFirstToLast: pctChange,
  };
}
