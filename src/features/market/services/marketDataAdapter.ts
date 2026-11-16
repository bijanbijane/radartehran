import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { toPersianNum } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import {
  aggregateNeighborhoodMarketMetrics,
  buildNeighborhoodListingSamples,
  buildIllustrativeSeedListingSamples,
  extractListingSpecsFromText,
  lookupMatchingDatedReferencePrice,
  resolveBuildingAge,
  type AggregatedMarketMetrics,
} from '../../../data/realMarketPriceAggregator';
import {
  buildTransparent12MonthMarketSeries,
  type MarketSeriesProvenanceKind,
} from '../../../utils/marketHistoryAndPulseIntegrity';
import {
  convertPricePerSqmToUnit,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
} from '../../../utils/areaUnit';
import {
  RENT_CONVERSION_ANNUAL_RATE,
  RENT_CONVERSION_MONTHLY_RATE_PER_MILLION,
  evaluateSampleSufficiency,
  resolveRentEquivalent,
} from '../indicators/IndicatorRegistry';
import { getPeriodLabelFa, getPeriodMonthCount } from '../filters/MarketFilterDraft';
import {
  buildSupplyCompositionByAge,
  buildSupplyCompositionByArea,
  computeDistributionStats,
  computeMean,
} from './marketStatsHelpers';
import {
  buildGeoComparisonRows,
  buildMarketReportsList,
  extractRoomsCountFromText,
  inferPropertySubTypeFromText,
  isWithinPeriodWindow,
  makeMarketIndicatorValue,
} from './marketComparisonReports';
import type {
  AppliedMarketFilters,
  DataQualityAssessment,
  GeoComparisonItem,
  MarketReportItem,
  MarketScopeStatus,
} from '../types/market.types';
import type {
  MarketIndicatorValue,
  MarketTrendSeriesPoint,
  PriceDistributionStats,
  PriceScatterPoint,
  RentRawBreakdown,
  SupplyCompositionSegment,
} from '../types/indicator.types';

export interface MarketSnapshotBundle {
  geoScopeFa: string;
  cityNameFa: string;
  periodLabelFa: string;
  scopeStatus: MarketScopeStatus;
  scopedNeighborhoods: EvaluatedNeighborhood[];
  isNonResidentialUnavailable: boolean;
  selectedAgg: AggregatedMarketMetrics;
  indicators: MarketIndicatorValue[];
  distribution: PriceDistributionStats;
  referenceBaselineDistribution?: PriceDistributionStats;
  scatterPoints: PriceScatterPoint[];
  supplyByArea: SupplyCompositionSegment[];
  supplyByAge: SupplyCompositionSegment[];
  trendSeries: MarketTrendSeriesPoint[];
  trendProvenance: MarketSeriesProvenanceKind | 'scope_historical_unavailable';
  trendProvenanceBadgeFa: string;
  trendProvenanceDescriptionFa: string;
  rentBreakdown: RentRawBreakdown;
  quality: DataQualityAssessment;
  comparisonRows: GeoComparisonItem[];
  reports: MarketReportItem[];
}

export function matchesFilterBand(
  point: Pick<PriceScatterPoint, 'sqm' | 'age' | 'rooms' | 'propertySubType' | 'transactionType' | 'createdAtIso' | 'isObserved'>,
  filters: AppliedMarketFilters,
): boolean {
  if (filters.onlyObserved && !point.isObserved) return false;
  if (point.transactionType && point.transactionType !== filters.transactionType) return false;
  if (point.propertySubType && point.propertySubType !== filters.propertySubType) return false;
  if (filters.areaRange === 'under75' && point.sqm >= 75) return false;
  if (filters.areaRange === '75to120' && (point.sqm < 75 || point.sqm > 120)) return false;
  if (filters.areaRange === 'over120' && point.sqm <= 120) return false;
  if (filters.ageRange === 'new_0_5' && point.age > 5) return false;
  if (filters.ageRange === 'mid_6_15' && (point.age < 6 || point.age > 15)) return false;
  if (filters.ageRange === 'old_16plus' && point.age <= 15) return false;
  if (filters.rooms !== 'all') {
    if (point.rooms === null || point.rooms === undefined) return false;
    if (filters.rooms === '1' && point.rooms !== 1) return false;
    if (filters.rooms === '2' && point.rooms !== 2) return false;
    if (filters.rooms === '3plus' && point.rooms < 3) return false;
  }
  if (!isWithinPeriodWindow(point.createdAtIso, filters.period)) return false;
  return true;
}

function buildScatterPoolForScope(
  scopedHoods: readonly EvaluatedNeighborhood[],
  filters: AppliedMarketFilters,
): PriceScatterPoint[] {
  const rawPoints: PriceScatterPoint[] = [];
  const seenListingIds = new Set<string>();
  const tx = filters.transactionType;

  for (const h of scopedHoods) {
    const live = buildNeighborhoodListingSamples(h, tx).map((s) => ({ ...s, isObserved: true }));
    const seed = filters.onlyObserved
      ? []
      : buildIllustrativeSeedListingSamples(h, tx).map((s) => ({ ...s, isObserved: false }));

    for (const item of [...live, ...seed]) {
      const dedupeKey = `${h.id}:${item.id}`;
      if (seenListingIds.has(dedupeKey)) continue;
      seenListingIds.add(dedupeKey);

      const specs = extractListingSpecsFromText(item.description, h.buyPerSqm);
      const sqm = item.sqm > 0 ? item.sqm : specs.sqm;
      const age = resolveBuildingAge(null, item.description);
      const rooms = extractRoomsCountFromText(item.description);
      const propertySubType = inferPropertySubTypeFromText(item.description);
      const perSqmMillion =
        tx === 'sale'
          ? item.perSqmMillion ?? Math.round((item.askingTotalMillion / Math.max(20, sqm)) * 10) / 10
          : Math.round(((item.depositMillion ?? item.askingTotalMillion) / Math.max(20, sqm)) * 10) / 10;
      const fairBaseline = tx === 'sale' ? h.buyPerSqm : Math.round((h.rahn80m / 80) * 10) / 10;
      const pt: PriceScatterPoint = {
        id: `${h.id}-${item.id}`,
        label: h.name,
        sqm,
        perSqmMillion,
        fairPerSqmMillion: fairBaseline,
        age,
        rooms,
        propertySubType,
        transactionType: tx,
        createdAtIso: item.createdAtIso ?? null,
        isObserved: item.isObserved,
        isOutlierBand: perSqmMillion < fairBaseline * 0.42 || perSqmMillion > fairBaseline * 2.4,
      };
      if (matchesFilterBand(pt, filters)) rawPoints.push(pt);
    }
  }
  return rawPoints;
}

export function buildMarketSnapshotBundle(params: {
  allHoods: readonly EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity: CityId | string;
  filters: AppliedMarketFilters;
  compareHoodIds: readonly number[];
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
}): MarketSnapshotBundle {
  const { allHoods, selectedHood, activeCity, filters, compareHoodIds, areaUnit, intlCurrency, radarLocale } = params;
  const validCityId: CityId = activeCity in MULTI_CITY_CONFIGS ? (activeCity as CityId) : 'tehran';
  const cityConfig = MULTI_CITY_CONFIGS[validCityId];
  const cityNameFa = cityConfig.nameFa;
  const periodLabelFa = getPeriodLabelFa(filters.period);
  const isNonResidentialUnavailable = filters.marketType !== 'residential';

  const cityScopedAll = allHoods.filter((h) => cityConfig.neighborhoods.some((ch) => ch.id === h.id));
  const effectiveCityHoods = cityScopedAll.length > 0 ? cityScopedAll : [...allHoods];
  const resolvedSelectedHood =
    effectiveCityHoods.find((h) => h.id === selectedHood?.id) ?? effectiveCityHoods[0] ?? selectedHood;

  const targetZone = filters.zoneName || resolvedSelectedHood?.zone || '';
  const scopedNeighborhoods: EvaluatedNeighborhood[] =
    filters.geoLevel === 'city'
      ? [...effectiveCityHoods]
      : filters.geoLevel === 'zone'
        ? effectiveCityHoods.filter((h) => h.zone === targetZone)
        : resolvedSelectedHood
          ? [resolvedSelectedHood]
          : [];

  const scopeStatus: MarketScopeStatus =
    scopedNeighborhoods.length === 0
      ? filters.geoLevel === 'zone' && !effectiveCityHoods.some((h) => h.zone === targetZone)
        ? 'invalid_scope'
        : 'valid_empty'
      : 'valid_with_data';

  const geoScopeFa =
    filters.geoLevel === 'city'
      ? `کل شهر ${cityNameFa}`
      : filters.geoLevel === 'zone'
        ? `${targetZone || 'منطقه انتخابی'} (${cityNameFa})`
        : `محله ${resolvedSelectedHood?.name || 'نامشخص'}`;

  const selectedAgg = aggregateNeighborhoodMarketMetrics(
    resolvedSelectedHood?.id ?? 1,
    resolvedSelectedHood?.name ?? '',
    resolvedSelectedHood?.buyPerSqm ?? 120,
    buildNeighborhoodListingSamples(resolvedSelectedHood, 'sale'),
  );

  const scatterPoints =
    isNonResidentialUnavailable || scopeStatus !== 'valid_with_data'
      ? []
      : buildScatterPoolForScope(scopedNeighborhoods, filters);
  const validNonOutliers = scatterPoints.filter((p) => !p.isOutlierBand);
  const observedValidPoints = validNonOutliers.filter((p) => p.isObserved);
  const illustrativePoints = validNonOutliers.filter((p) => !p.isObserved);

  const distribution = computeDistributionStats(validNonOutliers.map((p) => p.perSqmMillion));
  const referenceBaselineDistribution =
    scopedNeighborhoods.length > 0 ? computeDistributionStats(scopedNeighborhoods.map((h) => h.buyPerSqm)) : undefined;

  const hoodAggs = scopedNeighborhoods.map((h) =>
    aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, buildNeighborhoodListingSamples(h, 'sale')),
  );
  const observedCount =
    filters.transactionType === 'sale'
      ? observedValidPoints.length
      : scopedNeighborhoods.reduce((sum, h) => sum + buildNeighborhoodListingSamples(h, 'rent').length, 0);
  const totalRaw = scopedNeighborhoods.reduce((sum, h) => sum + (h.bargains?.length || 0), 0);
  const duplicateExcluded = hoodAggs.reduce((sum, a) => sum + a.duplicateSampleCount, 0);
  const missingAreaCount = hoodAggs.reduce((sum, a) => sum + a.missingAreaSampleCount, 0);
  const outlierExcluded = scatterPoints.filter((p) => p.isOutlierBand).length;

  const observedDist = computeDistributionStats(observedValidPoints.map((p) => p.perSqmMillion));
  const scopeReferenceMean = computeMean(scopedNeighborhoods.map((h) => h.buyPerSqm));
  const scopeAskToDealRatio =
    observedCount >= 10 ? 0.975 : observedCount >= 3 ? 0.93 : 1;

  const hasValidScopePrice =
    scopeStatus === 'valid_with_data' &&
    !isNonResidentialUnavailable &&
    (!filters.onlyObserved || observedDist.median !== null);

  const baseAskingSqm: number | null = !hasValidScopePrice
    ? null
    : filters.onlyObserved
      ? observedDist.median
      : observedDist.median ??
        (filters.geoLevel === 'neighborhood' ? selectedAgg.askingPricePerSqm : Math.round(scopeReferenceMean || 0));

  const baseDealSqm: number | null =
    baseAskingSqm === null
      ? null
      : filters.geoLevel === 'neighborhood' && !filters.onlyObserved
        ? selectedAgg.estimatedDealPricePerSqm
        : Math.round(baseAskingSqm * scopeAskToDealRatio * 10) / 10;

  const unitAsk = baseAskingSqm !== null ? convertPricePerSqmToUnit(baseAskingSqm, areaUnit) : null;
  const unitDeal = baseDealSqm !== null ? convertPricePerSqmToUnit(baseDealSqm, areaUnit) : null;
  const unitLabel = areaUnit === 'sqft' ? 'فوت مربع' : 'متر';

  const askingStatus =
    scopeStatus !== 'valid_with_data' || isNonResidentialUnavailable
      ? 'unavailable'
      : evaluateSampleSufficiency(filters.marketType, filters.geoLevel, observedCount, 'asking_price_median_sqm');
  const dealStatus =
    scopeStatus !== 'valid_with_data' || isNonResidentialUnavailable
      ? 'unavailable'
      : evaluateSampleSufficiency(filters.marketType, filters.geoLevel, observedCount, 'estimated_deal_v64_sqm');
  const supplyStatus =
    scopeStatus !== 'valid_with_data' || isNonResidentialUnavailable
      ? 'unavailable'
      : evaluateSampleSufficiency(filters.marketType, filters.geoLevel, observedValidPoints.length, 'supply_valid_count');

  const rentSamplesCount = scopedNeighborhoods.reduce(
    (sum, h) => sum + buildNeighborhoodListingSamples(h, 'rent').length,
    0,
  );
  const rentStatus =
    scopeStatus !== 'valid_with_data' || isNonResidentialUnavailable
      ? 'unavailable'
      : evaluateSampleSufficiency(filters.marketType, filters.geoLevel, rentSamplesCount, 'rent_deposit_80m');

  const avgRahn80 =
    scopedNeighborhoods.length > 0
      ? Math.round(computeMean(scopedNeighborhoods.map((h) => h.rahn80m)) || 0)
      : 0;
  const mixedMonthly = Math.round(avgRahn80 * 0.4 * RENT_CONVERSION_MONTHLY_RATE_PER_MILLION * 10) / 10;
  const convertedMonthly = resolveRentEquivalent(avgRahn80, 0, RENT_CONVERSION_ANNUAL_RATE);
  const grossYieldPct =
    baseAskingSqm !== null && baseAskingSqm > 0 && avgRahn80 > 0
      ? Math.round(((avgRahn80 * RENT_CONVERSION_ANNUAL_RATE) / (baseAskingSqm * 80)) * 1000) / 10
      : null;

  const seriesEnv = resolvedSelectedHood ? buildTransparent12MonthMarketSeries(resolvedSelectedHood) : null;
  const isScopeHistoricalAvailable =
    !isNonResidentialUnavailable &&
    scopeStatus === 'valid_with_data' &&
    filters.geoLevel === 'neighborhood' &&
    seriesEnv !== null;

  const trendProvenance: MarketSnapshotBundle['trendProvenance'] = isScopeHistoricalAvailable
    ? seriesEnv.provenance
    : 'scope_historical_unavailable';
  const trendProvenanceBadgeFa = isScopeHistoricalAvailable
    ? seriesEnv.provenance === 'modeled_trend_series'
      ? 'شبیه‌سازی‌شده'
      : seriesEnv.provenanceBadgeFa
    : 'فاقد سری تاریخی معتبر';
  const trendProvenanceDescriptionFa = isScopeHistoricalAvailable
    ? seriesEnv.provenanceDescriptionFa
    : 'سری تاریخی معتبر برای این سطح جغرافیایی در دسترس نیست.';

  const slicedPoints = isScopeHistoricalAvailable
    ? seriesEnv.points.slice(-getPeriodMonthCount(filters.period))
    : [];
  const cityAvgNow = Math.round(computeMean(effectiveCityHoods.map((h) => h.buyPerSqm)) || 0);

  const trendSeries: MarketTrendSeriesPoint[] = slicedPoints.map((pt, idx) => {
    const askSqm = pt.buyPricePerSqmMillions;
    const ratio = resolvedSelectedHood.buyPerSqm > 0 && askSqm !== null ? askSqm / resolvedSelectedHood.buyPerSqm : 1;
    const hasGap = filters.onlyObserved && observedCount === 0 && idx < slicedPoints.length - 1;
    return {
      monthKey: pt.monthKey,
      monthLabelFa: pt.monthLabelFa,
      askingPerSqmMillion: hasGap ? null : askSqm,
      estimatedDealPerSqmMillion: hasGap || askSqm === null ? null : Math.round(askSqm * scopeAskToDealRatio * 10) / 10,
      cityAvgPerSqmMillion: hasGap ? null : Math.round(cityAvgNow * ratio * 10) / 10,
      deposit80mMillion: hasGap ? null : Math.round(avgRahn80 * ratio),
      monthlyRentEquivMillion: hasGap ? null : resolveRentEquivalent(Math.round(avgRahn80 * ratio)),
      sampleCount: idx === slicedPoints.length - 1 ? observedCount : pt.sampleCount,
      hasDataGap: hasGap,
    };
  });

  const startTrendVal = trendSeries.find((t) => t.askingPerSqmMillion !== null)?.askingPerSqmMillion ?? null;
  const periodChangePct =
    startTrendVal !== null && startTrendVal > 0 && baseAskingSqm !== null
      ? Math.round(((baseAskingSqm - startTrendVal) / startTrendVal) * 1000) / 10
      : null;

  const latestListingIso = scatterPoints
    .map((p) => p.createdAtIso)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop() ?? null;
  const datedRef = resolvedSelectedHood
    ? lookupMatchingDatedReferencePrice(validCityId, resolvedSelectedHood.id, resolvedSelectedHood.buyPerSqm)
    : undefined;
  const freshnessLabelFa = latestListingIso
    ? `آخرین مشاهده آگهی: ${latestListingIso.slice(0, 10)}`
    : datedRef
      ? `به‌روزرسانی مرجع ${datedRef.asOfJalali}`
      : 'تاریخ آخرین مشاهده ثبت نشده است.';

  const indicators: MarketIndicatorValue[] = isNonResidentialUnavailable
    ? [
        makeMarketIndicatorValue('asking_price_median_sqm', null, 'ناموجود', geoScopeFa, periodLabelFa, 0, 'unavailable', 'پوشش فعلی رادار تهران فقط برای بازار مسکونی فعال است.'),
        makeMarketIndicatorValue('estimated_deal_v64_sqm', null, 'ناموجود', geoScopeFa, periodLabelFa, 0, 'unavailable', 'مدل v6.4 برای این نوع کاربری کالیبره نشده است.'),
        makeMarketIndicatorValue('supply_valid_count', 0, toPersianNum(0), geoScopeFa, periodLabelFa, 0, 'unavailable', 'فایل معتبر در این رده ثبت نشده است.'),
        makeMarketIndicatorValue('verified_transaction_sqm', null, '۰ معامله', geoScopeFa, periodLabelFa, 0, 'unavailable', 'رکورد معامله ثبت‌شده عمومی در دسترس نیست.'),
      ]
    : [
        makeMarketIndicatorValue(
          'asking_price_median_sqm',
          unitAsk,
          unitAsk !== null ? `${toPersianNum(unitAsk)} م/${unitLabel}` : 'داده مشاهده‌شده کافی نیست',
          geoScopeFa,
          periodLabelFa,
          observedCount,
          askingStatus,
          observedCount > 0 ? 'مبتنی بر آگهی‌های پالایش‌شده' : 'مبتنی بر مرجع داخلی محله (بدون آگهی زنده کافی)',
          unitAsk !== null && intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(unitAsk, intlCurrency, radarLocale) : undefined,
        ),
        makeMarketIndicatorValue(
          'estimated_deal_v64_sqm',
          unitDeal,
          unitDeal !== null ? `${toPersianNum(unitDeal)} م/${unitLabel}` : 'داده مشاهده‌شده کافی نیست',
          geoScopeFa,
          periodLabelFa,
          observedCount,
          dealStatus,
          scopeAskToDealRatio >= 0.999 ? '۰٪ شکاف (در وضعیت مرجع پایه؛ بدون آگهی زنده)' : `شکاف مذاکره -${toPersianNum(Math.round((1 - scopeAskToDealRatio) * 100))}٪ (غیرثبتی)`,
          unitDeal !== null && intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale) : undefined,
        ),
        makeMarketIndicatorValue(
          'rent_deposit_80m',
          avgRahn80 > 0 ? avgRahn80 : null,
          avgRahn80 > 0 ? `${toPersianNum(avgRahn80)} م` : 'ناموجود',
          geoScopeFa,
          periodLabelFa,
          rentSamplesCount,
          rentStatus,
          grossYieldPct !== null ? `معادل اجاره ماهانه (نرخ ۳۶٪): ${toPersianNum(convertedMonthly)} م · بازده ناخالص ${toPersianNum(grossYieldPct)}٪` : 'اطلاعات کافی برای محاسبه بازده اجاره موجود نیست',
          avgRahn80 > 0 && intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(avgRahn80, intlCurrency, radarLocale) : undefined,
        ),
        makeMarketIndicatorValue(
          'supply_valid_count',
          observedValidPoints.length,
          `${toPersianNum(observedValidPoints.length)} فایل`,
          geoScopeFa,
          periodLabelFa,
          observedValidPoints.length,
          supplyStatus,
          `حذف ${toPersianNum(duplicateExcluded)} تکراری و ${toPersianNum(outlierExcluded)} پرت از ${toPersianNum(totalRaw)} ورودی`,
        ),
        makeMarketIndicatorValue(
          'period_change_pct',
          periodChangePct,
          periodChangePct !== null ? `${periodChangePct > 0 ? '+' : ''}${toPersianNum(periodChangePct)}٪` : 'ناموجود برای این سطح',
          geoScopeFa,
          periodLabelFa,
          slicedPoints.length,
          isScopeHistoricalAvailable ? askingStatus : 'unavailable',
          isScopeHistoricalAvailable ? 'تغییر تخمینی در بازه انتخابی بر مبنای سری محله' : 'سری تاریخی معتبر برای این سطح جغرافیایی در دسترس نیست.',
        ),
        makeMarketIndicatorValue('verified_transaction_sqm', null, '۰ معامله ثبت‌شده', geoScopeFa, periodLabelFa, 0, 'unavailable', 'رادار تهران قیمت آگهی و برآورد مدل را با معامله ثبت‌شده یکی نمی‌داند.'),
      ];

  return {
    geoScopeFa,
    cityNameFa,
    periodLabelFa,
    scopeStatus,
    scopedNeighborhoods,
    isNonResidentialUnavailable,
    selectedAgg,
    indicators,
    distribution,
    referenceBaselineDistribution,
    scatterPoints,
    supplyByArea: buildSupplyCompositionByArea(validNonOutliers),
    supplyByAge: buildSupplyCompositionByAge(validNonOutliers),
    trendSeries,
    trendProvenance,
    trendProvenanceBadgeFa,
    trendProvenanceDescriptionFa,
    rentBreakdown: {
      deposit80mMillion: avgRahn80,
      monthlyRentAtMixedMillion: mixedMonthly,
      convertedFullMonthlyMillion: convertedMonthly,
      conversionRateAnnual: RENT_CONVERSION_ANNUAL_RATE,
      conversionRatioPerMillion: RENT_CONVERSION_MONTHLY_RATE_PER_MILLION,
      grossYieldPct,
      observedRentCount: rentSamplesCount,
      status: rentStatus,
    },
    quality: {
      status: askingStatus,
      rawCount: totalRaw,
      validCount: observedValidPoints.length,
      observedValidCount: observedValidPoints.length,
      illustrativeCount: illustrativePoints.length,
      duplicateExcluded,
      outlierExcluded,
      missingRatePct: totalRaw > 0 ? Math.round((missingAreaCount / totalRaw) * 100) : 0,
      observedCount,
      verifiedTransactionCount: 0,
      coverageLabelFa: observedCount >= 3 ? `پوشش ${toPersianNum(observedCount)} آگهی زنده` : 'وابسته به شاخص مرجع داخلی (فایل زنده محدود)',
      freshnessLabelFa,
      limitationFa: 'داده‌های پرت، آگهی‌های تکراری و معاملات تاییدنشده از میانه قیمت کنار گذاشته شده‌اند.',
    },
    comparisonRows: buildGeoComparisonRows(effectiveCityHoods, resolvedSelectedHood, compareHoodIds, filters),
    reports: buildMarketReportsList({
      selectedHood: resolvedSelectedHood,
      geoScopeFa,
      periodLabelFa,
      unitAsk,
      unitDeal,
      avgRahn80,
      convertedMonthly,
      grossYieldPct,
      askingStatus,
      rentStatus,
      distribution,
      observedSaleCount: observedValidPoints.length,
      observedRentCount: rentSamplesCount,
      dataAsOfIso: latestListingIso ?? (datedRef ? datedRef.asOfJalali : null),
    }),
  };
}
