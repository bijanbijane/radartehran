import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronUp, Layers, Pin, Sparkles, TrainFront, Wind, Shield, Wifi, Coins } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState } from './mapAdvancedLayers';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, formatUnitBuyPriceTitle, getRadarCompareCopy } from '../utils/areaUnit';

export interface ExpandableComparisonTableProps {
  currentHood: EvaluatedNeighborhood; allNeighborhoods: EvaluatedNeighborhood[]; targetSqm: number;
  rentAgeMultiplier: number; mode: 'rent' | 'buy'; onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
}

export function ExpandableComparisonTable({ currentHood, allNeighborhoods, targetSqm, rentAgeMultiplier, mode, onSelectNeighborhood }: ExpandableComparisonTableProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const compareCopy = getRadarCompareCopy(radarLocale);
  const isEn = radarLocale === 'en';
  const [isPinnedA, setIsPinnedA] = useState<boolean>(false);
  const [hoodAId, setHoodAId] = useState<number>(currentHood.id);
  const [hoodBId, setHoodBId] = useState<number>(() => {
    const alternate = allNeighborhoods.find((h) => h.id !== currentHood.id);
    return alternate ? alternate.id : currentHood.id;
  });

  useEffect(() => {
    if (isPinnedA) {
      if (currentHood.id !== hoodAId) setHoodBId(currentHood.id);
    } else if (currentHood.id !== hoodBId) {
      setHoodAId(currentHood.id);
    }
  }, [currentHood.id, hoodAId, hoodBId, isPinnedA]);

  const hoodA = useMemo(() => allNeighborhoods.find((h) => h.id === hoodAId) || currentHood, [allNeighborhoods, hoodAId, currentHood]);
  const hoodB = useMemo(() => {
    const found = allNeighborhoods.find((h) => h.id === hoodBId);
    if (found) return found;
    const alternate = allNeighborhoods.find((h) => h.id !== hoodA.id);
    return alternate || hoodA;
  }, [allNeighborhoods, hoodBId, hoodA]);

  useEffect(() => {
    updateMapAdvancedOverlayState({ comparisonArc: { active: isExpanded || isPinnedA, isPinned: isPinnedA, hoodA, hoodB } });
    return () => { updateMapAdvancedOverlayState({ comparisonArc: { active: false, isPinned: false, hoodA: null, hoodB: null } }); };
  }, [isExpanded, isPinnedA, hoodA, hoodB]);

  const handleSwap = () => { const temp = hoodAId; setHoodAId(hoodBId); setHoodBId(temp); };

  const metrics = useMemo(() => {
    const costBuyA = hoodA.buyPerSqm; const costBuyB = hoodB.buyPerSqm;
    const uBuyA = convertPricePerSqmToUnit(costBuyA, areaUnit); const uBuyB = convertPricePerSqmToUnit(costBuyB, areaUnit);
    const aggA = aggregateNeighborhoodMarketMetrics(hoodA.id, hoodA.name, costBuyA, []);
    const aggB = aggregateNeighborhoodMarketMetrics(hoodB.id, hoodB.name, costBuyB, []);
    const uDealA = convertPricePerSqmToUnit(aggA.estimatedDealPricePerSqm, areaUnit);
    const uDealB = convertPricePerSqmToUnit(aggB.estimatedDealPricePerSqm, areaUnit);
    const totalBuyA = costBuyA * targetSqm; const totalBuyB = costBuyB * targetSqm;
    const total80mA = Math.round(costBuyA * 80); const total80mB = Math.round(costBuyB * 80);
    const scaledRahnA = Math.round(hoodA.rahn80m * (targetSqm / 80) * rentAgeMultiplier);
    const scaledRahnB = Math.round(hoodB.rahn80m * (targetSqm / 80) * rentAgeMultiplier);
    const diffRentMonthly = Math.abs(Math.round(scaledRahnA * 0.03) - Math.round(scaledRahnB * 0.03));
    const unitLbl = areaUnit === 'sqft' ? 'ft²' : 'm²';

    const fxBuySubA = intlCurrency !== 'IRT'
      ? `${formatMillionTomanAsIntlCurrency(uBuyA, intlCurrency, radarLocale)}/${unitLbl} · ${isEn ? 'Total: ' : 'کل: '}${formatMillionTomanAsIntlCurrency(totalBuyA, intlCurrency, radarLocale)}`
      : `${formatAreaShort(targetSqm, areaUnit)}: ${toPersianNum((totalBuyA / 1000).toFixed(1))} م.ت`;
    const fxBuySubB = intlCurrency !== 'IRT'
      ? `${formatMillionTomanAsIntlCurrency(uBuyB, intlCurrency, radarLocale)}/${unitLbl} · ${isEn ? 'Total: ' : 'کل: '}${formatMillionTomanAsIntlCurrency(totalBuyB, intlCurrency, radarLocale)}`
      : `${formatAreaShort(targetSqm, areaUnit)}: ${toPersianNum((totalBuyB / 1000).toFixed(1))} م.ت`;
    const fxRahnSubA = `${isEn ? 'Rent: ' : 'اجاره: '}${toPersianNum(Math.round(scaledRahnA * 0.03))}م (${isEn ? 'Diff: ' : 'اختلاف: '}${toPersianNum(diffRentMonthly)}م)${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(scaledRahnA, intlCurrency, radarLocale)}` : ''}`;
    const fxRahnSubB = `${isEn ? 'Rent: ' : 'اجاره: '}${toPersianNum(Math.round(scaledRahnB * 0.03))}م (${isEn ? 'Diff: ' : 'اختلاف: '}${toPersianNum(diffRentMonthly)}م)${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(scaledRahnB, intlCurrency, radarLocale)}` : ''}`;

    return [
      { id: 'cost_buy', label: formatUnitBuyPriceTitle(areaUnit), icon: <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />, valA: `${toPersianNum(uBuyA)} میلیون`, valB: `${toPersianNum(uBuyB)} میلیون`, winner: costBuyA < costBuyB ? 'A' : costBuyA > costBuyB ? 'B' : 'equal', subA: fxBuySubA, subB: fxBuySubB },
      { id: 'cost_deal', label: isEn ? `Deal Price v6.4 (${areaUnit === 'sqft' ? 'ft²' : 'm²'})` : `تخمین قطعی معامله (${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'})`, icon: <Coins className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />, valA: `${toPersianNum(uDealA)} میلیون`, valB: `${toPersianNum(uDealB)} میلیون`, winner: aggA.estimatedDealPricePerSqm < aggB.estimatedDealPricePerSqm ? 'A' : aggA.estimatedDealPricePerSqm > aggB.estimatedDealPricePerSqm ? 'B' : 'equal', subA: intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(uDealA, intlCurrency, radarLocale) : undefined, subB: intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(uDealB, intlCurrency, radarLocale) : undefined },
      { id: 'cost_rent', label: isEn ? `Full Deposit (${formatAreaShort(targetSqm, areaUnit)})` : `رهن کامل (${formatAreaShort(targetSqm, areaUnit)})`, icon: <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />, valA: `${toPersianNum(scaledRahnA)} میلیون`, valB: `${toPersianNum(scaledRahnB)} میلیون`, winner: scaledRahnA < scaledRahnB ? 'A' : scaledRahnA > scaledRahnB ? 'B' : 'equal', subA: fxRahnSubA, subB: fxRahnSubB },
      { id: 'air', label: isEn ? 'Air Quality & Cleanliness' : 'کیفیت و پاکی هوا', icon: <Wind className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />, valA: `${toPersianNum(hoodA.air)} / ۱۰`, valB: `${toPersianNum(hoodB.air)} / ۱۰`, winner: hoodA.air > hoodB.air ? 'A' : hoodA.air < hoodB.air ? 'B' : 'equal' },
      { id: 'metro', label: isEn ? 'Metro & Transit Access' : 'دسترسی به خطوط مترو', icon: <TrainFront className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />, valA: `${toPersianNum(hoodA.metro)} / ۱۰`, valB: `${toPersianNum(hoodB.metro)} / ۱۰`, winner: hoodA.metro > hoodB.metro ? 'A' : hoodA.metro < hoodB.metro ? 'B' : 'equal', subA: hoodA.distKm != null ? `${toPersianNum(hoodA.distKm.toFixed(1))} km` : undefined, subB: hoodB.distKm != null ? `${toPersianNum(hoodB.distKm.toFixed(1))} km` : undefined },
      { id: 'security', label: isEn ? 'Security & Neighborhood Calm' : 'امنیت و آرامش محیطی', icon: <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />, valA: `${toPersianNum(hoodA.security)} / ۱۰`, valB: `${toPersianNum(hoodB.security)} / ۱۰`, winner: hoodA.security > hoodB.security ? 'A' : hoodA.security < hoodB.security ? 'B' : 'equal' },
      { id: 'internet', label: isEn ? 'Fiber & Internet Reliability' : 'پایداری اینترنت و فیبر', icon: <Wifi className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />, valA: `${toPersianNum(hoodA.internet)} / ۱۰`, valB: `${toPersianNum(hoodB.internet)} / ۱۰`, winner: hoodA.internet > hoodB.internet ? 'A' : hoodA.internet < hoodB.internet ? 'B' : 'equal' },
      { id: 'overall', label: isEn ? 'Livability Score' : 'امتیاز جامع کالبدی', icon: <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />, valA: `${toPersianNum(hoodA.overallScore)} / ۱۰`, valB: `${toPersianNum(hoodB.overallScore)} / ۱۰`, winner: hoodA.overallScore > hoodB.overallScore ? 'A' : hoodA.overallScore < hoodB.overallScore ? 'B' : 'equal' },
    ];
  }, [hoodA, hoodB, targetSqm, rentAgeMultiplier, areaUnit, intlCurrency, radarLocale, isEn]);

  const scoreWinsA = metrics.filter((m) => m.winner === 'A').length;
  const scoreWinsB = metrics.filter((m) => m.winner === 'B').length;
  const diffTotalMillion = Math.abs(hoodA.buyPerSqm - hoodB.buyPerSqm) * targetSqm;

  return (
    <div className="my-3 apple-grouped-card bg-white dark:bg-slate-900 overflow-hidden border border-slate-200/90 dark:border-slate-800 shadow-xs transition-all duration-300">
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        className="w-full px-3.5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition bg-slate-50/60 dark:bg-slate-900"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={compareCopy.inlineTitle}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
            <Layers className="w-4 h-4 stroke-[1.75]" />
          </div>
          <div className="text-right min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-800 dark:text-slate-100">{compareCopy.inlineTitle}</span>
              <span className="px-1.5 py-0.2 rounded-[6px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-extrabold tabular-nums">
                {hoodA.name} vs {hoodB.name}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {isExpanded ? (isEn ? 'Close side-by-side comparison table' : 'جدول مقایسه شاخص‌های هوا، مترو و قیمت') : (isEn ? 'Click to expand comparison table' : 'کلیک کنید تا جدول مقایسه ۲ محله باز شود')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPinnedA((prev) => !prev);
            }}
            className={`px-2 py-1 rounded-[7px] text-[10px] font-bold border flex items-center gap-1 transition cursor-pointer ${
              isPinnedA
                ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600 shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title="قفل کردن محله اول و ترسیم کمان مقایسه زنده روی نقشه با کلیک روی سایر محلات"
          >
            <Pin className={`w-2.5 h-2.5 ${isPinnedA ? 'fill-white' : ''}`} />
            <span>{isPinnedA ? (isEn ? 'Map Arc Active' : 'کمان نقشه فعال') : (isEn ? 'Pin Map' : 'پین نقشه')}</span>
          </button>
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hidden sm:inline">
            {isExpanded ? (isEn ? 'Collapse' : 'بستن جدول') : (isEn ? 'View Table' : 'مشاهده جدول')}
          </span>
          <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 stroke-[2]" /> : <ChevronDown className="w-3.5 h-3.5 stroke-[2]" />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 border-t border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 animate-in fade-in-0 duration-200">
          <div className="flex items-center justify-between gap-1.5 p-2 rounded-[10px] bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs">
            <div className="flex-1 min-w-0 text-center">
              <button
                type="button"
                onClick={() => setIsPinnedA((prev) => !prev)}
                className={`text-[10px] font-bold mb-0.5 inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md transition cursor-pointer ${
                  isPinnedA
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                <Pin className={`w-2.5 h-2.5 ${isPinnedA ? 'text-emerald-600 fill-emerald-600' : 'text-slate-500'}`} />
                <span>{isPinnedA ? (isEn ? 'Slot 1 (Pinned)' : 'محله اول (پین قفل شد)') : (isEn ? 'Slot 1 (Pin)' : 'محله اول (پین کردن)')}</span>
              </button>
              <div className="font-black text-slate-900 dark:text-slate-100 truncate">{hoodA.name}</div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums">
                {isEn ? 'Score: ' : 'امتیاز: '}{toPersianNum(hoodA.overallScore)}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSwap}
              title="جابجایی دو محله"
              className="p-1.5 rounded-full bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition shrink-0 cursor-pointer shadow-2xs"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2]" />
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div className="text-[10px] text-slate-400 dark:text-slate-400 font-bold mb-0.5">{isEn ? 'Slot 2 (Compare)' : 'محله دوم (انتخابی)'}</div>
              <select
                value={hoodBId}
                onChange={(e) => setHoodBId(Number(e.target.value))}
                className="w-full text-center text-xs font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[7px] py-0.5 px-1 focus:outline-none focus:border-emerald-500 cursor-pointer truncate"
              >
                {allNeighborhoods.map((h) => {
                  const optVal = mode === 'rent' ? h.rahn80m : convertPricePerSqmToUnit(h.buyPerSqm, areaUnit);
                  const optFx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(optVal, intlCurrency, radarLocale)}` : '';
                  return (
                    <option key={h.id} value={h.id} disabled={h.id === hoodAId}>
                      {h.name} ({toPersianNum(h.overallScore)} · {mode === 'rent' ? `رهن ${toPersianNum(h.rahn80m)}م` : `${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(optVal)}م`}{optFx})
                    </option>
                  );
                })}
              </select>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums">
                {isEn ? 'Score: ' : 'امتیاز: '}{toPersianNum(hoodB.overallScore)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 rounded-[8px] bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-slate-100">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{isEn ? 'Summary Result' : 'نتیجه مقایسه'} ({formatAreaShort(targetSqm, areaUnit)}: {isEn ? 'Diff ' : 'اختلاف '}{toPersianNum((diffTotalMillion / 1000).toFixed(1))} م.ت{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(diffTotalMillion, intlCurrency, radarLocale)}` : ''}):</span>
            </span>
            <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
              {scoreWinsA > scoreWinsB
                ? `${isEn ? 'Lead: ' : 'برتری '}${hoodA.name} (${toPersianNum(scoreWinsA)} ${isEn ? 'indicators' : 'شاخص'})`
                : scoreWinsB > scoreWinsA
                ? `${isEn ? 'Lead: ' : 'برتری '}${hoodB.name} (${toPersianNum(scoreWinsB)} ${isEn ? 'indicators' : 'شاخص'})`
                : (isEn ? 'Equal scores across key metrics' : 'برابری امتیاز در شاخص‌های کلیدی')}
            </span>
          </div>

          <div className="overflow-x-auto rounded-[10px] border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-2.5">{isEn ? 'Metric' : 'شاخص ارزیابی'}</th>
                  <th className="py-2 px-2 text-center w-28">{hoodA.name}</th>
                  <th className="py-2 px-2 text-center w-28">{hoodB.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {metrics.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition">
                    <td className="py-2 px-2.5 font-bold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        {m.icon} <span>{m.label}</span>
                      </div>
                    </td>
                    <td
                      className={`py-2 px-2 text-center tabular-nums font-bold ${
                        m.winner === 'A'
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div>{m.valA}</div>
                      {m.subA && <div className="text-[9.5px] text-slate-400 dark:text-slate-400 font-normal">{m.subA}</div>}
                    </td>
                    <td
                      className={`py-2 px-2 text-center tabular-nums font-bold ${
                        m.winner === 'B'
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div>{m.valB}</div>
                      {m.subB && <div className="text-[9.5px] text-slate-400 dark:text-slate-400 font-normal">{m.subB}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onSelectNeighborhood && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => onSelectNeighborhood(hoodA)}
                className={`flex-1 py-1 px-2 rounded-[7px] text-[11px] font-bold border transition cursor-pointer text-center ${currentHood.id === hoodA.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}
              >
                {currentHood.id === hoodA.id ? (isEn ? 'Current Hood' : 'محله فعلی در پنل') : `${isEn ? 'View ' : 'مشاهده '}${hoodA.name}`}
              </button>
              <button
                type="button"
                onClick={() => onSelectNeighborhood(hoodB)}
                className={`flex-1 py-1 px-2 rounded-[7px] text-[11px] font-bold border transition cursor-pointer text-center ${currentHood.id === hoodB.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}
              >
                {currentHood.id === hoodB.id ? (isEn ? 'Current Hood' : 'محله فعلی در پنل') : `${isEn ? 'View ' : 'مشاهده '}${hoodB.name}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}