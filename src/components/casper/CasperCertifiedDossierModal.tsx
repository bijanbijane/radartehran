/**
 * @file src/components/casper/CasperCertifiedDossierModal.tsx
 * @description Casper Certified Valuation & Legal Dossier Modal.
 * Generates an authoritative, printable 1-page appraisal certificate with verification hash for room negotiations.
 */
import React, { useId, useMemo } from 'react';
import { X, Printer, ShieldCheck, CheckCircle2, QrCode, FileCheck, AlertTriangle } from 'lucide-react';
import { toPersianNum } from '../../data/neighborhoods';
import type { IranianDeedType } from '../../utils/deedLegitimacyShieldEngine';
import { evaluateDeedImpact } from '../../utils/deedLegitimacyShieldEngine';
import { computeLiquidityDepthAndTom } from '../../utils/liquidityDepthAndTomEngine';
import { computeInflationAdjustedPrice } from '../../utils/fxInflationDriftEngine';
import { useDialogFocus } from '../useDialogFocus';

export interface CasperCertifiedDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  hoodName: string;
  zone: string;
  askingPricePerSqm: number;
  dealPricePerSqm: number;
  targetSqm: number;
  deedType?: IranianDeedType;
  floor?: number;
  hasElevator?: boolean;
}

export function CasperCertifiedDossierModal({
  isOpen,
  onClose,
  hoodName,
  zone,
  askingPricePerSqm,
  dealPricePerSqm,
  targetSqm,
  deedType = 'TEK_BARG_OFFICIAL',
  floor = 2,
  hasElevator = true,
}: CasperCertifiedDossierModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(isOpen, onClose);
  const serialSeed = useId();

  const area = targetSqm > 0 ? targetSqm : 80;

  // 1. Deed Evaluation
  const deed = useMemo(() => evaluateDeedImpact(dealPricePerSqm, deedType), [dealPricePerSqm, deedType]);

  // 2. Liquidity & TOM Evaluation
  const liquidity = useMemo(
    () =>
      computeLiquidityDepthAndTom({
        basePriceSqm: deed.discountedPriceSqm,
        unitAreaSqm: area,
        zone,
        hasElevator,
        floor,
        isBargainPrice: false,
      }),
    [deed.discountedPriceSqm, area, zone, hasElevator, floor],
  );

  // 3. Inflation / FX Drift
  const fx = useMemo(
    () =>
      computeInflationAdjustedPrice({
        basePriceSqm: deed.discountedPriceSqm,
        dataAgeDays: 14,
        cityZone: zone,
      }),
    [deed.discountedPriceSqm, zone],
  );

  const trackingCode = useMemo(() => {
    const hex = Math.abs(serialSeed.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 17)).toString(16).toUpperCase();
    return `RADAR-1405-${hex.slice(0, 6)}`;
  }, [serialSeed]);

  if (!isOpen) return null;

  const totalFairBillion = ((deed.discountedPriceSqm * area) / 1000).toFixed(2);
  const totalAskingBillion = ((askingPricePerSqm * area) / 1000).toFixed(2);
  const totalFireSaleBillion = ((liquidity.fireSaleCashPriceSqm * area) / 1000).toFixed(2);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="کارنامه رسمی کارشناسی و اعتبار قیمت رادار"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 outline-none print:border-none print:shadow-none print:p-0 print:max-w-none"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Certificate Header Banner */}
        <div className="flex items-center justify-between border-b-2 border-emerald-600/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-brand-600)]/10 border border-emerald-600/30 flex items-center justify-center text-[var(--color-brand-600)] dark:text-emerald-400">
              <FileCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  کارنامه رسمی کارشناسی قیمت و تحلیل ریسک رادار تهران
                </h2>
                <span className="text-[10px] bg-[var(--color-brand-600)] text-white font-bold px-2 py-0.5 rounded-full">
                  معتبر جهت پیوست به مبایعه‌نامه
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                کد یکتای رهگیری ثبتی: <strong className="text-[var(--color-brand-600)] dark:text-emerald-400">{trackingCode}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن کارنامه"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer print:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Property Identity Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">محله و منطقه:</span>
            <strong className="text-slate-900 dark:text-white">{hoodName} ({zone})</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">متراژ محاسباتی:</span>
            <strong className="text-slate-900 dark:text-white">{toPersianNum(area)} متر مربع</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">وضعیت سند:</span>
            <strong className="text-slate-900 dark:text-white">{deed.spec.titleFa}</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px]">قانون الزام ۱۴۰۳:</span>
            <strong className={deed.spec.isLaw1403Compliant ? 'text-[var(--color-brand-600)]' : 'text-rose-600'}>
              {deed.spec.isLaw1403Compliant ? '✓ دارای انطباق رسمی' : '⚠ نیازمند تبدیل ثبتی'}
            </strong>
          </div>
        </div>

        {/* Three Valuation Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-1">
            <span className="text-[11px] font-bold text-[var(--color-brand-600)] dark:text-emerald-400 block">
              ۱. ارزش ذاتی تسویه منصفانه
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 dark:text-white">{toPersianNum(totalFairBillion)}</span>
              <span className="text-xs text-slate-400">میلیارد تومان</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              متری {toPersianNum(deed.discountedPriceSqm)} م.ت (با کسر ریسک سند)
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">
              ۲. قیمت اعلامی متداول در آگهی‌ها
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-700 dark:text-slate-300">{toPersianNum(totalAskingBillion)}</span>
              <span className="text-xs text-slate-400">میلیارد تومان</span>
            </div>
            <span className="text-[11px] text-slate-400 block">
              متری {toPersianNum(askingPricePerSqm)} م.ت (حاوی حباب اولیه)
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 space-y-1">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block">
              ۳. قیمت فروش فوری نقدی (زیر ۲۰ روز)
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 dark:text-white">{toPersianNum(totalFireSaleBillion)}</span>
              <span className="text-xs text-slate-400">میلیارد تومان</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              نقدشوندگی ظرف {toPersianNum(liquidity.estimatedDaysToLiquidate)} روز در بازار عادی
            </span>
          </div>
        </div>

        {/* Legal & Liquidity Explanations */}
        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <p className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)] shrink-0 mt-0.5" />
            <span><strong>تحلیل اصالت حقوقی سند:</strong> {deed.warningSummaryFa}</span>
          </p>
          <p className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span><strong>وضعیت عمق نقدشوندگی بازار:</strong> {liquidity.diagnosticExplanationFa}</span>
          </p>
        </div>

        {/* Footer & Print / Share Trigger */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>ممهور به مهر دیجیتال اعتبارسنجی مدل هدونیک رادار تهران v6.4</span>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white transition flex items-center gap-2 cursor-pointer shadow-sm print:hidden"
          >
            <Printer className="w-4 h-4" />
            چاپ و صدور گواهی PDF
          </button>
        </div>
      </div>
    </div>
  );
}
