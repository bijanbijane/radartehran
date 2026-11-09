import type {
  AuthoritativeHousingMarketSummary,
  CanonicalUrbanGeographicEntity,
  RawDemographicSourceRecord,
  RawEconomicSourceRecord,
  SourceDatasetProvenanceRef,
} from '../contracts/externalAdapters';
import type {
  DataQualityStatusCode,
  DemographicIndicatorSection,
  EconomicIndicatorSection,
  HousingMarketIntelligenceSection,
  IndicatorValueEnvelope,
  MeasurementUnitCode,
} from '../domain/types';
import { CURRENT_URBAN_METHODOLOGY_VERSION } from '../methodologies/methodologyRegistry';

export const MINIMUM_POPULATION_PRIVACY_THRESHOLD = 50;
export const MINIMUM_HOUSEHOLD_PRIVACY_THRESHOLD = 15;

export function isProvenanceStale(
  prov: SourceDatasetProvenanceRef,
  referenceEpochMs: number,
): boolean {
  const obsMs = Date.parse(prov.observationTimestampIso);
  if (!Number.isFinite(obsMs)) return true;
  const maxAgeMs = prov.freshnessMaxAgeDays * 24 * 60 * 60 * 1000;
  return referenceEpochMs - obsMs > maxAgeMs;
}

export function deriveQualityStatusFromProvenance(
  prov: SourceDatasetProvenanceRef,
  referenceEpochMs: number,
): { qualityStatus: DataQualityStatusCode; isStale: boolean } {
  const isStale = isProvenanceStale(prov, referenceEpochMs);
  if (prov.verificationState === 'REJECTED_INVALID') {
    return { qualityStatus: 'REJECTED', isStale };
  }
  if (prov.verificationState === 'CONFLICTING_SOURCES') {
    return { qualityStatus: 'CONFLICTING', isStale };
  }
  if (isStale) {
    return { qualityStatus: 'STALE', isStale: true };
  }
  if (prov.verificationState === 'IMPORTED_NOT_INDEPENDENTLY_VERIFIED') {
    return { qualityStatus: 'IMPORTED_NOT_INDEPENDENTLY_VERIFIED', isStale: false };
  }
  if (prov.verificationState === 'ESTIMATED_MODEL_OUTPUT') {
    return { qualityStatus: 'ESTIMATED', isStale: false };
  }
  return { qualityStatus: 'VERIFIED_SOURCE', isStale: false };
}

export function makeUnavailableEnvelope<T = number>(
  indicatorId: string,
  unit: MeasurementUnitCode,
  evidenceClass: IndicatorValueEnvelope<T>['evidenceClass'],
  reason: string,
  methodologyVersion = CURRENT_URBAN_METHODOLOGY_VERSION,
): IndicatorValueEnvelope<T> {
  return {
    indicatorId,
    availability: 'UNAVAILABLE_MISSING_SOURCE',
    value: null,
    unit,
    dataNature: 'DERIVED_ANALYTICAL_VALUE',
    evidenceClass,
    methodologyVersion,
    qualityStatus: 'INSUFFICIENT_DATA',
    isStale: false,
    suppressionOrUnavailableReason: reason,
    provenanceRefs: [],
  };
}

export function makePrivacySuppressedEnvelope<T = number>(
  indicatorId: string,
  unit: MeasurementUnitCode,
  evidenceClass: IndicatorValueEnvelope<T>['evidenceClass'],
  provDatasetId: string,
  reason: string,
  methodologyVersion = CURRENT_URBAN_METHODOLOGY_VERSION,
): IndicatorValueEnvelope<T> {
  return {
    indicatorId,
    availability: 'SUPPRESSED_PRIVACY_THRESHOLD',
    value: null,
    unit,
    dataNature: 'DERIVED_ANALYTICAL_VALUE',
    evidenceClass,
    methodologyVersion,
    qualityStatus: 'INCOMPLETE',
    isStale: false,
    suppressionOrUnavailableReason: reason,
    provenanceRefs: [provDatasetId],
  };
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function evaluateDemographicIndicators(params: {
  geo: CanonicalUrbanGeographicEntity;
  source: RawDemographicSourceRecord | null;
  referenceEpochMs: number;
  methodologyVersion?: string;
}): DemographicIndicatorSection {
  const mVer = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
  const disclaimer =
    'PRIVACY_AND_NON_PROFILING: Aggregated population statistics only. Small populations (<50 residents or <15 households) are suppressed. Never used for individual resident profiling.';

  if (!params.source) {
    return {
      sectionAvailable: false,
      dataBasis: 'UNAVAILABLE',
      privacyAggregationThresholdApplied: false,
      minimumPopulationThreshold: MINIMUM_POPULATION_PRIVACY_THRESHOLD,
      totalPopulation: makeUnavailableEnvelope('urb.demo.population_total', 'PERSONS', 'CENSUS_OBSERVED', 'No demographic dataset available for reporting period.', mVer),
      populationDensityPerSqKm: makeUnavailableEnvelope('urb.demo.population_density_sqkm', 'PERSONS_PER_SQ_KM', 'CENSUS_OBSERVED', 'Missing population source.', mVer),
      householdCount: makeUnavailableEnvelope('urb.demo.household_count', 'HOUSEHOLDS', 'CENSUS_OBSERVED', 'Missing demographic source.', mVer),
      averageHouseholdSize: makeUnavailableEnvelope('urb.demo.avg_household_size', 'PERSONS_PER_HOUSEHOLD', 'CENSUS_OBSERVED', 'Missing demographic source.', mVer),
      residentialDensityHouseholdsPerSqKm: makeUnavailableEnvelope('urb.demo.residential_density_sqkm', 'HOUSEHOLDS_PER_SQ_KM', 'CENSUS_OBSERVED', 'Missing demographic source.', mVer),
      populationChangePct: makeUnavailableEnvelope('urb.demo.population_change_pct', 'PERCENTAGE', 'CENSUS_OBSERVED', 'Missing demographic source.', mVer),
      broadAgeDistributionPct: makeUnavailableEnvelope('urb.demo.age_distribution_pct', 'PERCENTAGE', 'CENSUS_OBSERVED', 'Missing demographic source.', mVer),
      privacyAndNonProfilingDisclaimer: disclaimer,
    };
  }

  const { source, geo } = params;
  const evidenceClass =
    source.dataBasis === 'CENSUS_ENUMERATION' ? 'CENSUS_OBSERVED' : 'STATISTICAL_ESTIMATE';
  const { qualityStatus, isStale } = deriveQualityStatusFromProvenance(
    source.provenance,
    params.referenceEpochMs,
  );
  const provId = source.provenance.datasetId;

  const pop = source.totalPopulation;
  const hh = source.householdCount;

  // Enforce Small-Area Privacy Suppression (Sections 7 & 21)
  if (
    (pop !== null && pop > 0 && pop < MINIMUM_POPULATION_PRIVACY_THRESHOLD) ||
    (hh !== null && hh > 0 && hh < MINIMUM_HOUSEHOLD_PRIVACY_THRESHOLD)
  ) {
    const reason = `Small-area privacy suppression applied: population (${pop ?? 'null'}) < ${MINIMUM_POPULATION_PRIVACY_THRESHOLD} or households (${hh ?? 'null'}) < ${MINIMUM_HOUSEHOLD_PRIVACY_THRESHOLD}.`;
    return {
      sectionAvailable: true,
      dataBasis: source.dataBasis,
      privacyAggregationThresholdApplied: true,
      minimumPopulationThreshold: MINIMUM_POPULATION_PRIVACY_THRESHOLD,
      totalPopulation: makePrivacySuppressedEnvelope('urb.demo.population_total', 'PERSONS', evidenceClass, provId, reason, mVer),
      populationDensityPerSqKm: makePrivacySuppressedEnvelope('urb.demo.population_density_sqkm', 'PERSONS_PER_SQ_KM', evidenceClass, provId, reason, mVer),
      householdCount: makePrivacySuppressedEnvelope('urb.demo.household_count', 'HOUSEHOLDS', evidenceClass, provId, reason, mVer),
      averageHouseholdSize: makePrivacySuppressedEnvelope('urb.demo.avg_household_size', 'PERSONS_PER_HOUSEHOLD', evidenceClass, provId, reason, mVer),
      residentialDensityHouseholdsPerSqKm: makePrivacySuppressedEnvelope('urb.demo.residential_density_sqkm', 'HOUSEHOLDS_PER_SQ_KM', evidenceClass, provId, reason, mVer),
      populationChangePct: makePrivacySuppressedEnvelope('urb.demo.population_change_pct', 'PERCENTAGE', evidenceClass, provId, reason, mVer),
      broadAgeDistributionPct: makePrivacySuppressedEnvelope('urb.demo.age_distribution_pct', 'PERCENTAGE', evidenceClass, provId, reason, mVer),
      privacyAndNonProfilingDisclaimer: disclaimer,
    };
  }

  const totalPopEnv: IndicatorValueEnvelope<number> =
    pop !== null
      ? {
          indicatorId: 'urb.demo.population_total',
          availability: 'AVAILABLE',
          value: pop,
          unit: 'PERSONS',
          dataNature: 'RAW_SOURCE_VALUE',
          evidenceClass,
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: [provId],
        }
      : makeUnavailableEnvelope('urb.demo.population_total', 'PERSONS', evidenceClass, 'totalPopulation is null in source.', mVer);

  const densityEnv: IndicatorValueEnvelope<number> =
    pop !== null && geo.areaSqKm !== null && geo.areaSqKm > 0
      ? {
          indicatorId: 'urb.demo.population_density_sqkm',
          availability: 'AVAILABLE',
          value: round2(pop / geo.areaSqKm),
          unit: 'PERSONS_PER_SQ_KM',
          dataNature: 'DERIVED_ANALYTICAL_VALUE',
          evidenceClass,
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: [provId],
        }
      : makeUnavailableEnvelope(
          'urb.demo.population_density_sqkm',
          'PERSONS_PER_SQ_KM',
          evidenceClass,
          geo.areaSqKm === null ? 'Boundary areaSqKm is unavailable (approximate centroid only).' : 'Population is unavailable.',
          mVer,
        );

  const hhEnv: IndicatorValueEnvelope<number> =
    hh !== null
      ? {
          indicatorId: 'urb.demo.household_count',
          availability: 'AVAILABLE',
          value: hh,
          unit: 'HOUSEHOLDS',
          dataNature: 'RAW_SOURCE_VALUE',
          evidenceClass,
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: [provId],
        }
      : makeUnavailableEnvelope('urb.demo.household_count', 'HOUSEHOLDS', evidenceClass, 'householdCount is null in source.', mVer);

  const avgHhEnv: IndicatorValueEnvelope<number> =
    pop !== null && hh !== null && hh > 0
      ? {
          indicatorId: 'urb.demo.avg_household_size',
          availability: 'AVAILABLE',
          value: round2(pop / hh),
          unit: 'PERSONS_PER_HOUSEHOLD',
          dataNature: 'DERIVED_ANALYTICAL_VALUE',
          evidenceClass,
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: [provId],
        }
      : makeUnavailableEnvelope('urb.demo.avg_household_size', 'PERSONS_PER_HOUSEHOLD', evidenceClass, 'Requires both totalPopulation and householdCount > 0.', mVer);

  const resDensityEnv: IndicatorValueEnvelope<number> =
    hh !== null && geo.areaSqKm !== null && geo.areaSqKm > 0
      ? {
          indicatorId: 'urb.demo.residential_density_sqkm',
          availability: 'AVAILABLE',
          value: round2(hh / geo.areaSqKm),
          unit: 'HOUSEHOLDS_PER_SQ_KM',
          dataNature: 'DERIVED_ANALYTICAL_VALUE',
          evidenceClass,
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: [provId],
        }
      : makeUnavailableEnvelope('urb.demo.residential_density_sqkm', 'HOUSEHOLDS_PER_SQ_KM', evidenceClass, 'Requires householdCount and verified areaSqKm > 0.', mVer);

  const popChangeEnv: IndicatorValueEnvelope<number> =
    pop !== null && source.previousPeriodPopulation !== null && source.previousPeriodPopulation > 0
      ? {
          indicatorId: 'urb.demo.population_change_pct',
          availability: 'AVAILABLE',
          value: round2(((pop - source.previousPeriodPopulation) / source.previousPeriodPopulation) * 100),
          unit: 'PERCENTAGE',
          dataNature: 'DERIVED_ANALYTICAL_VALUE',
          evidenceClass,
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: [provId],
        }
      : makeUnavailableEnvelope('urb.demo.population_change_pct', 'PERCENTAGE', evidenceClass, 'previousPeriodPopulation is unavailable.', mVer);

  const ageDistEnv: IndicatorValueEnvelope<{
    under15Pct: number;
    workingAge15To64Pct: number;
    senior65PlusPct: number;
  }> = source.ageDistributionBroadPercentages
    ? {
        indicatorId: 'urb.demo.age_distribution_pct',
        availability: 'AVAILABLE',
        value: source.ageDistributionBroadPercentages,
        unit: 'PERCENTAGE',
        dataNature: 'RAW_SOURCE_VALUE',
        evidenceClass,
        methodologyVersion: mVer,
        qualityStatus,
        isStale,
        provenanceRefs: [provId],
      }
    : makeUnavailableEnvelope('urb.demo.age_distribution_pct', 'PERCENTAGE', evidenceClass, 'Age distribution unavailable.', mVer);

  return {
    sectionAvailable: true,
    dataBasis: source.dataBasis,
    privacyAggregationThresholdApplied: false,
    minimumPopulationThreshold: MINIMUM_POPULATION_PRIVACY_THRESHOLD,
    totalPopulation: totalPopEnv,
    populationDensityPerSqKm: densityEnv,
    householdCount: hhEnv,
    averageHouseholdSize: avgHhEnv,
    residentialDensityHouseholdsPerSqKm: resDensityEnv,
    populationChangePct: popChangeEnv,
    broadAgeDistributionPct: ageDistEnv,
    privacyAndNonProfilingDisclaimer: disclaimer,
  };
}

export function evaluateEconomicIndicators(params: {
  geo: CanonicalUrbanGeographicEntity;
  source: RawEconomicSourceRecord | null;
  housingSummary: AuthoritativeHousingMarketSummary | null;
  referenceEpochMs: number;
  methodologyVersion?: string;
}): EconomicIndicatorSection {
  const mVer = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
  const disclaimer =
    'NON_DISCRIMINATORY_ECONOMIC_METHODOLOGY: Aggregated business and affordability indicators only. Never labels neighborhoods as safe/unsafe or desirable/undesirable, and never infers individual financial status.';

  if (!params.source) {
    return {
      sectionAvailable: false,
      currency: 'TOMAN',
      activeBusinessEnterprisesCount: makeUnavailableEnvelope('urb.econ.active_businesses_count', 'COUNT', 'STATISTICAL_ESTIMATE', 'No economic source dataset.', mVer),
      businessActivityDensityPerSqKm: makeUnavailableEnvelope('urb.econ.business_density_sqkm', 'FACILITIES_PER_SQ_KM', 'STATISTICAL_ESTIMATE', 'No economic source dataset.', mVer),
      localServiceBusinessDensityPerSqKm: makeUnavailableEnvelope('urb.econ.service_business_density_sqkm', 'FACILITIES_PER_SQ_KM', 'STATISTICAL_ESTIMATE', 'No economic source dataset.', mVer),
      employmentRatePct: makeUnavailableEnvelope('urb.econ.employment_rate_pct', 'PERCENTAGE', 'STATISTICAL_ESTIMATE', 'No economic source dataset.', mVer),
      medianAnnualHouseholdIncome: makeUnavailableEnvelope('urb.econ.median_annual_income', 'TOMAN_PER_SQM', 'STATISTICAL_ESTIMATE', 'No economic source dataset.', mVer),
      costOfLivingIndexBase100: makeUnavailableEnvelope('urb.econ.cost_of_living_index', 'INDEX_BASE_100', 'MODELED_INDICATOR', 'No economic source dataset.', mVer),
      housingPriceToAnnualIncomeRatio: makeUnavailableEnvelope('urb.econ.housing_affordability_ratio', 'PRICE_TO_INCOME_RATIO', 'MODELED_INDICATOR', 'No economic source dataset.', mVer),
      nonDiscriminatoryMethodologyDisclaimer: disclaimer,
    };
  }

  const { source, geo, housingSummary } = params;
  const evClass =
    source.dataBasis === 'OBSERVED_STATISTIC' ? 'DIRECT_MEASUREMENT' : 'MODELED_INDICATOR';
  const { qualityStatus, isStale } = deriveQualityStatusFromProvenance(
    source.provenance,
    params.referenceEpochMs,
  );
  const provId = source.provenance.datasetId;

  const bizCount = source.activeBusinessEnterprisesCount;
  const srvCount = source.localServiceBusinessesCount;

  const refHousingSqm =
    housingSummary &&
    housingSummary.currency === source.currency &&
    housingSummary.reportingPeriodKey === source.provenance.reportingPeriodKey
      ? (housingSummary.confirmedTransactionMetrics.confirmedSaleTransactionPricePerSqmMedian ??
        housingSummary.askingPriceMetrics.saleAskingPricePerSqmMedian)
      : null;

  const pirEnv: IndicatorValueEnvelope<number> =
    refHousingSqm !== null &&
    source.medianAnnualHouseholdIncomeAmount !== null &&
    source.medianAnnualHouseholdIncomeAmount > 0
      ? {
          indicatorId: 'urb.econ.housing_affordability_ratio',
          availability: 'AVAILABLE',
          value: round2((80 * refHousingSqm) / source.medianAnnualHouseholdIncomeAmount),
          unit: 'PRICE_TO_INCOME_RATIO',
          dataNature: 'DERIVED_ANALYTICAL_VALUE',
          evidenceClass: 'MODELED_INDICATOR',
          methodologyVersion: mVer,
          qualityStatus,
          isStale,
          provenanceRefs: housingSummary
            ? [provId, housingSummary.provenance.datasetId]
            : [provId],
        }
      : makeUnavailableEnvelope(
          'urb.econ.housing_affordability_ratio',
          'PRICE_TO_INCOME_RATIO',
          'MODELED_INDICATOR',
          'Requires matching currency/period housing price per sqm and median annual household income.',
          mVer,
        );

  return {
    sectionAvailable: true,
    currency: source.currency,
    activeBusinessEnterprisesCount:
      bizCount !== null
        ? {
            indicatorId: 'urb.econ.active_businesses_count',
            availability: 'AVAILABLE',
            value: bizCount,
            unit: 'COUNT',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: evClass,
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.econ.active_businesses_count', 'COUNT', evClass, 'Missing activeBusinessEnterprisesCount.', mVer),
    businessActivityDensityPerSqKm:
      bizCount !== null && geo.areaSqKm !== null && geo.areaSqKm > 0
        ? {
            indicatorId: 'urb.econ.business_density_sqkm',
            availability: 'AVAILABLE',
            value: round2(bizCount / geo.areaSqKm),
            unit: 'FACILITIES_PER_SQ_KM',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: evClass,
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.econ.business_density_sqkm', 'FACILITIES_PER_SQ_KM', evClass, 'Requires business count and verified areaSqKm.', mVer),
    localServiceBusinessDensityPerSqKm:
      srvCount !== null && geo.areaSqKm !== null && geo.areaSqKm > 0
        ? {
            indicatorId: 'urb.econ.service_business_density_sqkm',
            availability: 'AVAILABLE',
            value: round2(srvCount / geo.areaSqKm),
            unit: 'FACILITIES_PER_SQ_KM',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: evClass,
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.econ.service_business_density_sqkm', 'FACILITIES_PER_SQ_KM', evClass, 'Requires local service count and areaSqKm.', mVer),
    employmentRatePct:
      source.employmentRatePct !== null
        ? {
            indicatorId: 'urb.econ.employment_rate_pct',
            availability: 'AVAILABLE',
            value: source.employmentRatePct,
            unit: 'PERCENTAGE',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: evClass,
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.econ.employment_rate_pct', 'PERCENTAGE', evClass, 'Missing employmentRatePct.', mVer),
    medianAnnualHouseholdIncome:
      source.medianAnnualHouseholdIncomeAmount !== null
        ? {
            indicatorId: 'urb.econ.median_annual_income',
            availability: 'AVAILABLE',
            value: source.medianAnnualHouseholdIncomeAmount,
            unit: 'TOMAN_PER_SQM',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: evClass,
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.econ.median_annual_income', 'TOMAN_PER_SQM', evClass, 'Missing medianAnnualHouseholdIncomeAmount.', mVer),
    costOfLivingIndexBase100:
      source.costOfLivingIndexBase100 !== null
        ? {
            indicatorId: 'urb.econ.cost_of_living_index',
            availability: 'AVAILABLE',
            value: source.costOfLivingIndexBase100,
            unit: 'INDEX_BASE_100',
            dataNature: 'DERIVED_ANALYTICAL_VALUE',
            evidenceClass: 'MODELED_INDICATOR',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.econ.cost_of_living_index', 'INDEX_BASE_100', 'MODELED_INDICATOR', 'Missing costOfLivingIndexBase100.', mVer),
    housingPriceToAnnualIncomeRatio: pirEnv,
    nonDiscriminatoryMethodologyDisclaimer: disclaimer,
  };
}

export function evaluateHousingMarketIndicators(params: {
  summary: AuthoritativeHousingMarketSummary | null;
  referenceEpochMs: number;
  methodologyVersion?: string;
}): HousingMarketIntelligenceSection {
  const mVer = params.methodologyVersion ?? CURRENT_URBAN_METHODOLOGY_VERSION;
  const disclaimer =
    'HOUSING_MARKET_SEPARATION_INVARIANT: Public asking prices, confirmed transaction settlement prices, and Valuation module estimates are strictly separated. Disappearance of a listing is never counted as a completed transaction.';

  if (!params.summary) {
    return {
      sectionAvailable: false,
      currency: 'TOMAN',
      activeSaleListingCount: makeUnavailableEnvelope('urb.housing.active_sale_listings', 'COUNT', 'ASKING_PRICE_METRIC', 'No housing market summary available.', mVer),
      activeRentalListingCount: makeUnavailableEnvelope('urb.housing.active_rental_listings', 'COUNT', 'ASKING_PRICE_METRIC', 'No housing market summary available.', mVer),
      saleAskingPricePerSqmMedian: makeUnavailableEnvelope('urb.housing.sale_asking_sqm_median', 'TOMAN_PER_SQM', 'ASKING_PRICE_METRIC', 'No housing market summary available.', mVer),
      monthlyRentAskingPerSqmMedian: makeUnavailableEnvelope('urb.housing.rent_asking_sqm_median', 'TOMAN_PER_SQM', 'ASKING_PRICE_METRIC', 'No housing market summary available.', mVer),
      confirmedSaleTransactionCount: makeUnavailableEnvelope('urb.housing.confirmed_tx_count', 'COUNT', 'CONFIRMED_TRANSACTION_METRIC', 'No housing market summary available.', mVer),
      confirmedSaleTransactionPricePerSqmMedian: makeUnavailableEnvelope('urb.housing.confirmed_tx_sqm_median', 'TOMAN_PER_SQM', 'CONFIRMED_TRANSACTION_METRIC', 'No housing market summary available.', mVer),
      authoritativeValuationReferencePerSqm: makeUnavailableEnvelope('urb.housing.valuation_ref_sqm', 'TOMAN_PER_SQM', 'VALUATION_MODEL_REFERENCE', 'No housing market summary available.', mVer),
      valuationTrendChangePct: makeUnavailableEnvelope('urb.housing.valuation_trend_pct', 'PERCENTAGE', 'VALUATION_MODEL_REFERENCE', 'No housing market summary available.', mVer),
      authoritativeValuationModelVersion: null,
      marketCategorySeparationDisclaimer: disclaimer,
    };
  }

  const { summary } = params;
  const { qualityStatus, isStale } = deriveQualityStatusFromProvenance(
    summary.provenance,
    params.referenceEpochMs,
  );
  const provId = summary.provenance.datasetId;

  return {
    sectionAvailable: true,
    currency: summary.currency,
    activeSaleListingCount: {
      indicatorId: 'urb.housing.active_sale_listings',
      availability: 'AVAILABLE',
      value: summary.askingPriceMetrics.activeSaleListingCount,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'ASKING_PRICE_METRIC',
      methodologyVersion: mVer,
      qualityStatus,
      isStale,
      provenanceRefs: [provId],
    },
    activeRentalListingCount: {
      indicatorId: 'urb.housing.active_rental_listings',
      availability: 'AVAILABLE',
      value: summary.askingPriceMetrics.activeRentalListingCount,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'ASKING_PRICE_METRIC',
      methodologyVersion: mVer,
      qualityStatus,
      isStale,
      provenanceRefs: [provId],
    },
    saleAskingPricePerSqmMedian:
      summary.askingPriceMetrics.saleAskingPricePerSqmMedian !== null
        ? {
            indicatorId: 'urb.housing.sale_asking_sqm_median',
            availability: 'AVAILABLE',
            value: summary.askingPriceMetrics.saleAskingPricePerSqmMedian,
            unit: 'TOMAN_PER_SQM',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: 'ASKING_PRICE_METRIC',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.housing.sale_asking_sqm_median', 'TOMAN_PER_SQM', 'ASKING_PRICE_METRIC', 'Insufficient active sale listings.', mVer),
    monthlyRentAskingPerSqmMedian:
      summary.askingPriceMetrics.monthlyRentAskingPerSqmMedian !== null
        ? {
            indicatorId: 'urb.housing.rent_asking_sqm_median',
            availability: 'AVAILABLE',
            value: summary.askingPriceMetrics.monthlyRentAskingPerSqmMedian,
            unit: 'TOMAN_PER_SQM',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: 'ASKING_PRICE_METRIC',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.housing.rent_asking_sqm_median', 'TOMAN_PER_SQM', 'ASKING_PRICE_METRIC', 'Insufficient active rental listings.', mVer),
    confirmedSaleTransactionCount: {
      indicatorId: 'urb.housing.confirmed_tx_count',
      availability: 'AVAILABLE',
      value: summary.confirmedTransactionMetrics.confirmedSaleTransactionCount,
      unit: 'COUNT',
      dataNature: 'RAW_SOURCE_VALUE',
      evidenceClass: 'CONFIRMED_TRANSACTION_METRIC',
      methodologyVersion: mVer,
      qualityStatus,
      isStale,
      provenanceRefs: [provId],
    },
    confirmedSaleTransactionPricePerSqmMedian:
      summary.confirmedTransactionMetrics.confirmedSaleTransactionCount > 0 &&
      summary.confirmedTransactionMetrics.confirmedSaleTransactionPricePerSqmMedian !== null
        ? {
            indicatorId: 'urb.housing.confirmed_tx_sqm_median',
            availability: 'AVAILABLE',
            value: summary.confirmedTransactionMetrics.confirmedSaleTransactionPricePerSqmMedian,
            unit: 'TOMAN_PER_SQM',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: 'CONFIRMED_TRANSACTION_METRIC',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.housing.confirmed_tx_sqm_median', 'TOMAN_PER_SQM', 'CONFIRMED_TRANSACTION_METRIC', 'Zero confirmed transactions in period; asking prices are never substituted for transaction prices.', mVer),
    authoritativeValuationReferencePerSqm:
      summary.valuationTrendReferences.referenceEstimatedValuePerSqm !== null
        ? {
            indicatorId: 'urb.housing.valuation_ref_sqm',
            availability: 'AVAILABLE',
            value: summary.valuationTrendReferences.referenceEstimatedValuePerSqm,
            unit: 'TOMAN_PER_SQM',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: 'VALUATION_MODEL_REFERENCE',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.housing.valuation_ref_sqm', 'TOMAN_PER_SQM', 'VALUATION_MODEL_REFERENCE', 'Valuation reference unavailable.', mVer),
    valuationTrendChangePct:
      summary.valuationTrendReferences.periodOverPeriodChangePct !== null
        ? {
            indicatorId: 'urb.housing.valuation_trend_pct',
            availability: 'AVAILABLE',
            value: summary.valuationTrendReferences.periodOverPeriodChangePct,
            unit: 'PERCENTAGE',
            dataNature: 'RAW_SOURCE_VALUE',
            evidenceClass: 'VALUATION_MODEL_REFERENCE',
            methodologyVersion: mVer,
            qualityStatus,
            isStale,
            provenanceRefs: [provId],
          }
        : makeUnavailableEnvelope('urb.housing.valuation_trend_pct', 'PERCENTAGE', 'VALUATION_MODEL_REFERENCE', 'Valuation trend unavailable.', mVer),
    authoritativeValuationModelVersion:
      summary.valuationTrendReferences.authoritativeValuationModelVersion,
    marketCategorySeparationDisclaimer: disclaimer,
  };
}
