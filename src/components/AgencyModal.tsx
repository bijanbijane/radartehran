import React, { useMemo, useState } from 'react'; import { AlertTriangle, Award, CheckCircle2, ShieldCheck, Sparkles, X, } from 'lucide-react'; import type { CityId } from '../types/models'; import { Neighborhood, toPersianNum, } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics, extractListingSpecsFromText, type ExtractedListingSpecs } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { clampNumber, recordDiagnosticEvent, sanitizeInput, validateSqmAmount, } from '../utils/security'; import type { ListingMediaObject } from '../utils/objectStorage'; import { AreaUnitToggle, useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { ListingMediaStorageUploader } from './ListingMediaStorageUploader'; import { AgencySponsorReservationTab } from './AgencySponsorReservationTab'; import { useDialogFocus } from './useDialogFocus'; export interface AgencyModalProps { open: boolean; onClose: () => void; agencyModalTab: 'submit_bargain' | 'reserve_sponsor'; setAgencyModalTab: React.Dispatch<React.SetStateAction<'submit_bargain' | 'reserve_sponsor'>>; neighborhoods: Neighborhood[]; bargainHoodId: number; setBargainHoodId: React.Dispatch<React.SetStateAction<number>>; bargainType: 'خرید' | 'اجاره'; setBargainType: React.Dispatch<React.SetStateAction<'خرید' | 'اجاره'>>;
  bargainSqm: number; setBargainSqm: React.Dispatch<React.SetStateAction<number>>; bargainProposedPrice: number; setBargainProposedPrice: React.Dispatch<React.SetStateAction<number>>; bargainStreet: string; setBargainStreet: React.Dispatch<React.SetStateAction<string>>; bargainTitle: string; setBargainTitle: React.Dispatch<React.SetStateAction<string>>; targetBargainHood: Neighborhood; liveBargainCheck: { benchmark: number; maxAllowedFor10Percent: number; discountPercent: number; isEligible: boolean; buyerProfitMillion: number; }; bargainSubmitMsg: { type: 'success' | 'error'; text: string } | null; onSubmitBargainListing: (e: React.FormEvent) => void; sponsorHoodId: number; setSponsorHoodId: React.Dispatch<React.SetStateAction<number>>; sponsorAgencyName: string;
  setSponsorAgencyName: React.Dispatch<React.SetStateAction<string>>; sponsorPhone: string; setSponsorPhone: React.Dispatch<React.SetStateAction<string>>; sponsorSpecialty: string;
  setSponsorSpecialty: React.Dispatch<React.SetStateAction<string>>; sponsorExpYears: number; setSponsorExpYears: React.Dispatch<React.SetStateAction<number>>; sponsorSubmitMsg: string; onReserveSponsor: (e: React.FormEvent) => void; enableSponsorBilling?: boolean;
  sponsorPlanMonths?: 1 | 3; setSponsorPlanMonths?: React.Dispatch<React.SetStateAction<1 | 3>>; sponsorTrackingCode?: string; setSponsorTrackingCode?: React.Dispatch<React.SetStateAction<string>>; activeCity?: CityId; bargainUploadedMedia?: ListingMediaObject[]; setBargainUploadedMedia?: React.Dispatch<React.SetStateAction<ListingMediaObject[]>>; }
export function AgencyModal({ open, onClose, agencyModalTab, setAgencyModalTab, neighborhoods, bargainHoodId, setBargainHoodId, bargainType, setBargainType,
  bargainSqm, setBargainSqm, bargainProposedPrice, setBargainProposedPrice, bargainStreet, setBargainStreet, bargainTitle, setBargainTitle, targetBargainHood, liveBargainCheck, bargainSubmitMsg, onSubmitBargainListing,
  sponsorHoodId, setSponsorHoodId, sponsorAgencyName, setSponsorAgencyName, sponsorPhone, setSponsorPhone, sponsorSpecialty, setSponsorSpecialty, sponsorExpYears, setSponsorExpYears, sponsorSubmitMsg, onReserveSponsor,
  enableSponsorBilling = true, sponsorPlanMonths = 1, setSponsorPlanMonths, sponsorTrackingCode = '', setSponsorTrackingCode, activeCity = 'tehran', bargainUploadedMedia, setBargainUploadedMedia, }: AgencyModalProps) { const dialogRef = useDialogFocus(open, onClose); const [areaUnit] = useAreaUnit(); const [currency] = useIntlCurrency(); const [locale] = useRadarLocale(); const showIntl = currency !== 'IRT';
  const [internalMedia, setInternalMedia] = useState<ListingMediaObject[]>([]); const mediaList = bargainUploadedMedia ?? internalMedia; const setMediaList = setBargainUploadedMedia ?? setInternalMedia;
  const [adRawText, setAdRawText] = useState(''); const [nlpMsg, setNlpMsg] = useState(''); const [extractedSpecs, setExtractedSpecs] = useState<ExtractedListingSpecs | null>(null);
  const handleNlpExtract = () => { if (!adRawText.trim()) return;
    const baseBench = (targetBargainHood as { baseBuyPerSqm?: number }).baseBuyPerSqm ?? targetBargainHood.buyPerSqm ?? 100;
    const specs = extractListingSpecsFromText(adRawText, baseBench); setExtractedSpecs(specs);
    if (specs.sqm >= 30 && specs.sqm <= 500) setBargainSqm(specs.sqm);
    if (bargainType === 'خرید' && specs.perSqmMillion > 0) setBargainProposedPrice(Math.round(specs.perSqmMillion));
    else if (bargainType === 'اجاره' && specs.totalMillion > 0) setBargainProposedPrice(Math.round(specs.totalMillion));
    const am = [specs.hasParking ? 'پارکینگ' : '', specs.hasElevator ? 'آسانسور' : '', specs.hasStorage ? 'انباری' : ''].filter(Boolean).join('، ');
    setBargainTitle(`آپارتمان ${toPersianNum(specs.sqm)} متری طبقه ${toPersianNum(specs.floor)}${am ? ` با ${am}` : ''}`);
    setNlpMsg(`مشخصات (${toPersianNum(specs.sqm)}م، ط${toPersianNum(specs.floor)}) استخراج شد`);
  };
  const safeNeighborhoods = useMemo(() => { return Array.isArray(neighborhoods) ? neighborhoods.filter((n) => n && typeof n.id === 'number' && n.name) : []; }, [neighborhoods]); if (!open) return null; if (safeNeighborhoods.length === 0 || !targetBargainHood) { return ( <div
        role="dialog"
        aria-modal="true"
        aria-label="خطا در بارگذاری اطلاعات محله‌ها"
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-[3px] flex items-center justify-center p-4 z-50"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="apple-window-sheet max-w-md w-full p-5 text-center space-y-3"
        >
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="text-sm font-extrabold text-slate-900">
            اطلاعات محله‌ها جهت ثبت آگهی در دسترس نیست
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-[10px] bg-emerald-600 text-white text-xs font-bold cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    ); }
  return (
    <div role="dialog" aria-modal="true" aria-label="ثبت ملک زیر قیمت و رزرو کارشناس رسمی محله" onClick={onClose} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl max-w-2xl w-full p-5 max-h-[88vh] overflow-y-auto focus:outline-none shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[10px] bg-emerald-600 text-white flex items-center justify-center shrink-0"><Award className="w-4 h-4 stroke-[1.75]" /></span>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">ثبت ملک زیر قیمت و رزرو کارشناس رسمی محله</h3>
          </div>
          <div className="flex items-center gap-2">
            <AreaUnitToggle compact showIntlControls />
            <button type="button" aria-label="بستن پنجره ثبت ملک" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors">
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 apple-segmented dark:bg-slate-800/80 p-1 rounded-[10px] mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => { recordDiagnosticEvent('AgencyModal', 'switchTab:submit_bargain', 'success');
              setAgencyModalTab('submit_bargain'); }}
            className={`py-2 px-3 rounded-[8px] transition cursor-pointer ${
              agencyModalTab === 'submit_bargain'
                ? 'apple-segmented-pill-active dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            ثبت رایگان ملک زیر قیمت
          </button>
          <button
            type="button"
            onClick={() => { recordDiagnosticEvent('AgencyModal', 'switchTab:reserve_sponsor', 'success');
              setAgencyModalTab('reserve_sponsor');
            }}
            className={`py-2 px-3 rounded-[8px] transition cursor-pointer ${
              agencyModalTab === 'reserve_sponsor'
                ? 'apple-segmented-pill-active dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            رزرو کارشناس رسمی محله (ویژه املاک)
          </button>
        </div>
        {agencyModalTab === 'submit_bargain' && (
          <form onSubmit={onSubmitBargainListing} className="space-y-3.5 text-xs">
            <div className="bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 rounded-[12px] p-3 text-emerald-900 dark:text-emerald-200 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                سیستم به صورت خودکار قیمت پیشنهادی شما را با میانگین روز محله مقایسه می‌کند.{' '}
                <strong>فقط فایل‌هایی که حداقل ۱۰٪ زیر میانگین محله باشند</strong> تایید و منتشر
                می‌شوند.
              </div>
            </div>
            <div className="bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-800 rounded-[12px] p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  استخراج هوشمند از متن آگهی دیوار / شیپور:
                </span>
                {nlpMsg && <span className="font-bold text-emerald-700 dark:text-emerald-400">{nlpMsg}</span>}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={adRawText}
                  onChange={(e) => setAdRawText(e.target.value)}
                  placeholder="متن آگهی را پیست کنید (مثلاً: ۷۵ متر طبقه ۲ با پارکینگ متری ۱۱۰ م...)"
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[8px] px-2.5 py-1.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={handleNlpExtract}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-[8px] text-[11px] shrink-0 transition cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  تحلیل و ثبت
                </button>
              </div>
              {extractedSpecs && (
                <div className="flex flex-wrap items-center gap-1 text-[10.5px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold">متراژ: {toPersianNum(extractedSpecs.sqm)} متر</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold">ط {toPersianNum(extractedSpecs.floor)} از {toPersianNum(extractedSpecs.totalFloors)}</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${extractedSpecs.hasParking ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{extractedSpecs.hasParking ? 'پارکینگ' : 'بدون پارکینگ'}</span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${extractedSpecs.hasElevator ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{extractedSpecs.hasElevator ? 'آسانسور' : 'بدون آسانسور'}</span>
                  {extractedSpecs.detectedSignals.hasLegalRisk && <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold">ریسک سند/حقوقی</span>}
                </div>
              )}
            </div>
            <div className="apple-grouped-card dark:bg-slate-800/60 dark:border-slate-800 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">انتخاب محله:</label>
                <select value={bargainHoodId} onChange={(e) => setBargainHoodId(Number(e.target.value))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-[10px] px-3 py-2.5 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-600">
                  {safeNeighborhoods.map((n) => {
                    const uVal = bargainType === 'اجاره' ? n.rahn80m : Number(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit).toFixed(1));
                    const fx = showIntl ? ` · ${formatMillionTomanAsIntlCurrency(uVal, currency, locale)}` : '';
                    const subTag = bargainType === 'اجاره' ? ` · اجاره: ${toPersianNum(Math.round(n.rahn80m * 0.03))} م` : ` · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد`;
                    return (
                    <option key={n.id} value={n.id}>
                      {n.name} ({bargainType === 'اجاره' ? `رهن ${formatAreaShort(80, areaUnit)}` : areaUnit === 'sqft' ? 'ft²' : 'متری'} {toPersianNum(uVal)} م{fx}{subTag})
                    </option>
                  ); })}
                </select>
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">نوع معامله:</label>
                <select value={bargainType} onChange={(e) => setBargainType(e.target.value === 'اجاره' ? 'اجاره' : 'خرید')} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-600">
                  <option value="خرید">فروش ملک (خرید)</option>
                  <option value="اجاره">رهن و اجاره</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">متراژ واحد (متر مربع — معادل {formatAreaShort(bargainSqm, areaUnit)}):</label>
                <input type="number" min={30} max={500} value={bargainSqm} onChange={(e) => setBargainSqm(validateSqmAmount(e.target.value, 80))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white font-bold tabular-nums focus:outline-none focus:border-emerald-600" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">
                  {bargainType === 'خرید'
                    ? (() => {
                        const rawBench = (targetBargainHood as { baseBuyPerSqm?: number }).baseBuyPerSqm ?? targetBargainHood.buyPerSqm;
                        const uBench = Number(convertPricePerSqmToUnit(rawBench, areaUnit).toFixed(1));
                        const uDealBench = Number(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(targetBargainHood.id, targetBargainHood.name, rawBench, []).estimatedDealPricePerSqm, areaUnit).toFixed(1));
                        return `قیمت پیشنهادی هر متر (میانگین ${areaUnit === 'sqft' ? 'ft²' : 'متر'} ${targetBargainHood.name}: ${toPersianNum(uBench)} میلیون · قطعی معامله: ${toPersianNum(uDealBench)} م${showIntl ? ` · ${formatMillionTomanAsIntlCurrency(uBench, currency, locale)}` : ''}):`;
                      })()
                    : (() => {
                        const scaledRahn = Math.round(targetBargainHood.rahn80m * (Math.max(25, bargainSqm) / 80));
                        return `مبلغ رهن کامل پیشنهادی (میانگین ${formatAreaShort(bargainSqm, areaUnit)} ${targetBargainHood.name}: ${toPersianNum(scaledRahn)} میلیون · اجاره: ${toPersianNum(Math.round(scaledRahn * 0.03))} م${showIntl ? ` · ${formatMillionTomanAsIntlCurrency(scaledRahn, currency, locale)}` : ''}):`;
                      })()}
                </label>
                <input type="number" min={10} max={50000} value={bargainProposedPrice} onChange={(e) => setBargainProposedPrice(clampNumber(e.target.value, 1, 50000, 100))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-emerald-700 dark:text-emerald-400 font-extrabold tabular-nums focus:outline-none focus:border-emerald-600" />
                <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1.5 text-[11px]">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setBargainProposedPrice(liveBargainCheck.maxAllowedFor10Percent)} className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold transition cursor-pointer">
                      اعمال ۱۰٪ تخفیف ({toPersianNum(liveBargainCheck.maxAllowedFor10Percent)} م{showIntl ? ` · ${formatMillionTomanAsIntlCurrency(liveBargainCheck.maxAllowedFor10Percent, currency, locale)}` : ''})
                    </button>
                    <button type="button" onClick={() => setBargainProposedPrice(Math.max(10, Math.floor((liveBargainCheck.maxAllowedFor10Percent / 0.9) * 0.85)))} className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold transition cursor-pointer">
                      اعمال ۱۵٪ تخفیف ({toPersianNum(Math.max(10, Math.floor((liveBargainCheck.maxAllowedFor10Percent / 0.9) * 0.85)))} م{showIntl ? ` · ${formatMillionTomanAsIntlCurrency(Math.max(10, Math.floor((liveBargainCheck.maxAllowedFor10Percent / 0.9) * 0.85)), currency, locale)}` : ''})
                    </button>
                  </div>
                  {bargainType === 'خرید' ? (
                    <span className="text-slate-600 dark:text-slate-300 font-bold tabular-nums">
                      کل واحد: {toPersianNum(((bargainProposedPrice * bargainSqm) / 1000).toFixed(2))} میلیارد{showIntl ? ` (${formatMillionTomanAsIntlCurrency(bargainProposedPrice * bargainSqm, currency, locale)})` : ''}{areaUnit === 'sqft' ? ` · معادل هر ft²: ${toPersianNum(convertPricePerSqmToUnit(bargainProposedPrice, areaUnit))} م` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-300 font-bold tabular-nums">
                      اجاره ماهانه معادل: {toPersianNum(Math.round(bargainProposedPrice * 0.03))} م{showIntl ? ` (${formatMillionTomanAsIntlCurrency(Math.round(bargainProposedPrice * 0.03), currency, locale)})` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">نام خیابان یا فرعی در محله:</label>
                <input type="text" maxLength={100} value={bargainStreet} onChange={(e) => setBargainStreet(sanitizeInput(e.target.value, 100))} placeholder={`مثلاً: فرعی دنج ${targetBargainHood.name}`} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600" />
              </div>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 mb-1">عنوان و مشخصات ملک:</label>
              <input type="text" maxLength={140} value={bargainTitle} onChange={(e) => setBargainTitle(sanitizeInput(e.target.value, 140))} placeholder={`مثلاً: آپارتمان ${formatAreaShort(bargainSqm, areaUnit)} ۲ خواب، فول امکانات`} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-600" />
            </div>
            <ListingMediaStorageUploader hoodId={bargainHoodId} hoodName={targetBargainHood.name} sqm={bargainSqm} city={activeCity} uploadedMedia={mediaList} onChangeMedia={setMediaList} />
            <div
              className={`p-3 rounded-2xl border ${
                liveBargainCheck.isEligible
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              }`}
            >
              {liveBargainCheck.isEligible ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      واجد شرایط ثبت ({toPersianNum(liveBargainCheck.discountPercent)}٪ زیر میانگین
                      محله)
                    </span>
                  </span>
                  <strong className="tabular-nums">
                    سود خریدار: {toPersianNum(liveBargainCheck.buyerProfitMillion)} میلیون تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(liveBargainCheck.buyerProfitMillion, currency, locale)})` : ''}
                  </strong>
                </div>
              ) : liveBargainCheck.discountPercent > 60 ? (
                <div className="flex items-start gap-1.5 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    تخفیف واردشده ({toPersianNum(liveBargainCheck.discountPercent)}٪) بیش از سقف مجاز ۶۰٪ است. برای جلوگیری از ثبت آگهی صوری، فقط تخفیف‌های بین ۱۰٪ تا ۶۰٪ زیر میانگین محله تایید می‌شوند.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    قیمت واردشده فقط {toPersianNum(Math.max(0, liveBargainCheck.discountPercent))}٪
                    زیر میانگین محله است. فقط فایل‌های حداقل ۱۰٪ زیر میانگین محله (حداکثر{' '}
                    <strong className="tabular-nums">
                      {toPersianNum(liveBargainCheck.maxAllowedFor10Percent)} میلیون تومان{showIntl ? ` (${formatMillionTomanAsIntlCurrency(liveBargainCheck.maxAllowedFor10Percent, currency, locale)})` : ''}
                    </strong>
                    ) ثبت می‌شوند.
                  </span>
                </div>
              )}
            </div>
            {bargainSubmitMsg && (
              <div
                className={`p-3 rounded-2xl border font-semibold ${
                  bargainSubmitMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
              >
                {bargainSubmitMsg.text}
              </div>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition cursor-pointer"
            >
              ثبت فوری فایل در محله {targetBargainHood.name}
            </button>
          </form>
        )}
        {agencyModalTab === 'reserve_sponsor' && (
          <AgencySponsorReservationTab
            safeNeighborhoods={safeNeighborhoods}
            targetBargainHood={targetBargainHood}
            sponsorHoodId={sponsorHoodId}
            setSponsorHoodId={setSponsorHoodId}
            sponsorAgencyName={sponsorAgencyName}
            setSponsorAgencyName={setSponsorAgencyName}
            sponsorPhone={sponsorPhone}
            setSponsorPhone={setSponsorPhone}
            sponsorSpecialty={sponsorSpecialty}
            setSponsorSpecialty={setSponsorSpecialty}
            sponsorExpYears={sponsorExpYears}
            setSponsorExpYears={setSponsorExpYears} sponsorSubmitMsg={sponsorSubmitMsg} onReserveSponsor={onReserveSponsor} enableSponsorBilling={enableSponsorBilling} sponsorPlanMonths={sponsorPlanMonths} setSponsorPlanMonths={setSponsorPlanMonths} sponsorTrackingCode={sponsorTrackingCode} setSponsorTrackingCode={setSponsorTrackingCode} />
        )} </div>
    </div>
  ); }