import { CoreApiError } from '../../core';
import type {
  AgeBandCategory,
  RawMarketDemandSignal,
  RawMarketListingObservation,
  RawMarketTransactionObservation,
  SizeBandCategory,
} from '../contracts/externalAdapters';
import type {
  DistributionSummaryMetrics,
  HousingDemandIndicators,
  HousingSupplyIndicators,
  MarketLiquidityIndicators,
  MarketSegmentDefinitionRecord,
  RentalMarketIndicators,
  SaleMarketIndicators,
  SupplyAbsorptionIndicators,
} from '../domain/types';

export const CURRENT_MARKET_METHODOLOGY_VERSION = '1.2.0';
export const MINIMUM_DEMAND_UNIQUE_ACTOR_PRIVACY_THRESHOLD = 5;

export const CANONICAL_MARKET_SEGMENTS: readonly MarketSegmentDefinitionRecord[] = [
  {
    segmentId: 'seg_res_apt_sale_all',
    version: '1.2.0',
    name: 'Residential Apartment Sale — All Sizes',
    marketType: 'SALE',
    propertyUse: 'RESIDENTIAL',
    propertyForm: 'APARTMENT',
    constructionStage: 'ALL_STAGES',
    sizeBandSqm: 'ALL_SIZES',
    ageBandYears: 'ALL_AGES',
    minimumSampleSizeThreshold: 3,
  },
  {
    segmentId: 'seg_res_apt_rental_all',
    version: '1.2.0',
    name: 'Residential Apartment Rental — All Sizes',
    marketType: 'RENTAL',
    propertyUse: 'RESIDENTIAL',
    propertyForm: 'APARTMENT',
    constructionStage: 'ALL_STAGES',
    sizeBandSqm: 'ALL_SIZES',
    ageBandYears: 'ALL_AGES',
    minimumSampleSizeThreshold: 3,
  },
  {
    segmentId: 'seg_com_office_sale_all',
    version: '1.2.0',
    name: 'Commercial Office Sale — All Sizes',
    marketType: 'SALE',
    propertyUse: 'COMMERCIAL',
    propertyForm: 'OFFICE',
    constructionStage: 'ALL_STAGES',
    sizeBandSqm: 'ALL_SIZES',
    ageBandYears: 'ALL_AGES',
    minimumSampleSizeThreshold: 3,
  },
];

export function resolveSegmentDefinition(segmentId: string): MarketSegmentDefinitionRecord {
  const found = CANONICAL_MARKET_SEGMENTS.find((s) => s.segmentId === segmentId);
  if (!found) {
    throw new CoreApiError('NOT_FOUND', 404, `Market segment definition "${segmentId}" not found.`);
  }
  return found;
}

export function classifySizeBandSqm(areaSqm: number | null): SizeBandCategory | 'UNKNOWN_SIZE' {
  if (areaSqm === null || !Number.isFinite(areaSqm) || areaSqm <= 0) return 'UNKNOWN_SIZE';
  if (areaSqm < 75) return 'SMALL_UNDER_75';
  if (areaSqm <= 130) return 'MEDIUM_75_TO_130';
  return 'LARGE_OVER_130';
}

export function classifyAgeBandYears(ageYears: number | null): AgeBandCategory | 'UNKNOWN_AGE' {
  if (ageYears === null || !Number.isFinite(ageYears) || ageYears < 0) return 'UNKNOWN_AGE';
  if (ageYears <= 3) return 'NEW_0_TO_3';
  if (ageYears <= 15) return 'ESTABLISHED_4_TO_15';
  return 'OLDER_OVER_15';
}

export function matchesMarketSegment(
  obs: {
    marketType: MarketSegmentDefinitionRecord['marketType'];
    propertyUse: MarketSegmentDefinitionRecord['propertyUse'];
    propertyForm: string;
    constructionStage: string;
    listedAreaSqm: number | null;
    verifiedAreaSqm: number | null;
    constructionAgeYears: number | null;
  },
  segment: MarketSegmentDefinitionRecord,
): boolean {
  if (obs.marketType !== segment.marketType) return false;
  if (obs.propertyUse !== segment.propertyUse) return false;
  if (segment.propertyForm !== 'ALL_FORMS' && obs.propertyForm !== segment.propertyForm) return false;
  if (
    segment.constructionStage !== 'ALL_STAGES' &&
    obs.constructionStage !== segment.constructionStage
  ) {
    return false;
  }
  const effectiveArea = obs.verifiedAreaSqm ?? obs.listedAreaSqm;
  if (segment.sizeBandSqm !== 'ALL_SIZES') {
    if (classifySizeBandSqm(effectiveArea) !== segment.sizeBandSqm) return false;
  }
  if (segment.ageBandYears !== 'ALL_AGES') {
    if (classifyAgeBandYears(obs.constructionAgeYears) !== segment.ageBandYears) return false;
  }
  return true;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function quantileSorted(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return round2(sorted[base]! + rest * (sorted[base + 1]! - sorted[base]!));
  }
  return round2(sorted[base]!);
}

export function computeIqrFilteredDistribution(
  rawValues: number[],
  minSampleThreshold = 3,
): DistributionSummaryMetrics {
  const finite = rawValues.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (finite.length === 0) {
    return {
      sampleCount: 0,
      sufficientSample: false,
      median: null,
      mean: null,
      p25: null,
      p75: null,
      iqrOutliersRemovedCount: 0,
    };
  }
  const initialSorted = [...finite].sort((a, b) => a - b);
  let filtered = initialSorted;
  let removed = 0;

  if (initialSorted.length >= 4) {
    const q25 = quantileSorted(initialSorted, 0.25);
    const q75 = quantileSorted(initialSorted, 0.75);
    const iqr = q75 - q25;
    const lowerFence = q25 - 1.5 * iqr;
    const upperFence = q75 + 1.5 * iqr;
    filtered = initialSorted.filter((v) => v >= lowerFence && v <= upperFence);
    removed = initialSorted.length - filtered.length;
    if (filtered.length === 0) {
      filtered = initialSorted;
      removed = 0;
    }
  }

  const sufficientSample = filtered.length >= minSampleThreshold;
  const sum = filtered.reduce((acc, v) => acc + v, 0);
  return {
    sampleCount: filtered.length,
    sufficientSample,
    median: sufficientSample ? quantileSorted(filtered, 0.5) : null,
    mean: sufficientSample ? round2(sum / filtered.length) : null,
    p25: sufficientSample ? quantileSorted(filtered, 0.25) : null,
    p75: sufficientSample ? quantileSorted(filtered, 0.75) : null,
    iqrOutliersRemovedCount: removed,
  };
}

/**
 * Section 7: Deduplicates multiple advertisements for the same canonicalPropertyRefId
 * (retaining the latest observed record per canonical property).
 */
export function deduplicateListingsByCanonicalProperty(
  listings: RawMarketListingObservation[],
): {
  deduplicated: RawMarketListingObservation[];
  duplicatesRemovedCount: number;
} {
  const byProperty = new Map<string, RawMarketListingObservation>();
  for (const item of listings) {
    const existing = byProperty.get(item.canonicalPropertyRefId);
    if (
      !existing ||
      Date.parse(item.sourceObservedAtIso) >= Date.parse(existing.sourceObservedAtIso)
    ) {
      byProperty.set(item.canonicalPropertyRefId, item);
    }
  }
  const deduplicated = Array.from(byProperty.values());
  return {
    deduplicated,
    duplicatesRemovedCount: listings.length - deduplicated.length,
  };
}

export function evaluateHousingSupply(params: {
  rawListings: RawMarketListingObservation[];
  windowStartIso: string;
  windowEndIso: string;
}): {
  supply: HousingSupplyIndicators;
  deduplicatedListings: RawMarketListingObservation[];
} {
  const { deduplicated, duplicatesRemovedCount } = deduplicateListingsByCanonicalProperty(
    params.rawListings,
  );
  const winStartMs = Date.parse(params.windowStartIso);
  const winEndMs = Date.parse(params.windowEndIso);

  const active = deduplicated.filter(
    (l) => l.lifecycleState === 'ACTIVE' || l.lifecycleState === 'REACTIVATED',
  );
  const newListings = deduplicated.filter((l) => {
    const pubMs = Date.parse(l.publishedAtIso);
    return pubMs >= winStartMs && pubMs <= winEndMs;
  });
  const withdrawn = deduplicated.filter((l) => l.lifecycleState === 'WITHDRAWN');
  const expired = deduplicated.filter((l) => l.lifecycleState === 'EXPIRED');
  const reactivated = deduplicated.filter((l) => l.lifecycleState === 'REACTIVATED');

  const bySizeBandCounts: HousingSupplyIndicators['bySizeBandCounts'] = {
    SMALL_UNDER_75: 0,
    MEDIUM_75_TO_130: 0,
    LARGE_OVER_130: 0,
    UNKNOWN_SIZE: 0,
  };
  const byConstructionStageCounts: HousingSupplyIndicators['byConstructionStageCounts'] = {
    NEW_CONSTRUCTION: 0,
    EXISTING_PROPERTY: 0,
  };

  for (const item of active) {
    const band = classifySizeBandSqm(item.verifiedAreaSqm ?? item.listedAreaSqm);
    bySizeBandCounts[band]++;
    byConstructionStageCounts[item.constructionStage]++;
  }

  return {
    deduplicatedListings: deduplicated,
    supply: {
      rawAdvertisementCount: params.rawListings.length,
      duplicateAdvertisementsRemovedCount: duplicatesRemovedCount,
      deduplicatedActiveInventoryCount: active.length,
      newListingCount: newListings.length,
      withdrawnListingCount: withdrawn.length,
      expiredListingCount: expired.length,
      reactivatedListingCount: reactivated.length,
      bySizeBandCounts,
      byConstructionStageCounts,
      withdrawnNotCountedAsSoldDisclaimer:
        'SUPPLY_BOUNDARY_INVARIANT: Withdrawn or expired listings are never classified as sold or rented properties without authoritative transaction confirmation.',
    },
  };
}

export function evaluateHousingDemand(params: {
  signals: RawMarketDemandSignal[];
  minUniqueActorThreshold?: number;
}): HousingDemandIndicators {
  const minActors =
    params.minUniqueActorThreshold ?? MINIMUM_DEMAND_UNIQUE_ACTOR_PRIVACY_THRESHOLD;

  const pageViews = params.signals.filter((s) => s.signalType === 'RAW_PAGE_VIEW_TELEMETRY');
  const inquiries = params.signals.filter(
    (s) => s.signalType === 'SUBMITTED_INQUIRY' || s.signalType === 'QUALIFIED_INQUIRY',
  );
  const qualified = params.signals.filter((s) => s.signalType === 'QUALIFIED_INQUIRY');
  const offers = params.signals.filter((s) => s.signalType === 'SUBMITTED_OFFER');
  const agreements = params.signals.filter((s) => s.signalType === 'ACCEPTED_AGREEMENT');

  const uniqueInquiringActors = new Set(inquiries.map((i) => i.actorUidHash));
  const uniqueOfferingActors = new Set(offers.map((o) => o.actorUidHash));

  const limitations = [
    'Raw page-view telemetry is excluded and never equated with housing demand.',
    'Repeated inquiries by the same actorUidHash are deduplicated into unique inquiring actors.',
    'An inquiry or offer does not constitute a completed transaction.',
  ];

  if (uniqueInquiringActors.size > 0 && uniqueInquiringActors.size < minActors) {
    return {
      minimumUniqueActorPrivacyThreshold: minActors,
      privacySuppressionApplied: true,
      ignoredRawTelemetryPageViewsCount: pageViews.length,
      totalSubmittedInquiriesCount: null,
      uniqueInquiringActorsCount: null,
      repeatInquiryRatePct: null,
      qualifiedInquiriesCount: null,
      submittedOffersCount: null,
      acceptedAgreementsCount: null,
      inquiryToOfferConversionPct: null,
      offerToAgreementConversionPct: null,
      demandProxyLimitations: [
        ...limitations,
        `Privacy threshold applied: unique inquiring actors (${uniqueInquiringActors.size}) < ${minActors}.`,
      ],
    };
  }

  const totalInq = inquiries.length;
  const uniqueInq = uniqueInquiringActors.size;
  const repeatCount = Math.max(0, totalInq - uniqueInq);

  return {
    minimumUniqueActorPrivacyThreshold: minActors,
    privacySuppressionApplied: false,
    ignoredRawTelemetryPageViewsCount: pageViews.length,
    totalSubmittedInquiriesCount: totalInq,
    uniqueInquiringActorsCount: uniqueInq,
    repeatInquiryRatePct: totalInq > 0 ? round2((repeatCount / totalInq) * 100) : null,
    qualifiedInquiriesCount: qualified.length,
    submittedOffersCount: offers.length,
    acceptedAgreementsCount: agreements.length,
    inquiryToOfferConversionPct:
      uniqueInq > 0 ? round2((uniqueOfferingActors.size / uniqueInq) * 100) : null,
    offerToAgreementConversionPct:
      offers.length > 0 ? round2((agreements.length / offers.length) * 100) : null,
    demandProxyLimitations: limitations,
  };
}

export function evaluateSaleMarket(params: {
  deduplicatedListings: RawMarketListingObservation[];
  transactions: RawMarketTransactionObservation[];
  minSampleThreshold: number;
}): SaleMarketIndicators {
  const activeSale = params.deduplicatedListings.filter(
    (l) =>
      l.marketType === 'SALE' &&
      (l.lifecycleState === 'ACTIVE' || l.lifecycleState === 'REACTIVATED'),
  );
  const saleTx = params.transactions.filter((t) => t.marketType === 'SALE');
  const agreedPendingTx = saleTx.filter(
    (t) => t.verificationClassification === 'AGREED_PENDING_COMPLETION',
  );
  const confirmedTx = saleTx.filter(
    (t) => t.verificationClassification === 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
  );

  const askingTotals: number[] = [];
  const askingSqms: number[] = [];
  const priceReductionsPct: number[] = [];

  for (const l of activeSale) {
    const area = l.verifiedAreaSqm ?? l.listedAreaSqm;
    if (typeof l.currentSaleAskingTotal === 'number' && l.currentSaleAskingTotal > 0) {
      askingTotals.push(l.currentSaleAskingTotal);
      if (area && area > 0) {
        askingSqms.push(round2(l.currentSaleAskingTotal / area));
      }
      if (
        typeof l.initialSaleAskingTotal === 'number' &&
        l.initialSaleAskingTotal > 0 &&
        l.currentSaleAskingTotal !== l.initialSaleAskingTotal
      ) {
        priceReductionsPct.push(
          round2(
            ((l.currentSaleAskingTotal - l.initialSaleAskingTotal) / l.initialSaleAskingTotal) *
              100,
          ),
        );
      }
    }
  }

  const agreedSqms: number[] = [];
  for (const t of agreedPendingTx) {
    const area = t.verifiedAreaSqm ?? t.listedAreaSqm;
    if (typeof t.agreedPriceTotal === 'number' && area && area > 0) {
      agreedSqms.push(round2(t.agreedPriceTotal / area));
    }
  }

  const confirmedTotals: number[] = [];
  const confirmedSqms: number[] = [];
  const negotiatedDiscountsPct: number[] = [];

  for (const t of confirmedTx) {
    const area = t.verifiedAreaSqm ?? t.listedAreaSqm;
    if (
      typeof t.confirmedTransactionPriceTotal === 'number' &&
      t.confirmedTransactionPriceTotal > 0
    ) {
      confirmedTotals.push(t.confirmedTransactionPriceTotal);
      if (area && area > 0) {
        confirmedSqms.push(round2(t.confirmedTransactionPriceTotal / area));
      }
      if (typeof t.askingPriceTotal === 'number' && t.askingPriceTotal > 0) {
        negotiatedDiscountsPct.push(
          round2(
            ((t.askingPriceTotal - t.confirmedTransactionPriceTotal) / t.askingPriceTotal) * 100,
          ),
        );
      }
    }
  }

  const totalVolume =
    confirmedTotals.length > 0 ? confirmedTotals.reduce((a, b) => a + b, 0) : null;

  return {
    currency: 'TOMAN',
    areaBasisUsed: 'MIXED_PREFER_VERIFIED',
    askingPriceTotalDistribution: computeIqrFilteredDistribution(
      askingTotals,
      params.minSampleThreshold,
    ),
    askingPricePerSqmDistribution: computeIqrFilteredDistribution(
      askingSqms,
      params.minSampleThreshold,
    ),
    agreedPendingPricePerSqmDistribution: computeIqrFilteredDistribution(
      agreedSqms,
      params.minSampleThreshold,
    ),
    confirmedTransactionPriceTotalDistribution: computeIqrFilteredDistribution(
      confirmedTotals,
      params.minSampleThreshold,
    ),
    confirmedTransactionPricePerSqmDistribution: computeIqrFilteredDistribution(
      confirmedSqms,
      params.minSampleThreshold,
    ),
    confirmedTransactionCount: confirmedTx.length,
    confirmedTransactionTotalVolume: totalVolume,
    medianListingPriceReductionPct: computeIqrFilteredDistribution(priceReductionsPct, 1).median,
    medianNegotiatedDiscountFromAskingPct: computeIqrFilteredDistribution(
      negotiatedDiscountsPct,
      1,
    ).median,
    askingVsTransactionSeparationDisclaimer:
      'SALE_MARKET_INVARIANT: Public asking prices, agreed pending prices, and authoritatively confirmed transaction settlement prices are strictly separated.',
  };
}

export function evaluateRentalMarket(params: {
  deduplicatedListings: RawMarketListingObservation[];
  transactions: RawMarketTransactionObservation[];
  windowStartIso: string;
  windowEndIso: string;
  minSampleThreshold: number;
  equivalentRentAnnualRatePct?: number;
}): RentalMarketIndicators {
  const winStartMs = Date.parse(params.windowStartIso);
  const winEndMs = Date.parse(params.windowEndIso);

  const activeRental = params.deduplicatedListings.filter(
    (l) =>
      l.marketType === 'RENTAL' &&
      (l.lifecycleState === 'ACTIVE' || l.lifecycleState === 'REACTIVATED'),
  );
  const newRental = activeRental.filter((l) => {
    const pubMs = Date.parse(l.publishedAtIso);
    return pubMs >= winStartMs && pubMs <= winEndMs;
  });

  const askingRents: number[] = [];
  const askingDeposits: number[] = [];
  const askingRentSqms: number[] = [];
  const eqRents: number[] = [];
  const annualRate = params.equivalentRentAnnualRatePct ?? 30;

  for (const l of activeRental) {
    const area = l.verifiedAreaSqm ?? l.listedAreaSqm;
    const rent = l.monthlyAskingRent ?? null;
    const dep = l.askingSecurityDeposit ?? null;
    if (typeof rent === 'number' && rent >= 0) {
      askingRents.push(rent);
      if (area && area > 0 && rent > 0) askingRentSqms.push(round2(rent / area));
    }
    if (typeof dep === 'number' && dep >= 0) {
      askingDeposits.push(dep);
    }
    if (typeof rent === 'number' && typeof dep === 'number') {
      eqRents.push(round2(rent + (dep * (annualRate / 100)) / 12));
    }
  }

  const rentalTx = params.transactions.filter((t) => t.marketType === 'RENTAL');
  const agreedUnverified = rentalTx.filter(
    (t) => t.verificationClassification !== 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
  );
  const confirmedRental = rentalTx.filter(
    (t) => t.verificationClassification === 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
  );

  const confRents = confirmedRental
    .map((t) => t.confirmedMonthlyRent)
    .filter((v): v is number => typeof v === 'number' && v >= 0);
  const confDeps = confirmedRental
    .map((t) => t.confirmedSecurityDeposit)
    .filter((v): v is number => typeof v === 'number' && v >= 0);

  return {
    currency: 'TOMAN',
    activeRentalListingCount: activeRental.length,
    newRentalListingCount: newRental.length,
    askingMonthlyRentDistribution: computeIqrFilteredDistribution(
      askingRents,
      params.minSampleThreshold,
    ),
    askingSecurityDepositDistribution: computeIqrFilteredDistribution(
      askingDeposits,
      params.minSampleThreshold,
    ),
    askingMonthlyRentPerSqmDistribution: computeIqrFilteredDistribution(
      askingRentSqms,
      params.minSampleThreshold,
    ),
    agreedUnverifiedRentalCount: agreedUnverified.length,
    confirmedRentalAgreementCount: confirmedRental.length,
    confirmedMonthlyRentDistribution: computeIqrFilteredDistribution(
      confRents,
      params.minSampleThreshold,
    ),
    confirmedSecurityDepositDistribution: computeIqrFilteredDistribution(
      confDeps,
      params.minSampleThreshold,
    ),
    analyticalEquivalentRentReference: {
      documentedAnnualConversionRatePct: annualRate,
      formula: 'EquivalentMonthlyRent = MonthlyRent + (SecurityDeposit * (AnnualConversionRatePct / 100)) / 12',
      medianAskingEquivalentMonthlyRent: computeIqrFilteredDistribution(
        eqRents,
        params.minSampleThreshold,
      ).median,
    },
    rentAndDepositSeparationDisclaimer:
      'RENTAL_MARKET_INVARIANT: Monthly rent and security deposit are always maintained as separate financial variables; deposit is never silently merged into monthly rent.',
  };
}

export function evaluateMarketLiquidityAndAbsorption(params: {
  marketType: 'SALE' | 'RENTAL';
  deduplicatedListings: RawMarketListingObservation[];
  transactions: RawMarketTransactionObservation[];
  timeWindowKey: string;
  windowStartIso: string;
  windowEndIso: string;
}): {
  liquidity: MarketLiquidityIndicators;
  absorption: SupplyAbsorptionIndicators;
} {
  const winEndMs = Date.parse(params.windowEndIso);
  const winStartMs = Date.parse(params.windowStartIso);

  const modeListings = params.deduplicatedListings.filter(
    (l) => l.marketType === params.marketType,
  );
  const modeTx = params.transactions.filter(
    (t) =>
      t.marketType === params.marketType &&
      t.verificationClassification === 'AUTHORITATIVELY_CONFIRMED_COMPLETED',
  );

  const completedDomsDays: number[] = [];
  const listingToOfferDays: number[] = [];
  const offerToAgreementDays: number[] = [];
  const agreementToCompletionDays: number[] = [];

  for (const tx of modeTx) {
    if (tx.listingPublishedAtIso && tx.completedAtIso) {
      const d = (Date.parse(tx.completedAtIso) - Date.parse(tx.listingPublishedAtIso)) / 86_400_000;
      if (d >= 0) completedDomsDays.push(round2(d));
    }
    if (tx.listingPublishedAtIso && tx.firstOfferSubmittedAtIso) {
      const d =
        (Date.parse(tx.firstOfferSubmittedAtIso) - Date.parse(tx.listingPublishedAtIso)) /
        86_400_000;
      if (d >= 0) listingToOfferDays.push(round2(d));
    }
    if (tx.firstOfferSubmittedAtIso && tx.agreementReachedAtIso) {
      const d =
        (Date.parse(tx.agreementReachedAtIso) - Date.parse(tx.firstOfferSubmittedAtIso)) /
        86_400_000;
      if (d >= 0) offerToAgreementDays.push(round2(d));
    }
    if (tx.agreementReachedAtIso && tx.completedAtIso) {
      const d =
        (Date.parse(tx.completedAtIso) - Date.parse(tx.agreementReachedAtIso)) / 86_400_000;
      if (d >= 0) agreementToCompletionDays.push(round2(d));
    }
  }

  const rightCensoredDays: number[] = [];
  for (const l of modeListings) {
    if (l.lifecycleState === 'ACTIVE' || l.lifecycleState === 'REACTIVATED') {
      const baseStartMs = Date.parse(l.reactivatedAtIso ?? l.publishedAtIso);
      const currentRunDays = Math.max(0, (winEndMs - baseStartMs) / 86_400_000);
      const cumulativeDays = currentRunDays + (l.priorActiveDaysBeforeReactivation ?? 0);
      rightCensoredDays.push(round2(cumulativeDays));
    }
  }

  const totalCohortCount = modeListings.length + modeTx.length;
  const withdrawnCount = modeListings.filter((l) => l.lifecycleState === 'WITHDRAWN').length;
  const expiredCount = modeListings.filter((l) => l.lifecycleState === 'EXPIRED').length;
  const activeCount = modeListings.filter(
    (l) => l.lifecycleState === 'ACTIVE' || l.lifecycleState === 'REACTIVATED',
  ).length;
  const newSupplyCount = modeListings.filter((l) => {
    const pubMs = Date.parse(l.publishedAtIso);
    return pubMs >= winStartMs && pubMs <= winEndMs;
  }).length;

  const domDist = computeIqrFilteredDistribution(completedDomsDays, 1);

  const liquidity: MarketLiquidityIndicators = {
    marketType: params.marketType,
    observedCompletedSampleCount: completedDomsDays.length,
    rightCensoredActiveListingCount: rightCensoredDays.length,
    medianDaysOnMarketObserved: domDist.median,
    averageDaysOnMarketObserved: domDist.mean,
    medianRightCensoredActiveDays: computeIqrFilteredDistribution(rightCensoredDays, 1).median,
    medianListingToOfferDays: computeIqrFilteredDistribution(listingToOfferDays, 1).median,
    medianOfferToAgreementDays: computeIqrFilteredDistribution(offerToAgreementDays, 1).median,
    medianAgreementToCompletionDays: computeIqrFilteredDistribution(
      agreementToCompletionDays,
      1,
    ).median,
    withdrawalRatePct:
      totalCohortCount > 0 ? round2((withdrawnCount / totalCohortCount) * 100) : null,
    expirationRatePct:
      totalCohortCount > 0 ? round2((expiredCount / totalCohortCount) * 100) : null,
    completionRatePct:
      totalCohortCount > 0 ? round2((modeTx.length / totalCohortCount) * 100) : null,
    censoringAndReactivationMethodologyNote:
      'LIQUIDITY_METHODOLOGY: Separates completed transaction durations from right-censored active listings and accumulates priorActiveDaysBeforeReactivation for reactivated listings.',
  };

  const confirmedCount = modeTx.length;
  let absorptionStatus: SupplyAbsorptionIndicators['absorptionStatus'] = 'AVAILABLE_OBSERVED';
  if (confirmedCount === 0) {
    absorptionStatus = 'UNAVAILABLE_ZERO_TRANSACTIONS';
  }

  const absorption: SupplyAbsorptionIndicators = {
    timeWindowKey: params.timeWindowKey,
    activeInventoryCount: activeCount,
    newSupplyCount,
    confirmedTransactionsCount: confirmedCount,
    absorptionStatus,
    monthsOfSupply:
      confirmedCount > 0 ? round2(activeCount / confirmedCount) : null,
    inventoryTurnoverRatePct:
      activeCount > 0 && confirmedCount > 0
        ? round2((confirmedCount / activeCount) * 100)
        : null,
    newSupplyAbsorptionRatePct:
      newSupplyCount > 0 && confirmedCount > 0
        ? round2((confirmedCount / newSupplyCount) * 100)
        : null,
    listingToConfirmedTransactionRatio:
      confirmedCount > 0 ? round2(activeCount / confirmedCount) : null,
    absorptionMethodologyDisclaimer:
      'ABSORPTION_INVARIANT: Months of supply (ActiveInventory / MonthlyConfirmedTransactions) requires confirmed transaction volume > 0; inquiries are never substituted for absorption.',
  };

  return { liquidity, absorption };
}
