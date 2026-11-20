import React, { useState, useMemo, useEffect } from 'react'; import { Calculator, Building2, Layers, Calendar, Wrench, X, Sparkles } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { getNeighborhoodDeepInsight } from '../data/neighborhoodInsights'; import { calculateHedonicValuation, getCurrentJalaliYear, HEDONIC_RENOVATION_OPTIONS, HedonicRenovationStatus, HedonicValuationResult } from '../data/hedonicPricingEngine'; import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples, computeQualityMultiplier, extractListingSpecsFromText, parseIranianPriceToMillionToman } from '../data/realMarketPriceAggregator'; import { clampNumber, recordDiagnosticEvent } from '../utils/security'; import { parseLocalizedNumber } from '../utils/forms/formInputHelpers'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaValue, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { HedonicInlineWidget, resolveBuildYearFromSegment, type HedonicInlineParams, type HedonicInlineWidgetProps } from './HedonicInlineWidget'; import { HedonicValuationResultsColumn } from './HedonicValuationResultsColumn'; import { useDialogFocus } from './useDialogFocus'; import { NumericDraftInput } from './ui/NumericDraftInput'; export { HedonicInlineWidget, type HedonicInlineParams, type HedonicInlineWidgetProps }; export interface HedonicValuationModalProps { open: boolean; onClose: () => void; selectedNeighborhood: EvaluatedNeighborhood; allNeighborhoods: EvaluatedNeighborhood[]; onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  initialSqm?: number; buildingAgeSegment?: 'new' | 'mid' | 'older'; initialParams?: HedonicInlineParams; areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; }
export function HedonicValuationModal({ open, onClose, selectedNeighborhood, allNeighborhoods, onSelectNeighborhood, initialSqm = 85, buildingAgeSegment, initialParams, areaUnit: propAreaUnit, intlCurrency: propIntlCurrency, }: HedonicValuationModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(open, onClose); const [ctxAreaUnit] = useAreaUnit(); const [ctxIntlCurrency] = useIntlCurrency(); const [radarLocale] = useRadarLocale();
  const areaUnit: AreaUnit = propAreaUnit ?? ctxAreaUnit; const intlCurrency: IntlCurrencyCode = propIntlCurrency ?? ctxIntlCurrency;
  const currentJalaliYear = getCurrentJalaliYear();
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : 'متر'; const [hoodId, setHoodId] = useState<number>(selectedNeighborhood.id); const [sqm, setSqm] = useState<number>(clampNumber(initialParams?.sqm ?? initialSqm, 35, 450, 85)); const [buildYear, setBuildYear] = useState<number>(() => initialParams?.buildYear ?? resolveBuildYearFromSegment(buildingAgeSegment)); const [renovationStatus, setRenovationStatus] = useState<HedonicRenovationStatus>(initialParams?.renovationStatus ?? 'renovated'); const [floor, setFloor] = useState<number>(initialParams?.floor ?? 3); const [totalFloors, setTotalFloors] = useState<number>(5); const [hasElevator, setHasElevator] = useState<boolean>(true); const [hasParking, setHasParking] = useState<boolean>(true); const [hasStorage, setHasStorage] = useState<boolean>(true);
  const [streetTier, setStreetTier] = useState<'luxury' | 'balanced' | 'economic' | 'economy'>(initialParams?.streetTier ?? 'balanced');
  const [adRawText, setAdRawText] = useState<string>(''); const [nlpFeedback, setNlpFeedback] = useState<string>('');
  const [sellerAskingBillion, setSellerAskingBillion] = useState<string>(''); const [copiedReport, setCopiedReport] = useState<boolean>(false); const [downloadingPng, setDownloadingPng] = useState<boolean>(false); const copiedTimerRef = React.useRef<number | null>(null); const nlpTimerRef = React.useRef<number | null>(null); useEffect(() => () => { if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current); if (nlpTimerRef.current !== null) window.clearTimeout(nlpTimerRef.current); }, []); useEffect(() => { setHoodId(selectedNeighborhood.id); setSellerAskingBillion(''); }, [selectedNeighborhood.id]); useEffect(() => { if (!initialParams?.sqm) setSqm(clampNumber(initialSqm, 35, 450, 85)); }, [initialSqm, initialParams?.sqm]); useEffect(() => { if (buildingAgeSegment && !initialParams?.buildYear) { setBuildYear(resolveBuildYearFromSegment(buildingAgeSegment)); } }, [buildingAgeSegment, initialParams?.buildYear]); useEffect(() => { if (!open || !initialParams) return; if (typeof initialParams.sqm === 'number') setSqm(clampNumber(initialParams.sqm, 35, 450, 85));
    if (typeof initialParams.buildYear === 'number') setBuildYear(clampNumber(initialParams.buildYear, 1370, currentJalaliYear, 1398)); if (initialParams.renovationStatus) setRenovationStatus(initialParams.renovationStatus); if (initialParams.streetTier) setStreetTier(initialParams.streetTier); if (typeof initialParams.floor === 'number') { const f = clampNumber(initialParams.floor, -1, 25, 3); setFloor(f); setTotalFloors((prev) => Math.max(prev, f)); }
  }, [open, initialParams, currentJalaliYear]); const activeHood = useMemo( () => allNeighborhoods.find((n) => n.id === hoodId) || selectedNeighborhood || allNeighborhoods[0], [allNeighborhoods, hoodId, selectedNeighborhood] ); const microHoods = useMemo(() => getNeighborhoodDeepInsight(activeHood).microHoods, [activeHood]); const activeMicroTier = useMemo(() => microHoods.find((m) => m.tier === streetTier), [microHoods, streetTier]); const sellerAskingMillion = useMemo(() => { const parsed = parseLocalizedNumber(sellerAskingBillion); if (Number.isNaN(parsed) || parsed <= 0) return undefined; return parsed < 1000 ? Math.round(parsed * 1000) : Math.round(parsed); }, [sellerAskingBillion]); const valuation: HedonicValuationResult = useMemo( () => calculateHedonicValuation({
      neighborhood: activeHood, sqm, buildYear, renovationStatus, floor, totalFloors, hasElevator, hasParking, hasStorage, sellerAskingTotalMillion: sellerAskingMillion, streetTier, streetMultiplier: activeMicroTier?.priceMultiplier, }), [activeHood, sqm, buildYear, renovationStatus, floor, totalFloors, hasElevator, hasParking, hasStorage, sellerAskingMillion, streetTier, activeMicroTier]
  ); const hoodDealPerSqm = useMemo(() => aggregateNeighborhoodMarketMetrics(activeHood.id, activeHood.name, valuation.hoodBasePerSqm, buildNeighborhoodListingSamples(activeHood)).estimatedDealPricePerSqm, [activeHood, valuation.hoodBasePerSqm]);
  const hoodTotal80mMillions = Math.round((valuation.hoodBasePerSqm * 80) / 1000);
  const estimatedMonthlyRentMillions = Math.round(valuation.estimatedRahnMillion * 0.03);
  if (!open) return null; const handleHoodChange = (newId: number) => { setHoodId(newId); const found = allNeighborhoods.find((n) => n.id === newId); if (found && onSelectNeighborhood) onSelectNeighborhood(found); }; const handleCopyValuation = () => { const text = [
      `گزارش برآورد الگوریتمی قیمت ملک (مدل Hedonic) - محله ${valuation.hoodName}`,
      `مشخصات: ${formatAreaShort(valuation.sqm, areaUnit)} | ساخت ${toPersianNum(valuation.buildYear)} (${toPersianNum(valuation.buildingAgeYears)} ساله) | طبقه ${toPersianNum(valuation.floor)} | ${valuation.renovationLabel}`,
      `برآورد هر ${unitLabel}: ${toPersianNum(convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit))} میلیون تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''}`,
      `میانگین پایه محله ${valuation.hoodName}: ${toPersianNum(convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit))} میلیون/${unitLabel}${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit), intlCurrency, radarLocale)})` : ''} · معامله محله v6.4: ${toPersianNum(convertPricePerSqmToUnit(hoodDealPerSqm, areaUnit))} م/${unitLabel}`,
      `مقایسه با میانگین محله: ${valuation.diffFromHoodAvgPercent > 0 ? '+' : ''}${toPersianNum(valuation.diffFromHoodAvgPercent)}٪ (${valuation.diffPerSqmMillion >= 0 ? '+' : ''}${toPersianNum(convertPricePerSqmToUnit(valuation.diffPerSqmMillion, areaUnit))} میلیون در هر ${unitLabel}${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(Math.abs(convertPricePerSqmToUnit(valuation.diffPerSqmMillion, areaUnit)), intlCurrency, radarLocale)}` : ''})`,
      `ارزش کل برآوردی ملک: ${toPersianNum(valuation.hedonicTotalBillion)} میلیارد تومان (${toPersianNum(valuation.hedonicTotalMillion.toLocaleString())} میلیون تومان)${intlCurrency !== 'IRT' ? ` ≈ ${formatMillionTomanAsIntlCurrency(valuation.hedonicTotalMillion, intlCurrency, radarLocale)}` : ''}`,
      `بازه منصفانه معامله: ${toPersianNum((valuation.confidenceRangeMillion.min / 1000).toFixed(2))} تا ${toPersianNum((valuation.confidenceRangeMillion.max / 1000).toFixed(2))} میلیارد تومان${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.confidenceRangeMillion.min, intlCurrency, radarLocale)} – ${formatMillionTomanAsIntlCurrency(valuation.confidenceRangeMillion.max, intlCurrency, radarLocale)})` : ''}`,
      `فروش فوری نقدی (-۱۲٪): ${toPersianNum((valuation.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد تومان (هر ${unitLabel}: ${toPersianNum(convertPricePerSqmToUnit(Math.round(valuation.fastSaleTotalMillion / Math.max(1, valuation.sqm)), areaUnit))} م)${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.fastSaleTotalMillion, intlCurrency, radarLocale)})` : ''}`,
      `رهن کامل برآوردی: ${toPersianNum(valuation.estimatedRahnMillion)} میلیون تومان (اجاره ماهانه معادل: ${toPersianNum(Math.round(valuation.estimatedRahnMillion * 0.03))} م)${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(valuation.estimatedRahnMillion, intlCurrency, radarLocale)})` : ''}`,
      ...(sellerAskingMillion ? [`قیمت اعلامی فروشنده: ${toPersianNum((sellerAskingMillion / 1000).toFixed(2))} میلیارد (اختلاف کل: ${sellerAskingMillion - valuation.hedonicTotalMillion >= 0 ? '+' : ''}${toPersianNum((sellerAskingMillion - valuation.hedonicTotalMillion).toLocaleString())} میلیون${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(Math.abs(sellerAskingMillion - valuation.hedonicTotalMillion), intlCurrency, radarLocale)}` : ''})`] : []),
      `ℹ️ این ارقام برآورد الگوریتمی مبتنی بر میانگین داده‌های پیکربندی محله هستند و جایگزین کارشناسی رسمی دادگستری نمی‌شوند.`,
    ].join('\n'); if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(() => {}); }
    setCopiedReport(true); recordDiagnosticEvent('HedonicCalculator', `Copied hedonic report for ${valuation.hoodName}`, 'success'); if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current); copiedTimerRef.current = window.setTimeout(() => { copiedTimerRef.current = null; setCopiedReport(false); }, 2200); };
  const handleNlpExtract = () => {
    if (!adRawText.trim()) return;
    const specs = extractListingSpecsFromText(adRawText, valuation.hoodBasePerSqm);
    const extractedYear = clampNumber(currentJalaliYear - specs.buildingAge, 1370, currentJalaliYear, 1398);
    setSqm(clampNumber(specs.sqm, 35, 450, 85)); setBuildYear(extractedYear);
    setRenovationStatus(specs.renovationStatus); setFloor(clampNumber(specs.floor, -1, 25, 3));
    setTotalFloors(Math.max(specs.totalFloors, specs.floor)); setHasElevator(specs.hasElevator);
    setHasParking(specs.hasParking); setHasStorage(specs.hasStorage);
    const pMillion = specs.totalMillion > 0 ? specs.totalMillion : parseIranianPriceToMillionToman(adRawText, specs.sqm, valuation.hoodBasePerSqm).totalMillion;
    if (pMillion > 0) setSellerAskingBillion((pMillion / 1000).toFixed(2));
    const qMult = computeQualityMultiplier({ ...specs, hoodBasePerSqm: valuation.hoodBasePerSqm });
    setNlpFeedback(`استخراج شد: ${formatAreaShort(specs.sqm, areaUnit)}، سال ${toPersianNum(extractedYear)}، ط ${toPersianNum(specs.floor)} (ضریب کیفی ${toPersianNum(qMult)}x)`);
    if (nlpTimerRef.current !== null) window.clearTimeout(nlpTimerRef.current);
    nlpTimerRef.current = window.setTimeout(() => { nlpTimerRef.current = null; setNlpFeedback(''); }, 4000);
  }; return (
    <div role="dialog" aria-modal="true" aria-labelledby="hedonic-modal-title" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} dir="rtl" onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 ring-1 ring-slate-900/5 dark:ring-white/10 rounded-3xl max-w-3xl w-full p-5 sm:p-6 space-y-5 my-auto max-h-[92vh] overflow-y-auto text-slate-900 dark:text-slate-100 focus:outline-none shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shrink-0"><Calculator className="w-5 h-5 stroke-[1.75]" /></div>
            <div>
              <h2 id="hedonic-modal-title" className="text-base sm:text-lg font-black text-slate-900 dark:text-white">ماشین‌حساب هوشمند قیمت‌گذاری ملک (الگوریتم Hedonic)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ارزش‌گذاری کارشناسی بر اساس متراژ ({formatAreaShort(sqm, areaUnit)})، سال ساخت، وضعیت نوسازی و طبقه در مقایسه با میانگین محله</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" onClick={onClose} aria-label="بستن ماشین‌حساب هدونیک" className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"><X className="w-4 h-4 stroke-[2]" /></button>
          </div>
        </div>
        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* RIGHT COLUMN: Hedonic Input Parameters (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Neighborhood Selection */}
            <div className="apple-grouped-card dark:bg-slate-950/60 dark:border-slate-800 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="hedonic-hood-select" className="font-extrabold text-slate-800 dark:text-slate-200">محله انتخابی جهت کارشناسی:</label>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  میانگین پایه: <strong className="text-slate-900 dark:text-white">{toPersianNum(convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit))} م/{unitLabel}</strong> (سناریو v6.4 (غیرثبتی): {toPersianNum(convertPricePerSqmToUnit(hoodDealPerSqm, areaUnit))} م)
                  {intlCurrency !== 'IRT' && <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold mr-1" dir="ltr">({formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit), intlCurrency, radarLocale)})</span>}
                </span>
              </div>
              <select id="hedonic-hood-select" aria-label="انتخاب محله جهت کارشناسی هوشمند" value={activeHood.id} onChange={(e) => handleHoodChange(Number(e.target.value))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-[10px] px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-emerald-600 focus:outline-none cursor-pointer">
                {allNeighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    محله {n.name} ({n.zone}{typeof n.distKm === 'number' ? ` · ${toPersianNum(areaUnit === 'sqft' ? Number((n.distKm * 0.621371).toFixed(1)) : n.distKm)} ${areaUnit === 'sqft' ? 'mi' : 'km'}` : ''}) — پایه هر {unitLabel} {toPersianNum(convertPricePerSqmToUnit(n.baseBuyPerSqm ?? n.buyPerSqm, areaUnit))} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(n.baseBuyPerSqm ?? n.buyPerSqm, areaUnit), intlCurrency, radarLocale)})` : ''} · واحد {formatAreaShort(80, areaUnit)}: {toPersianNum((((n.baseBuyPerSqm ?? n.buyPerSqm) * 80) / 1000).toFixed(1))} میلیارد · سناریو v6.4 (غیرثبتی): {toPersianNum(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, n.baseBuyPerSqm ?? n.buyPerSqm, buildNeighborhoodListingSamples(n)).estimatedDealPricePerSqm, areaUnit))} م
                  </option>
                ))}
              </select>
              <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 space-y-1.5" data-testid="hedonic-street-tier-selector">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 dark:text-slate-300">کالیبراسیون پهنه خیابانی (Micro-Hood):</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[230px]">{activeMicroTier?.streets}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {microHoods.map((m) => (
                    <button key={m.tier} type="button" data-testid={`hedonic-street-tier-${m.tier}`} onClick={() => setStreetTier(m.tier)} className={`px-2 py-1.5 rounded-lg border text-[10.5px] font-bold transition cursor-pointer flex items-center justify-between ${streetTier === m.tier ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-900 dark:text-emerald-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'}`}>
                      <span className="truncate">{m.tier === 'luxury' ? 'پهنه اعیانی' : m.tier === 'balanced' ? 'بافت میانی' : 'پهنه اقتصادی'}</span>
                      <span className="tabular-nums text-[10px] opacity-80">{m.priceMultiplier > 1 ? `+${toPersianNum(Math.round((m.priceMultiplier - 1) * 100))}٪` : m.priceMultiplier < 1 ? `-${toPersianNum(Math.round((1 - m.priceMultiplier) * 100))}٪` : 'مبنا'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Smart NLP Ad Extractor */}
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/90 dark:border-emerald-800/70 rounded-[12px] p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-1 text-[11px] font-extrabold text-emerald-950 dark:text-emerald-200">
                <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> استخراج هوشمند از متن آگهی دیوار یا مشاور:</span>
                {nlpFeedback && <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full font-bold">{nlpFeedback}</span>}
              </div>
              <div className="flex gap-1.5">
                <input type="text" aria-label="متن آگهی جهت استخراج هوشمند" value={adRawText} onChange={(e) => setAdRawText(e.target.value)} placeholder="متن آگهی را اینجا پیست کنید (مثال: ۱۰۰ متر طبقه ۳ از ۵ با پارکینگ و آسانسور ساخت ۱۳۹۸...)" className="flex-1 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-[8px] px-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-600" />
                <button type="button" onClick={handleNlpExtract} className="px-3 py-1 bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 text-xs font-black rounded-[8px] transition cursor-pointer shrink-0">استخراج</button>
              </div>
            </div>
            {/* 1. Area (Sqm) & 2. Build Year */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="apple-grouped-card dark:bg-slate-950/60 dark:border-slate-800 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><span>۱. متراژ ({formatAreaValue(sqm, areaUnit)}):</span></span>
                  <div className="flex items-center gap-1">
                    <NumericDraftInput min={30} max={500} fallback={85} aria-label="متراژ ملک" value={sqm} onValueChange={setSqm} className="w-16 px-2 py-1 text-center font-black text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-[8px] text-slate-900 dark:text-white focus:border-emerald-600 focus:outline-none tabular-nums" />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">متر</span>
                  </div>
                </div>
                <input type="range" aria-label="اسلایدر متراژ ملک" min={35} max={300} step={5} value={Math.min(300, sqm)} onChange={(e) => setSqm(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                <div className="flex justify-between text-[10px] text-slate-400 tabular-nums"><span>{formatAreaShort(35, areaUnit)}</span><span>{formatAreaShort(100, areaUnit)}</span><span>{formatAreaShort(300, areaUnit)}</span></div>
              </div>
              <div className="apple-grouped-card dark:bg-slate-950/60 dark:border-slate-800 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><span>۲. سال ساخت شمسی:</span></span>
                  <div className="flex items-center gap-1">
                    <NumericDraftInput min={1370} max={1405} fallback={1398} aria-label="سال ساخت ملک" value={buildYear} onValueChange={setBuildYear} className="w-18 px-2 py-1 text-center font-black text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-[8px] text-slate-900 dark:text-white focus:border-emerald-600 focus:outline-none tabular-nums" />
                    <span className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">({valuation.buildingAgeYears === 0 ? 'نوساز' : `${toPersianNum(valuation.buildingAgeYears)} ساله`})</span>
                  </div>
                </div>
                <input type="range" aria-label="اسلایدر سال ساخت ملک" min={1370} max={1405} step={1} value={buildYear} onChange={(e) => setBuildYear(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                <div className="flex justify-between text-[10px] text-slate-400 tabular-nums"><span>۱۳۷۰ (قدیمی)</span><span>۱۳۹۰</span><span>۱۴۰۵ (نوساز)</span></div>
              </div>
            </div>
            {/* 3. Renovation Status */}
            <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Wrench className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><span>۳. وضعیت نوسازی و کیفیت داخلی:</span></span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">اثر مستقیم و جبران استهلاک سنی</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {HEDONIC_RENOVATION_OPTIONS.map((opt) => {
                  const isSelected = renovationStatus === opt.id;
                  return (
                    <button key={opt.id} type="button" onClick={() => setRenovationStatus(opt.id)} className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col justify-between ${isSelected ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-600 text-emerald-950 dark:text-emerald-200 shadow-xs' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold">{opt.shortLabel}</span>
                        <span className={`text-[10.5px] font-bold tabular-nums ${opt.baseImpactPercent > 0 ? 'text-emerald-700 dark:text-emerald-400' : opt.baseImpactPercent < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>{opt.baseImpactPercent > 0 ? `+${toPersianNum(opt.baseImpactPercent)}٪` : `${toPersianNum(opt.baseImpactPercent)}٪`}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 4. Floor & Total Floors + Amenities */}
            <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><span>۴. طبقه واحد:</span></span>
                    <div className="flex items-center gap-1">
                      <NumericDraftInput min={-1} max={25} fallback={3} aria-label="طبقه واحد" value={floor} onValueChange={(nextFloor) => { setFloor(nextFloor); if (nextFloor > totalFloors) setTotalFloors(nextFloor); }} className="w-14 px-2 py-0.5 text-center font-black text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:border-emerald-600 focus:outline-none tabular-nums" />
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">{floor === 0 ? '(همکف)' : floor < 0 ? '(زیرهمکف)' : `از ${toPersianNum(totalFloors)}`}</span>
                    </div>
                  </div>
                  <input type="range" aria-label="اسلایدر طبقه واحد" min={0} max={15} step={1} value={Math.max(0, Math.min(15, floor))} onChange={(e) => { const nextFloor = Number(e.target.value); setFloor(nextFloor); if (nextFloor > totalFloors) setTotalFloors(nextFloor); }} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">تعداد کل طبقات ساختمان:</span>
                    <strong className="text-xs text-slate-900 dark:text-white tabular-nums">{toPersianNum(totalFloors)} طبقه</strong>
                  </div>
                  <input type="range" aria-label="تعداد کل طبقات ساختمان" min={1} max={25} step={1} value={totalFloors} onChange={(e) => { const tf = Number(e.target.value); setTotalFloors(tf); if (floor > tf) setFloor(tf); }} className="w-full accent-slate-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" aria-label="پارکینگ سندی" checked={hasParking} onChange={(e) => setHasParking(e.target.checked)} className="rounded text-emerald-600" />
                  <span>پارکینگ سندی</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" aria-label="آسانسور" checked={hasElevator} onChange={(e) => setHasElevator(e.target.checked)} className="rounded text-emerald-600" />
                  <span>آسانسور</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" aria-label="انباری سندی" checked={hasStorage} onChange={(e) => setHasStorage(e.target.checked)} className="rounded text-emerald-600" />
                  <span>انباری سندی</span>
                </label>
              </div>
            </div>
            {/* 5. Asking Price & Verification */}
            <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <label htmlFor="hedonic-asking-input" className="font-bold text-slate-700 dark:text-slate-300">قیمت اعلامی فروشنده (اختیاری):</label>
                <div className="flex items-center gap-1.5">
                  <input id="hedonic-asking-input" type="text" inputMode="decimal" dir="ltr" aria-label="قیمت اعلامی فروشنده به میلیارد تومان" placeholder={`مثلاً ${(valuation.hedonicTotalMillion / 1000).toFixed(1)}`} value={sellerAskingBillion} onChange={(e) => setSellerAskingBillion(e.target.value)} className="w-24 px-2.5 py-1 text-center font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:border-emerald-600 focus:outline-none tabular-nums" />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">میلیارد تومان{sellerAskingMillion && intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sellerAskingMillion, intlCurrency, radarLocale)})` : ''}</span>
                </div>
              </div>
              {valuation.sellerPriceEvaluation && (
                <div className={`p-2.5 rounded-xl border text-xs space-y-1 ${valuation.sellerPriceEvaluation.verdict === 'bargain' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200' : valuation.sellerPriceEvaluation.verdict === 'fair' ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200'}`}>
                  <div className="font-extrabold flex items-center justify-between">
                    <span>نتیجه راستی‌آزمایی قیمت فروشنده:</span>
                    <span>{valuation.sellerPriceEvaluation.verdictLabel}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{valuation.sellerPriceEvaluation.verdictDescription}{sellerAskingMillion ? ` (اعلامی هر ${unitLabel}: ${toPersianNum(convertPricePerSqmToUnit(Math.round(sellerAskingMillion / Math.max(1, sqm)), areaUnit))} م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(Math.round(sellerAskingMillion / Math.max(1, sqm)), areaUnit), intlCurrency, radarLocale)}` : ''} | اختلاف کل: ${sellerAskingMillion - valuation.hedonicTotalMillion >= 0 ? '+' : ''}${toPersianNum((sellerAskingMillion - valuation.hedonicTotalMillion).toLocaleString())} م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(Math.abs(sellerAskingMillion - valuation.hedonicTotalMillion), intlCurrency, radarLocale)}` : ''})` : ''}</p>
                </div>
              )}
              {/* Recent Calculations History */}
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs space-y-1" data-testid="hedonic-recent-presets">
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">پیش‌تنظیم‌های پرکاربرد کارشناسی:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => { setSqm(65); setBuildYear(1402); setFloor(2); }} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 cursor-pointer">۶۵ متری نوساز</button>
                  <button type="button" onClick={() => { setSqm(85); setBuildYear(1395); setFloor(3); }} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 cursor-pointer">۸۵ متری ۱۰ ساله</button>
                  <button type="button" onClick={() => { setSqm(120); setBuildYear(1385); setFloor(1); setTotalFloors(3); }} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:border-emerald-500 cursor-pointer">۱۲۰ متری کم‌واحد قدیمی (قدرالسهم)</button>
                </div>
              </div>
            </div>
          </div>
          <HedonicValuationResultsColumn valuation={valuation} copiedReport={copiedReport} onCopyValuation={handleCopyValuation} downloadingPng={downloadingPng} setDownloadingPng={setDownloadingPng} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}