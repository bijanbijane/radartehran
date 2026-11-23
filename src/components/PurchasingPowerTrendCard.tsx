import React from 'react';
import { TrainFront, TrendingDown, TrendingUp } from 'lucide-react';
import { BubbleReport, EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { resolveCityIdForNeighborhood } from '../data/multiCityData';
import {
  computeSpatialProximityReport,
  updateMapAdvancedOverlayState,
  useMapAdvancedOverlayState,
} from './mapAdvancedLayers';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import {
  convertAreaFromSqm,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaValue,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';

export interface PurchasingPowerTrendCardProps {
  selectedHood: EvaluatedNeighborhood;
  marketReport: BubbleReport;
  effectiveBuyBudget: number;
}

export function PurchasingPowerTrendCard({
  selectedHood,
  marketReport,
  effectiveBuyBudget,
}: PurchasingPowerTrendCardProps): React.ReactElement | null {
  const overlayState = useMapAdvancedOverlayState();
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();

  if (!selectedHood || !marketReport?.trendData?.length) return null;

  const spatialReport = computeSpatialProximityReport(
    selectedHood,
    resolveCityIdForNeighborhood(selectedHood.id)
  );

  const basePriceNow = Math.max(1, selectedHood.baseBuyPerSqm || selectedHood.buyPerSqm);
  const currentPrice = Math.max(1, selectedHood.buyPerSqm || basePriceNow);
  const ageDiscountRatio = currentPrice / basePriceNow;
  const rawStartPrice = Math.max(1, marketReport.trendData[0]?.hoodPrice || basePriceNow);
  const startPrice = Math.max(1, Math.round(rawStartPrice * ageDiscountRatio));
  const safeBudget = Math.max(500, effectiveBuyBudget);

  const sqm6MonthsAgo = Math.round(safeBudget / startPrice);
  const sqmToday = Math.round(safeBudget / currentPrice);
  const dealPerSqm = Math.max(1, aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, currentPrice, buildNeighborhoodListingSamples(selectedHood)).estimatedDealPricePerSqm);
  const sqmDealToday = Math.round(safeBudget / dealPerSqm);
  const uDealPrice = convertPricePerSqmToUnit(dealPerSqm, areaUnit);
  const sqmDiff = sqmToday - sqm6MonthsAgo;
  const convertedDiff = convertAreaFromSqm(Math.abs(sqmDiff), areaUnit);
  const uStartPrice = convertPricePerSqmToUnit(startPrice, areaUnit);
  const uCurrentPrice = convertPricePerSqmToUnit(currentPrice, areaUnit);
  const uPriceDelta = Number((uCurrentPrice - uStartPrice).toFixed(1));
  const total80DeltaMillion = (currentPrice - startPrice) * 80;
  const total80mTodayMillions = Math.round(currentPrice * 80);
  const monthlyRent80mMillions = Math.max(1, Math.round(selectedHood.rahn80m * 0.03));
  const fxStart = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uStartPrice, intlCurrency, radarLocale)}` : '';
  const fxCurrent = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uCurrentPrice, intlCurrency, radarLocale)}` : '';
  const fxDelta = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(uPriceDelta), intlCurrency, radarLocale)})` : '';
  const fxTotal80Delta = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(total80DeltaMillion), intlCurrency, radarLocale)})` : '';
  const fxBudget = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(safeBudget, intlCurrency, radarLocale)})` : '';

  const laggedCityGrowth =
    marketReport.hoodGrowth6mPercent < marketReport.tehranGrowth6mPercent;

  return (
    <div className="space-y-3.5">
      <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-white">
            {sqmDiff >= 0 ? (
              <TrendingUp className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span>تغییر قدرت خرید بودجه شما ({toPersianNum((safeBudget / 1000).toFixed(1))} میلیارد{fxBudget}) در ۶ ماه گذشته</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-md text-[10.5px] font-black tabular-nums ${
              sqmDiff >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}
          >
            {sqmDiff > 0
              ? `+${toPersianNum(convertedDiff)} ${areaUnit === 'sqft' ? 'ft²' : 'متر مربع'}`
              : sqmDiff < 0
                ? `-${toPersianNum(convertedDiff)} ${areaUnit === 'sqft' ? 'ft²' : 'متر مربع'}`
                : 'ثابت (۰ تغییر)'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-center">
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 rounded-xl p-2.5">
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400">قدرت خرید ۶ ماه پیش در {selectedHood.name}</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-200 tabular-nums mt-0.5">
              {formatAreaValue(sqm6MonthsAgo, areaUnit)}
            </div>
            <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
              ({areaUnit === 'sqft' ? 'هر ft²' : 'متری'} {toPersianNum(uStartPrice)} میلیون{fxStart})
            </div>
          </div>

          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl p-2.5">
            <div className="text-[10.5px] text-emerald-800 dark:text-emerald-300">قدرت خرید امروز در {selectedHood.name}</div>
            <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
              {formatAreaValue(sqmToday, areaUnit)}
            </div>
            <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 tabular-nums mt-0.5">
              ({areaUnit === 'sqft' ? 'هر ft²' : 'متری'} {toPersianNum(uCurrentPrice)} میلیون{fxCurrent})
            </div>
            <div className="text-[10px] text-teal-800 dark:text-teal-300 font-bold tabular-nums mt-0.5">
              با تخمین معامله ({toPersianNum(uDealPrice)} م): {formatAreaValue(sqmDealToday, areaUnit)}
            </div>
            <div className="text-[9.5px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              {formatAreaShort(80, areaUnit)}: {toPersianNum((total80mTodayMillions / 1000).toFixed(1))} میلیارد · اجاره: {toPersianNum(monthlyRent80mMillions)} م/ماه
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50/80 dark:bg-slate-950/60 rounded-lg p-2 border border-slate-100 dark:border-slate-800">
          {laggedCityGrowth
            ? `💡 فرصت خرید: رشد ۶ ماهه ${selectedHood.name} (${toPersianNum(marketReport.hoodGrowth6mPercent)}٪ · تغییر هر ${areaUnit === 'sqft' ? 'ft²' : 'متر'}: ${uPriceDelta >= 0 ? '+' : ''}${toPersianNum(uPriceDelta)} م${fxDelta} · تغییر واحد ${formatAreaShort(80, areaUnit)}: ${total80DeltaMillion >= 0 ? '+' : ''}${toPersianNum((total80DeltaMillion / 1000).toFixed(2))} میلیارد${fxTotal80Delta}) کمتر از میانگین شهر (${toPersianNum(marketReport.tehranGrowth6mPercent)}٪) بوده و جاماندگی قیمتی دارد.`
            : `📊 تحلیل روند: رشد ۶ ماهه ${selectedHood.name} (${toPersianNum(marketReport.hoodGrowth6mPercent)}٪ · تغییر هر ${areaUnit === 'sqft' ? 'ft²' : 'متر'}: ${uPriceDelta >= 0 ? '+' : ''}${toPersianNum(uPriceDelta)} م${fxDelta} · تغییر واحد ${formatAreaShort(80, areaUnit)}: ${total80DeltaMillion >= 0 ? '+' : ''}${toPersianNum((total80DeltaMillion / 1000).toFixed(2))} میلیارد${fxTotal80Delta}) بالاتر از میانگین شهر (${toPersianNum(marketReport.tehranGrowth6mPercent)}٪) بوده؛ چانه‌زنی ضروری است.`}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10.5px]">
          <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 truncate">
            <TrainFront className="w-3.5 h-3.5 shrink-0" style={{ color: spatialReport.nearestMetroColor }} />
            <span>
              فاصله تا مترو: <strong>~{toPersianNum(spatialReport.nearestMetroDistKm)} کم{areaUnit === 'sqft' ? ` (${toPersianNum(Math.round(spatialReport.nearestMetroDistKm * 3280.84).toLocaleString('en-US'))} فوت)` : ''}</strong>
              {selectedHood.distKm !== null ? ` · مرکز: ${toPersianNum(areaUnit === 'sqft' ? Number((selectedHood.distKm * 0.621371).toFixed(1)) : selectedHood.distKm)} ${areaUnit === 'sqft' ? 'مایل' : 'کم'}` : ''} ·{' '}
              <strong>{spatialReport.trafficZoneLabelFa}</strong>
            </span>
          </span>
          <button
            type="button"
            onClick={() =>
              updateMapAdvancedOverlayState({
                showMetroLines: !overlayState.showMetroLines,
                showTrafficZones: !overlayState.showTrafficZones,
              })
            }
            aria-label={overlayState.showMetroLines && overlayState.showTrafficZones ? 'مخفی‌سازی لایه‌های مترو و طرح ترافیک در نقشه' : 'نمایش خطوط مترو و محدوده طرح ترافیک روی نقشه'}
            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold cursor-pointer transition shrink-0"
          >
            {overlayState.showMetroLines && overlayState.showTrafficZones
              ? 'مخفی‌سازی مترو و طرح در نقشه'
              : '🚇 نمایش مترو و طرح روی نقشه'}
          </button>
        </div>
      </div>
    </div>
  );
}
