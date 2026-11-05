import React, { useMemo } from 'react';
import { Building2, Compass, Maximize2, Percent, Scale, Sparkles } from 'lucide-react';
import {
  calcDistanceKm,
  EvaluatedNeighborhood,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  toPersianNum,
} from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood } from '../data/multiCityData';
import {
  updateMapAdvancedOverlayState,
  useMapAdvancedOverlayState,
} from './mapAdvancedLayers';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';

export interface BudgetBridgeAdvisorCardProps {
  selectedHood: EvaluatedNeighborhood;
  mode: 'rent' | 'buy';
  targetSqm: number;
  onChangeTargetSqm: (sqm: number) => void;
  buildingAgeSegment: 'new' | 'mid' | 'older';
  onChangeBuildingAgeSegment: (seg: 'new' | 'mid' | 'older') => void;
  useLoanBooster: boolean;
  onToggleLoanBooster: () => void;
  deductTenantRahnInBuy: boolean;
  onToggleDeductTenantRahn: () => void;
  effectiveBuyBudget: number;
  totalRahnEquivalent: number;
}

export function BudgetBridgeAdvisorCard({
  selectedHood,
  mode,
  targetSqm,
  onChangeTargetSqm,
  buildingAgeSegment,
  onChangeBuildingAgeSegment,
  useLoanBooster,
  onToggleLoanBooster,
  deductTenantRahnInBuy,
  onToggleDeductTenantRahn,
  effectiveBuyBudget,
  totalRahnEquivalent,
}: BudgetBridgeAdvisorCardProps): React.ReactElement | null {
  const { comparisonArc } = useMapAdvancedOverlayState();
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const fxTag = (millionVal: number) =>
    intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(millionVal, intlCurrency, radarLocale)})` : '';

  const nearbyAffordableNeighbors = useMemo(() => {
    if (!selectedHood) return [];
    const cityId = resolveCityIdForNeighborhood(selectedHood.id);
    const cityHoods = MULTI_CITY_CONFIGS[cityId]?.neighborhoods || [];
    return cityHoods
      .filter((h) => {
        if (h.id === selectedHood.id) return false;
        return mode === 'buy'
          ? h.buyPerSqm < selectedHood.buyPerSqm * 0.92
          : h.rahn80m < selectedHood.rahn80m * 0.92;
      })
      .map((h) => {
        const distKm = Number(
          (calcDistanceKm(selectedHood.lat, selectedHood.lng, h.lat, h.lng) ?? 99).toFixed(1)
        );
        return { raw: h, distKm };
      })
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 3);
  }, [selectedHood, mode]);

  if (!selectedHood || selectedHood.status === 'green') return null;

  const rahnPerSqm = Math.max(1, selectedHood.rahn80m / 80);
  const rentAgeFactor =
    buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.9 : 0.8;
  const netCostPerSqmBuy = deductTenantRahnInBuy
    ? Math.max(15, selectedHood.buyPerSqm * 0.9 - rahnPerSqm * rentAgeFactor)
    : Math.max(15, selectedHood.buyPerSqm);
  const costPerSqmRent = Math.max(1, rahnPerSqm * rentAgeFactor);

  const rawAffordableSqm =
    mode === 'buy'
      ? Math.floor(effectiveBuyBudget / netCostPerSqmBuy)
      : Math.floor(totalRahnEquivalent / costPerSqmRent);
  const affordableSqm = Math.max(30, Math.min(250, rawAffordableSqm));
  const agg = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, []);
  const dealNetCostBuy = deductTenantRahnInBuy ? Math.max(15, agg.estimatedDealPricePerSqm * 0.9 - rahnPerSqm * rentAgeFactor) : Math.max(15, agg.estimatedDealPricePerSqm);
  const dealAffordableSqm = Math.max(30, Math.min(250, Math.floor(effectiveBuyBudget / dealNetCostBuy)));

  const baseNewBuyPerSqm = selectedHood.baseBuyPerSqm || selectedHood.buyPerSqm;
  const midSavingsMillion =
    mode === 'buy'
      ? Math.round(baseNewBuyPerSqm * targetSqm * 0.12)
      : Math.round(selectedHood.rahn80m * (targetSqm / 80) * 0.1);
  const olderSavingsMillion =
    mode === 'buy'
      ? Math.round(baseNewBuyPerSqm * targetSqm * 0.24)
      : Math.round(selectedHood.rahn80m * (targetSqm / 80) * 0.2);

  const tenantRahnUnlockMillion = Math.round(
    selectedHood.rahn80m * (targetSqm / 80) * rentAgeFactor + selectedHood.buyPerSqm * targetSqm * 0.1
  );
  const requiredBudgetMillion = mode === 'buy' ? Math.round(netCostPerSqmBuy * targetSqm) : Math.round(selectedHood.rahn80m * (targetSqm / 80) * rentAgeFactor);
  const budgetGapMillion = Math.max(0, requiredBudgetMillion - (mode === 'buy' ? effectiveBuyBudget : totalRahnEquivalent));
  const monthlyRent80mMillions = Math.max(1, Math.round(selectedHood.rahn80m * 0.03));

  return (
    <div className="apple-grouped-card bg-amber-50/75 dark:bg-amber-950/20 border-amber-200/90 dark:border-amber-900/50 p-3.5 space-y-2.5 text-xs">
      <div className="flex items-center justify-between border-b border-amber-200/70 dark:border-amber-900/40 pb-2">
        <div className="flex items-center gap-1.5 font-extrabold text-amber-950 dark:text-amber-200">
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>مشاور پل بودجه: راهکارهای عملی برای ورود به محله {selectedHood.name}</span>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200 text-[10px] font-black tabular-nums">
          کمبود بودجه ({formatAreaShort(targetSqm, areaUnit)}): {toPersianNum(selectedHood.diffPercent)}٪{budgetGapMillion > 0 ? ` (~${toPersianNum(budgetGapMillion)} م${fxTag(budgetGapMillion)})` : ''}
        </span>
      </div>

      <div className="space-y-2">
        {/* Option 1: Adjust Area */}
        <div className="bg-white/90 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1">
              <Maximize2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>۱. تعدیل متراژ متناسب با بودجه فعلی</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              {rawAffordableSqm >= 35 ? (
                <>با بودجه فعلی می‌توانید در {selectedHood.name} واحد <strong className="text-emerald-700 dark:text-emerald-400 font-black">{formatAreaShort(affordableSqm, areaUnit)}</strong>{mode === 'buy' ? <> (با تخمین قطعی معامله: <strong className="text-teal-700 font-black">{formatAreaShort(dealAffordableSqm, areaUnit)}</strong>)</> : null} تهیه کنید.</>
              ) : (
                <>بودجه فعلی برای حداقل متراژ مسکونی استاندارد ({formatAreaShort(35, areaUnit)}) در این محله کافی نیست؛ از اهرم‌های زیر کمک بگیرید.</>
              )}
            </p>
          </div>
          {rawAffordableSqm >= 35 && affordableSqm < targetSqm && (
            <button
              type="button"
              onClick={() => onChangeTargetSqm(affordableSqm)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-extrabold cursor-pointer transition shrink-0"
            >
              تغییر متراژ به {formatAreaShort(affordableSqm, areaUnit)}
            </button>
          )}
        </div>

        {/* Option 2: Building Age */}
        {buildingAgeSegment === 'new' && (
          <div className="bg-white/90 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>۲. انتخاب واحدهای چندساله خوش‌نقشه ({formatAreaShort(targetSqm, areaUnit)})</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                تغییر سن بنا به ۶–۱۵ سال حدود <strong className="text-slate-900 dark:text-white">{toPersianNum(midSavingsMillion)} م{fxTag(midSavingsMillion)}</strong> و بالای ۱۵ سال <strong className="text-slate-900 dark:text-white">{toPersianNum(olderSavingsMillion)} م{fxTag(olderSavingsMillion)}</strong> بودجه لازم را کاهش می‌دهد.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => onChangeBuildingAgeSegment('mid')} className="px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-200 text-[10.5px] font-bold cursor-pointer">۶ تا ۱۵ سال (-۱۲٪)</button>
              <button type="button" onClick={() => onChangeBuildingAgeSegment('older')} className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10.5px] font-bold cursor-pointer">۱۵+ سال (-۲۴٪)</button>
            </div>
          </div>
        )}

        {/* Option 3: Financial Levers */}
        {(!useLoanBooster || (mode === 'buy' && !deductTenantRahnInBuy)) && (
          <div className="bg-white/90 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>۳. فعال‌سازی اهرم‌های وام و رهن مستأجر</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {mode === 'buy'
                  ? `کسر رهن مستأجر و تنفس سند حدود ${toPersianNum(tenantRahnUnlockMillion)} م${fxTag(tenantRahnUnlockMillion)} و وام مسکن ۱,۲۰۰ م${fxTag(1200)} به بودجه شما می‌افزاید.`
                  : `وام ودیعه مسکن ۴۰۰ میلیون تومان${fxTag(400)} به توان رهن کامل شما اضافه می‌کند.`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!useLoanBooster && (
                <button type="button" onClick={onToggleLoanBooster} className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[10.5px] font-bold cursor-pointer">
                  {mode === 'buy' ? '+ وام ۱.۲ میلیاردی' : '+ وام ودیعه ۴۰۰م'}
                </button>
              )}
              {mode === 'buy' && !deductTenantRahnInBuy && (
                <button type="button" onClick={onToggleDeductTenantRahn} className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10.5px] font-bold cursor-pointer">+ کسر رهن مستأجر</button>
              )}
            </div>
          </div>
        )}

        {/* Option 4: Spatial Affordable Neighbor Alternatives */}
        {nearbyAffordableNeighbors.length > 0 && (
          <div className="bg-white/90 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-900/40 rounded-xl p-2.5 space-y-1.5">
            <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>۴. نزدیک‌ترین محلات همسایه با قیمت مناسب‌تر:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {nearbyAffordableNeighbors.map(({ raw, distKm }) => {
                const isPinned = comparisonArc.active && ((comparisonArc.hoodA?.id === selectedHood.id && comparisonArc.hoodB?.id === raw.id) || (comparisonArc.hoodB?.id === selectedHood.id && comparisonArc.hoodA?.id === raw.id));
                const diffSqm = Math.max(1, selectedHood.buyPerSqm - raw.buyPerSqm);
                const diffRahn = Math.max(10, selectedHood.rahn80m - raw.rahn80m);
                const diffRentMonthly = Math.max(1, Math.round(diffRahn * 0.03));
                void monthlyRent80mMillions;
                return (
                  <button
                    key={raw.id}
                    type="button"
                    onClick={() => {
                      const evaluatedNeighbor: EvaluatedNeighborhood = {
                        ...raw, baseBuyPerSqm: raw.buyPerSqm,
                        overallScore: Math.round(((raw.air + raw.powerWater + raw.internet + raw.metro + raw.security + raw.flatTerrain) / 6) * 10) / 10,
                        status: 'green', diffPercent: 0, distKm: null,
                        trafficInfo: getNeighborhoodTrafficInfo(raw), marketReport: getNeighborhoodMarketReport(raw),
                      };
                      updateMapAdvancedOverlayState({
                        comparisonArc: { active: !isPinned, isPinned: !isPinned, hoodA: selectedHood, hoodB: evaluatedNeighbor },
                      });
                    }}
                    className={`px-2 py-1 rounded-lg border text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer ${
                      isPinned ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'
                    }`}
                  >
                    <Scale className="w-3 h-3 shrink-0" />
                    <span>{raw.name}</span>
                    <span className="opacity-85 tabular-nums">
                      ({toPersianNum(distKm)}کم{areaUnit === 'sqft' ? ` / ${toPersianNum((distKm * 0.621371).toFixed(1))} mi` : ''} ·{' '}
                      {mode === 'rent'
                        ? `رهن (${formatAreaShort(80, areaUnit)}) ${toPersianNum(diffRahn)}م${fxTag(diffRahn)} / اجاره ${toPersianNum(diffRentMonthly)}م`
                        : `${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(convertPricePerSqmToUnit(diffSqm, areaUnit))}م${fxTag(convertPricePerSqmToUnit(diffSqm, areaUnit))}`}{' '}
                      ارزان‌تر)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
