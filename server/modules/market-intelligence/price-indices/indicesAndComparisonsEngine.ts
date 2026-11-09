import crypto from 'crypto';
import type {
  NormalizedTimestamp,
  RawMarketListingObservation,
  RawMarketTransactionObservation,
  SizeBandCategory,
  VerifiedMacroeconomicPeriodRecord,
} from '../contracts/externalAdapters';
import type {
  ImmutableMarketSnapshotRecord,
  MarketPriceOrRentIndexRecord,
} from '../domain/types';
import {
  classifySizeBandSqm,
  computeIqrFilteredDistribution,
  CURRENT_MARKET_METHODOLOGY_VERSION,
  round2,
} from '../segmentation/segmentationAndSupplyDemandEngine';

export const DEFAULT_SIZE_STRATUM_WEIGHTS: Readonly<Record<SizeBandCategory, number>> = {
  SMALL_UNDER_75: 0.3,
  MEDIUM_75_TO_130: 0.5,
  LARGE_OVER_130: 0.2,
};

/**
 * Section 11 & 18: Stratified Mix-Adjusted Laspeyres Price & Rent Index.
 * Holds base-period size-band weights constant so shifts in sample composition (e.g., more luxury large units)
 * are never misrepresented as genuine market-wide price appreciation.
 */
export function computeStratifiedMarketIndex(params: {
  indexType: MarketPriceOrRentIndexRecord['indexType'];
  geographicEntityId: string;
  segmentId: string;
  basePeriodKey: string;
  reportingPeriodKey: string;
  baseObservations: Array<{ areaSqm: number | null; metricPerSqm: number | null }>;
  currentObservations: Array<{ areaSqm: number | null; metricPerSqm: number | null }>;
  baseMacro?: VerifiedMacroeconomicPeriodRecord | null;
  currentMacro?: VerifiedMacroeconomicPeriodRecord | null;
  previousNominalIndexValue?: number | null;
  previousRealIndexValue?: number | null;
  minimumTotalSampleSize?: number;
  nowTs: NormalizedTimestamp;
}): MarketPriceOrRentIndexRecord {
  const minSample = params.minimumTotalSampleSize ?? 3;
  const strata: readonly SizeBandCategory[] = [
    'SMALL_UNDER_75',
    'MEDIUM_75_TO_130',
    'LARGE_OVER_130',
  ];

  const validCurrent = params.currentObservations.filter(
    (o) => typeof o.metricPerSqm === 'number' && o.metricPerSqm > 0 && o.areaSqm !== null,
  );
  const validBase = params.baseObservations.filter(
    (o) => typeof o.metricPerSqm === 'number' && o.metricPerSqm > 0 && o.areaSqm !== null,
  );

  const indexId = `mktidx_${crypto.randomBytes(6).toString('hex')}`;
  const disclaimer =
    'PROPRIETARY_ANALYTICAL_INDEX_ONLY: Mix-adjusted fixed-weight Laspeyres index computed by Radartehran Market Intelligence. Not an official national or government statistical index.';

  if (validCurrent.length < minSample || validBase.length < minSample) {
    return {
      indexId,
      indexType: params.indexType,
      geographicEntityId: params.geographicEntityId,
      segmentId: params.segmentId,
      basePeriodKey: params.basePeriodKey,
      reportingPeriodKey: params.reportingPeriodKey,
      methodologyVersion: CURRENT_MARKET_METHODOLOGY_VERSION,
      weightingMethodology: 'FIXED_BASE_SIZE_STRATUM_LASPEYRES_WEIGHTS',
      stratumWeights: { ...DEFAULT_SIZE_STRATUM_WEIGHTS },
      sampleSize: validCurrent.length,
      status: 'SUPPRESSED_INSUFFICIENT_SAMPLE',
      nominalIndexValueBase100: null,
      realInflationAdjustedIndexValueBase100: null,
      nominalPeriodChangePct: null,
      realPeriodChangePct: null,
      nonOfficialProprietaryIndexDisclaimer: disclaimer,
      createdAt: params.nowTs,
    };
  }

  let weightedBaseComposite = 0;
  let weightedCurrentComposite = 0;
  let activeWeightSum = 0;

  for (const band of strata) {
    const baseBandVals = validBase
      .filter((o) => classifySizeBandSqm(o.areaSqm) === band)
      .map((o) => o.metricPerSqm!);
    const currBandVals = validCurrent
      .filter((o) => classifySizeBandSqm(o.areaSqm) === band)
      .map((o) => o.metricPerSqm!);

    const baseMed = computeIqrFilteredDistribution(baseBandVals, 1).median;
    const currMed = computeIqrFilteredDistribution(currBandVals, 1).median;

    if (baseMed !== null && currMed !== null) {
      const w = DEFAULT_SIZE_STRATUM_WEIGHTS[band];
      weightedBaseComposite += w * baseMed;
      weightedCurrentComposite += w * currMed;
      activeWeightSum += w;
    }
  }

  if (activeWeightSum === 0 || weightedBaseComposite === 0) {
    const allBaseMed = computeIqrFilteredDistribution(
      validBase.map((o) => o.metricPerSqm!),
      1,
    ).median!;
    const allCurrMed = computeIqrFilteredDistribution(
      validCurrent.map((o) => o.metricPerSqm!),
      1,
    ).median!;
    weightedBaseComposite = allBaseMed;
    weightedCurrentComposite = allCurrMed;
  }

  const nominalIndex = round2((weightedCurrentComposite / weightedBaseComposite) * 100);

  let realIndex: number | null = null;
  let deflatorCpiUsed: number | null = null;
  if (
    params.baseMacro?.verified &&
    params.currentMacro?.verified &&
    typeof params.baseMacro.cpiIndexBase100 === 'number' &&
    params.baseMacro.cpiIndexBase100 > 0 &&
    typeof params.currentMacro.cpiIndexBase100 === 'number' &&
    params.currentMacro.cpiIndexBase100 > 0
  ) {
    const cpiRatio = params.currentMacro.cpiIndexBase100 / params.baseMacro.cpiIndexBase100;
    realIndex = round2(nominalIndex / cpiRatio);
    deflatorCpiUsed = params.currentMacro.cpiIndexBase100;
  }

  const nominalChangePct =
    typeof params.previousNominalIndexValue === 'number' && params.previousNominalIndexValue > 0
      ? round2(
          ((nominalIndex - params.previousNominalIndexValue) / params.previousNominalIndexValue) *
            100,
        )
      : null;

  const realChangePct =
    realIndex !== null &&
    typeof params.previousRealIndexValue === 'number' &&
    params.previousRealIndexValue > 0
      ? round2(
          ((realIndex - params.previousRealIndexValue) / params.previousRealIndexValue) * 100,
        )
      : null;

  return {
    indexId,
    indexType: params.indexType,
    geographicEntityId: params.geographicEntityId,
    segmentId: params.segmentId,
    basePeriodKey: params.basePeriodKey,
    reportingPeriodKey: params.reportingPeriodKey,
    methodologyVersion: CURRENT_MARKET_METHODOLOGY_VERSION,
    weightingMethodology: 'FIXED_BASE_SIZE_STRATUM_LASPEYRES_WEIGHTS',
    stratumWeights: { ...DEFAULT_SIZE_STRATUM_WEIGHTS },
    sampleSize: validCurrent.length,
    status: 'PUBLISHED',
    nominalIndexValueBase100: nominalIndex,
    realInflationAdjustedIndexValueBase100: realIndex,
    ...(deflatorCpiUsed !== null ? { deflatorCpiUsed } : {}),
    nominalPeriodChangePct: nominalChangePct,
    realPeriodChangePct: realChangePct,
    nonOfficialProprietaryIndexDisclaimer: disclaimer,
    createdAt: params.nowTs,
  };
}

export function extractPerSqmObservationsFromListings(
  listings: RawMarketListingObservation[],
  marketType: 'SALE' | 'RENTAL',
): Array<{ areaSqm: number | null; metricPerSqm: number | null }> {
  return listings
    .filter(
      (l) =>
        l.marketType === marketType &&
        (l.lifecycleState === 'ACTIVE' || l.lifecycleState === 'REACTIVATED'),
    )
    .map((l) => {
      const area = l.verifiedAreaSqm ?? l.listedAreaSqm;
      if (!area || area <= 0) return { areaSqm: null, metricPerSqm: null };
      if (marketType === 'SALE') {
        return {
          areaSqm: area,
          metricPerSqm:
            typeof l.currentSaleAskingTotal === 'number'
              ? round2(l.currentSaleAskingTotal / area)
              : null,
        };
      }
      return {
        areaSqm: area,
        metricPerSqm:
          typeof l.monthlyAskingRent === 'number' ? round2(l.monthlyAskingRent / area) : null,
      };
    });
}

export function extractPerSqmObservationsFromTransactions(
  transactions: RawMarketTransactionObservation[],
): Array<{ areaSqm: number | null; metricPerSqm: number | null }> {
  return transactions
    .filter(
      (t) =>
        t.marketType === 'SALE' &&
        t.verificationClassification === 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
    )
    .map((t) => {
      const area = t.verifiedAreaSqm ?? t.listedAreaSqm;
      if (!area || area <= 0 || typeof t.confirmedTransactionPriceTotal !== 'number') {
        return { areaSqm: null, metricPerSqm: null };
      }
      return {
        areaSqm: area,
        metricPerSqm: round2(t.confirmedTransactionPriceTotal / area),
      };
    });
}

export interface MarketSnapshotComparisonDimension {
  dimensionKey: string;
  compatible: boolean;
  incompatibilityReason?: string;
  valuesBySnapshotId: Record<
    string,
    {
      geographicEntityId: string;
      reportingPeriodKey: string;
      segmentId: string;
      sampleSize: number;
      value: number | null;
      isStale: boolean;
    }
  >;
}

export interface GeographicMarketComparisonReport {
  comparisonId: string;
  generatedAtIso: string;
  segmentsCompatible: boolean;
  reportingPeriodsAligned: boolean;
  boundaryVersions: Record<string, string>;
  dimensions: MarketSnapshotComparisonDimension[];
  descriptiveNonRankingDisclaimer: string;
}

export function compareMarketSnapshots(params: {
  snapshots: ImmutableMarketSnapshotRecord[];
  generatedAtIso: string;
}): GeographicMarketComparisonReport {
  const comparisonId = `mktcmp_${crypto.randomBytes(6).toString('hex')}`;
  const uniqueSegments = new Set(params.snapshots.map((s) => s.segment.segmentId));
  const uniqueModes = new Set(params.snapshots.map((s) => s.marketType));
  const uniqueUses = new Set(params.snapshots.map((s) => s.segment.propertyUse));
  const segmentsCompatible = uniqueModes.size === 1 && uniqueUses.size === 1 && uniqueSegments.size === 1;

  const uniquePeriods = new Set(params.snapshots.map((s) => s.reportingPeriodKey));
  const reportingPeriodsAligned = uniquePeriods.size === 1;

  const boundaryVersions: Record<string, string> = {};
  for (const s of params.snapshots) {
    boundaryVersions[s.snapshotId] = s.boundaryVersion;
  }

  const metricExtractors: Array<{
    key: string;
    extract: (s: ImmutableMarketSnapshotRecord) => { val: number | null; n: number };
  }> = [
    {
      key: 'deduplicatedActiveInventoryCount',
      extract: (s) => ({
        val: s.supply.deduplicatedActiveInventoryCount,
        n: s.supply.deduplicatedActiveInventoryCount,
      }),
    },
    {
      key: 'saleAskingPricePerSqmMedian',
      extract: (s) => ({
        val: s.saleMarket?.askingPricePerSqmDistribution.median ?? null,
        n: s.saleMarket?.askingPricePerSqmDistribution.sampleCount ?? 0,
      }),
    },
    {
      key: 'confirmedTransactionPricePerSqmMedian',
      extract: (s) => ({
        val: s.saleMarket?.confirmedTransactionPricePerSqmDistribution.median ?? null,
        n: s.saleMarket?.confirmedTransactionPricePerSqmDistribution.sampleCount ?? 0,
      }),
    },
    {
      key: 'medianDaysOnMarketObserved',
      extract: (s) => ({
        val: s.liquidity.medianDaysOnMarketObserved,
        n: s.liquidity.observedCompletedSampleCount,
      }),
    },
    {
      key: 'monthsOfSupply',
      extract: (s) => ({
        val: s.absorption.monthsOfSupply,
        n: s.absorption.confirmedTransactionsCount,
      }),
    },
  ];

  const dimensions: MarketSnapshotComparisonDimension[] = metricExtractors.map((ext) => {
    const valuesBySnapshotId: MarketSnapshotComparisonDimension['valuesBySnapshotId'] = {};
    let anyMissing = false;

    for (const snap of params.snapshots) {
      const { val, n } = ext.extract(snap);
      if (val === null) anyMissing = true;
      valuesBySnapshotId[snap.snapshotId] = {
        geographicEntityId: snap.geographicEntityId,
        reportingPeriodKey: snap.reportingPeriodKey,
        segmentId: snap.segment.segmentId,
        sampleSize: n,
        value: val,
        isStale: snap.dataQuality.isStale,
      };
    }

    if (!segmentsCompatible) {
      return {
        dimensionKey: ext.key,
        compatible: false,
        incompatibilityReason: 'INCOMPATIBLE_MARKET_SEGMENT_OR_PROPERTY_USE',
        valuesBySnapshotId,
      };
    }
    if (anyMissing) {
      return {
        dimensionKey: ext.key,
        compatible: false,
        incompatibilityReason: 'MISSING_OR_INSUFFICIENT_SAMPLE_IN_DIMENSION',
        valuesBySnapshotId,
      };
    }
    return {
      dimensionKey: ext.key,
      compatible: true,
      valuesBySnapshotId,
    };
  });

  return {
    comparisonId,
    generatedAtIso: params.generatedAtIso,
    segmentsCompatible,
    reportingPeriodsAligned,
    boundaryVersions,
    dimensions,
    descriptiveNonRankingDisclaimer:
      'DESCRIPTIVE_MARKET_COMPARISON_ONLY: Exposes sample sizes, coverage, and aligned physical/price metrics. Never computes a universal market attractiveness score or causal claim.',
  };
}
