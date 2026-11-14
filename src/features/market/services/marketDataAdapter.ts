import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { toPersianNum } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import {
  aggregateNeighborhoodMarketMetrics,
  buildNeighborhoodListingSamples,
  buildIllustrativeSeedListingSamples,
  extractListingSpecsFromText,
  resolveBuildingAge,
  type AggregatedMarketMetrics,
} from '../../../data/realMarketPriceAggregator';
import { buildTransparent12MonthMarketSeries } from '../../../utils/marketHistoryAndPulseIntegrity';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode, type RadarLocale } from '../../../utils/areaUnit';
import {
  RENT_CONVERSION_ANNUAL_RATE,
  RENT_CONVERSION_MONTHLY_RATE_PER_MILLION,
  evaluateSampleSufficiency,
  resolveRentEquivalent,
} from '../indicators/IndicatorRegistry';
import { getPeriodLabelFa, getPeriodMonthCount } from '../filters/MarketFilterDraft';
import { buildSupplyCompositionByAge, buildSupplyCompositionByArea, computeDistributionStats, computeMean } from './marketStatsHelpers';
import { buildGeoComparisonRows, buildMarketReportsList, makeMarketIndicatorValue } from './marketComparisonReports';
import type {
  AppliedMarketFilters,
  DataQualityAssessment,
  GeoComparisonItem,
  MarketReportItem,
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
  isNonResidentialUnavailable: boolean;
  selectedAgg: AggregatedMarketMetrics;
  indicators: MarketIndicatorValue[];
  distribution: PriceDistributionStats;
  scatterPoints: PriceScatterPoint[];
  supplyByArea: SupplyCompositionSegment[];
  supplyByAge: SupplyCompositionSegment[];
  trendSeries: MarketTrendSeriesPoint[];
  rentBreakdown: RentRawBreakdown;
  quality: DataQualityAssessment;
  comparisonRows: GeoComparisonItem[];
  reports: MarketReportItem[];
}

function matchesFilterBand(point: Pick<PriceScatterPoint, 'sqm' | 'age' | 'isObserved'>, filters: AppliedMarketFilters): boolean {
  if (filters.onlyObserved && !point.isObserved) return false;
  if (filters.areaRange === 'under75' && point.sqm >= 75) return false;
  if (filters.areaRange === '75to120' && (point.sqm < 75 || point.sqm > 120)) return false;
  if (filters.areaRange === 'over120' && point.sqm <= 120) return false;
  if (filters.ageRange === 'new_0_5' && point.age > 5) return false;
  if (filters.ageRange === 'mid_6_15' && (point.age < 6 || point.age > 15)) return false;
  if (filters.ageRange === 'old_16plus' && point.age <= 15) return false;
  return true;
}

function buildScatterPoolForScope(scopedHoods: readonly EvaluatedNeighborhood[], filters: AppliedMarketFilters): PriceScatterPoint[] {
  const rawPoints: PriceScatterPoint[] = [];
  for (const h of scopedHoods) {
    const live = buildNeighborhoodListingSamples(h).map((s) => ({ ...s, isObserved: true }));
    const seed = filters.onlyObserved ? [] : buildIllustrativeSeedListingSamples(h).map((s) => ({ ...s, isObserved: false }));
    for (const item of [...live, ...seed]) {
      const specs = extractListingSpecsFromText(item.description, h.buyPerSqm);
      const sqm = item.sqm > 0 ? item.sqm : specs.sqm;
      const age = resolveBuildingAge(null, item.description);
      const perSqmMillion = Math.round((item.askingTotalMillion / Math.max(20, sqm)) * 10) / 10;
      const pt: PriceScatterPoint = {
        id: `${h.id}-${item.id}`,
        label: h.name,
        sqm,
        perSqmMillion,
        fairPerSqmMillion: h.buyPerSqm,
        age,
        isObserved: item.isObserved,
        isOutlierBand: perSqmMillion < h.buyPerSqm * 0.42 || perSqmMillion > h.buyPerSqm * 2.4,
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
  const cityNameFa = MULTI_CITY_CONFIGS[activeCity as CityId]?.nameFa || 'تهران';
  const periodLabelFa = getPeriodLabelFa(filters.period);
  const isNonResidentialUnavailable = filters.marketType !== 'residential';

  const scopedHoods =
    filters.geoLevel === 'city'
      ? allHoods
      : filters.geoLevel === 'zone'
        ? allHoods.filter((h) => h.zone === (filters.zoneName || selectedHood.zone))
        : [selectedHood];
  const safeScope = scopedHoods.length > 0 ? scopedHoods : [selectedHood];
  const geoScopeFa =
    filters.geoLevel === 'city' ? `کل شهر ${cityNameFa}` : filters.geoLevel === 'zone' ? `${filters.zoneName || selectedHood.zone} (${cityNameFa})` : `محله ${selectedHood.name}`;

  const selectedAgg = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood));
  const scatterPoints = isNonResidentialUnavailable ? [] : buildScatterPoolForScope(safeScope, filters);
  const validNonOutliers = scatterPoints.filter((p) => !p.isOutlierBand);
  const distributionPool =
    validNonOutliers.length > 0
      ? validNonOutliers.map((p) => p.perSqmMillion)
      : isNonResidentialUnavailable || filters.onlyObserved
        ? []
        : safeScope.map((h) => h.buyPerSqm);

  const distribution = computeDistributionStats(distributionPool);
  const observedCount = safeScope.reduce(
    (sum, h) => sum + aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, buildNeighborhoodListingSamples(h)).observedSampleCount,
    0,
  );
  const totalRaw = safeScope.reduce((sum, h) => sum + (h.bargains?.length || 0), 0);
  const duplicateExcluded = safeScope.reduce(
    (sum, h) => sum + aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, buildNeighborhoodListingSamples(h)).duplicateSampleCount,
    0,
  );
  const outlierExcluded = scatterPoints.filter((p) => p.isOutlierBand).length;

  const baseAskingSqm = filters.geoLevel === 'neighborhood' ? selectedAgg.askingPricePerSqm : distribution.median ?? Math.round(computeMean(safeScope.map((h) => h.buyPerSqm)) || selectedHood.buyPerSqm);
  const baseDealSqm = filters.geoLevel === 'neighborhood' ? selectedAgg.estimatedDealPricePerSqm : Math.round(baseAskingSqm * selectedAgg.askToDealRatio * 10) / 10;
  const unitAsk = convertPricePerSqmToUnit(baseAskingSqm, areaUnit);
  const unitDeal = convertPricePerSqmToUnit(baseDealSqm, areaUnit);
  const unitLabel = areaUnit === 'sqft' ? 'فوت مربع' : 'متر';

  const askingStatus = evaluateSampleSufficiency(filters.marketType, filters.geoLevel, observedCount, 'asking_price_median_sqm');
  const dealStatus = evaluateSampleSufficiency(filters.marketType, filters.geoLevel, observedCount, 'estimated_deal_v64_sqm');
  const supplyStatus = evaluateSampleSufficiency(filters.marketType, filters.geoLevel, validNonOutliers.length, 'supply_valid_count');
  const rentStatus = evaluateSampleSufficiency(filters.marketType, filters.geoLevel, observedCount, 'rent_deposit_80m');

  const avgRahn80 = Math.round(computeMean(safeScope.map((h) => h.rahn80m)) || selectedHood.rahn80m);
  const mixedMonthly = Math.round(avgRahn80 * 0.4 * RENT_CONVERSION_MONTHLY_RATE_PER_MILLION * 10) / 10;
  const convertedMonthly = resolveRentEquivalent(avgRahn80, 0, RENT_CONVERSION_ANNUAL_RATE);
  const grossYieldPct = Math.round(((avgRahn80 * RENT_CONVERSION_ANNUAL_RATE) / Math.max(1, baseAskingSqm * 80)) * 1000) / 10;

  const slicedPoints = buildTransparent12MonthMarketSeries(selectedHood).points.slice(-getPeriodMonthCount(filters.period));
  const cityAvgNow = Math.round(computeMean(allHoods.map((h) => h.buyPerSqm)) || selectedHood.buyPerSqm);

  const trendSeries: MarketTrendSeriesPoint[] = isNonResidentialUnavailable
    ? []
    : slicedPoints.map((pt, idx) => {
        const askSqm = pt.buyPricePerSqmMillions;
        const ratio = selectedHood.buyPerSqm > 0 && askSqm !== null ? askSqm / selectedHood.buyPerSqm : 1;
        const hasGap = filters.onlyObserved && observedCount === 0 && idx < slicedPoints.length - 1;
        return {
          monthKey: pt.monthKey,
          monthLabelFa: pt.monthLabelFa,
          askingPerSqmMillion: hasGap ? null : askSqm,
          estimatedDealPerSqmMillion: hasGap || askSqm === null ? null : Math.round(askSqm * selectedAgg.askToDealRatio * 10) / 10,
          cityAvgPerSqmMillion: hasGap ? null : Math.round(cityAvgNow * ratio * 10) / 10,
          deposit80mMillion: hasGap ? null : Math.round(avgRahn80 * ratio),
          monthlyRentEquivMillion: hasGap ? null : resolveRentEquivalent(Math.round(avgRahn80 * ratio)),
          sampleCount: idx === slicedPoints.length - 1 ? observedCount : pt.sampleCount,
          hasDataGap: hasGap,
        };
      });

  const startTrendVal = trendSeries.find((t) => t.askingPerSqmMillion !== null)?.askingPerSqmMillion ?? baseAskingSqm;
  const periodChangePct = startTrendVal > 0 ? Math.round(((baseAskingSqm - startTrendVal) / startTrendVal) * 1000) / 10 : 0;

  const indicators: MarketIndicatorValue[] = isNonResidentialUnavailable
    ? [
        makeMarketIndicatorValue('asking_price_median_sqm', null, 'ناموجود', geoScopeFa, periodLabelFa, 0, 'unavailable', 'پوشش فعلی رادار تهران فقط برای بازار مسکونی فعال است.'),
        makeMarketIndicatorValue('estimated_deal_v64_sqm', null, 'ناموجود', geoScopeFa, periodLabelFa, 0, 'unavailable', 'مدل v6.4 برای این نوع کاربری کالیبره نشده است.'),
        makeMarketIndicatorValue('supply_valid_count', 0, toPersianNum(0), geoScopeFa, periodLabelFa, 0, 'unavailable', 'فایل معتبر در این رده ثبت نشده است.'),
        makeMarketIndicatorValue('verified_transaction_sqm', null, '۰ معامله', geoScopeFa, periodLabelFa, 0, 'unavailable', 'رکورد معامله ثبت‌شده عمومی در دسترس نیست.'),
      ]
    : [
        makeMarketIndicatorValue('asking_price_median_sqm', unitAsk, `${toPersianNum(unitAsk)} م/${unitLabel}`, geoScopeFa, periodLabelFa, observedCount, askingStatus, observedCount > 0 ? 'مبتنی بر آگهی‌های پالایش‌شده' : 'مبتنی بر مرجع داخلی محله (بدون آگهی زنده کافی)', intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(unitAsk, intlCurrency, radarLocale) : undefined),
        makeMarketIndicatorValue('estimated_deal_v64_sqm', unitDeal, `${toPersianNum(unitDeal)} م/${unitLabel}`, geoScopeFa, periodLabelFa, observedCount, dealStatus, selectedAgg.askToDealRatio >= 0.999 ? '۰٪ شکاف (در وضعیت مرجع پایه؛ بدون آگهی زنده)' : `شکاف مذاکره -${toPersianNum(Math.round((1 - selectedAgg.askToDealRatio) * 100))}٪ (غیرثبتی)`, intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale) : undefined),
        makeMarketIndicatorValue('rent_deposit_80m', avgRahn80, `${toPersianNum(avgRahn80)} م`, geoScopeFa, periodLabelFa, observedCount, rentStatus, `معادل اجاره ماهانه (نرخ ۳۶٪): ${toPersianNum(convertedMonthly)} م · بازده ناخالص ${toPersianNum(grossYieldPct)}٪`, intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(avgRahn80, intlCurrency, radarLocale) : undefined),
        makeMarketIndicatorValue('supply_valid_count', validNonOutliers.length, `${toPersianNum(validNonOutliers.length)} فایل`, geoScopeFa, periodLabelFa, validNonOutliers.length, supplyStatus, `حذف ${toPersianNum(duplicateExcluded)} تکراری و ${toPersianNum(outlierExcluded)} پرت از ${toPersianNum(totalRaw)} ورودی`),
        makeMarketIndicatorValue('period_change_pct', periodChangePct, `${periodChangePct > 0 ? '+' : ''}${toPersianNum(periodChangePct)}٪`, geoScopeFa, periodLabelFa, safeScope.length, askingStatus, 'تغییر تخمینی در بازه انتخابی بر مبنای سری فصلی محله'),
        makeMarketIndicatorValue('verified_transaction_sqm', null, '۰ معامله ثبت‌شده', geoScopeFa, periodLabelFa, 0, 'unavailable', 'رادار تهران قیمت آگهی و برآورد مدل را با معامله ثبت‌شده یکی نمی‌داند.'),
      ];

  return {
    geoScopeFa,
    cityNameFa,
    periodLabelFa,
    isNonResidentialUnavailable,
    selectedAgg,
    indicators,
    distribution,
    scatterPoints,
    supplyByArea: buildSupplyCompositionByArea(validNonOutliers),
    supplyByAge: buildSupplyCompositionByAge(validNonOutliers),
    trendSeries,
    rentBreakdown: {
      deposit80mMillion: avgRahn80,
      monthlyRentAtMixedMillion: mixedMonthly,
      convertedFullMonthlyMillion: convertedMonthly,
      conversionRateAnnual: RENT_CONVERSION_ANNUAL_RATE,
      conversionRatioPerMillion: RENT_CONVERSION_MONTHLY_RATE_PER_MILLION,
      grossYieldPct,
      status: rentStatus,
    },
    quality: {
      status: askingStatus,
      rawCount: totalRaw,
      validCount: validNonOutliers.length,
      duplicateExcluded,
      outlierExcluded,
      missingRatePct: totalRaw > 0 ? Math.round((selectedAgg.missingAreaSampleCount / totalRaw) * 100) : 0,
      observedCount,
      verifiedTransactionCount: 0,
      coverageLabelFa: observedCount >= 3 ? `پوشش ${toPersianNum(observedCount)} آگهی زنده` : 'وابسته به شاخص مرجع داخلی (فایل زنده محدود)',
      freshnessLabelFa: 'به‌روزرسانی مرجع ۱۴۰۵/۰۸',
      limitationFa: 'داده‌های پرت، آگهی‌های تکراری و معاملات تاییدنشده از میانه قیمت کنار گذاشته شده‌اند.',
    },
    comparisonRows: buildGeoComparisonRows(allHoods, selectedHood, compareHoodIds, filters),
    reports: buildMarketReportsList({
      selectedHood, geoScopeFa, periodLabelFa, unitAsk, unitDeal, avgRahn80, convertedMonthly, grossYieldPct, askingStatus, rentStatus, distribution, validCount: validNonOutliers.length, scopeCount: safeScope.length,
    }),
  };
}
