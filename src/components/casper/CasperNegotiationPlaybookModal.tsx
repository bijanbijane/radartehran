/**
 * @file src/components/casper/CasperNegotiationPlaybookModal.tsx
 * @description Casper Negotiation Playbook Modal - Generates custom 3-argument negotiation scripts
 * to empower buyers and renters against inflated listing prices in meeting rooms.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, X, ShieldAlert, Sparkles, Scale, FileText } from 'lucide-react';
import { toPersianNum } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { useDialogFocus } from '../useDialogFocus';

export interface CasperNegotiationPlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
  hoodName: string;
  askingPricePerSqm: number;
  dealPricePerSqm: number;
  targetOfferPerSqm: number;
  walkAwayPricePerSqm: number;
  targetSqm: number;
  intlCurrency?: IntlCurrencyCode;
}

export function CasperNegotiationPlaybookModal({
  isOpen,
  onClose,
  hoodName,
  askingPricePerSqm,
  dealPricePerSqm,
  targetOfferPerSqm,
  walkAwayPricePerSqm,
  targetSqm,
  intlCurrency = 'IRT',
}: CasperNegotiationPlaybookModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    }
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const area = targetSqm > 0 ? targetSqm : 80;
  const spreadPerSqm = Math.max(0, askingPricePerSqm - dealPricePerSqm);
  const totalAskingBillion = ((askingPricePerSqm * area) / 1000).toFixed(2);
  const totalDealBillion = ((dealPricePerSqm * area) / 1000).toFixed(2);
  const totalOfferBillion = ((targetOfferPerSqm * area) / 1000).toFixed(2);
  const totalWalkAwayBillion = ((walkAwayPricePerSqm * area) / 1000).toFixed(2);
  const savingsMillion = Math.round((askingPricePerSqm - targetOfferPerSqm) * area);

  const scriptText = `سلام و احترام.
من بررسی کارشناسی و میدانی دقیقی روی معاملات قطعی اخیر محله ${hoodName} انجام دادم.
۱. قیمت اعلامی متری ${toPersianNum(askingPricePerSqm)} م.ت حاوی حدود ${toPersianNum(spreadPerSqm)} م.ت حباب ناشی از آگهی‌های اولیه است، در حالی که کف معامله واقعی و تسویه‌شده این منطقه متری ${toPersianNum(dealPricePerSqm)} م.ت است.
۲. با در نظر گرفتن استهلاک سال ساخت و موقعیت طبقاتی واحد، ارزش ذاتی منصفانه این ملک متری ${toPersianNum(targetOfferPerSqm)} م.ت (مجموعاً ${toPersianNum(totalOfferBillion)} میلیارد تومان) ارزیابی می‌شود.
۳. در صورت توافق بر روی مبلغ ${toPersianNum(totalOfferBillion)} میلیارد، نقدینگی بنده در قالب چک تضمینی و حساب امانی حاضر و آماده امضای فوری در دفترخانه است. سقف غیرقابل تغییر بودجه من برای این واحد ${toPersianNum(totalWalkAwayBillion)} میلیارد تومان است.`;

  const handleCopy = async () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(scriptText);
      setCopied(true);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="راهنمای چانه‌زنی پای میز نشست"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 outline-none"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                راهنمای چانه‌زنی پای میز نشست
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                استدلال مستند فنی برای شکستن حباب قیمت آگهی در محله {hoodName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره چانه‌زنی"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pricing Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 block mb-0.5">قیمت اعلامی</span>
            <span className="text-xs font-black text-rose-600 dark:text-rose-400">
              {toPersianNum(totalAskingBillion)} م.م
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">متری {toPersianNum(askingPricePerSqm)} م</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-[10px] text-slate-400 block mb-0.5">کف معامله واقعی</span>
            <span className="text-xs font-black text-blue-600 dark:text-blue-400">
              {toPersianNum(totalDealBillion)} م.م
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">متری {toPersianNum(dealPricePerSqm)} م</span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mb-0.5">پیشنهاد بازگشایی</span>
            <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">
              {toPersianNum(totalOfferBillion)} م.م
            </span>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5">متری {toPersianNum(targetOfferPerSqm)} م</span>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mb-0.5">سقف ترک جلسه</span>
            <span className="text-xs font-black text-amber-700 dark:text-amber-300">
              {toPersianNum(totalWalkAwayBillion)} م.م
            </span>
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5">متری {toPersianNum(walkAwayPricePerSqm)} م</span>
          </div>
        </div>

        {/* Script Preview Box */}
        <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-500" />
              متن آماده برای قرائت یا ارسال به مشاور/مالک:
            </span>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              سود بالقوه چانه‌زنی: {toPersianNum(savingsMillion)} میلیون تومان
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 selection:bg-amber-200">
            {scriptText}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-slate-400">
            قانون طلایی مذاکره: پیشنهاد اول را شما تعیین کنید تا لنگر مذاکره به نفع شما قفل شود.
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                متن کپی شد!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                کپی متن چانه‌زنی
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
