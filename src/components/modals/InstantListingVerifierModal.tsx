/**
 * @file src/components/modals/InstantListingVerifierModal.tsx
 * @description Instant Real Estate Listing Verifier, Bubble Scanner, and Red-Flag Trap Diagnostic Modal.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldAlert, Sparkles, CheckCircle2, AlertTriangle, HelpCircle,
  Copy, Check, X, PhoneCall, ChevronRight, Zap
} from 'lucide-react';
import {
  getRemainingVerificationQuota,
  consumeVerificationQuota,
  FREE_QUOTA_MAX,
  type ListingDiagnosisResult,
} from '../../utils/listingVerifierEngine';
import { buildListingVerdict } from '../../utils/listingVerdictService';
import { toPersianNum as toPersianDigits, INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { convertPricePerSqmToUnitRaw, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useDialogFocus } from '../useDialogFocus';

export interface InstantListingVerifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityKey?: string;
  initialHoodName?: string;
  initialListingText?: string;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
}

const SAMPLE_TEXT_SAADAT = `سعادت آباد صرافها شمالی ۹۵ متر ۲ خواب طبقه ۴ نوساز کلیدنخورده فول امکانات پارکینگ انباری آسانسور سند تک برگ شخصی متری ۲۲۰ میلیون مقطوع`;
const SAMPLE_TEXT_PUNAK = `پونک سردار جنگل ۸۲ متر طبقه ۳ بدون آسانسور خوش نقشه پارکینگ مزاحم قیمت ۱۲ میلیارد و ۶۰۰ میلیون تومن مالک پول لازم`;

export const InstantListingVerifierModal: React.FC<InstantListingVerifierModalProps> = ({
  isOpen, onClose, cityKey = 'tehran', initialHoodName = 'پونک', initialListingText = '', evaluatedNeighborhoods = [],
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const dialogRef = useDialogFocus(isOpen, onClose);
  const copyTimerRef = useRef<number | null>(null);
  const cityNameFa = MULTI_CITY_CONFIGS[cityKey as CityId]?.nameFa || 'تهران';
  const [inputText, setInputText] = useState<string>('');
  const [selectedHoodName, setSelectedHoodName] = useState<string>(initialHoodName);
  const [quotaRemaining, setQuotaRemaining] = useState<number>(FREE_QUOTA_MAX);
  const [diagnosis, setDiagnosis] = useState<ListingDiagnosisResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hoodMismatchWarningFa, setHoodMismatchWarningFa] = useState<string | null>(null);
  const [disclaimerFa, setDisclaimerFa] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuotaRemaining(getRemainingVerificationQuota());
      if (initialHoodName) setSelectedHoodName(initialHoodName);
      else if (evaluatedNeighborhoods.length > 0) setSelectedHoodName(evaluatedNeighborhoods[0].name);
      if (initialListingText) setInputText(initialListingText);
    }
  }, [isOpen, initialHoodName, initialListingText, evaluatedNeighborhoods]);
  useEffect(() => () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  if (!isOpen) return null;

  const handleScan = async () => {
    if (!inputText.trim() || scanning) return;
    setScanning(true);
    setScanError(null);
    setHoodMismatchWarningFa(null);
    setDisclaimerFa(null);
    setDiagnosis(null);
    try {
      const result = await buildListingVerdict({
        city: cityKey,
        hoodName: selectedHoodName,
        listingText: inputText,
        mode: 'buy',
      });
      if (result.status === 'error') {
        setScanError(result.messageFa);
        return;
      }
      setDiagnosis(result.diagnosis);
      setHoodMismatchWarningFa(result.hoodMismatchWarningFa);
      setDisclaimerFa(result.disclaimerFa);
      setQuotaRemaining(consumeVerificationQuota());
    } catch {
      setScanError('بررسی آگهی انجام نشد. اتصال یا دادهٔ زنده را دوباره امتحان کنید.');
    } finally {
      setScanning(false);
    }
  };

  const handleCopyReport = () => {
    if (!diagnosis) return;
    const unitDeal = Math.round(convertPricePerSqmToUnitRaw(diagnosis.fairDealPricePerSqm, areaUnit) * 10) / 10;
    const uSuffix = areaUnit === 'sqft' ? 'م/ft²' : 'م.ت';
    const text = `گزارش کارشناسی رادار ${cityNameFa} (${diagnosis.hoodName}):\nوضعیت قیمت: ${diagnosis.verdictLabelFa}\nمبنای مرجع: ${toPersianDigits(unitDeal)} ${uSuffix}\nسقف حباب شناسایی‌شده: ${toPersianDigits(diagnosis.totalBubbleMillion)} م.ت\nپیشنهاد خرید در نشست: ${toPersianDigits(diagnosis.negotiationScript.openingOfferMillion)} م.ت\nتله‌های شناسایی‌شده: ${diagnosis.redFlags.map((r) => r.title).join(' • ') || 'موردی یافت نشد.'}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => { copyTimerRef.current = null; setCopied(false); }, 2000);
  };

  const modalContent = (
    <div onClick={onClose} className="fixed inset-0 z-[9500] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm" dir="rtl">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="آنتی‌ویروس و کارشناسی فوری آگهی مسکن" onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100">
                آنتی‌ویروس و کارشناسی فوری آگهی مسکن
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                کشف حباب پنهان، نقایص سندی و سناریوی چانه‌زنی با مشاور املاک
              </p>
            </div>
          </div>
          <button type="button" aria-label="بستن" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 text-xs flex-1">
          {/* Input Box */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="ad-text-input" className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                متن یا لینک آگهی (دیوار یا شیپور) را قرار دهید:
              </label>
              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-slate-400">محله مبنا:</span>
                <select
                  aria-label="انتخاب محله مبنا"
                  value={selectedHoodName}
                  onChange={(e) => { setScanError(null); setHoodMismatchWarningFa(null); setSelectedHoodName(e.target.value); }}
                  className="max-w-[160px] truncate rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-slate-800 dark:text-slate-200 font-bold"
                >
                  {(() => {
                    const list = evaluatedNeighborhoods.length > 0 ? evaluatedNeighborhoods : INITIAL_NEIGHBORHOODS;
                    return list.map((h) => <option key={h.id} value={h.name}>{h.name}</option>);
                  })()}
                </select>
              </div>
            </div>

            <textarea
              id="ad-text-input"
              rows={3}
              value={inputText}
              onChange={(e) => { setScanError(null); setHoodMismatchWarningFa(null); setInputText(e.target.value); }}
              placeholder={`مثال (${cityNameFa}): ۹۵ متر ۲ خواب طبقه ۴ بدون آسانسور متری ۱۴۰ میلیون...`}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500 text-xs"
            />

            {cityKey === 'tehran' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400">تست سریع با نمونه:</span>
                <button
                  type="button"
                  onClick={() => { setScanError(null); setHoodMismatchWarningFa(null); setInputText(SAMPLE_TEXT_SAADAT); setSelectedHoodName('سعادت‌آباد'); }}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                >
                  نمونه ۱ (سعادت‌آباد)
                </button>
                <button
                  type="button"
                  onClick={() => { setScanError(null); setHoodMismatchWarningFa(null); setInputText(SAMPLE_TEXT_PUNAK); setSelectedHoodName('پونک'); }}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                >
                  نمونه ۲ (پونک - بدون آسانسور)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={!inputText.trim() || scanning}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-700 hover:to-indigo-700 text-white font-extrabold flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{scanning ? 'در حال خواندن آگهی و نمونه‌های زنده…' : 'اسکن فوری آگهی و سنجش حباب قیمت'}</span>
          </button>
          {scanError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{scanError}</p>}

          {/* Diagnostic Result */}
          {diagnosis && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {hoodMismatchWarningFa && (
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-2">
                  {hoodMismatchWarningFa}
                </p>
              )}
              {/* Verdict Banner */}
              <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                diagnosis.dealVerdict === 'FAIR_OPPORTUNITY'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : (diagnosis.dealVerdict === 'HEAVY_BUBBLE' || diagnosis.dealVerdict === 'SUSPICIOUS_BAIT')
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}>
                <div className="min-w-0">
                  <span className="text-[10px] block opacity-80">حکم کارشناسی سلامت معامله:</span>
                  <span className="font-extrabold text-sm">{diagnosis.verdictLabelFa}</span>
                </div>
                <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-current">
                  {formatAreaShort(diagnosis.parsed.areaSqm, areaUnit)} در {diagnosis.hoodName}
                </span>
              </div>

              {/* 3 Metric Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{diagnosis.benchmarkKind === 'UNAVAILABLE' ? `${diagnosis.benchmarkLabelFa}:` : 'کف سناریوی مذاکره (غیرثبتی):'}</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-100 text-xs">
                    {toPersianDigits(Math.round(convertPricePerSqmToUnitRaw(diagnosis.fairDealPricePerSqm, areaUnit) * 10) / 10)} {areaUnit === 'sqft' ? 'م/ft²' : 'م/متر'}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnitRaw(diagnosis.fairDealPricePerSqm, areaUnit), intlCurrency, radarLocale, rateState.snapshot)})` : ''}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{diagnosis.benchmarkKind === 'UNAVAILABLE' ? 'شکاف با میانهٔ امروز:' : 'حباب ثمن کل:'}</span>
                  <span className={`font-extrabold text-xs ${diagnosis.benchmarkKind === 'UNAVAILABLE' ? 'text-slate-500' : diagnosis.totalBubbleMillion > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--color-brand-600)] dark:text-emerald-400'}`}>
                    {diagnosis.benchmarkKind === 'UNAVAILABLE' ? 'موجود نیست' : diagnosis.totalBubbleMillion > 0 ? `+${toPersianDigits(diagnosis.totalBubbleMillion)} م` : 'بدون حباب'}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">پیشنهاد نشست:</span>
                  <span className="font-extrabold text-indigo-700 dark:text-indigo-300 text-xs">
                    {diagnosis.benchmarkKind === 'UNAVAILABLE' ? 'نداریم' : `${toPersianDigits(diagnosis.negotiationScript.openingOfferMillion)} م.ت${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(diagnosis.negotiationScript.openingOfferMillion, intlCurrency, radarLocale, rateState.snapshot)})` : ''}`}
                  </span>
                </div>
              </div>

              {/* Red Flags List */}
              {diagnosis.redFlags.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-rose-800 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>تله‌ها و هشدارهای شناسایی‌شده در آگهی ({toPersianDigits(diagnosis.redFlags.length)} مورد):</span>
                  </div>
                  {diagnosis.redFlags.map((rf) => (
                    <div key={rf.id} className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-rose-100 dark:border-rose-900/40 text-xs">
                      <span className="font-bold text-rose-900 dark:text-rose-200 block">{rf.title}</span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{rf.explanation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Negotiation Questions */}
              <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
                  <PhoneCall className="w-4 h-4 text-indigo-600" />
                  <span>سوالات مرگبار قبل از بازدید (از مشاور بپرسید):</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300 pr-3 list-disc">
                  {diagnosis.negotiationScript.firstCallQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ul>
                <div className="mt-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-800 dark:text-indigo-300 font-semibold">
                  {diagnosis.negotiationScript.closingMeetingTactic}
                </div>
              </div>
              {disclaimerFa && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{disclaimerFa}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>سهمیه رایگان: {toPersianDigits(quotaRemaining)} از {toPersianDigits(FREE_QUOTA_MAX)} استعلام</span>
          </div>
          {diagnosis && (
            <button
              type="button"
              onClick={handleCopyReport}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold flex items-center gap-1 cursor-pointer transition text-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'کپی شد!' : 'کپی گزارش برای واتساپ'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
