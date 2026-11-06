import React from 'react';
import { Award, Heart, MapPin, Scale, Trash2, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';
import { EvaluatedNeighborhood, getNeighborhoodMarketReport, getNeighborhoodTrafficInfo, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../data/multiCityData';
import { computeSpatialProximityReport, updateMapAdvancedOverlayState } from './mapAdvancedLayers';
import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface ShortlistMatrixModalProps {
  open: boolean;
  onClose: () => void;
  favoriteHoodIds: number[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  mode: 'rent' | 'buy';
  buyTotalBudget: number;
  totalRahnEquivalent: number;
  rentAgeMultiplier?: number;
  deductTenantRahnInBuy?: boolean;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onRemoveFavorite: (hoodId: number) => void;
}

export function ShortlistMatrixModal({
  open, onClose, favoriteHoodIds, evaluatedNeighborhoods, mode, buyTotalBudget, totalRahnEquivalent,
  rentAgeMultiplier = 1, deductTenantRahnInBuy = false, onSelectNeighborhood, onRemoveFavorite,
}: ShortlistMatrixModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(open, onClose);
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const isEn = radarLocale === 'en';

  if (!open) return null;

  const allKnownHoods = getAllMultiCityNeighborhoods();
  const shortlistedHoods = favoriteHoodIds
    .map((id) => {
      const evaluated = evaluatedNeighborhoods.find((n) => n.id === id);
      if (evaluated) return evaluated;
      const raw = allKnownHoods.find((n) => n.id === id);
      if (!raw) return undefined;
      return {
        ...raw, baseBuyPerSqm: raw.buyPerSqm,
        overallScore: Math.round(((raw.air + raw.powerWater + raw.internet + raw.metro + raw.security + raw.flatTerrain) / 6) * 10) / 10,
        status: 'yellow' as const, diffPercent: 0, distKm: null,
        trafficInfo: getNeighborhoodTrafficInfo(raw), marketReport: getNeighborhoodMarketReport(raw),
      } satisfies EvaluatedNeighborhood;
    })
    .filter((n): n is EvaluatedNeighborhood => Boolean(n));

  const spatialReportsByHoodId = new Map(
    shortlistedHoods.map((h) => [h.id, computeSpatialProximityReport(h, resolveCityIdForNeighborhood(h.id))])
  );
  const minMetroDistKm = shortlistedHoods.length
    ? Math.min(...shortlistedHoods.map((h) => spatialReportsByHoodId.get(h.id)?.nearestMetroDistKm ?? 99)) : 0;

  const getAffordableSqm = (h: EvaluatedNeighborhood): number => {
    if (mode === 'buy') {
      const netCashPerSqm = deductTenantRahnInBuy
        ? Math.max(10, h.buyPerSqm * 0.9 - (h.rahn80m / 80) * rentAgeMultiplier) : Math.max(1, h.buyPerSqm);
      return Math.max(0, Math.round(buyTotalBudget / netCashPerSqm));
    }
    const effRahn80 = Math.max(1, h.rahn80m * rentAgeMultiplier);
    return Math.max(0, Math.round((totalRahnEquivalent / effRahn80) * 80));
  };

  const minBuyPerSqm = shortlistedHoods.length ? Math.min(...shortlistedHoods.map((h) => h.buyPerSqm)) : 0;
  const minRahn80m = shortlistedHoods.length ? Math.min(...shortlistedHoods.map((h) => h.rahn80m)) : 0;
  const maxAffordable = shortlistedHoods.length ? Math.max(...shortlistedHoods.map((h) => getAffordableSqm(h))) : 0;

  const scoreRows = [
    { key: 'overallScore', labelFa: 'امتیاز کل کیفیت زندگی', labelEn: 'Overall Livability Score', getValue: (h: EvaluatedNeighborhood) => h.overallScore },
    { key: 'air', labelFa: 'کیفیت هوا و فضای سبز', labelEn: 'Clean Air & Green Spaces', getValue: (h: EvaluatedNeighborhood) => h.air ?? 7 },
    { key: 'powerWater', labelFa: 'پایداری آب و برق', labelEn: 'Power & Water Reliability', getValue: (h: EvaluatedNeighborhood) => h.powerWater ?? 8 },
    { key: 'internet', labelFa: 'اینترنت و فیبر نوری', labelEn: 'Internet & Fiber Speed', getValue: (h: EvaluatedNeighborhood) => h.internet ?? 8 },
    { key: 'metro', labelFa: 'دسترسی مترو و حمل‌ونقل', labelEn: 'Metro & Transit Access', getValue: (h: EvaluatedNeighborhood) => h.metro ?? 8 },
    { key: 'security', labelFa: 'امنیت و آرامش شبانه', labelEn: 'Safety & Quiet Hours', getValue: (h: EvaluatedNeighborhood) => h.security ?? 8 },
    { key: 'flatTerrain', labelFa: 'همواری گذرها (بدون شیب)', labelEn: 'Terrain Flatness', getValue: (h: EvaluatedNeighborhood) => h.flatTerrain ?? 8 },
    { key: 'traffic', labelFa: 'امتیاز ترافیک و روانی تردد', labelEn: 'Traffic Flow Score', getValue: (h: EvaluatedNeighborhood) => h.trafficInfo?.trafficScore ?? 6.5 },
  ];

  const anchorHood = shortlistedHoods[0] || null;

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} role="dialog" aria-modal="true" aria-label={isEn ? 'Shortlisted Neighborhoods Matrix' : 'مقایسه جدولی محله‌های منتخب'} onClick={onClose} className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="w-full max-w-5xl apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] flex flex-col focus:outline-none shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Heart className="w-4 h-4 stroke-[2] fill-rose-500" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {isEn ? `Shortlist Decision Matrix (${toPersianNum(shortlistedHoods.length)} Neighborhoods)` : `ماتریس مقایسه هم‌زمان محله‌های منتخب (${toPersianNum(shortlistedHoods.length)} محله)`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn ? 'The top-ranking neighborhood in each category is highlighted with an emerald badge' : 'برترین محله در هر شاخص با کادر سبز زمردی مشخص شده است'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" aria-label={isEn ? 'Close matrix' : 'بستن ماتریس'} onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {shortlistedHoods.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {isEn ? 'No neighborhoods shortlisted yet. Click the heart icon on any neighborhood card to add it to this comparison matrix.' : 'هنوز محله‌ای به لیست منتخب اضافه نکرده‌اید. با کلیک روی آیکون قلب در بالای پنل هر محله، آن را به لیست مقایسه اضافه کنید.'}
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto flex-1 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-xs border-collapse min-w-[560px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                  <th className={`p-3 font-extrabold text-slate-700 dark:text-slate-200 sticky ${isEn ? 'left-0' : 'right-0'} bg-slate-50 dark:bg-slate-800 z-10 min-w-[170px] ${isEn ? 'border-r text-left' : 'border-l text-right'} border-slate-200/80 dark:border-slate-700`}>
                    {isEn ? 'Comparison Indicator' : 'شاخص مقایسه'}
                  </th>
                  {shortlistedHoods.map((hood, idx) => (
                    <th key={hood.id} className="p-3 min-w-[165px] align-top text-center">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-black text-sm text-slate-900 dark:text-white">{hood.name}</span>
                        <button type="button" aria-label={isEn ? `Remove ${hood.name} from favorites` : `حذف ${hood.name} از منتخب‌ها`} onClick={() => onRemoveFavorite(hood.id)} title={isEn ? 'Remove from favorites' : 'حذف از منتخب‌ها'} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 cursor-pointer transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mb-2">{hood.zone}</div>
                      <div className="space-y-1">
                        <button type="button" onClick={() => { onSelectNeighborhood(hood); onClose(); }} aria-label={isEn ? `Jump to ${hood.name} on map` : `پرش به ${hood.name} روی نقشه`} className="w-full py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition">
                          <MapPin className="w-3 h-3" />
                          <span>{isEn ? 'Jump on Map' : 'پرش روی نقشه'}</span>
                        </button>
                        {idx > 0 && anchorHood && (
                          <button type="button" onClick={() => { updateMapAdvancedOverlayState({ comparisonArc: { active: true, isPinned: true, hoodA: anchorHood, hoodB: hood } }); onSelectNeighborhood(hood); onClose(); }} aria-label={isEn ? `Comparison Arc between ${anchorHood.name} and ${hood.name}` : `کمان مقایسه بین ${anchorHood.name} و ${hood.name}`} className="w-full py-1 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition">
                            <Scale className="w-3 h-3" />
                            <span>{isEn ? `Arc with ${anchorHood.name}` : `کمان با ${anchorHood.name}`}</span>
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                <tr>
                  <td className={`p-3 font-bold text-slate-700 dark:text-slate-300 sticky ${isEn ? 'left-0 text-left border-r' : 'right-0 text-right border-l'} bg-white dark:bg-slate-900 z-10 border-slate-200/80 dark:border-slate-800`}>
                    {isEn ? `Asking Price (${areaUnit === 'sqft' ? 'ft²' : 'm²'})` : `قیمت خرید (${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'} — میلیون تومان)`}
                  </td>
                  {shortlistedHoods.map((hood) => {
                    const isBest = hood.buyPerSqm === minBuyPerSqm;
                    const unitBuy = Number(convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit).toFixed(1));
                    const hoodTotal80m = Math.round((hood.buyPerSqm * 80) / 1000);
                    const monthlyRent80m = Math.round(hood.rahn80m * 0.03);
                    return (
                      <td key={hood.id} className={`p-3 tabular-nums font-bold ${isBest ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                        {toPersianNum(unitBuy)} {isEn ? 'M' : 'میلیون'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)})` : ''} ({formatAreaShort(80, areaUnit)}: {toPersianNum(hoodTotal80m)}B · rent: {toPersianNum(monthlyRent80m)}M)
                        {isBest && <span className="inline-flex items-center text-[10px] text-emerald-700 dark:text-emerald-400 font-bold ml-1"><Award className="w-3 h-3 mx-0.5" />{isEn ? 'Lowest' : 'ارزان‌ترین'}</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className={`p-3 font-bold text-slate-700 dark:text-slate-300 sticky ${isEn ? 'left-0 text-left border-r' : 'right-0 text-right border-l'} bg-white dark:bg-slate-900 z-10 border-slate-200/80 dark:border-slate-800`}>
                    {isEn ? `Estimated Deal v6.4 (${areaUnit === 'sqft' ? 'ft²' : 'm²'})` : `تخمین قیمت قطعی معامله v6.4 (${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'})`}
                  </td>
                  {shortlistedHoods.map((hood) => {
                    const agg = aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, []);
                    const unitDeal = Number(convertPricePerSqmToUnit(agg.estimatedDealPricePerSqm, areaUnit).toFixed(1));
                    const isBest = hood.buyPerSqm === minBuyPerSqm;
                    return (
                      <td key={hood.id} className={`p-3 tabular-nums font-bold ${isBest ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black' : 'text-teal-700 dark:text-teal-400'}`}>
                        {toPersianNum(unitDeal)} {isEn ? 'M' : 'میلیون'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)})` : ''}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className={`p-3 font-bold text-slate-700 dark:text-slate-300 sticky ${isEn ? 'left-0 text-left border-r' : 'right-0 text-right border-l'} bg-white dark:bg-slate-900 z-10 border-slate-200/80 dark:border-slate-800`}>
                    {isEn ? <span>Full Deposit ({formatAreaShort(80, areaUnit)})</span> : <span>رهن کامل ({formatAreaShort(80, areaUnit)} — میلیون تومان)</span>}
                  </td>
                  {shortlistedHoods.map((hood) => {
                    const isBest = hood.rahn80m === minRahn80m;
                    return (
                      <td key={hood.id} className={`p-3 tabular-nums font-bold ${isBest ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                        {toPersianNum(hood.rahn80m)} {isEn ? 'M' : 'میلیون'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(hood.rahn80m, intlCurrency, radarLocale)})` : ''} (rent: {toPersianNum(Math.round(hood.rahn80m * 0.03))}M)
                        {isBest && <span className="inline-flex items-center text-[10px] text-emerald-700 dark:text-emerald-400 font-bold ml-1"><Award className="w-3 h-3 mx-0.5" />{isEn ? 'Lowest' : 'ارزان‌ترین'}</span>}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className={`p-3 font-bold text-slate-700 dark:text-slate-300 sticky ${isEn ? 'left-0 text-left border-r' : 'right-0 text-right border-l'} bg-white dark:bg-slate-900 z-10 border-slate-200/80 dark:border-slate-800`}>
                    {isEn ? 'Affordable Area with Budget' : `متراژ قابل ${mode === 'buy' ? 'خرید' : 'اجاره'} با بودجه شما`}{intlCurrency !== 'IRT' && mode === 'buy' ? ` (${formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency, radarLocale)})` : ''}
                  </td>
                  {shortlistedHoods.map((hood) => {
                    const sqm = getAffordableSqm(hood);
                    const isBest = sqm === maxAffordable && sqm > 0;
                    return (
                      <td key={hood.id} className={`p-3 tabular-nums font-bold ${isBest ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                        ~{formatAreaValue(sqm, areaUnit, true)}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className={`p-3 font-bold text-slate-700 dark:text-slate-300 sticky ${isEn ? 'left-0 text-left border-r' : 'right-0 text-right border-l'} bg-white dark:bg-slate-900 z-10 border-slate-200/80 dark:border-slate-800`}>
                    {isEn ? 'Nearest Metro (GIS)' : 'نزدیک‌ترین خط مترو (GIS)'}
                  </td>
                  {shortlistedHoods.map((hood) => {
                    const rep = spatialReportsByHoodId.get(hood.id);
                    const isBest = rep && rep.nearestMetroDistKm === minMetroDistKm;
                    const distKm = rep?.nearestMetroDistKm ?? 1.5;
                    return (
                      <td key={hood.id} className={`p-3 font-bold ${isBest ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                        <div className="truncate max-w-[160px]">🚇 {rep?.nearestMetroLineName}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          ~{toPersianNum(distKm)} km ({toPersianNum(rep?.walkingMinutesEstimate ?? 15)} {isEn ? 'min walk' : 'دقیقه پیاده'})
                        </div>
                      </td>
                    );
                  })}
                </tr>
                {scoreRows.map((row) => {
                  const maxVal = Math.max(...shortlistedHoods.map((h) => row.getValue(h)));
                  return (
                    <tr key={row.key}>
                      <td className={`p-3 font-bold text-slate-700 dark:text-slate-300 sticky ${isEn ? 'left-0 text-left border-r' : 'right-0 text-right border-l'} bg-white dark:bg-slate-900 z-10 border-slate-200/80 dark:border-slate-800`}>
                        {isEn ? row.labelEn : row.labelFa}
                      </td>
                      {shortlistedHoods.map((hood) => {
                        const val = row.getValue(hood);
                        const isBest = val === maxVal;
                        return (
                          <td key={hood.id} className={`p-3 tabular-nums font-bold ${isBest ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                            {toPersianNum(val)}/10
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}