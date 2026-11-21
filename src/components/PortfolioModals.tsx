import React, { useState, useMemo, useEffect, useRef } from 'react'; import { ArrowLeftRight, Bookmark, Check, Copy, PlusCircle, Trash2, X } from 'lucide-react'; import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods'; import { explainNeighborhoodRecommendation } from './useEvaluatedNeighborhoods'; import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator'; import type { evaluateTradeUpOptions } from '../data/neighborhoodInsights'; import { sanitizeInput } from '../utils/security'; import { useDialogFocus } from './useDialogFocus'; import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { NumericDraftInput } from './ui/NumericDraftInput'; export type TradeUpEvaluationResult = ReturnType<typeof evaluateTradeUpOptions>; export interface VisitedHomeEntry { id: string; hoodId: number; hoodName: string; address: string; askingPriceMillion: number; notes: string; date: string; rating: number; }
export interface PortfolioModalsProps { selectedHood: EvaluatedNeighborhood; evaluatedNeighborhoods: EvaluatedNeighborhood[]; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; setMobileSheetOpen: React.Dispatch<React.SetStateAction<boolean>>; showVisitedModal: boolean; setShowVisitedModal: React.Dispatch<React.SetStateAction<boolean>>; visitedHomes: VisitedHomeEntry[]; setVisitedHomes: React.Dispatch<React.SetStateAction<VisitedHomeEntry[]>>; newVisitAddress: string; setNewVisitAddress: React.Dispatch<React.SetStateAction<string>>; newVisitPrice: number; setNewVisitPrice: React.Dispatch<React.SetStateAction<number>>; newVisitNotes: string; setNewVisitNotes: React.Dispatch<React.SetStateAction<string>>; newVisitRating: number; setNewVisitRating: React.Dispatch<React.SetStateAction<number>>; showTradeUpModal: boolean; setShowTradeUpModal: React.Dispatch<React.SetStateAction<boolean>>; tradeUpCurrentHoodId: number; setTradeUpCurrentHoodId: React.Dispatch<React.SetStateAction<number>>; tradeUpCurrentSqm: number; setTradeUpCurrentSqm: React.Dispatch<React.SetStateAction<number>>; tradeUpCurrentAge: number; setTradeUpCurrentAge: React.Dispatch<React.SetStateAction<number>>; tradeUpExtraCash: number; setTradeUpExtraCash: React.Dispatch<React.SetStateAction<number>>;
  tradeUpUseLoan: boolean; setTradeUpUseLoan: React.Dispatch<React.SetStateAction<boolean>>; tradeUpUseRahn: boolean; setTradeUpUseRahn: React.Dispatch<React.SetStateAction<boolean>>; tradeUpTargetSqm: number; setTradeUpTargetSqm: React.Dispatch<React.SetStateAction<number>>; tradeUpTargetAgeSegment: 'new' | 'mid' | 'older'; setTradeUpTargetAgeSegment: React.Dispatch<React.SetStateAction<'new' | 'mid' | 'older'>>; tradeUpResults: TradeUpEvaluationResult; } export function PortfolioModals(props: PortfolioModalsProps) { const { selectedHood, evaluatedNeighborhoods, onSelectNeighborhood, setMobileSheetOpen, showVisitedModal, setShowVisitedModal, visitedHomes, setVisitedHomes, newVisitAddress, setNewVisitAddress, newVisitPrice, setNewVisitPrice, newVisitNotes, setNewVisitNotes, newVisitRating, setNewVisitRating, showTradeUpModal, setShowTradeUpModal, tradeUpCurrentHoodId, setTradeUpCurrentHoodId, tradeUpCurrentSqm, setTradeUpCurrentSqm, tradeUpCurrentAge, setTradeUpCurrentAge, tradeUpExtraCash, setTradeUpExtraCash, tradeUpUseLoan, setTradeUpUseLoan, tradeUpUseRahn, setTradeUpUseRahn, tradeUpTargetSqm, setTradeUpTargetSqm, tradeUpTargetAgeSegment, setTradeUpTargetAgeSegment, tradeUpResults,
  } = props; const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency(); const [visitSortBy, setVisitSortBy] = useState<'newest' | 'rating'>('newest'); const [visitHoodId, setVisitHoodId] = useState<number>(selectedHood.id); const [visitFormError, setVisitFormError] = useState<string>(''); const [copiedVisits, setCopiedVisits] = useState(false); const [tradeUpFilterMode, setTradeUpFilterMode] = useState<'all' | 'cash_release'>('all'); const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); const dialogRef = useDialogFocus(showVisitedModal || showTradeUpModal, () => { setShowVisitedModal(false); setShowTradeUpModal(false); }); useEffect(() => () => { if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current); }, []); useEffect(() => {
    if (selectedHood?.id) setVisitHoodId(selectedHood.id); setVisitFormError(''); }, [selectedHood?.id, showVisitedModal]); const sortedVisitedHomes = useMemo(() => (visitSortBy === 'rating' ? [...visitedHomes].sort((a, b) => b.rating - a.rating) : visitedHomes), [visitedHomes, visitSortBy]); const displayedTradeUpHoods = useMemo(() => { const list = tradeUpResults.matchingHoods || []; const maxDeficitAllowed = -Math.round(tradeUpResults.totalBaseCapitalMillion * 0.20); const affordableOrNear = list.filter((item) => item.isAffordable || item.surplusOrDeficitMillion >= maxDeficitAllowed); const activePool = affordableOrNear.length > 0 ? affordableOrNear : list; return tradeUpFilterMode === 'cash_release' ? activePool.filter((item) => item.surplusOrDeficitMillion > 0).sort((a, b) => b.surplusOrDeficitMillion - a.surplusOrDeficitMillion || b.hood.overallScore - a.hood.overallScore) : activePool.sort((a, b) => (b.isAffordable ? 1 : 0) - (a.isAffordable ? 1 : 0) || b.hood.overallScore - a.hood.overallScore); }, [tradeUpResults.matchingHoods, tradeUpFilterMode, tradeUpResults.totalBaseCapitalMillion]); if (!showVisitedModal && !showTradeUpModal) return null; const handleCopyVisitsForFamily = () => { if (sortedVisitedHomes.length === 0) return; const lines = [
      '📋 خلاصه بازدیدهای میدانی مسکن (رادار هوشمند مسکن):',
      ...sortedVisitedHomes.map((v, idx) => `${toPersianNum(idx + 1)}. محله ${v.hoodName} (${v.date}) — ⭐ ${toPersianNum(v.rating)}/۱۰\n   📍 ${v.address}${v.askingPriceMillion > 0 ? ` | قیمت پیشنهادی: ${toPersianNum(v.askingPriceMillion)} م.ت${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(v.askingPriceMillion, intlCurrency, radarLocale)})` : ''}` : ''}${v.notes ? `\n   📝 یادداشت: ${v.notes}` : ''}`),
    ]; navigator.clipboard?.writeText(lines.join('\n\n')).catch(() => {}); setCopiedVisits(true); if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current); copyTimerRef.current = setTimeout(() => { setCopiedVisits(false); copyTimerRef.current = null; }, 2200); }; return ( <> {showVisitedModal && ( <div
          role="dialog" aria-modal="true" aria-label="دفترچه بازدیدهای من" onClick={() => setShowVisitedModal(false)} className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" >
          <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}
            className="apple-window-sheet dark:bg-slate-900 max-w-lg w-full p-5 space-y-3.5 max-h-[90vh] overflow-y-auto focus:outline-none dark:border dark:border-slate-800" >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800"> <span className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Bookmark className="w-5 h-5 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" /> <span>دفترچه بازدیدهای میدانی من ({toPersianNum(visitedHomes.length)} فایل)</span>
              </span> <div className="flex items-center gap-2"><AreaUnitToggle compact showIntlControls /><button type="button" aria-label="بستن دفترچه بازدیدها" onClick={() => setShowVisitedModal(false)} className="p-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"><X className="w-4 h-4 stroke-[1.75]" /></button></div>
            </div> <form
              onSubmit={(e) => { e.preventDefault(); const cleanAddr = sanitizeInput(newVisitAddress, 180); if (!cleanAddr) { setVisitFormError('لطفاً آدرس یا مشخصات کوتاه واحد بازدیدشده را وارد کنید.'); return; }
                setVisitFormError(''); const targetVisitHood = evaluatedNeighborhoods.find((n) => n.id === visitHoodId) || selectedHood; const entry: VisitedHomeEntry = {
                  id: `visit-${Date.now()}`, hoodId: targetVisitHood.id, hoodName: targetVisitHood.name,
                  address: cleanAddr, askingPriceMillion: Math.max(0, Number(newVisitPrice) || 0), notes: sanitizeInput(newVisitNotes, 300), date: new Date().toLocaleDateString('fa-IR'), rating: newVisitRating, }; setVisitedHomes((prev) => [entry, ...prev]); setNewVisitAddress(''); setNewVisitPrice(0); setNewVisitNotes(''); setNewVisitRating(8); }}
              className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-3.5 space-y-2.5" >
              <div className="flex items-center justify-between gap-2 text-xs"> <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
                  <span>ثبت بازدید جدید</span>
                </span>
                <select
                  aria-label="محله بازدید" value={visitHoodId} onChange={(e) => setVisitHoodId(Number(e.target.value))}
                  className="max-w-[190px] sm:max-w-[260px] truncate bg-slate-100/80 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 rounded-lg px-2 py-1 font-bold text-slate-800 dark:text-slate-100 text-xs"
                >
                  {evaluatedNeighborhoods.map((n) => { const uBuy = Number(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit).toFixed(1)); const fx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uBuy, intlCurrency, radarLocale)}` : ''; return ( <option key={n.id} value={n.id}>محله {n.name} ({areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(uBuy)} م{fx} · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد)</option> ); })}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-[11px] block mb-1">آدرس یا مشخصات واحد:</label>
                  <input
                    type="text" aria-label="آدرس یا مشخصات واحد" value={newVisitAddress}
                    onChange={(e) => { setNewVisitAddress(e.target.value); if (visitFormError) setVisitFormError(''); }}
                    placeholder={`مثال: ${formatAreaShort(85, areaUnit)}، طبقه ۳، فرعی دنج`}
                    className="w-full bg-slate-100/80 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-slate-500 dark:text-slate-400 text-[11px] block mb-1">قیمت پیشنهادی مالک (میلیون){newVisitPrice > 0 && intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(newVisitPrice, intlCurrency, radarLocale)}` : ''}:</label>
                  <NumericDraftInput
                    aria-label="قیمت پیشنهادی مالک"
                    min={0}
                    max={500000}
                    fallback={0}
                    nullable
                    value={newVisitPrice > 0 ? newVisitPrice : null}
                    onNullableValueChange={(val) => setNewVisitPrice(val ?? 0)}
                    placeholder="مثال: ۸۲۰۰"
                    className="w-full bg-slate-100/80 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-500 dark:text-slate-400 text-[11px] block mb-1">یادداشت‌های میدانی، نقاط ضعف و قوت:</label>
                <input
                  type="text" aria-label="یادداشت‌های میدانی" value={newVisitNotes} onChange={(e) => setNewVisitNotes(e.target.value)}
                  placeholder="مثال: نورگیر عالی، مشاعات نیازمند نقاشی، پارک مهمان سخت"
                  className="w-full bg-slate-100/80 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                />
              </div>
              {visitFormError && ( <div role="alert" className="text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg px-2.5 py-1.5">
                  {visitFormError}
                </div> )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">نمره من به ملک:</span>
                  <select
                    aria-label="نمره من به ملک" value={newVisitRating} onChange={(e) => setNewVisitRating(Number(e.target.value))}
                    className="bg-slate-100/80 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 rounded-lg px-2 py-1 font-bold text-emerald-700 dark:text-emerald-400"
                  >
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => ( <option key={r} value={r}>{toPersianNum(r)} از ۱۰</option> ))}
                  </select>
                </div>
                <button type="submit" className="px-4 py-2 bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer">
                  ثبت در دفترچه
                </button>
              </div>
            </form>
            {visitedHomes.length > 0 && ( <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1 apple-segmented dark:bg-slate-900 p-0.5 rounded-lg font-bold">
                  <button
                    type="button" onClick={() => setVisitSortBy('newest')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${visitSortBy === 'newest' ? 'apple-segmented-pill-active dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    جدیدترین بازدیدها
                  </button>
                  <button
                    type="button" onClick={() => setVisitSortBy('rating')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${visitSortBy === 'rating' ? 'apple-segmented-pill-active dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    بالاترین امتیاز (⭐)
                  </button>
                </div>
                <button
                  type="button" onClick={handleCopyVisitsForFamily}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  {copiedVisits ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedVisits ? 'کپی شد!' : 'کپی و اشتراک‌گذاری لیست بازدیدها برای خانواده'}</span>
                </button>
              </div> )}
            <div className="space-y-2">
              {sortedVisitedHomes.length === 0 ? (
                <div className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-5 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="font-bold text-slate-700 dark:text-slate-200">هنوز بازدیدی ثبت نکرده‌اید</div>
                  <div>هنگام بازدید میدانی در محله {selectedHood.name} یا سایر محله‌ها، مشخصات، قیمت پیشنهادی و نمره ملک را در فرم بالا ثبت کنید تا برای مقایسه خانوادگی ذخیره شود.</div>
                </div>
              ) : (
                sortedVisitedHomes.map((item) => (
                  <div key={item.id} className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { const found = evaluatedNeighborhoods.find((n) => n.id === item.hoodId); if (found) { onSelectNeighborhood(found); setShowVisitedModal(false); setMobileSheetOpen(true); }
                          }}
                          className="font-extrabold text-slate-900 dark:text-slate-100 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition"
                        >
                          محله {item.hoodName}
                        </button>
                        <span className="text-[10px] text-slate-400">({item.date})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-extrabold tabular-nums text-[11px]">
                          ⭐ {toPersianNum(item.rating)}/۱۰
                        </span>
                        <button
                          type="button"
                          aria-label={`حذف بازدید ${item.address}`}
                          onClick={() => setVisitedHomes((prev) => prev.filter((v) => v.id !== item.id))}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer p-1" title="حذف این مورد"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[1.75]" />
                        </button>
                      </div>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200 font-semibold">{item.address}</div>
                    {item.askingPriceMillion > 0 && (() => { const vHood = evaluatedNeighborhoods.find((n) => n.id === item.hoodId); const uHood = vHood ? Number(convertPricePerSqmToUnit(vHood.buyPerSqm, areaUnit).toFixed(1)) : 0; const uDeal = vHood ? Number(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(vHood.id, vHood.name, vHood.buyPerSqm, buildNeighborhoodListingSamples(vHood)).estimatedDealPricePerSqm, areaUnit).toFixed(1)) : 0; const impliedSqm = vHood ? Math.round(item.askingPriceMillion / Math.max(1, vHood.buyPerSqm)) : 0; return (
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold tabular-nums">
                        قیمت پیشنهادی مالک: {toPersianNum(item.askingPriceMillion)} میلیون تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(item.askingPriceMillion, intlCurrency, radarLocale)})` : ''}{uHood > 0 ? ` · معیار محله: ${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(uHood)} م (تخمین معامله: ${toPersianNum(uDeal)} م) · معادل ~${formatAreaShort(impliedSqm, areaUnit)}` : ''}
                      </div> ); })()}
                    {item.notes && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                        {item.notes}
                      </p> )}
                  </div> ))
              )}
            </div>
          </div>
        </div> )}
      {showTradeUpModal && (
        <div
          role="dialog" aria-modal="true" aria-label="ماشین‌حساب معاوضه و ارتقای ملک"
          onClick={() => setShowTradeUpModal(false)}
          className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
        >
          <div
            ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet dark:bg-slate-900 max-w-xl w-full p-5 space-y-3.5 max-h-[92vh] overflow-y-auto focus:outline-none dark:border dark:border-slate-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800">
              <span className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 stroke-[1.75] text-[var(--color-brand-600)] dark:text-emerald-400" />
                <span>ماشین‌حساب معاوضه و ارتقای متراژ ملک (Trade-Up)</span>
              </span>
              <div className="flex items-center gap-2">
                <AreaUnitToggle compact showIntlControls />
                <button type="button" aria-label="بستن ماشین‌حساب معاوضه" onClick={() => setShowTradeUpModal(false)} className="p-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"><X className="w-4 h-4 stroke-[1.75]" /></button>
              </div>
            </div>
            <div className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-3.5 space-y-3 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-slate-100">۱. مشخصات ملک فعلی شما برای فروش:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">محله فعلی:</label>
                  <select
                    aria-label="محله فعلی" value={tradeUpCurrentHoodId} onChange={(e) => setTradeUpCurrentHoodId(Number(e.target.value))} className="w-full bg-slate-100/80 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 rounded-lg px-2 py-1.5 font-bold text-slate-800 dark:text-slate-100"
                  >
                    {evaluatedNeighborhoods.map((n) => { const uBuy = Number(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit).toFixed(1)); const fx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uBuy, intlCurrency, radarLocale)}` : ''; return (
                      <option key={n.id} value={n.id}>{n.name} ({areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(uBuy)} م{fx} · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد)</option>
                    ); })} </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                    متراژ فعلی: <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{formatAreaValue(tradeUpCurrentSqm, areaUnit, true)}</strong>
                  </label>
                  <input type="range" aria-label="متراژ فعلی" min={40} max={250} step={5} value={tradeUpCurrentSqm} onChange={(e) => setTradeUpCurrentSqm(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                    سن بنا: <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{toPersianNum(tradeUpCurrentAge)} سال</strong>
                  </label>
                  <input type="range" aria-label="سن بنا" min={0} max={30} step={1} value={tradeUpCurrentAge} onChange={(e) => setTradeUpCurrentAge(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">ارزش تقریبی فروش ملک فعلی (هر {areaUnit === 'sqft' ? 'ft²' : 'متر'} {toPersianNum(Math.round(convertPricePerSqmToUnit(tradeUpResults.netProceedsFromSaleMillion / Math.max(1, tradeUpCurrentSqm), areaUnit)))} م):</span>
                <strong className="text-emerald-700 dark:text-emerald-400 text-sm font-black tabular-nums">
                  {toPersianNum((tradeUpResults.netProceedsFromSaleMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(tradeUpResults.netProceedsFromSaleMillion, intlCurrency, radarLocale)})` : ''}
                </strong>
              </div>
            </div>
            <div className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-3.5 space-y-3 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-slate-100">۲. اهرم‌های مالی و نقدینگی مازاد:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-600 dark:text-slate-300">پس‌انداز نقدی مازاد:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum((tradeUpExtraCash / 1000).toFixed(1))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(tradeUpExtraCash, intlCurrency, radarLocale)})` : ''}</strong>
                  </div>
                  <input type="range" aria-label="پس‌انداز نقدی مازاد" min={0} max={15000} step={250} value={tradeUpExtraCash} onChange={(e) => setTradeUpExtraCash(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
                </div>
                <div className="space-y-1.5 text-slate-700 dark:text-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tradeUpUseLoan} onChange={(e) => setTradeUpUseLoan(e.target.checked)} aria-label="دریافت وام مسکن برای ارتقای ملک" className="rounded text-[var(--color-brand-600)]" />
                    <span>دریافت وام مسکن (+۱.۲ میلیارد تومان{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(1200, intlCurrency, radarLocale)}` : ''})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={tradeUpUseRahn} onChange={(e) => setTradeUpUseRahn(e.target.checked)} aria-label="رهن دادن واحد جدید به مستأجر" className="rounded text-[var(--color-brand-600)]" />
                    <span>رهن دادن واحد جدید به مستأجر (~{toPersianNum(Math.round(selectedHood.rahn80m * (tradeUpTargetSqm / 80)))} م · اجاره: {toPersianNum(Math.round(selectedHood.rahn80m * (tradeUpTargetSqm / 80) * 0.03))} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(Math.round(selectedHood.rahn80m * (tradeUpTargetSqm / 80)), intlCurrency, radarLocale)}` : ''})</span>
                  </label>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">کل سرمایه پایه در دسترس شما:</span>
                <strong className="text-emerald-800 dark:text-emerald-300 text-sm font-black tabular-nums">{toPersianNum((tradeUpResults.totalBaseCapitalMillion / 1000).toFixed(2))} میلیارد تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(tradeUpResults.totalBaseCapitalMillion, intlCurrency, radarLocale)})` : ''}</strong>
              </div>
            </div>
            <div className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 dark:text-slate-100">۳. هدف ملک جدید شما:</span>
                <div className="flex items-center gap-1 apple-segmented dark:bg-slate-900">
                  {[
                    { id: 'new' as const, label: 'نوساز' }, { id: 'mid' as const, label: '۶ تا ۱۵ سال' }, { id: 'older' as const, label: 'قدیمی‌ساز' }, ].map((s) => ( <button
                      key={s.id} type="button" onClick={() => setTradeUpTargetAgeSegment(s.id)}
                      className={`px-2 py-0.5 text-[10.5px] font-bold cursor-pointer ${tradeUpTargetAgeSegment === s.id ? 'apple-segmented-pill-active dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
                    >
                      {s.label} </button>
                  ))} </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-600 dark:text-slate-300">متراژ مورد نظر واحد جدید ({tradeUpTargetSqm >= tradeUpCurrentSqm ? '+' : '-'}{formatAreaShort(Math.abs(tradeUpTargetSqm - tradeUpCurrentSqm), areaUnit)}):</span>
                <strong className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">{formatAreaValue(tradeUpTargetSqm, areaUnit, true)}</strong>
              </div>
              <input type="range" aria-label="متراژ مورد نظر واحد جدید" min={50} max={250} step={5} value={tradeUpTargetSqm} onChange={(e) => setTradeUpTargetSqm(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-extrabold text-xs text-slate-900 dark:text-slate-100">محله‌های قابل ارتقا با سرمایه شما ({toPersianNum(displayedTradeUpHoods.length)} محله):</div>
                <div className="flex items-center gap-1 apple-segmented dark:bg-slate-900">
                  <button type="button" onClick={() => setTradeUpFilterMode('all')} className={`px-2 py-1 text-[10px] font-bold cursor-pointer ${tradeUpFilterMode === 'all' ? 'apple-segmented-pill-active dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>همه محله‌های قابل خرید</button>
                  <button type="button" onClick={() => setTradeUpFilterMode('cash_release')} className={`px-2 py-1 text-[10px] font-bold cursor-pointer ${tradeUpFilterMode === 'cash_release' ? 'apple-segmented-pill-active dark:bg-slate-800 text-emerald-800 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'}`}>آزادسازی نقدینگی (با پول نقد مازاد)</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                {displayedTradeUpHoods.length === 0 ? ( <div className="sm:col-span-2 apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    محله‌ای با این متراژ هدف برای آزادسازی نقدینگی یافت نشد؛ متراژ هدف را کاهش دهید یا تب «همه محله‌های قابل خرید» را انتخاب کنید.
                  </div>
                ) : (() => { const maxTradeUpScore = Math.max(...displayedTradeUpHoods.map((x) => x.hood.overallScore)); const tiedAtTopCount = displayedTradeUpHoods.filter((x) => Math.abs(maxTradeUpScore - x.hood.overallScore) <= 0.3).length; return displayedTradeUpHoods.map((item) => { const recExp = explainNeighborhoodRecommendation(item.hood, { mode: 'buy', topReferenceScore: maxTradeUpScore }); const showTieBadge = recExp.isTieBandWithTop && tiedAtTopCount > 1; return ( <div key={item.hood.id} className="apple-grouped-card dark:bg-slate-800/80 dark:border-slate-700 p-2.5 text-xs space-y-1 hover:border-emerald-500 transition">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100">محله {item.hood.name} <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">({areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(Math.round(convertPricePerSqmToUnit(item.hood.buyPerSqm, areaUnit)))} م)</span></span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">نمره: {toPersianNum(item.hood.overallScore)}{showTieBadge ? ' (≈ هم‌تراز ±۰.۳)' : ''}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">قیمت کل واحد ({formatAreaShort(tradeUpTargetSqm, areaUnit)}): {toPersianNum((item.targetUnitTotalPriceMillion / 1000).toFixed(1))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(item.targetUnitTotalPriceMillion, intlCurrency, radarLocale)})` : ''}</div>
                    {recExp.nonCompensatoryWarningsFa.length > 0 && <div className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800 rounded px-1.5 py-0.5 font-semibold" data-testid="tradeup-bottleneck-warning">{recExp.nonCompensatoryWarningsFa[0]}</div>}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700">
                      <span className={`text-[10px] font-semibold tabular-nums ${item.surplusOrDeficitMillion < 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {item.surplusOrDeficitMillion > 0
                          ? `+${toPersianNum((item.surplusOrDeficitMillion / 1000).toFixed(2))} میلیارد نقدینگی آزادشده`
                          : item.surplusOrDeficitMillion === 0
                            ? 'سر به سر (بدون کسری)'
                            : Math.abs(item.surplusOrDeficitMillion) >= 1000
                              ? `تنها ${toPersianNum((Math.abs(item.surplusOrDeficitMillion) / 1000).toFixed(2))} میلیارد کسری`
                              : `تنها ${toPersianNum(Math.round(Math.abs(item.surplusOrDeficitMillion)))} میلیون کسری`}
                        {item.surplusOrDeficitMillion !== 0 && intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.abs(item.surplusOrDeficitMillion), intlCurrency, radarLocale)})` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => { onSelectNeighborhood(item.hood); setShowTradeUpModal(false); setMobileSheetOpen(true); }} className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 underline cursor-pointer"
                      >
                        مشاهده روی نقشه
                      </button>
                    </div>
                  </div>
                ); }); })()} </div>
            </div>
          </div>
        </div>
      )} </>
  ); }