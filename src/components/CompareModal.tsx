import React, { useEffect, useMemo, useState } from 'react'; import { AlertCircle, ArrowLeftRight, Award, Check, Copy, MapPin, Printer, RefreshCw, Sparkles, X } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator'; import { clampNumber, recordDiagnosticEvent, validateNeighborhoodId } from '../utils/security'; import { useDialogFocus } from './useDialogFocus'; import { getMapAdvancedOverlayState, updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from './mapAdvancedLayers'; import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaValue, formatMillionTomanAsIntlCurrency, formatUnitBuyPriceTitle, getRadarCompareCopy } from '../utils/areaUnit'; import { explainNeighborhoodRecommendation } from './useEvaluatedNeighborhoods'; export interface CompareModalProps { open: boolean; onClose: () => void; evaluatedNeighborhoods: EvaluatedNeighborhood[];
  compareId1: number; setCompareId1: React.Dispatch<React.SetStateAction<number>>; compareId2: number; setCompareId2: React.Dispatch<React.SetStateAction<number>>; compHood1: EvaluatedNeighborhood; compHood2: EvaluatedNeighborhood; mode?: 'rent' | 'buy'; buyTotalBudget?: number; totalRahnEquivalent?: number; rentAgeMultiplier?: number; deductTenantRahnInBuy?: boolean; onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void; } interface ComparisonMetricRow { label: string; v1: string; v2: string; win: 0 | 1 | 2; }
export function CompareModal({ open, onClose, evaluatedNeighborhoods, compareId1, setCompareId1, compareId2, setCompareId2, compHood1, compHood2, mode = 'buy', buyTotalBudget = 8500, totalRahnEquivalent = 1500, rentAgeMultiplier = 1, deductTenantRahnInBuy = false, onSelectNeighborhood, }: CompareModalProps): React.ReactElement | null { const dialogRef = useDialogFocus(open, onClose); const overlayState = useMapAdvancedOverlayState(); const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const isEn = radarLocale === 'en'; const compareCopy = getRadarCompareCopy(radarLocale);
  const [copied, setCopied] = useState(false);
  const isArcPinned = overlayState.comparisonArc.isPinned; useEffect(() => { if (open && compHood1 && compHood2 && compHood1.id !== compHood2.id) { updateMapAdvancedOverlayState({ comparisonArc: { active: true, isPinned: getMapAdvancedOverlayState().comparisonArc.isPinned, hoodA: compHood1, hoodB: compHood2 }, }); }
  }, [open, compHood1, compHood2]); const safeNeighborhoods = useMemo(() => (Array.isArray(evaluatedNeighborhoods) ? evaluatedNeighborhoods : []), [evaluatedNeighborhoods]); const rows: ComparisonMetricRow[] = useMemo(() => { if (!compHood1 || !compHood2) return []; try { const buy1 = clampNumber(compHood1.buyPerSqm, 10, 2000, 100); const buy2 = clampNumber(compHood2.buyPerSqm, 10, 2000, 100);
      const uBuy1 = convertPricePerSqmToUnit(buy1, areaUnit); const uBuy2 = convertPricePerSqmToUnit(buy2, areaUnit);
      const agg1 = aggregateNeighborhoodMarketMetrics(compHood1.id, compHood1.name, buy1, buildNeighborhoodListingSamples(compHood1)); const agg2 = aggregateNeighborhoodMarketMetrics(compHood2.id, compHood2.name, buy2, buildNeighborhoodListingSamples(compHood2));
      const uDeal1 = convertPricePerSqmToUnit(agg1.estimatedDealPricePerSqm, areaUnit); const uDeal2 = convertPricePerSqmToUnit(agg2.estimatedDealPricePerSqm, areaUnit);
      const rahn1 = Math.round(clampNumber(compHood1.rahn80m, 50, 20000, 1000) * rentAgeMultiplier); const rahn2 = Math.round(clampNumber(compHood2.rahn80m, 50, 20000, 1000) * rentAgeMultiplier);
      const fxBuy1 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uBuy1, intlCurrency, radarLocale)})` : ''; const fxBuy2 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uBuy2, intlCurrency, radarLocale)})` : '';
      const fxDeal1 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uDeal1, intlCurrency, radarLocale)})` : ''; const fxDeal2 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uDeal2, intlCurrency, radarLocale)})` : '';
      const fxRahn1 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rahn1, intlCurrency, radarLocale)})` : ''; const fxRahn2 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rahn2, intlCurrency, radarLocale)})` : '';
      const growth1 = clampNumber(compHood1.marketReport?.hoodGrowth6mPercent, -50, 200, 10); const growth2 = clampNumber(compHood2.marketReport?.hoodGrowth6mPercent, -50, 200, 10);
      const rankStatus = (s?: string) => (s === 'undervalued' ? 0 : s === 'balanced' ? 1 : 2); const r1 = rankStatus(compHood1.marketReport?.status); const r2 = rankStatus(compHood2.marketReport?.status); const bubbleWin: 0 | 1 | 2 = r1 !== r2 ? (r1 < r2 ? 1 : 2) : growth1 === growth2 ? 0 : growth1 < growth2 ? 1 : 2;
      const tScore1 = clampNumber(compHood1?.trafficInfo?.trafficScore, 1, 10, 6.5); const tScore2 = clampNumber(compHood2?.trafficInfo?.trafficScore, 1, 10, 6.5);
      const scoreTieBand = Math.abs(compHood1.overallScore - compHood2.overallScore) <= 0.3; return [
        { label: formatUnitBuyPriceTitle(areaUnit), v1: `${toPersianNum(uBuy1)} میلیون${fxBuy1}`, v2: `${toPersianNum(uBuy2)} میلیون${fxBuy2}`, win: buy1 === buy2 ? 0 : buy1 < buy2 ? 1 : 2 },
        { label: isEn ? `v6.4 Hypothetical Negotiation Scenario (${areaUnit === 'sqft' ? 'ft²' : 'm²'})` : `${agg1.displayDealLabelFa} (${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'})`, v1: `${toPersianNum(uDeal1)} میلیون${fxDeal1}`, v2: `${toPersianNum(uDeal2)} میلیون${fxDeal2}`, win: agg1.estimatedDealPricePerSqm === agg2.estimatedDealPricePerSqm ? 0 : agg1.estimatedDealPricePerSqm < agg2.estimatedDealPricePerSqm ? 1 : 2 },
        { label: isEn ? 'Data Provenance & Sample Coverage Index' : 'منشأ داده و شاخص پوشش نمونه (غیرآماری)', v1: agg1.observedSampleCount === 0 ? 'پروفایل مرجع (۰ آگهی مستقیم)' : `شاخص پوشش ${toPersianNum(agg1.evidenceIndexScore)}/۱۰۰ (${toPersianNum(agg1.eligibleObservedCount)} نمونه)`, v2: agg2.observedSampleCount === 0 ? 'پروفایل مرجع (۰ آگهی مستقیم)' : `شاخص پوشش ${toPersianNum(agg2.evidenceIndexScore)}/۱۰۰ (${toPersianNum(agg2.eligibleObservedCount)} نمونه)`, win: 0 },
        { label: `رهن کامل واحد ${formatAreaValue(80, areaUnit, true)}`, v1: `${toPersianNum(rahn1)} میلیون${fxRahn1}`, v2: `${toPersianNum(rahn2)} میلیون${fxRahn2}`, win: rahn1 === rahn2 ? 0 : rahn1 < rahn2 ? 1 : 2 },
        { label: 'وضعیت حباب یا جاماندگی ۶ ماهه', v1: (compHood1.marketReport?.badgeText || 'متعادل').replace(/^[💎⚖️🔥🟢🟡🔴]+\s*/, ''), v2: (compHood2.marketReport?.badgeText || 'متعادل').replace(/^[💎⚖️🔥🟢🟡🔴]+\s*/, ''), win: bubbleWin },
        { label: 'کیفیت هوا و فضای سبز', v1: `${toPersianNum(compHood1.air)} / ۱۰`, v2: `${toPersianNum(compHood2.air)} / ۱۰`, win: compHood1.air === compHood2.air ? 0 : compHood1.air > compHood2.air ? 1 : 2 },
        { label: 'پایداری برق و فشار آب', v1: `${toPersianNum(compHood1.powerWater)} / ۱۰`, v2: `${toPersianNum(compHood2.powerWater)} / ۱۰`, win: compHood1.powerWater === compHood2.powerWater ? 0 : compHood1.powerWater > compHood2.powerWater ? 1 : 2 },
        { label: 'سرعت اینترنت و فیبر نوری', v1: `${toPersianNum(compHood1.internet)} / ۱۰`, v2: `${toPersianNum(compHood2.internet)} / ۱۰`, win: compHood1.internet === compHood2.internet ? 0 : compHood1.internet > compHood2.internet ? 1 : 2 },
        { label: 'دسترسی به مترو و حمل‌ونقل', v1: `${toPersianNum(compHood1.metro)} / ۱۰${compHood1.distKm != null ? ` (${toPersianNum(compHood1.distKm.toFixed(1))} km${areaUnit === 'sqft' ? ` / ${toPersianNum((compHood1.distKm * 0.621371).toFixed(1))} mi` : ''})` : ''}`, v2: `${toPersianNum(compHood2.metro)} / ۱۰${compHood2.distKm != null ? ` (${toPersianNum(compHood2.distKm.toFixed(1))} km${areaUnit === 'sqft' ? ` / ${toPersianNum((compHood2.distKm * 0.621371).toFixed(1))} mi` : ''})` : ''}`, win: compHood1.metro === compHood2.metro ? 0 : compHood1.metro > compHood2.metro ? 1 : 2 },
        { label: 'امنیت و آرامش شبانه', v1: `${toPersianNum(compHood1.security)} / ۱۰`, v2: `${toPersianNum(compHood2.security)} / ۱۰`, win: compHood1.security === compHood2.security ? 0 : compHood1.security > compHood2.security ? 1 : 2 },
        { label: 'روانی ترافیک ساعت ۸ شب', v1: `${toPersianNum(tScore1)} / ۱۰`, v2: `${toPersianNum(tScore2)} / ۱۰`, win: tScore1 === tScore2 ? 0 : tScore1 > tScore2 ? 1 : 2 },
        { label: 'همواری گذرها', v1: `${toPersianNum(compHood1.flatTerrain)} / ۱۰`, v2: `${toPersianNum(compHood2.flatTerrain)} / ۱۰`, win: compHood1.flatTerrain === compHood2.flatTerrain ? 0 : compHood1.flatTerrain > compHood2.flatTerrain ? 1 : 2 },
        { label: 'امتیاز کل کیفیت زندگی (میانگین هم‌وزن ۶ سنجه · بازه ±۰.۳ هم‌تراز)', v1: `${toPersianNum(compHood1.overallScore)} / ۱۰${scoreTieBand ? ' (≈ هم‌تراز)' : ''}`, v2: `${toPersianNum(compHood2.overallScore)} / ۱۰${scoreTieBand ? ' (≈ هم‌تراز)' : ''}`, win: scoreTieBand ? 0 : compHood1.overallScore > compHood2.overallScore ? 1 : 2 },
      ]; } catch { recordDiagnosticEvent('CompareModal', 'Fallback triggered while building rows', 'fallback'); return []; }
  }, [compHood1, compHood2, rentAgeMultiplier, areaUnit, intlCurrency, radarLocale, isEn]); const summaryStats = useMemo(() => { if (!compHood1 || !compHood2) return { win1: 0, win2: 0, sqm1: 0, sqm2: 0, diffSqm: 0, uSpread: 0 }; const win1 = rows.filter((r) => r.win === 1).length;
    const win2 = rows.filter((r) => r.win === 2).length; const calcSqm = (h: EvaluatedNeighborhood) => {
      if (mode === 'buy') { const netCashPerSqm = deductTenantRahnInBuy ? Math.max(10, h.buyPerSqm * 0.9 - (h.rahn80m / 80) * rentAgeMultiplier) : Math.max(1, h.buyPerSqm);
        return Math.max(0, Math.round(buyTotalBudget / netCashPerSqm)); }
      return Math.max(0, Math.round((totalRahnEquivalent / Math.max(1, h.rahn80m * rentAgeMultiplier)) * 80));
    };
    const sqm1 = calcSqm(compHood1); const sqm2 = calcSqm(compHood2);
    const total80m1 = Math.round(compHood1.buyPerSqm * 80); const total80m2 = Math.round(compHood2.buyPerSqm * 80);
    const monthlyRent1 = Math.round(compHood1.rahn80m * 0.03); const monthlyRent2 = Math.round(compHood2.rahn80m * 0.03);
    const uSpread = Number(Math.abs(convertPricePerSqmToUnit(compHood1.buyPerSqm, areaUnit) - convertPricePerSqmToUnit(compHood2.buyPerSqm, areaUnit)).toFixed(1));
    return { win1, win2, sqm1, sqm2, diffSqm: Math.abs(sqm1 - sqm2), uSpread, total80m1, total80m2, monthlyRent1, monthlyRent2 };
  }, [rows, compHood1, compHood2, mode, buyTotalBudget, totalRahnEquivalent, rentAgeMultiplier, deductTenantRahnInBuy, areaUnit]);
  if (!open) return null;
  const activeBudgetMillion = mode === 'buy' ? buyTotalBudget : totalRahnEquivalent;
  const topScoreRef = Math.max(compHood1?.overallScore ?? 0, compHood2?.overallScore ?? 0);
  const explain1 = compHood1 ? explainNeighborhoodRecommendation(compHood1, { mode, topReferenceScore: topScoreRef }) : null;
  const explain2 = compHood2 ? explainNeighborhoodRecommendation(compHood2, { mode, topReferenceScore: topScoreRef }) : null;
  const formatHoodOption = (n: EvaluatedNeighborhood, otherId: number) => {
    const val = mode === 'rent' ? Math.round(n.rahn80m * rentAgeMultiplier) : Number(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit).toFixed(1));
    const unitTag = mode === 'rent' ? `رهن (${formatAreaShort(80, areaUnit)})` : areaUnit === 'sqft' ? 'ft²' : 'متری';
    const fx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(val, intlCurrency, radarLocale)}` : '';
    return `${n.name} (${n.zone}) — ${unitTag} ${toPersianNum(val)} م${fx}${n.id === otherId ? ' (انتخاب‌شده در ستون مقابل)' : ''}`;
  };
  const handleSwapHoods = (): void => { const id1 = validateNeighborhoodId(compareId1, compHood1?.id || 1); const id2 = validateNeighborhoodId(compareId2, compHood2?.id || 2); setCompareId1(id2); setCompareId2(id1); };
  const handleSelectHood1 = (rawVal: string) => { const newId = validateNeighborhoodId(rawVal, 1); if (newId === compareId2) setCompareId2(compareId1); setCompareId1(newId); };
  const handleSelectHood2 = (rawVal: string) => { const newId = validateNeighborhoodId(rawVal, 5); if (newId === compareId1) setCompareId1(compareId2); setCompareId2(newId); };
  const handleCopySummary = async () => {
    try {
      const summaryText = `رادار مسکن: مقایسه ${compHood1.name} با ${compHood2.name}\n` +
        `• بودجه: ${toPersianNum(activeBudgetMillion)} م.ت\n` +
        `• متراژ قابل تامین: ${formatAreaValue(summaryStats.sqm1, areaUnit)} در برابر ${formatAreaValue(summaryStats.sqm2, areaUnit)} (اختلاف: ${formatAreaValue(summaryStats.diffSqm, areaUnit)})\n` +
        `• قیمت ${areaUnit === 'sqft' ? 'هر ft²' : 'متری'}: ${toPersianNum(summaryStats.uSpread)} م.ت اختلاف\n` +
        `• جمع‌بندی: ${summaryStats.win1 > summaryStats.win2 ? `برتری با ${compHood1.name}` : summaryStats.win2 > summaryStats.win1 ? `برتری با ${compHood2.name}` : 'برابر'}`;
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* clipboard fallback */ }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={compareCopy.modalTitle} onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 ring-1 ring-slate-900/5 dark:ring-white/10 text-slate-900 dark:text-slate-100 max-w-3xl w-full p-5 max-h-[88vh] overflow-y-auto focus:outline-none shadow-2xl rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-xs shrink-0"><ArrowLeftRight className="w-4 h-4 stroke-[1.75]" /></span>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{compareCopy.modalTitle}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
            <button
              type="button"
              onClick={() => {
                const nextPinned = !isArcPinned;
                updateMapAdvancedOverlayState({ comparisonArc: { active: true, isPinned: nextPinned, hoodA: compHood1, hoodB: compHood2 } });
                if (nextPinned) onClose();
              }}
              aria-label={isArcPinned ? 'کمان نقشه پین شد' : 'پین کمان روی نقشه'}
              title="ترسیم و پین کردن کمان مقایسه و اختلاف قیمت روی نقشه زنده"
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs ${
                isArcPinned ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>{isArcPinned ? 'کمان نقشه پین شد' : 'پین کمان روی نقشه'}</span>
            </button>
            <button type="button" onClick={handleCopySummary} aria-label="کپی خلاصه مقایسه" title="کپی خلاصه مقایسه در کلیپ‌بورد" className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs ${copied ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
              {copied ? <Check className="w-3.5 h-3.5 stroke-[2]" /> : <Copy className="w-3.5 h-3.5 stroke-[1.75]" />}
              <span>{copied ? 'کپی شد' : 'کپی خلاصه'}</span>
            </button>
            <button type="button" onClick={() => window.print()} aria-label={compareCopy.printBtnLabel} title="چاپ یا ذخیره PDF جدول مقایسه" className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs">
              <Printer className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>{compareCopy.printBtnLabel}</span>
            </button>
            <button type="button" onClick={handleSwapHoods} aria-label={compareCopy.swapBtnLabel} title="جابه‌جایی دو محله" className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs">
              <RefreshCw className="w-3.5 h-3.5 stroke-[1.75]" />
              <span>{compareCopy.swapBtnLabel}</span>
            </button>
            <button type="button" aria-label="بستن پنجره مقایسه" onClick={onClose} className="p-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
              <X className="w-4 h-4 stroke-[1.75]" />
            </button>
          </div>
        </div>
        {safeNeighborhoods.length === 0 || !compHood1 || !compHood2 ? (
          <div className="apple-grouped-card dark:bg-slate-800/80 p-6 text-center space-y-3">
            <AlertCircle className="w-6 h-6 stroke-[1.75] text-amber-600 mx-auto" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">اطلاعات محلات برای مقایسه در دسترس نیست.</p>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer">بازگشت به نقشه</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="apple-grouped-card dark:bg-slate-800/70 dark:border-slate-800 p-3">
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">انتخاب محله اول:</label>
                <select aria-label="انتخاب محله اول" value={compareId1} onChange={(e) => handleSelectHood1(e.target.value)} className="w-full bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-slate-500">
                  {safeNeighborhoods.map((n) => (
                    <option key={n.id} value={n.id}>{formatHoodOption(n, compareId2)}</option>
                  ))}
                </select>
              </div>
              <div className="apple-grouped-card dark:bg-slate-800/70 dark:border-slate-800 p-3">
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">انتخاب محله دوم:</label>
                <select aria-label="انتخاب محله دوم" value={compareId2} onChange={(e) => handleSelectHood2(e.target.value)} className="w-full bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-slate-500">
                  {safeNeighborhoods.map((n) => (
                    <option key={n.id} value={n.id}>{formatHoodOption(n, compareId1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2.5 mb-4 text-xs">
              <div className="apple-grouped-card bg-amber-50/90 dark:bg-amber-950/25 ring-1 ring-amber-500/20 p-3.5 text-amber-950 dark:text-amber-200 flex items-start gap-2.5 shadow-xs">
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-extrabold">مقایسه قدرت خرید واقعی شما: </strong>
                  با بودجه فعلی شما ({toPersianNum(activeBudgetMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(activeBudgetMillion, intlCurrency, radarLocale)}` : ''})، در محله{' '}
                  <strong className="underline decoration-amber-400">{compHood1.name}</strong> امکان{' '}
                  {mode === 'buy' ? 'خرید' : 'اجاره'} واحد حدود{' '}
                  <strong className="text-amber-800 dark:text-amber-300 font-black tabular-nums">{formatAreaValue(summaryStats.sqm1, areaUnit)}</strong>{' '}
                  و در محله{' '}
                  <strong className="underline decoration-amber-400">{compHood2.name}</strong> امکان{' '}
                  {mode === 'buy' ? 'خرید' : 'اجاره'} واحد حدود{' '}
                  <strong className="text-amber-800 dark:text-amber-300 font-black tabular-nums">{formatAreaValue(summaryStats.sqm2, areaUnit)}</strong>{' '}
                  وجود دارد (اختلاف متراژ: <strong className="tabular-nums">{formatAreaValue(summaryStats.diffSqm, areaUnit)}</strong> · اختلاف هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: <strong className="tabular-nums">{toPersianNum(summaryStats.uSpread)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(summaryStats.uSpread, intlCurrency, radarLocale)})` : ''}</strong>).
                </div>
              </div>
              <div className="apple-grouped-card dark:bg-slate-900 ring-1 ring-slate-900/5 dark:ring-white/10 p-3.5 text-slate-900 dark:text-slate-100 space-y-2.5 shadow-xs">
                {(() => {
                  const p1 = compHood1.buyPerSqm, p2 = compHood2.buyPerSqm;
                  const priceRatio = Math.max(p1, p2) / Math.max(1, Math.min(p1, p2));
                  const isPeerMismatch = priceRatio >= 1.4;
                  return (
                    <div className="space-y-2">
                      {isPeerMismatch && (
                        <div data-testid="compare-peer-mismatch-banner" className="p-2.5 rounded-xl bg-indigo-50/90 dark:bg-indigo-950/40 ring-1 ring-indigo-500/25 text-[11px] text-indigo-950 dark:text-indigo-200 flex items-center justify-between shadow-2xs">
                          <span>⚖️ هشدار رده اقتصادی: اختلاف پایه قیمت این دو محله بیش از ۴۰٪ است؛ مقایسه بر اساس ارزش ریالی امکانات انجام شده است.</span>
                          <span className="font-extrabold tabular-nums">نسبت: {toPersianNum(priceRatio.toFixed(1))} برابر</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-extrabold">
                          <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>
                            نبرد تن‌به‌تن: محله {compHood1.name} در <span className="text-emerald-700 dark:text-emerald-400">{toPersianNum(summaryStats.win1)} شاخص</span> و محله {compHood2.name} در <span className="text-emerald-700 dark:text-emerald-400">{toPersianNum(summaryStats.win2)} شاخص</span> برتر است.
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold">
                          {summaryStats.win1 > summaryStats.win2 ? `برتری کلی با ${compHood1.name}` : summaryStats.win2 > summaryStats.win1 ? `برتری کلی با ${compHood2.name}` : 'رقابت کاملاً برابر'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                {explain1 && explain2 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700 text-[10.5px] text-slate-600 dark:text-slate-300">
                    <div><strong className="text-slate-900 dark:text-white">{compHood1.name} ({explain1.budgetFitSemanticsLabelFa}):</strong> {explain1.tradeOffSummaryFa}{explain1.nonCompensatoryWarningsFa[0] ? ` · ⚠️ ${explain1.nonCompensatoryWarningsFa[0]}` : ''}</div>
                    <div><strong className="text-slate-900 dark:text-white">{compHood2.name} ({explain2.budgetFitSemanticsLabelFa}):</strong> {explain2.tradeOffSummaryFa}{explain2.nonCompensatoryWarningsFa[0] ? ` · ⚠️ ${explain2.nonCompensatoryWarningsFa[0]}` : ''}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="apple-grouped-card dark:bg-slate-800/50 dark:border-slate-800 overflow-hidden text-xs">
              <div className="grid grid-cols-3 bg-slate-50/90 dark:bg-slate-800 py-3 px-4 font-extrabold text-slate-900 dark:text-white border-b border-slate-200/70 dark:border-slate-700">
                <div className="text-center text-sm truncate">{compHood1.name}</div>
                <div className="text-center text-slate-500 dark:text-slate-400">{compareCopy.metricHeader}</div>
                <div className="text-center text-sm truncate">{compHood2.name}</div>
              </div>
              <div className="grid grid-cols-3 items-center py-2.5 px-4 border-b border-amber-200/80 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20">
                <div
                  className={`text-center font-black tabular-nums py-1 rounded-lg ${
                    summaryStats.sqm1 > summaryStats.sqm2 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800' : summaryStats.sqm1 === summaryStats.sqm2 ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700' : 'text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {formatAreaValue(summaryStats.sqm1, areaUnit)}
                </div>
                <div className="text-center font-extrabold text-amber-900 dark:text-amber-200 px-2">
                  متراژ قابل {mode === 'buy' ? 'خرید' : 'اجاره'} با بودجه شما
                </div>
                <div
                  className={`text-center font-black tabular-nums py-1 rounded-lg ${
                    summaryStats.sqm2 > summaryStats.sqm1 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800' : summaryStats.sqm1 === summaryStats.sqm2 ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700' : 'text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {formatAreaValue(summaryStats.sqm2, areaUnit)}
                </div>
              </div>
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-3 items-center py-2.5 px-4 border-b border-slate-100 dark:border-slate-800/80 last:border-none bg-white dark:bg-slate-900"
                >
                  <div
                    className={`text-center font-bold tabular-nums py-1 rounded-lg ${
                      row.win === 1
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60'
                        : row.win === 0
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {row.v1}
                  </div>
                  <div className="text-center text-slate-500 dark:text-slate-400 px-2">{row.label}</div>
                  <div
                    className={`text-center font-bold tabular-nums py-1 rounded-lg ${
                      row.win === 2
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60'
                        : row.win === 0
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {row.v2}
                  </div>
                </div>
              ))}
            </div>
            {onSelectNeighborhood && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    onSelectNeighborhood(compHood1);
                    onClose();
                  }}
                  aria-label={`انتخاب محله ${compHood1.name}`}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <MapPin className="w-4 h-4 stroke-[1.75]" />
                  <span>انتخاب محله {compHood1.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectNeighborhood(compHood2);
                    onClose();
                  }}
                  aria-label={`انتخاب محله ${compHood2.name}`}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs border border-slate-200 dark:border-slate-700"
                >
                  <MapPin className="w-4 h-4 stroke-[1.75]" />
                  <span>انتخاب محله {compHood2.name}</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  ); }