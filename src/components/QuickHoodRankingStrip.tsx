import React, { useMemo, useState } from 'react'; import { Sparkles, TrendingDown, Wallet, Wind, TrainFront, MapPinned, BarChart3, Navigation, Scale } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { MULTI_CITY_CONFIGS, CityId, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood, } from '../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { evaluateHousingMarketStatisticalIndicators, type MarketListingObservation, } from '../data/rentalMarketCommissionAndPreSaleAudit'; import { isCoordInsideStoredViewport, updateMapAdvancedOverlayState, useMapAdvancedOverlayState, } from './mapAdvancedLayers'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { explainNeighborhoodRecommendation } from './useEvaluatedNeighborhoods'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; export type QuickRankingCriterionId = 'budget_match' | 'all_hoods' | 'nearest_work_hub' | 'tehran_counties' | 'undervalued' | 'cheapest' | 'clean_air' | 'best_metro'; export interface QuickHoodRankingStripProps { evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHoodId: number; mode: 'rent' | 'buy'; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; activeCity?: CityId;
  onSwitchCity?: (city: CityId, targetHoodId?: number, targetCenter?: [number, number], targetZoom?: number) => void; }
const RANKING_TABS: { id: QuickRankingCriterionId; label: string; icon: React.ComponentType<{ className?: string }>; }[] = [
  { id: 'budget_match', label: 'همخوان با بودجه من', icon: Sparkles }, { id: 'all_hoods', label: 'همه محلات', icon: MapPinned }, { id: 'tehran_counties', label: 'شهرستان‌ها و استان‌ها', icon: MapPinned }, { id: 'nearest_work_hub', label: 'نزدیک‌ترین به کار', icon: Navigation },
  { id: 'undervalued', label: 'جامانده از بازار', icon: TrendingDown }, { id: 'cheapest', label: 'ارزان‌ترین‌ها', icon: Wallet }, { id: 'clean_air', label: 'پاک‌ترین هوا', icon: Wind }, { id: 'best_metro', label: 'بهترین مترو', icon: TrainFront }, ]; export function QuickHoodRankingStrip({
  evaluatedNeighborhoods, selectedHoodId, mode, onSelectNeighborhood,
  activeCity = 'tehran', onSwitchCity, }: QuickHoodRankingStripProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const [criterion, setCriterion] = useState<QuickRankingCriterionId>('budget_match'); const { filterRankingByViewport, viewportBounds, comparisonArc } = useMapAdvancedOverlayState();
  const nationwideHoods = useMemo(() => getAllMultiCityNeighborhoods(), []);
  const currentSelectedHood = useMemo(
    () => evaluatedNeighborhoods.find((h) => h.id === selectedHoodId) || evaluatedNeighborhoods[0] || null,
    [evaluatedNeighborhoods, selectedHoodId]
  );
  const scopedNeighborhoods = useMemo(() => {
    if (!filterRankingByViewport || !viewportBounds) return evaluatedNeighborhoods;
    const inView = evaluatedNeighborhoods.filter((h) => isCoordInsideStoredViewport(h.lat, h.lng, viewportBounds));
    return inView.length > 0 ? inView : evaluatedNeighborhoods;
  }, [evaluatedNeighborhoods, filterRankingByViewport, viewportBounds]);
  const isCountyOrProvincialHood = (id: number) => (id >= 61 && id <= 99) || (id >= 115 && id <= 199) || (id >= 217 && id <= 299) || (id >= 312 && id <= 399) || id === 406 || id >= 418;
  const hasCountiesOrProvinces = useMemo(
    () => evaluatedNeighborhoods.some((h) => isCountyOrProvincialHood(h.id)),
    [evaluatedNeighborhoods]
  );
  const hasActiveWorkHub = useMemo(
    () => evaluatedNeighborhoods.some((h) => h.distKm !== null),
    [evaluatedNeighborhoods]
  );
  const visibleTabs = useMemo(
    () => RANKING_TABS.filter((t) => {
      if (t.id === 'tehran_counties' && !hasCountiesOrProvinces) return false;
      if (t.id === 'nearest_work_hub' && !hasActiveWorkHub) return false;
      return true;
    }),
    [hasCountiesOrProvinces, hasActiveWorkHub]
  );
  const cityMarketStats = useMemo(() => {
    const nowMs = 1_710_000_000_000;
    const observations: MarketListingObservation[] = scopedNeighborhoods.map((h) => ({
      listingId: `HOOD-BENCH-${h.id}`, canonicalPropertyUnitKey: `UNIT-HOOD-${h.id}`, neighborhoodId: h.id,
      propertySegment: 'APARTMENT_RESIDENTIAL', areaSqm: 85,
      pricePerSqmMillionToman: mode === 'rent' ? Math.max(1, Number((h.rahn80m / 80).toFixed(1))) : h.buyPerSqm,
      observedTimestampMs: nowMs - 1000, status: 'ACTIVE', sourceKind: 'ADVERTISED_ASKING_PRICE',
    }));
    return evaluateHousingMarketStatisticalIndicators(observations, { nowMs, minimumSampleThreshold: 1 });
  }, [scopedNeighborhoods, mode]);
  const rankedHoods = useMemo(() => {
    const list = [...scopedNeighborhoods];
    if (criterion === 'all_hoods') return list;
    if (criterion === 'nearest_work_hub') return list.sort((a, b) => (a.distKm ?? 999) - (b.distKm ?? 999)).slice(0, 20);
    if (criterion === 'tehran_counties') {
      const counties = list.filter((h) => isCountyOrProvincialHood(h.id));
      return (counties.length > 0 ? counties : list).sort((a, b) => b.overallScore - a.overallScore);
    }
    if (criterion === 'budget_match') {
      return list.sort((a, b) => {
        const rankStatus = (s: EvaluatedNeighborhood['status']) => (s === 'green' ? 0 : s === 'yellow' ? 1 : 2);
        const diffStatus = rankStatus(a.status) - rankStatus(b.status);
        return diffStatus !== 0 ? diffStatus : b.overallScore - a.overallScore;
      }).slice(0, 25);
    }
    if (criterion === 'undervalued') {
      return list.sort((a, b) => {
        const statusScore = (s?: string) => (s === 'undervalued' ? 0 : s === 'balanced' ? 1 : 2);
        const sDiff = statusScore(a.marketReport?.status) - statusScore(b.marketReport?.status);
        if (sDiff !== 0) return sDiff;
        const gDiff = (a.marketReport?.hoodGrowth6mPercent ?? 20) - (b.marketReport?.hoodGrowth6mPercent ?? 20);
        return Math.abs(gDiff) > 0.1 ? gDiff : (a.marketReport?.prRatio ?? 7) - (b.marketReport?.prRatio ?? 7);
      }).slice(0, 25);
    }
    if (criterion === 'cheapest') {
      return list.sort((a, b) => (mode === 'rent' ? a.rahn80m - b.rahn80m : a.buyPerSqm - b.buyPerSqm)).slice(0, 25);
    }
    if (criterion === 'clean_air') return list.sort((a, b) => (b.air ?? 0) - (a.air ?? 0)).slice(0, 25);
    return list.sort((a, b) => (b.metro ?? 0) - (a.metro ?? 0)).slice(0, 25);
  }, [scopedNeighborhoods, criterion, mode]);
  const formatSubMetric = (hood: EvaluatedNeighborhood): string => {
    const unitBuy = Number(convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit).toFixed(1));
    const unitDeal = Number(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit).toFixed(1));
    const priceTag = mode === 'rent'
      ? `رهن (${formatAreaShort(80, areaUnit)}) ${toPersianNum(hood.rahn80m)} م · اجاره ${toPersianNum(Math.round(hood.rahn80m * 0.03))} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(hood.rahn80m, intlCurrency, radarLocale)})` : ''}`
      : `${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(unitBuy)} م (معامله v6.4: ${toPersianNum(unitDeal)} م) · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((hood.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)})` : ''}`;
    if (criterion === 'nearest_work_hub' && hood.distKm !== null) return `فاصله ${toPersianNum(hood.distKm)} کم${areaUnit === 'sqft' ? ` (${toPersianNum((hood.distKm * 0.621371).toFixed(1))} mi)` : ''} · ${priceTag}`;
    if (criterion === 'clean_air') return `هوا ${toPersianNum(hood.air)}/۱۰ · ${priceTag}`;
    if (criterion === 'best_metro') return `مترو ${toPersianNum(hood.metro)}/۱۰ · ${priceTag}`;
    if (criterion === 'undervalued') {
      const g = hood.marketReport?.hoodGrowth6mPercent ?? 12;
      return `رشد ۶م ${g > 0 ? '+' : ''}${toPersianNum(g)}٪ · ${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(unitBuy)}م (معامله: ${toPersianNum(unitDeal)} م)${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)})` : ''}`;
    }
    return priceTag;
  };
  return (
    <div className="mb-3.5 pb-3 border-b border-slate-200/70 dark:border-slate-800 space-y-2">
      {cityMarketStats.medianPricePerSqm !== null && (
        <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-[9px] bg-slate-100/80 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-400 tabular-nums">
          <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-bold text-slate-700 dark:text-slate-300">
            <BarChart3 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>میانه {mode === 'rent' ? 'رهن ' : 'خرید '}{filterRankingByViewport ? 'کادر نقشه' : 'شهر'} ({areaUnit === 'sqft' ? 'ft²' : 'متر'}):</span>
            <strong className="text-slate-900 dark:text-white">{toPersianNum(Number(convertPricePerSqmToUnit(cityMarketStats.medianPricePerSqm, areaUnit).toFixed(1)))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(cityMarketStats.medianPricePerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}</strong>
            <span className="text-slate-400">·</span>
            <span>IQR: <strong className="text-emerald-700 dark:text-emerald-400">{toPersianNum(Number(convertPricePerSqmToUnit(cityMarketStats.iqrPricePerSqm ?? 0, areaUnit).toFixed(1)))}م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(cityMarketStats.iqrPricePerSqm ?? 0, areaUnit), intlCurrency, radarLocale)})` : ''}</strong></span>
            <span className="text-slate-400">·</span>
            <span className="dark:text-slate-200">{mode === 'rent' ? 'رهن ' : ''}واحد {formatAreaShort(80, areaUnit)}: <strong className="text-slate-800">{toPersianNum(((cityMarketStats.medianPricePerSqm * 80) / 1000).toFixed(1))} میلیارد</strong></span>
          </span>
          <button
            type="button"
            aria-pressed={filterRankingByViewport}
            onClick={() => updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport })}
            className={`px-2 py-0.5 rounded-[6px] text-[9.5px] font-extrabold border transition cursor-pointer shrink-0 ${
              filterRankingByViewport
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
            title="محاسبه میانه قیمت و رتبه‌بندی فقط برای محلات داخل کادر فعلی نقشه"
          >
            📍 فقط کادر نقشه ({toPersianNum(scopedNeighborhoods.length)})
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <select
          aria-label="انتخاب سریع محله از کل فهرست"
          value={selectedHoodId}
          onChange={(e) => {
            const targetId = Number(e.target.value);
            const found = evaluatedNeighborhoods.find((h) => h.id === targetId);
            if (found) onSelectNeighborhood(found);
          }}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-[9px] px-2.5 py-1.5 text-[11px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600 cursor-pointer"
        >
          {evaluatedNeighborhoods.map((h, i) => {
            const uBuy = Number(convertPricePerSqmToUnit(h.buyPerSqm, areaUnit).toFixed(1));
            const uDeal = Number(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(h.id, h.name, h.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit).toFixed(1));
            const fx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(mode === 'rent' ? h.rahn80m : uBuy, intlCurrency, radarLocale)}` : '';
            return (
              <option key={h.id} value={h.id}>
                {toPersianNum(i + 1)}. {h.name} — {h.zone} ({mode === 'rent' ? `رهن ${formatAreaShort(80, areaUnit)} ${toPersianNum(h.rahn80m)} م` : `${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(uBuy)} م · معامله: ${toPersianNum(uDeal)} م`}{fx})
              </option>
            );
          })}
        </select>
        <select
          aria-label="انتخاب از کل ۲۷۵ محله و شهر ایران (۳۱ استان)"
          value={selectedHoodId}
          onChange={(e) => {
            const targetId = Number(e.target.value);
            const found = evaluatedNeighborhoods.find((h) => h.id === targetId) || nationwideHoods.find((h) => h.id === targetId);
            if (!found) return;
            const targetCity = resolveCityIdForNeighborhood(found.id);
            if (onSwitchCity && targetCity !== activeCity) {
              onSwitchCity(targetCity, found.id, [found.lat, found.lng], 13);
              return;
            }
            onSelectNeighborhood(found as EvaluatedNeighborhood);
          }}
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-[9px] px-2.5 py-1.5 text-[11px] font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600 cursor-pointer"
        >
          {(Object.keys(MULTI_CITY_CONFIGS) as CityId[]).map((cId) => {
            const cfg = MULTI_CITY_CONFIGS[cId];
            return (
              <optgroup key={cId} label={`حوزه ${cfg.nameFa} (${toPersianNum(cfg.neighborhoods.length)} محله و شهر)`}>
                {cfg.neighborhoods.map((h) => {
                  const uBuy = Number(convertPricePerSqmToUnit(h.buyPerSqm, areaUnit).toFixed(1));
                  const fx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uBuy, intlCurrency, radarLocale)})` : '';
                  return (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.zone}) — {areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(uBuy)} م{fx}
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar apple-segmented dark:bg-slate-800 p-1 rounded-[10px]">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = criterion === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCriterion(tab.id)}
              className={`px-2.5 py-1 rounded-[8px] text-[10.5px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer ${
                active
                  ? 'apple-segmented-pill-active dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3 stroke-[1.75] text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {rankedHoods.map((hood, index) => {
          const isSelected = hood.id === selectedHoodId;
          const isArcTarget =
            comparisonArc.active &&
            ((comparisonArc.hoodA?.id === selectedHoodId && comparisonArc.hoodB?.id === hood.id) ||
              (comparisonArc.hoodB?.id === selectedHoodId && comparisonArc.hoodA?.id === hood.id));
          const dotColor = hood.status === 'green' ? 'bg-emerald-500' : hood.status === 'yellow' ? 'bg-amber-500' : 'bg-rose-500';
          const explain = explainNeighborhoodRecommendation(hood, { mode, topReferenceScore: rankedHoods[0]?.overallScore });
          const rankPrefix = index > 0 && explain.isTieBandWithTop ? `≈${toPersianNum(index + 1)}.` : `${toPersianNum(index + 1)}.`;
          return (
            <div
              key={hood.id}
              title={`${explain.budgetFitSemanticsLabelFa} · ${explain.scoreSemanticsLabelFa}: ${toPersianNum(hood.overallScore)}/۱۰ · ${explain.tradeOffSummaryFa}`}
              className={`rounded-[10px] border text-[11px] font-bold flex items-center whitespace-nowrap shrink-0 transition ${
                isSelected
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-600 text-emerald-900 dark:text-emerald-200 shadow-2xs ring-1 ring-emerald-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectNeighborhood(hood)}
                className="px-2.5 py-1.5 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-label={explain.budgetFitSemanticsLabelFa} />
                <span>
                  {rankPrefix} {hood.name}
                </span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums">
                  · {formatSubMetric(hood)}
                </span>
              </button>
              {!isSelected && currentSelectedHood && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMapAdvancedOverlayState({
                      comparisonArc: {
                        active: !isArcTarget,
                        isPinned: !isArcTarget,
                        hoodA: currentSelectedHood,
                        hoodB: hood,
                      },
                    });
                  }}
                  title={`ترسیم کمان مقایسه زنده بین ${currentSelectedHood.name} و ${hood.name} روی نقشه`}
                  className={`px-1.5 py-1.5 border-r text-[10px] transition cursor-pointer rounded-l-[10px] ${
                    isArcTarget
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                      : 'border-slate-200/70 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Scale className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}