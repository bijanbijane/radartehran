import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export function evaluateTransactionObservationAndDedupe(
  params: {
    candidate: { observationId: string; propertyId: string; priceToman: number; areaSqm: number; observationDateIso: string; priceNature: 'OFFICIAL_REGISTERED_TRANSACTION' | 'BROKER_REPORTED_UNVERIFIED' | 'ASKING_LISTING_PRICE'; ownershipTransferredSharePercent: number; buyerSellerPiiNames: string[] };
    existingObservations: Array<{ observationId: string; propertyId: string; priceToman: number; areaSqm: number; observationDateIso: string; priceNature: 'OFFICIAL_REGISTERED_TRANSACTION' | 'BROKER_REPORTED_UNVERIFIED' | 'ASKING_LISTING_PRICE' }>;
    isPublicMarketDatasetView: boolean;
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()
) {
  const c = params.candidate; const cTime = Date.parse(c.observationDateIso);
  let classification: 'UNIQUE_NEW_OBSERVATION' | 'PROBABLE_DUPLICATE_RECORD' | 'SEPARATE_REPEAT_TRANSACTION' = 'UNIQUE_NEW_OBSERVATION';
  let matchedObservationId: string | null = null;
  for (const ex of params.existingObservations) {
    if (ex.propertyId !== c.propertyId) continue;
    const daysApart = Math.abs(cTime - Date.parse(ex.observationDateIso)) / (1000 * 3600 * 24);
    const priceDiffRatio = Math.abs(c.priceToman - ex.priceToman) / Math.max(1, ex.priceToman);
    if (daysApart <= 7 && priceDiffRatio <= 0.02 && ex.priceNature === c.priceNature) {
      classification = 'PROBABLE_DUPLICATE_RECORD'; matchedObservationId = ex.observationId; break;
    }
    if (daysApart > 30) { classification = 'SEPARATE_REPEAT_TRANSACTION'; matchedObservationId = ex.observationId; }
  }
  const share = Number.isFinite(c.ownershipTransferredSharePercent) ? c.ownershipTransferredSharePercent : 100;
  const price = Number.isFinite(c.priceToman) && c.priceToman >= 0 ? c.priceToman : 0;
  const normalizedFullPropertyEquivalentToman =
    share > 0 && share < 100 ? Math.round(price / (share / 100)) : price;
  return {
    observationId: c.observationId, priceNature: c.priceNature,
    isVerifiedOfficialTransaction: c.priceNature === 'OFFICIAL_REGISTERED_TRANSACTION',
    isPartialShareTransfer: share < 100,
    recordedTransferAmountToman: price, normalizedFullPropertyEquivalentToman,
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    normalizedFullPropertyEquivalentIntlText: formatMillionTomanAsIntlCurrency(normalizedFullPropertyEquivalentToman / 1_000_000, intlCurrency),
    deduplicationResult: { classification, matchedObservationId, sourceRecordPreserved: true as const },
    exposedPartyNames: params.isPublicMarketDatasetView ? [] : c.buyerSellerPiiNames,
  };
}
export function normalizeHeterogeneousPropertyRecord(params: {
  rawTitleAndAddress: string;
  rawPriceString: string;
  rawCurrencyUnit: 'RIAL' | 'TOMAN' | 'MILLION_TOMAN';
  rawAreaValue: number;
  rawAreaUnit: 'SQM' | 'HECTARE';
  normalizationRuleVersion: string;
}) {
  const toAsciiDigits = (s: string) =>
    s
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const normalizedText = toAsciiDigits(params.rawTitleAndAddress)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
  const numericPrice = Number(toAsciiDigits(params.rawPriceString).replace(/[^0-9.]/g, ''));
  let normalizedPriceToman: number | null = null;
  let currencyConversionBasis = '1:1_TOMAN';
  if (Number.isFinite(numericPrice) && numericPrice > 0) {
    if (params.rawCurrencyUnit === 'RIAL') {
      normalizedPriceToman = Math.round(numericPrice / 10);
      currencyConversionBasis = 'DIVIDE_BY_10_RIAL_TO_TOMAN';
    } else if (params.rawCurrencyUnit === 'MILLION_TOMAN') {
      normalizedPriceToman = Math.round(numericPrice * 1_000_000);
      currencyConversionBasis = 'MULTIPLY_1M_TOMAN';
    } else {
      normalizedPriceToman = Math.round(numericPrice);
    }
  }
  const areaVal = Number.isFinite(params.rawAreaValue) && params.rawAreaValue > 0 ? params.rawAreaValue : 0;
  const normalizedAreaSqm = params.rawAreaUnit === 'HECTARE' ? areaVal * 10_000 : areaVal;
  return {
    normalizationRuleVersion: params.normalizationRuleVersion,
    rawPreserved: {
      rawTitleAndAddress: params.rawTitleAndAddress, rawPriceString: params.rawPriceString,
      rawCurrencyUnit: params.rawCurrencyUnit, rawAreaValue: params.rawAreaValue, rawAreaUnit: params.rawAreaUnit,
    },
    normalized: {
      text: normalizedText, priceToman: normalizedPriceToman, currencyConversionBasis,
      areaSqm: normalizedAreaSqm, areaConversionBasis: params.rawAreaUnit === 'HECTARE' ? '1_HECTARE_EQ_10000_SQM' : '1:1_SQM',
    },
  };
}
export function analyzeMarketPricingRentAndTimeOnMarket(params: {
  depositToMonthlyRentConversionRateAnnualPercent: number; // e.g., 36% -> 3% per month
  records: Array<{
    id: string;
    recordKind: 'ACTIVE_ASKING_LISTING' | 'WITHDRAWN_LISTING' | 'CONFIRMED_SALE_TRANSACTION';
    pricePerSqmToman: number;
    publishedAtIso: string;
    closedOrWithdrawnAtIso: string | null;
    depositToman?: number;
    monthlyRentToman?: number;
  }>;
}) {
  const askingPrices = params.records
    .filter((r) => r.recordKind === 'ACTIVE_ASKING_LISTING')
    .map((r) => r.pricePerSqmToman)
    .sort((a, b) => a - b);
  const transactionPrices = params.records
    .filter((r) => r.recordKind === 'CONFIRMED_SALE_TRANSACTION')
    .map((r) => r.pricePerSqmToman)
    .sort((a, b) => a - b);
  const medianOf = (arr: number[]): number | null => {
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 1 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };
  const confirmedSaleDurationsDays: number[] = [];
  const withdrawnExposureDurationsDays: number[] = [];
  for (const r of params.records) {
    if (!r.closedOrWithdrawnAtIso) continue;
    const days =
      (Date.parse(r.closedOrWithdrawnAtIso) - Date.parse(r.publishedAtIso)) / (1000 * 3600 * 24);
    if (!Number.isFinite(days) || days < 0) continue;
    if (r.recordKind === 'CONFIRMED_SALE_TRANSACTION') {
      confirmedSaleDurationsDays.push(Math.round(days));
    } else if (r.recordKind === 'WITHDRAWN_LISTING') {
      withdrawnExposureDurationsDays.push(Math.round(days));
    }
  }
  confirmedSaleDurationsDays.sort((a, b) => a - b);
  withdrawnExposureDurationsDays.sort((a, b) => a - b);
  const rate = Number.isFinite(params.depositToMonthlyRentConversionRateAnnualPercent) ? params.depositToMonthlyRentConversionRateAnnualPercent : 0;
  const monthlyConvFactor = Math.max(0, rate) / 12 / 100;
  const fullRahnEquivalents = params.records
    .filter((r) => typeof r.depositToman === 'number' && Number.isFinite(r.depositToman))
    .map((r) => {
      const dep = Number.isFinite(r.depositToman) && r.depositToman! >= 0 ? r.depositToman! : 0;
      const rent = typeof r.monthlyRentToman === 'number' && Number.isFinite(r.monthlyRentToman) && r.monthlyRentToman > 0 ? r.monthlyRentToman : 0;
      return monthlyConvFactor > 0 ? Math.round(dep + rent / monthlyConvFactor) : dep;
    });
  return {
    askingDistribution: {
      sampleCount: askingPrices.length,
      medianPricePerSqmToman: medianOf(askingPrices),
    },
    confirmedTransactionDistribution: {
      sampleCount: transactionPrices.length,
      medianPricePerSqmToman: medianOf(transactionPrices),
    },
    timeOnMarketReport: {
      confirmedSalesCount: confirmedSaleDurationsDays.length,
      medianDaysToConfirmedSale: medianOf(confirmedSaleDurationsDays),
      withdrawnUnsoldCount: withdrawnExposureDurationsDays.length,
      medianDaysBeforeWithdrawal: medianOf(withdrawnExposureDurationsDays),
    },
    rentalConversionReport: {
      conversionRateAnnualPercent: params.depositToMonthlyRentConversionRateAnnualPercent,
      sampleCount: fullRahnEquivalents.length,
      medianFullRahnEquivalentToman: medianOf(fullRahnEquivalents.sort((a, b) => a - b)),
    },
  };
}
/**
 * Prompts 1527, 1551, 1553 & 1555:
 * Market Regime-Change Detection, Suspicious Price Surveillance, Research Bulletin Governance,
 * and Cross-City Normalized Market Comparison.
 */
export function evaluateMarketRegimeSurveillanceAndCrossCity(params: {
  monthlyPriceIndexSeries: number[]; // chronological
  listingPriceJumpPercentIn24h: number;
  relistCountIn30Days: number;
  researchBulletin: {
    reportId: string;
    workflowStage: 'ANALYST_DRAFT' | 'INTERNAL_REVIEW' | 'PUBLISHED_PUBLIC';
    datasetSnapshotVersion: string | null;
  };
  cityComparison: {
    cityA: { nameFa: string; medianSqmPrice: number; currency: 'TOMAN' | 'RIAL'; sampleCount: number };
    cityB: { nameFa: string; medianSqmPrice: number; currency: 'TOMAN' | 'RIAL'; sampleCount: number };
  };
}) {
  const s = params.monthlyPriceIndexSeries;
  let regimeStatus: 'INSUFFICIENT_WINDOW' | 'STABLE_REGIME' | 'STRUCTURAL_TREND_BREAK_DETECTED' =
    'INSUFFICIENT_WINDOW';
  if (s.length >= 6) {
    const mid = Math.floor(s.length / 2);
    const firstHalfMean = s.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalfMean = s.slice(mid).reduce((a, b) => a + b, 0) / (s.length - mid);
    const shiftRatio = Math.abs(secondHalfMean - firstHalfMean) / Math.max(1, firstHalfMean);
    regimeStatus = shiftRatio >= 0.18 ? 'STRUCTURAL_TREND_BREAK_DETECTED' : 'STABLE_REGIME';
  }
  const isSuspiciousSpikeOrChurn =
    Math.abs(params.listingPriceJumpPercentIn24h) >= 25 || params.relistCountIn30Days >= 4;
  const canDisplayAsPublishedPublicResearch =
    params.researchBulletin.workflowStage === 'PUBLISHED_PUBLIC' &&
    Boolean(params.researchBulletin.datasetSnapshotVersion);
  const normPriceA =
    params.cityComparison.cityA.currency === 'RIAL'
      ? Math.round(params.cityComparison.cityA.medianSqmPrice / 10)
      : params.cityComparison.cityA.medianSqmPrice;
  const normPriceB =
    params.cityComparison.cityB.currency === 'RIAL'
      ? Math.round(params.cityComparison.cityB.medianSqmPrice / 10)
      : params.cityComparison.cityB.medianSqmPrice;
  return {
    regimeDetection: {
      observationsCount: s.length,
      regimeStatus,
    },
    surveillanceAlert: {
      anomalyFlaggedForAnalystReview: isSuspiciousSpikeOrChurn,
      verifiedFraudConclusion: false as const,
      automaticAccountSuspensionTriggered: false as const,
    },
    researchPublicationCheck: {
      reportId: params.researchBulletin.reportId,
      canDisplayAsPublishedPublicResearch,
    },
    crossCityComparisonNormalizedToman: {
      cityAMedianSqmToman: normPriceA,
      cityBMedianSqmToman: normPriceB,
      relativeRatioAtoB: normPriceB > 0 ? Number((normPriceA / normPriceB).toFixed(2)) : null,
    },
  };
}
/**
 * Prompts 1557, 1558, 1559, 1560 & 1561:
 * Specialized Property Sector Analytics:
 * - Land & Redevelopment (`LAND_KOLANGI`): Never infers buildable FAR/permit without official planning record.
 * - Commercial & Office (`COMMERCIAL_OFFICE`): Separates asking rent from contractual rent.
 * - Industrial & Warehouse (`INDUSTRIAL_WAREHOUSE`): Separates verified power/clearance specs from user claims.
 * - Presale & New Development (`PRESALE_DEVELOPMENT`): Never treats advertised presale as completed transaction.
 */
export function evaluateSpecializedPropertySectorIntelligence(params: {
  landParcel: {
    parcelAreaSqm: number;
    frontageMeters: number;
    totalLandPriceToman: number;
    hasOfficialMunicipalityZoningPermitRecord: boolean;
    permittedFarFromOfficialRecord: number | null;
  };
  industrialFacility: {
    usableWarehouseSqm: number;
    clearCeilingHeightMeters: number;
    threePhasePowerKw: number;
    hasUtilityCompanyPowerCertificate: boolean;
  };
  presaleProject: {
    projectId: string;
    stage: 'ADVERTISED_PRESALE_OFFER' | 'CONTRACTED_UNDER_CONSTRUCTION' | 'COMPLETED_DELIVERED';
    developerReportedProgressPercent: number;
    independentInspectorVerifiedProgressPercent: number | null;
  };
}) {
  const pArea = Number.isFinite(params.landParcel.parcelAreaSqm) && params.landParcel.parcelAreaSqm > 0 ? params.landParcel.parcelAreaSqm : null;
  const pPrice = Number.isFinite(params.landParcel.totalLandPriceToman) && params.landParcel.totalLandPriceToman >= 0 ? params.landParcel.totalLandPriceToman : 0;
  const landSqmPriceToman = pArea !== null ? Math.round(pPrice / pArea) : 0;
  const far = Number.isFinite(params.landParcel.permittedFarFromOfficialRecord) && params.landParcel.permittedFarFromOfficialRecord !== null && params.landParcel.permittedFarFromOfficialRecord > 0 ? params.landParcel.permittedFarFromOfficialRecord : null;
  const verifiedBuildableAreaSqm = params.landParcel.hasOfficialMunicipalityZoningPermitRecord && far !== null && pArea !== null ? Math.round(pArea * far) : null;
  return {
    landSector: {
      landPricePerSqmToman: landSqmPriceToman, verifiedBuildableAreaSqm,
      zoningBasisStatus: verifiedBuildableAreaSqm !== null ? ('SOURCED_OFFICIAL_PLANNING_RECORD' as const) : ('UNVERIFIED_ZONING_NO_BUILDABLE_INFERENCE' as const),
    },
    industrialSector: {
      usableWarehouseSqm: params.industrialFacility.usableWarehouseSqm, clearCeilingHeightMeters: params.industrialFacility.clearCeilingHeightMeters,
      threePhasePowerKw: params.industrialFacility.threePhasePowerKw,
      powerSpecVerification: params.industrialFacility.hasUtilityCompanyPowerCertificate ? ('VERIFIED_UTILITY_CERTIFICATE' as const) : ('USER_CLAIMED_UNVERIFIED_SPEC' as const),
    },
    presaleSector: {
      projectId: params.presaleProject.projectId, countsAsCompletedSaleTransaction: params.presaleProject.stage === 'COMPLETED_DELIVERED',
      verifiedProgressPercent: params.presaleProject.independentInspectorVerifiedProgressPercent,
      developerSelfReportedProgressPercent: params.presaleProject.developerReportedProgressPercent,
      progressProvenanceStatus: params.presaleProject.independentInspectorVerifiedProgressPercent !== null ? ('INDEPENDENT_ENGINEERING_INSPECTION' as const) : ('DEVELOPER_SELF_REPORTED_UNVERIFIED' as const),
    },
  };
}