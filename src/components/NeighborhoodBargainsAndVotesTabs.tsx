import React, { useState } from 'react'; import { Award, Bell, Bookmark, Compass, MapPin, Phone, PlusCircle, Sparkles, ThumbsUp } from 'lucide-react'; import { EvaluatedNeighborhood, LocalLandmark, Neighborhood, ResidentVoteDoc, isSponsorActive, toPersianNum } from '../data/neighborhoods'; import type { CityId } from '../data/multiCityData'; import { buildExternalDivarUrl, type FeatureFlags } from '../utils/security'; import { ListingMediaGallery } from './ListingMediaGallery'; import { ViewportLazyRender } from './priceHeatmapAndViewportLazy'; import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples, computeQualityMultiplier, extractListingSpecsFromText, isLiveDivarBargainId, type PriceSourceType } from '../data/realMarketPriceAggregator';
import { dealFairTotalLabelFa } from '../utils/epistemicUiLabels';
import { EpistemicMarketDisclaimer } from './EpistemicMarketDisclaimer'; import { getCurrentJalaliYear } from '../data/hedonicPricingEngine';
export interface NeighborhoodBargainsAndVotesTabsProps {
  activeTab: 'bargains' | 'vote'; selectedHood: EvaluatedNeighborhood; activeCity: CityId; mode: 'rent' | 'buy'; targetSqm: number; buyTotalBudget?: number;
  deposit?: number; monthlyRent?: number; featureFlags: FeatureFlags; setBargainHoodId: (id: number) => void; setAgencyModalTab: (t: 'submit_bargain' | 'reserve_sponsor') => void; setShowAgencyModal: (v: boolean) => void; setAlertHoodId: (id: number) => void;
  setAlertSubmitMsg: (msg: string) => void; setShowBuyerAlertModal: (v: boolean) => void; callingSponsorHoodId: number | null; revealedSponsorPhoneHoodId: number | null; onTrackSponsorCall: (hood: EvaluatedNeighborhood, sponsor: NonNullable<Neighborhood['sponsor']>) => void;
  setNewVisitAddress: (v: string) => void; setNewVisitPrice: (v: number) => void; setShowVisitedModal: (v: boolean) => void; hoodLandmarks: LocalLandmark[]; onFocusLandmarkOnMap: (lm: LocalLandmark) => void;
  voteAir: number; setVoteAir: (v: number) => void; votePower: number; setVotePower: (v: number) => void; voteInternet: number; setVoteInternet: (v: number) => void; voteMetro: number; setVoteMetro: (v: number) => void;
  voteSecurity: number; setVoteSecurity: (v: number) => void; voteFlat: number; setVoteFlat: (v: number) => void; voteComment: string; setVoteComment: (v: string) => void; verifyingGeo: boolean; onResidentVote: (useGeo: boolean) => void;
  voteStatus: { type: 'success' | 'warning' | 'info'; text: string } | null; cloudVotes: ResidentVoteDoc[];
}
export function NeighborhoodBargainsAndVotesTabs(props: NeighborhoodBargainsAndVotesTabsProps): React.ReactElement {
  const { activeTab, selectedHood, activeCity, mode, targetSqm, buyTotalBudget, deposit, monthlyRent, featureFlags, setBargainHoodId, setAgencyModalTab, setShowAgencyModal, setAlertHoodId, setAlertSubmitMsg, setShowBuyerAlertModal, callingSponsorHoodId, revealedSponsorPhoneHoodId, onTrackSponsorCall, setNewVisitAddress, setNewVisitPrice, setShowVisitedModal, hoodLandmarks, onFocusLandmarkOnMap, voteAir, setVoteAir, votePower, setVotePower, voteInternet, setVoteInternet, voteMetro, setVoteMetro, voteSecurity, setVoteSecurity, voteFlat, setVoteFlat, voteComment, setVoteComment, verifyingGeo, onResidentVote, voteStatus, cloudVotes } = props;
  const [areaUnit] = useAreaUnit(); const [radarLocale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const curJalaliYear = getCurrentJalaliYear();
  const [adText, setAdText] = useState(''); const [anSqm, setAnSqm] = useState(targetSqm || 85); const [anAge, setAnAge] = useState(5); const [anFloor, setAnFloor] = useState(2); const [anTotalFloors, setAnTotalFloors] = useState(5);
  const [anParking, setAnParking] = useState(true); const [anElevator, setAnElevator] = useState(true); const [anStorage, setAnStorage] = useState(true); const [anAskingMillion, setAnAskingMillion] = useState(0);
  const [anPriceSourceType, setAnPriceSourceType] = useState<PriceSourceType>('NONE');
  const [anSignals, setAnSignals] = useState({ hasLegalRisk: false, hasTenantLag: false, isRenovated: false, isUrbanRenewal: false });
  const handlePasteAdText = (txt: string) => {
    setAdText(txt); if (!txt.trim()) return;
    const ext = extractListingSpecsFromText(txt, selectedHood.buyPerSqm);
    setAnSqm(ext.sqm); setAnAge(ext.age ?? 5); setAnFloor(ext.floor ?? 2); setAnTotalFloors(ext.totalFloors ?? 5);
    setAnParking(ext.hasParking); setAnElevator(ext.hasElevator); setAnStorage(ext.hasStorage); setAnAskingMillion(ext.totalMillion); setAnPriceSourceType(ext.priceSourceType); setAnSignals(ext.detectedSignals);
  };
  if (activeTab === 'bargains') {
    const agg = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood));
    const hoodTotal80mMillions = selectedHood.buyPerSqm * 80; const estMonthlyRent80 = Math.round(selectedHood.rahn80m * 0.03);
    const qMult = computeQualityMultiplier({ age: anAge ?? 5, floor: anFloor ?? 2, totalFloors: anTotalFloors ?? 5, hasParking: anParking, hasElevator: anElevator, hasStorage: anStorage, detectedSignals: anSignals, hoodBasePerSqm: agg.askingPricePerSqm });
    const fairAskTotal = Math.round(agg.askingPricePerSqm * qMult * Math.max(25, anSqm));
    const fairDealTotal = Math.round(agg.estimatedDealPricePerSqm * qMult * Math.max(25, anSqm));
    const effectiveAskingTotal = anAskingMillion > 0 && anAskingMillion <= 600 ? Math.round(anAskingMillion * Math.max(25, anSqm)) : anAskingMillion;
    const devPct = effectiveAskingTotal > 0 && fairAskTotal > 0 ? Math.round(((effectiveAskingTotal - fairAskTotal) / fairAskTotal) * 1000) / 10 : 0;
    const verdict = devPct <= -5 ? { label: '🔥 شکار واقعی (زیر قیمت کارشناسی)', cls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' } : devPct <= 4 ? { label: '✅ به قیمت و منصفانه', cls: 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800' } : { label: '🚨 حباب قیمتی / بالاتر از عرف محله', cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
    return (
      <div className="space-y-3 text-xs">
        <div className="apple-grouped-card dark:bg-slate-900 p-3.5 space-y-2.5 border-emerald-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <span className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><span>کارشناسی هوشمند متن آگهی دیوار/شیپور</span></span>
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md tabular-nums">ضریب کیفی: {toPersianNum(qMult)}x</span>
          </div>
          <textarea rows={2} aria-label="متن کامل آگهی دیوار یا شیپور" value={adText} onChange={(e) => handlePasteAdText(e.target.value)} placeholder="متن کامل آگهی دیوار یا شیپور را اینجا الصاق (Paste) کنید تا متراژ، طبقه، سن بنا، قیمت و ریسک‌ها خودکار استخراج شوند..." className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[10px] p-2 text-[11px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600" />
          <div className="grid grid-cols-4 gap-1.5 text-[10.5px]">
            <label className="block"><span className="text-slate-500 dark:text-slate-400 block mb-0.5">متراژ ({formatAreaShort(anSqm, areaUnit)})</span><input type="number" min={25} max={500} value={anSqm} onChange={(e) => setAnSqm(Math.max(25, Number(e.target.value) || 85))} aria-label="متراژ آپارتمان جهت کارشناسی آگهی" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-slate-100 tabular-nums" /></label>
            <label className="block"><span className="text-slate-500 dark:text-slate-400 block mb-0.5">سال ساخت / سن بنا</span><input type="number" min={0} max={curJalaliYear} value={anAge} onChange={(e) => { const v = Math.max(0, Number(e.target.value) ?? 0); setAnAge(v >= 1350 ? Math.max(0, curJalaliYear - v) : v); }} aria-label="سال ساخت یا سن بنا جهت کارشناسی آگهی" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-slate-100 tabular-nums" /></label>
            <label className="block"><span className="text-slate-500 dark:text-slate-400 block mb-0.5">طبقه</span><input type="number" min={-1} max={35} value={anFloor} onChange={(e) => setAnFloor(Number(e.target.value) ?? 0)} aria-label="طبقه واحد جهت کارشناسی آگهی" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-slate-100 tabular-nums" /></label>
            <label className="block"><span className="text-slate-500 dark:text-slate-400 block mb-0.5">قیمت اعلامی (کل یا متری)</span><input type="number" min={0} value={anAskingMillion || ''} placeholder="توافقی" onChange={(e) => setAnAskingMillion(Math.max(0, Number(e.target.value) || 0))} aria-label="قیمت اعلامی آگهی به میلیون تومان" className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-slate-100 tabular-nums" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700 dark:text-slate-300 pt-0.5">
            <label className="inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={anParking} onChange={(e) => setAnParking(e.target.checked)} aria-label="پارکینگ سندی در کارشناسی آگهی" className="accent-emerald-600" /><span>پارکینگ</span></label>
            <label className="inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={anElevator} onChange={(e) => setAnElevator(e.target.checked)} aria-label="آسانسور در کارشناسی آگهی" className="accent-emerald-600" /><span>آسانسور</span></label>
            <label className="inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={anStorage} onChange={(e) => setAnStorage(e.target.checked)} aria-label="انباری سندی در کارشناسی آگهی" className="accent-emerald-600" /><span>انباری</span></label>
          </div>
          {(anSignals.hasLegalRisk || anSignals.hasTenantLag || anPriceSourceType === 'NET_CASH' || anSignals.isRenovated || anSignals.isUrbanRenewal) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {anSignals.hasLegalRisk && <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[10px] font-bold">اصلاحی/قولنامه‌ای (-۱۲٪ ریسک سندی)</span>}
              {anSignals.hasTenantLag && <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[10px] font-bold">در رهن مستاجر (-۴٪ تاخیر تحویل)</span>}
              {anPriceSourceType === 'NET_CASH' && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold">نقدینگی/کسر رهن (اصلاح قیمت کل)</span>}
              {anSignals.isRenovated && <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">بازسازی کامل (+۳۵٪ بهبود سن بنا)</span>}
              {anSignals.isUrbanRenewal && <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-[10px] font-bold">بافت فرسوده/قدرالسهم (+۱۰٪ ارزش زمین)</span>}
            </div>
          )}
          <EpistemicMarketDisclaimer metrics={agg} className="mb-1" />
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-[10px] p-2.5 space-y-1.5 tabular-nums">
            <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">ارزش عادلانه تابلو:</span><strong className="text-slate-900 dark:text-slate-100 font-black">{toPersianNum((fairAskTotal / 1000).toFixed(2))} میلیارد تومان ({toPersianNum(fairAskTotal)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(fairAskTotal, intlCurrency, radarLocale)}` : ''})</strong></div>
            <div className="flex items-center justify-between"><span className="text-emerald-700 dark:text-emerald-400 font-semibold">{dealFairTotalLabelFa()}:</span><strong className="text-emerald-700 dark:text-emerald-400 font-black">{toPersianNum((fairDealTotal / 1000).toFixed(2))} میلیارد تومان ({toPersianNum(fairDealTotal)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(fairDealTotal, intlCurrency, radarLocale)}` : ''})</strong></div>
            {effectiveAskingTotal <= 0 ? (
              <div className="text-[10.5px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800 rounded-lg px-2 py-1 font-medium">قیمت در متن یافت نشد (توافقی) — قیمت پیشنهادی فروشنده را وارد کنید تا درصد حباب/شکار محاسبه شود</div>
            ) : (
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-700">
                <span className={`px-2 py-0.5 rounded-md border text-[10.5px] font-extrabold ${verdict.cls}`}>{verdict.label}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{devPct > 0 ? `+${toPersianNum(devPct)}٪ بالاتر از ارزش عادلانه` : `${toPersianNum(Math.abs(devPct))}٪ زیر ارزش عادلانه`}</span>
              </div>
            )}
            <button type="button" data-testid="save-analyzed-ad-to-visits-btn" onClick={() => { setNewVisitAddress(`آگهی کارشناسی‌شده ${formatAreaShort(anSqm, areaUnit)} (طبقه ${toPersianNum(anFloor)}، ${toPersianNum(anAge)} ساله) - ${selectedHood.name}`); setNewVisitPrice(effectiveAskingTotal > 0 ? effectiveAskingTotal : fairDealTotal); setShowVisitedModal(true); }} className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition cursor-pointer">
              <Bookmark className="w-3.5 h-3.5 stroke-[1.75]" /><span>ثبت این آگهی در دفترچه بازدیدهای میدانی من</span>
            </button>
          </div>
        </div>
        <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">فایل‌های شکار محله <strong className="text-slate-900 dark:text-slate-100">{selectedHood.name}</strong></span>
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums block mt-0.5">
                معیار {formatAreaShort(targetSqm, areaUnit)}: {mode === 'buy' ? `${toPersianNum(convertPricePerSqmToUnit(selectedHood.buyPerSqm, areaUnit))} م/${areaUnit === 'sqft' ? 'ft²' : 'متر'} (کل: ${toPersianNum(Math.round((selectedHood.buyPerSqm * targetSqm) / 100) / 10)} میلیارد${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(selectedHood.buyPerSqm * targetSqm, intlCurrency, radarLocale)}` : ''})` : `رهن ~${toPersianNum(Math.round(selectedHood.rahn80m * (targetSqm / 80)))} م`}
              </span>
            </div>
            <button type="button" onClick={() => { setBargainHoodId(selectedHood.id); setAgencyModalTab('submit_bargain'); setShowAgencyModal(true); }} className="px-2.5 py-1.5 rounded-[9px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer">
              <PlusCircle className="w-3.5 h-3.5 stroke-[1.75]" /><span>ثبت فایل</span>
            </button>
          </div>
          <button type="button" onClick={() => { setAlertHoodId(selectedHood.id); setAlertSubmitMsg(''); setShowBuyerAlertModal(true); }} className="w-full py-2 px-3 rounded-[10px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer">
            <Bell className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>خبرم کن وقتی فایل جدید زیر قیمت در {selectedHood.name} ثبت شد</span>
          </button>
          <a href={buildExternalDivarUrl(activeCity, mode, selectedHood.name, { targetSqm, buyTotalBudget, deposit, monthlyRent })} target="_blank" rel="noopener noreferrer" className="w-full py-2 px-3 rounded-[10px] bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 font-bold flex items-center justify-center gap-1.5 transition text-xs">
            <span>مشاهده تمام آگهی‌های دیوار محله {selectedHood.name} ↗</span>
          </a>
        </div>
        {isSponsorActive(selectedHood.sponsor, featureFlags.enableSponsorBilling) && selectedHood.sponsor && (
          <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 rounded-[12px] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black text-amber-950 dark:text-amber-200"><Award className="w-4 h-4 stroke-[1.75] text-amber-600 dark:text-amber-400" /><span>مشاور تخصصی و امین محله {selectedHood.name}</span></div>
              <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">{toPersianNum(selectedHood.sponsor.experienceYears)} سال سابقه</span>
            </div>
            <div className="text-xs text-slate-800 dark:text-slate-200"><strong>{selectedHood.sponsor.name}</strong> · {selectedHood.sponsor.specialty}</div>
            <button type="button" onClick={() => onTrackSponsorCall(selectedHood, selectedHood.sponsor!)} disabled={callingSponsorHoodId === selectedHood.id} className="w-full py-2.5 px-3 rounded-[10px] bg-amber-600 hover:bg-amber-500 text-white font-extrabold flex items-center justify-center gap-2 transition cursor-pointer text-xs shadow-xs">
              <Phone className="w-4 h-4 stroke-[1.75]" /><span>{revealedSponsorPhoneHoodId === selectedHood.id ? `شماره تماس: ${selectedHood.sponsor.phone}` : 'تماس مستقیم با مشاور تخصصی محله'}</span>
            </button>
          </div>
        )}
        {agg.autoBargains.slice(0, 2).map((ab) => (
          <div key={ab.id} className="apple-grouped-card dark:bg-slate-900 p-3 space-y-1.5 border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-800 dark:text-slate-200">{formatAreaShort(ab.sqm, areaUnit)} · ساخت {toPersianNum(curJalaliYear - ab.age)} · طبقه {toPersianNum(ab.floor)}</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-extrabold tabular-nums">{toPersianNum(ab.discountPct)}٪ زیر میانگین محله</span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">قیمت کل: <strong className="text-slate-900 dark:text-slate-100">{toPersianNum((ab.askingTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(ab.askingTotalMillion, intlCurrency, radarLocale)})` : ''}</strong> · هر {areaUnit === 'sqft' ? 'ft²' : 'متر'} {toPersianNum(convertPricePerSqmToUnit(ab.perSqmMillion, areaUnit))} م (معیار: {toPersianNum(convertPricePerSqmToUnit(ab.fairPerSqmMillion, areaUnit))} م)</div>
            <button type="button" onClick={() => handlePasteAdText(ab.description)} className="w-full py-1 px-2 rounded-md bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-[10.5px] transition cursor-pointer">ارسال به کارشناس هوشمند آگهی ↑</button>
          </div>
        ))}
        {(selectedHood?.bargains || []).map((b) => {
            const isLiveListing = isLiveDivarBargainId(b.id);
            const discountFactor = Math.max(0.4, 1 - (Number(b.discountPercent) || 12) / 100);
            const baseBuy = selectedHood.baseBuyPerSqm ?? selectedHood.buyPerSqm;
            const estMillion = b.type === 'خرید' ? Math.round(baseBuy * b.sqm * discountFactor) : Math.round(selectedHood.rahn80m * (b.sqm / 80) * discountFactor);
            const estRahn80 = Math.round(selectedHood.rahn80m * discountFactor);
            const profitMillion = Math.max(1, Math.round(estMillion / discountFactor - estMillion));
            const uRate = convertPricePerSqmToUnit(Math.round(estMillion / Math.max(1, b.sqm)), areaUnit);
            const fxLabel = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(estMillion, intlCurrency, radarLocale)})` : '';
            const fxUnitRate = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uRate, intlCurrency, radarLocale)})` : '';
            const fxRahn80 = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(estRahn80, intlCurrency, radarLocale)})` : '';
            const fxProfit = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(profitMillion, intlCurrency, radarLocale)})` : '';
            return (
              <ViewportLazyRender key={b.id} minHeightPx={155}>
                <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 hover:border-emerald-500/50 p-3.5 space-y-2 transition">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>نوع معامله: <strong className="text-slate-800 dark:text-slate-200">{b.type}</strong> · {formatAreaValue(b.sqm, areaUnit)}</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold tabular-nums">{isLiveListing ? `${toPersianNum(b.discountPercent)}٪ زیر قیمت` : 'نمونه آموزشی'}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">{b.title}</h4>
                  <div className="text-xs text-slate-500 dark:text-slate-400">محدوده: <span className="text-slate-700 dark:text-slate-300">{b.street}</span></div>
                  <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 rounded-[10px] p-2.5 space-y-1">
                    <div className="text-slate-900 dark:text-slate-100 font-bold">{b.priceText}{fxLabel}</div>
                    {b.type === 'خرید' ? (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">نرخ هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: <strong className="text-slate-800 dark:text-slate-200">{toPersianNum(uRate)} میلیون{fxUnitRate}</strong></div>
                    ) : (
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">نرخ معادل رهن ({formatAreaShort(80, areaUnit)}): <strong className="text-slate-800 dark:text-slate-200">{toPersianNum(estRahn80)} میلیون{fxRahn80}</strong></div>
                    )}
                    {isLiveListing ? <div className="text-emerald-700 dark:text-emerald-400 font-semibold">سود خریدار: {b.buyerProfitText}{fxProfit}</div> : <div className="text-amber-800 dark:text-amber-200 font-semibold">نمونه آموزشی؛ آگهی زنده نیست و اختلاف قیمت محاسبه نشده است.</div>}
                  </div>
                  <ListingMediaGallery listing={b} estimatedMillionToman={estMillion} />
                  <button type="button" onClick={() => { setNewVisitAddress(`${b.type === 'اجاره' ? '[رهن/اجاره] ' : ''}واحد ${formatAreaValue(b.sqm, areaUnit)} - ${b.street}`); setNewVisitPrice(estMillion); setShowVisitedModal(true); }} className="w-full py-1.5 px-2 rounded-[8px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer">
                    <Bookmark className="w-3.5 h-3.5 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>افزودن به دفترچه بازدیدهای من</span>
                  </button>
                </div>
              </ViewportLazyRender>
            );
          })}
      </div>
    );
  }
  return (
    <div className="space-y-3.5 text-xs">
      <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Compass className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /><span>مراکز مهم {selectedHood.name} روی نقشه</span></span>
          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold tabular-nums">شعاع {toPersianNum(selectedHood.radius || 900)} متر{areaUnit === 'sqft' ? ` (${toPersianNum(Math.round((selectedHood.radius || 900) * 3.28084).toLocaleString('en-US'))} ft)` : ''}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {hoodLandmarks.map((lm, i) => (
            <button key={i} type="button" onClick={() => onFocusLandmarkOnMap(lm)} className="text-right bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 rounded-[10px] p-2.5 transition cursor-pointer block">
              <div className="flex items-center justify-between gap-1"><span className="font-bold text-slate-800 dark:text-slate-200 truncate">{lm.name}</span><span className="text-[10px] text-emerald-700 dark:text-emerald-400 shrink-0">{lm.category}</span></div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{lm.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="apple-grouped-card dark:bg-slate-900 dark:border-slate-800 p-3.5 space-y-3">
        <p className="text-slate-700 dark:text-slate-300 font-medium">ثبت امتیاز ساکنان محله <strong className="text-slate-900 dark:text-slate-100">{selectedHood.name}</strong>:</p>
        {[
          { label: 'کیفیت هوا و فضای سبز', val: voteAir, setter: setVoteAir },
          { label: 'پایداری برق و فشار آب', val: votePower, setter: setVotePower },
          { label: 'سرعت اینترنت و آنتن‌دهی', val: voteInternet, setter: setVoteInternet },
          { label: 'دسترسی به مترو و تاکسی', val: voteMetro, setter: setVoteMetro },
          { label: 'امنیت و آرامش شبانه', val: voteSecurity, setter: setVoteSecurity },
          { label: 'همواری خیابان‌ها', val: voteFlat, setter: setVoteFlat },
        ].map((slider, idx) => (
          <div key={idx}>
            <div className="flex justify-between mb-1"><span className="text-slate-600 dark:text-slate-400">{slider.label}:</span><strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{toPersianNum(slider.val)} / ۱۰</strong></div>
            <input type="range" aria-label={slider.label} min={1} max={10} step={1} value={slider.val} onChange={(e) => slider.setter(Number(e.target.value))} className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        ))}
        <input type="text" aria-label={`تجربه کوتاه از سکونت در ${selectedHood.name}`} maxLength={300} value={voteComment} onChange={(e) => setVoteComment(e.target.value)} placeholder={`تجربه کوتاه شما از سکونت در ${selectedHood.name}...`} className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={() => onResidentVote(true)} disabled={verifyingGeo} className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer">
            <MapPin className="w-4 h-4 stroke-[1.75] shrink-0" /><span className="truncate">{verifyingGeo ? 'بررسی مکان‌یاب...' : 'تایید مکانی و ثبت رای'}</span>
          </button>
          <button type="button" onClick={() => onResidentVote(false)} className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium transition flex items-center justify-center gap-1.5 cursor-pointer">
            <ThumbsUp className="w-4 h-4 stroke-[1.75] shrink-0" /><span>ثبت بدون مکان‌یاب</span>
          </button>
        </div>
        {voteStatus && (
          <div className={`p-2.5 rounded-xl border leading-relaxed ${voteStatus.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300' : voteStatus.type === 'info' ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300' : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'}`}>{voteStatus.text}</div>
        )}
      </div>
      {cloudVotes.filter((v) => v.hoodId === selectedHood.id).length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-3.5 space-y-2">
          <div className="font-bold text-slate-800 dark:text-slate-200">آخرین نظرات ساکنان {selectedHood.name} ({toPersianNum(cloudVotes.filter((v) => v.hoodId === selectedHood.id).length)})</div>
          {cloudVotes.filter((v) => v.hoodId === selectedHood.id).slice(0, 4).map((v) => (
            <div key={v.id} className="border-t border-slate-200/70 dark:border-slate-700 pt-2 text-xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-800 dark:text-slate-200">{v.userDisplayName}</span><span>امنیت: {toPersianNum(v.security)}/۱۰</span></div>
              <p className="text-slate-600 dark:text-slate-400 mt-1">{v.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}