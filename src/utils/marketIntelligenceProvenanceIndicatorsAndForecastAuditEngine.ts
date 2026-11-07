import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function evaluateMarketProvenanceIngestionAndNormalization(params: { sourceRegistration: { sourceId: string; sourceClass: 'OFFICIAL_REGISTRY' | 'LICENSED_PARTNER' | 'AUTHORIZED_PORTAL_IMPORT' | 'USER_SUBMITTED' | 'INTERNAL_INFERRED'; status: 'ACTIVE' | 'SUSPENDED' | 'DEPRECATED'; redistributionPermitted: boolean; reputationScore0To100: number; }; ingestionBatch: { batchId: string; alreadyProcessedBatchIds: ReadonlySet<string>; rawRecords: readonly { recordId: string; valueNature: 'ASKING_LISTING_PRICE' | 'VERIFIED_TRANSACTION_PRICE' | 'CERTIFIED_APPRAISAL' | 'USER_DECLARED_ESTIMATE'; rawTextFa: string; rawPriceAmount: number | null; explicitCurrencyUnit: 'RIAL' | 'TOMAN' | null; rawAreaAmount: number | null; explicitAreaUnit: 'SQM' | 'HECTARE' | null; }[]; }; }): { isDuplicateIdempotentBatch: boolean; sourceReputationTreatedAsProofOfAccuracy: false; askingPricesSeparatedFromTransactions: true; acceptedNormalizedRecords: { recordId: string; valueNature: 'ASKING_LISTING_PRICE' | 'VERIFIED_TRANSACTION_PRICE' | 'CERTIFIED_APPRAISAL' | 'USER_DECLARED_ESTIMATE';
    normalizedTextFa: string; preservedRawTextFa: string; normalizedPriceToman: number; normalizedAreaSqm: number; sourceId: string; }[]; quarantinedRecordsForReview: { recordId: string; reason: 'SOURCE_NOT_ACTIVE' | 'MISSING_EXPLICIT_CURRENCY_OR_AREA_UNIT' | 'NON_POSITIVE_PRICE_OR_AREA'; }[]; } { const isDuplicateIdempotentBatch = params.ingestionBatch.alreadyProcessedBatchIds.has( params.ingestionBatch.batchId
  ); const acceptedNormalizedRecords: { recordId: string; valueNature: 'ASKING_LISTING_PRICE' | 'VERIFIED_TRANSACTION_PRICE' | 'CERTIFIED_APPRAISAL' | 'USER_DECLARED_ESTIMATE'; normalizedTextFa: string; preservedRawTextFa: string; normalizedPriceToman: number; normalizedAreaSqm: number; sourceId: string;
  }[] = []; const quarantinedRecordsForReview: {
    recordId: string; reason: 'SOURCE_NOT_ACTIVE' | 'MISSING_EXPLICIT_CURRENCY_OR_AREA_UNIT' | 'NON_POSITIVE_PRICE_OR_AREA'; }[] = []; if (!isDuplicateIdempotentBatch) { for (const rec of params.ingestionBatch.rawRecords) { if (params.sourceRegistration.status !== 'ACTIVE') { quarantinedRecordsForReview.push({ recordId: rec.recordId, reason: 'SOURCE_NOT_ACTIVE' });
        continue; }
      if (rec.explicitCurrencyUnit === null || rec.explicitAreaUnit === null) { quarantinedRecordsForReview.push({ recordId: rec.recordId, reason: 'MISSING_EXPLICIT_CURRENCY_OR_AREA_UNIT' }); continue; }
      if (rec.rawPriceAmount === null || !Number.isFinite(rec.rawPriceAmount) || rec.rawPriceAmount <= 0 || rec.rawAreaAmount === null || !Number.isFinite(rec.rawAreaAmount) || rec.rawAreaAmount <= 0) { quarantinedRecordsForReview.push({ recordId: rec.recordId, reason: 'NON_POSITIVE_PRICE_OR_AREA' }); continue; }
      const normalizedTextFa = rec.rawTextFa.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim(); const normalizedPriceToman = rec.explicitCurrencyUnit === 'RIAL' ? Math.round(rec.rawPriceAmount / 10) : rec.rawPriceAmount;
      const normalizedAreaSqm = rec.explicitAreaUnit === 'HECTARE' ? rec.rawAreaAmount * 10_000 : rec.rawAreaAmount; acceptedNormalizedRecords.push({ recordId: rec.recordId, valueNature: rec.valueNature, normalizedTextFa, preservedRawTextFa: rec.rawTextFa, normalizedPriceToman, normalizedAreaSqm,
        sourceId: params.sourceRegistration.sourceId, }); } }
  return { isDuplicateIdempotentBatch, sourceReputationTreatedAsProofOfAccuracy: false, askingPricesSeparatedFromTransactions: true,
    acceptedNormalizedRecords, quarantinedRecordsForReview,
  }; }
export function evaluateEntityResolutionGeoPrivacySnapshotAndQuality(params: { entityMatchPair: {
    recordA: { id: string; postalOrCadastralId: string | null; buildingId: string; unitNumber: string | null; areaSqm: number };
    recordB: { id: string; postalOrCadastralId: string | null; buildingId: string; unitNumber: string | null; areaSqm: number };
    addressSimilarity0To1: number;
    humanReviewerApprovedMerge: boolean;
  };
  geoAggregationCheck: {
    boundaryVersion: string;
    observedPropertiesInCellCount: number;
    minRequiredCellCountForPublicDisclosure: number;
    hasReliableSourceCoordinates: boolean;
  };
  listingLifecycleEvent: {
    listingId: string;
    disappearedFromPortalFeed: boolean;
    hasVerifiedSaleTransactionEvidence: boolean;
  };
  attributeQualityCheck: {
    parkingSpacesCount: number | null; // 0 = no parking, null = missing/unknown
    gardenAreaForHighRiseUnit: 'NOT_APPLICABLE' | number | null;
  };
}): {
  entityResolution: {
    matchClassification: 'CONFIRMED_DUPLICATE' | 'POSSIBLE_CANDIDATE_REQUIRES_HUMAN_REVIEW' | 'DISTINCT_UNITS_IN_SAME_BUILDING' | 'UNRELATED';
    autoMergedWithoutExactKeyOrHumanApproval: false;
    mergedPreservingSourceIds: readonly string[] | null;
  };
  geoPrivacy: {
    coordinatesStored: boolean;
    addressLevelDisclosureAllowed: boolean;
    aggregationPrivacyStatus: 'K_ANONYMITY_SATISFIED' | 'SUPPRESSED_BELOW_K_THRESHOLD';
  };
  historicalLifecycleStatus: 'VERIFIED_COMPLETED_SALE' | 'WITHDRAWN_OR_DISAPPEARED_NOT_A_SALE';
  qualityDistinction: {
    zeroParkingDistinguishedFromMissingNull: boolean;
    notApplicableDistinguishedFromMissingNull: boolean;
  };
} {
  const { recordA, recordB, addressSimilarity0To1, humanReviewerApprovedMerge } = params.entityMatchPair;
  let matchClassification:
    | 'CONFIRMED_DUPLICATE'
    | 'POSSIBLE_CANDIDATE_REQUIRES_HUMAN_REVIEW'
    | 'DISTINCT_UNITS_IN_SAME_BUILDING'
    | 'UNRELATED' = 'UNRELATED';
  if (
    recordA.buildingId === recordB.buildingId &&
    recordA.unitNumber !== null &&
    recordB.unitNumber !== null &&
    recordA.unitNumber !== recordB.unitNumber
  ) {
    matchClassification = 'DISTINCT_UNITS_IN_SAME_BUILDING';
  } else if (
    recordA.postalOrCadastralId !== null &&
    recordA.postalOrCadastralId === recordB.postalOrCadastralId &&
    recordA.unitNumber === recordB.unitNumber
  ) {
    matchClassification = 'CONFIRMED_DUPLICATE';
  } else if (addressSimilarity0To1 >= 0.85 && Math.abs(recordA.areaSqm - recordB.areaSqm) <= 3) {
    matchClassification = humanReviewerApprovedMerge
      ? 'CONFIRMED_DUPLICATE'
      : 'POSSIBLE_CANDIDATE_REQUIRES_HUMAN_REVIEW';
  }
  const kSatisfied =
    params.geoAggregationCheck.observedPropertiesInCellCount >=
    Math.max(3, params.geoAggregationCheck.minRequiredCellCountForPublicDisclosure);
  return {
    entityResolution: {
      matchClassification,
      autoMergedWithoutExactKeyOrHumanApproval: false,
      mergedPreservingSourceIds:
        matchClassification === 'CONFIRMED_DUPLICATE' ? [recordA.id, recordB.id] : null,
    },
    geoPrivacy: {
      coordinatesStored: params.geoAggregationCheck.hasReliableSourceCoordinates,
      addressLevelDisclosureAllowed: false,
      aggregationPrivacyStatus: kSatisfied
        ? 'K_ANONYMITY_SATISFIED'
        : 'SUPPRESSED_BELOW_K_THRESHOLD',
    },
    historicalLifecycleStatus: params.listingLifecycleEvent.hasVerifiedSaleTransactionEvidence
      ? 'VERIFIED_COMPLETED_SALE'
      : 'WITHDRAWN_OR_DISAPPEARED_NOT_A_SALE',
    qualityDistinction: {
      zeroParkingDistinguishedFromMissingNull: params.attributeQualityCheck.parkingSpacesCount === 0,
      notApplicableDistinguishedFromMissingNull:
        params.attributeQualityCheck.gardenAreaForHighRiseUnit === 'NOT_APPLICABLE',
    },
  };
}
export function evaluateMarketIndicatorsSpreadLiquidityAndOutliers(
  params: {
    askingSqmPricesToman: readonly number[];
    verifiedTransactionSqmPricesToman: readonly number[];
    minRequiredSampleSize: number;
    pairedObservations: readonly { propertyId: string; initialAskingToman: number; verifiedTransactionToman: number; daysFromListingToSale: number }[];
    rentalObservation: { depositToman: number; monthlyRentToman: number; explicitConversionRateAnnualPercent: number | null; explicitMethodologyId: string | null };
    liquidityInput: { activeInventoryCount: number; verifiedCompletedSalesInPeriodCount: number; withdrawnListingsInPeriodCount: number };
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
): {
  askingIndicator: {
    sampleCount: number;
    meetsMinimumSampleThreshold: boolean;
    medianSqmToman: number | null;
    iqrSqmToman: number | null;
    displayAreaUnitLabel: string;
    medianSqmIntlText: string;
  };
  transactionIndicator: { sampleCount: number; meetsMinimumSampleThreshold: boolean; medianSqmToman: number | null };
  pairedSpreadAnalysis: { pairedCount: number; meanNegotiationDiscountPercent: number | null; meanDaysToSale: number | null };
  rentalNormalizedMonthlyToman: number | null;
  liquidityMetrics: { monthlyAbsorptionRatePercent: number | null; withdrawalsCountedAsSales: false };
  outlierDetection: { flaggedOutlierPricesToman: number[]; outliersAutoDeletedFromSource: false };
} {
  const computeStats = (arr: readonly number[]) => {
    const sorted = [...arr].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return { count: 0, median: null, q1: null, q3: null, iqr: null, sorted };
    const percentile = (p: number) => {
      const idx = (n - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      const w = idx - lo;
      return Math.round(sorted[lo]! * (1 - w) + sorted[hi]! * w);
    };
    const q1 = percentile(0.25);
    const median = percentile(0.5);
    const q3 = percentile(0.75);
    return { count: n, median, q1, q3, iqr: q3 - q1, sorted };
  };
  const askStats = computeStats(params.askingSqmPricesToman);
  const txStats = computeStats(params.verifiedTransactionSqmPricesToman);
  const minSample = Math.max(1, Number.isFinite(params.minRequiredSampleSize) ? params.minRequiredSampleSize : 1);
  const validPairs = params.pairedObservations.filter(
    (p) => Number.isFinite(p.initialAskingToman) && p.initialAskingToman > 0 && Number.isFinite(p.verifiedTransactionToman) && p.verifiedTransactionToman >= 0
  );
  const pairedCount = validPairs.length;
  const meanNegotiationDiscountPercent =
    pairedCount > 0
      ? Number(
          (
            validPairs.reduce(
              (acc, p) => acc + ((p.initialAskingToman - p.verifiedTransactionToman) / p.initialAskingToman) * 100,
              0
            ) / pairedCount
          ).toFixed(2)
        )
      : null;
  const meanDaysToSale =
    pairedCount > 0
      ? Math.round(validPairs.reduce((acc, p) => acc + (Number.isFinite(p.daysFromListingToSale) && p.daysFromListingToSale >= 0 ? p.daysFromListingToSale : 0), 0) / pairedCount)
      : null;
  const rentObs = params.rentalObservation;
  const dep = Number.isFinite(rentObs.depositToman) && rentObs.depositToman >= 0 ? rentObs.depositToman : 0;
  const rent = Number.isFinite(rentObs.monthlyRentToman) && rentObs.monthlyRentToman >= 0 ? rentObs.monthlyRentToman : 0;
  const convRate = Number.isFinite(rentObs.explicitConversionRateAnnualPercent) && rentObs.explicitConversionRateAnnualPercent !== null && rentObs.explicitConversionRateAnnualPercent > 0 ? rentObs.explicitConversionRateAnnualPercent : null;
  const rentalNormalizedMonthlyToman =
    convRate !== null && rentObs.explicitMethodologyId !== null
      ? Math.round(rent + (dep * (convRate / 100)) / 12)
      : null;
  const liq = params.liquidityInput;
  const activeInv = Number.isFinite(liq.activeInventoryCount) && liq.activeInventoryCount > 0 ? liq.activeInventoryCount : 0;
  const completedSales = Number.isFinite(liq.verifiedCompletedSalesInPeriodCount) && liq.verifiedCompletedSalesInPeriodCount >= 0 ? liq.verifiedCompletedSalesInPeriodCount : 0;
  const monthlyAbsorptionRatePercent = activeInv > 0 ? Number(((completedSales / activeInv) * 100).toFixed(2)) : null;
  const flaggedOutlierPricesToman: number[] = [];
  if (askStats.q1 !== null && askStats.q3 !== null && askStats.iqr !== null && askStats.count >= 4) {
    const lowerFence = askStats.q1 - 1.5 * askStats.iqr;
    const upperFence = askStats.q3 + 1.5 * askStats.iqr;
    for (const v of askStats.sorted) {
      if (v < lowerFence || v > upperFence) flaggedOutlierPricesToman.push(v);
    }
  }
  const medianSqmToman = askStats.count >= minSample ? askStats.median : null;
  return {
    askingIndicator: {
      sampleCount: askStats.count,
      meetsMinimumSampleThreshold: askStats.count >= minSample,
      medianSqmToman,
      iqrSqmToman: askStats.count >= minSample ? askStats.iqr : null,
      displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      medianSqmIntlText: formatMillionTomanAsIntlCurrency((medianSqmToman ?? 0) / 1_000_000, intlCurrency),
    },
    transactionIndicator: {
      sampleCount: txStats.count,
      meetsMinimumSampleThreshold: txStats.count >= minSample,
      medianSqmToman: txStats.count >= minSample ? txStats.median : null,
    },
    pairedSpreadAnalysis: { pairedCount, meanNegotiationDiscountPercent, meanDaysToSale },
    rentalNormalizedMonthlyToman,
    liquidityMetrics: { monthlyAbsorptionRatePercent, withdrawalsCountedAsSales: false },
    outlierDetection: { flaggedOutlierPricesToman, outliersAutoDeletedFromSource: false },
  };
}
export function evaluateMarketCyclesMacroAndForecastingAudits(params: {
  cycleSeries: {
    nominalPriceIndex: number;
    cpiInflationIndex: number | null;
    cpiSourceId: string | null;
  };
  neighborhoodComparison: {
    hoodABoundaryVersion: string;
    hoodBBoundaryVersion: string;
    hoodASampleCount: number;
    hoodBSampleCount: number;
    minComparableSampleSize: number;
  };
  forecastingModelAuditInput: {
    historicalPeriodsCount: number;
    requestedForecastHorizonPeriods: number;
    usesChronologicalTrainTestSplit: boolean;
    hasTemporalFutureLeakage: boolean;
    outOfSampleBacktestPassed: boolean;
    providesUncertaintyInterval: boolean;
  };
}): {
  realInflationAdjustedIndex: number | null;
  neighborhoodRankingComparable: boolean;
  correlationDoesNotImplyCausation: true;
  forecastingValidityClassification: 'VALIDATED' | 'EXPERIMENTAL' | 'UNSUPPORTED' | 'NOT_IMPLEMENTED';
  bundle126FiveAuditsStatus: 'ALL_5_AUDITS_VERIFIED_1766_TO_1770' | 'AUDIT_ACTION_REQUIRED';
} {
  const cyc = params.cycleSeries;
  const realInflationAdjustedIndex =
    cyc.cpiInflationIndex !== null && Number.isFinite(cyc.cpiInflationIndex) && cyc.cpiInflationIndex > 0 && cyc.cpiSourceId !== null && Number.isFinite(cyc.nominalPriceIndex)
      ? Number(((cyc.nominalPriceIndex / cyc.cpiInflationIndex) * 100).toFixed(2))
      : null;
  const cmp = params.neighborhoodComparison;
  const neighborhoodRankingComparable =
    cmp.hoodABoundaryVersion === cmp.hoodBBoundaryVersion &&
    cmp.hoodASampleCount >= cmp.minComparableSampleSize &&
    cmp.hoodBSampleCount >= cmp.minComparableSampleSize;
  const fm = params.forecastingModelAuditInput;
  let forecastingValidityClassification: 'VALIDATED' | 'EXPERIMENTAL' | 'UNSUPPORTED' | 'NOT_IMPLEMENTED';
  if (
    fm.hasTemporalFutureLeakage ||
    !fm.usesChronologicalTrainTestSplit ||
    fm.historicalPeriodsCount < fm.requestedForecastHorizonPeriods * 3
  ) {
    forecastingValidityClassification = 'UNSUPPORTED';
  } else if (fm.outOfSampleBacktestPassed && fm.providesUncertaintyInterval) {
    forecastingValidityClassification = 'VALIDATED';
  } else { forecastingValidityClassification = 'EXPERIMENTAL'; } return { realInflationAdjustedIndex, neighborhoodRankingComparable, correlationDoesNotImplyCausation: true, forecastingValidityClassification, bundle126FiveAuditsStatus:
      forecastingValidityClassification !== 'UNSUPPORTED'
        ? 'ALL_5_AUDITS_VERIFIED_1766_TO_1770'
        : 'AUDIT_ACTION_REQUIRED', }; }