import React from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ShieldCheck, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { useDialogFocus } from '../../../components/useDialogFocus';
import {
  DATA_KIND_LABELS_FA,
  MARKET_METHODOLOGIES,
  MARKET_SOURCE_REGISTRY,
  RENT_CONVERSION_EFFECTIVE_VERSION,
} from '../indicators/IndicatorRegistry';
import type { DataQualityAssessment } from '../types/market.types';

export interface MethodologyPanelProps {
  quality: DataQualityAssessment;
  isModal?: boolean;
  onClose?: () => void;
}

export const MethodologyPanel: React.FC<MethodologyPanelProps> = ({
  quality,
  isModal = false,
  onClose,
}) => {
  const dialogRef = useDialogFocus(Boolean(isModal), () => onClose?.());
  const body = (
    <div className="space-y-5 text-xs text-[var(--color-text-secondary)] dark:text-slate-300">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-black text-[var(--color-text-primary)] dark:text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>روش‌شناسی شاخص‌ها، شفافیت منابع و کیفیت داده</span>
          </h3>
          <p className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400 mt-1">
            فرمول رهن به اجاره (نسخه {RENT_CONVERSION_EFFECTIVE_VERSION}) و استاندارد تفکیک سه‌گانه قیمت.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="بستن پنل روش‌شناسی"
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-[var(--color-border-subtle)] dark:border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Data Quality Scorecard */}
      <div className="p-3.5 rounded-lg bg-[var(--color-bg-canvas)] dark:bg-slate-800/50 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2">
        <div className="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)]" />
          <span>سنجش کیفیت داده محدوده فعلی</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
          <div><span className="text-[var(--color-text-muted)] block">نمونه معتبر</span><strong>{toPersianNum(quality.validCount)}</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">حذف تکراری / پرت</span><strong>{toPersianNum(quality.duplicateExcluded)} / {toPersianNum(quality.outlierExcluded)}</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">معامله ثبت‌شده رسمی</span><strong className="text-[#A61B1B] dark:text-rose-300">{toPersianNum(quality.verifiedTransactionCount)} مورد</strong></div>
          <div><span className="text-[var(--color-text-muted)] block">به‌روزرسانی</span><strong>{quality.freshnessLabelFa}</strong></div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400">{quality.limitationFa}</p>
      </div>

      {/* 3-way Price Taxonomy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['asking_price', 'estimated_value', 'transaction_price'] as const).map((k) => (
          <div key={k} className="p-3 rounded-lg border border-[var(--color-border-subtle)] dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
            <div className="font-bold text-[var(--color-text-primary)] dark:text-white">{DATA_KIND_LABELS_FA[k]}</div>
            <p className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400 leading-relaxed">
              {k === 'asking_price'
                ? 'نرخ اعلام‌شده توسط مالک یا مشاور در آگهی‌ها؛ معمولاً شامل حاشیه چانه‌زنی است.'
                : k === 'estimated_value'
                  ? 'برآورد تحلیلی مدل هدونیک v6.4 با اعمال سن بنا، طبقه، امکانات و رژیم عرضه.'
                  : 'فقط قراردادهای قطعی راستی‌آزمایی‌شده؛ تا اتصال سامانه رسمی، عدد صفر نمایش داده می‌شود.'}
            </p>
          </div>
        ))}
      </div>

      {/* Methodologies */}
      <div className="space-y-2.5">
        <h4 className="font-bold text-[var(--color-text-primary)] dark:text-white">فرمول‌ها و مفروضات رسمی محاسبه</h4>
        {MARKET_METHODOLOGIES.map((m) => (
          <div key={m.id} className="p-3 rounded-lg border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[var(--color-text-primary)] dark:text-white">{m.titleFa}</strong>
              <span className="text-[10.5px] font-mono text-[var(--color-text-muted)]">v{m.version}</span>
            </div>
            <p className="text-[11px]">{m.summaryFa}</p>
            <code className="block text-[10.5px] font-mono bg-[var(--color-bg-canvas)] dark:bg-slate-800 px-2 py-1 rounded text-[var(--color-brand-600)] dark:text-emerald-300" dir="ltr">
              {m.formulaText}
            </code>
          </div>
        ))}
      </div>

      {/* Source Registry */}
      <div className="space-y-2">
        <h4 className="font-bold text-[var(--color-text-primary)] dark:text-white">دفترچه منابع داده‌ای</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MARKET_SOURCE_REGISTRY.map((src) => (
            <div key={src.id} className="p-2.5 rounded-lg border border-[var(--color-border-subtle)] dark:border-slate-800 text-[11px] space-y-0.5">
              <div className="font-bold text-[var(--color-text-primary)] dark:text-white">{src.nameFa}</div>
              <div className="text-[var(--color-brand-600)] dark:text-emerald-400">{src.kindFa} · {src.cadenceFa}</div>
              <div className="text-[var(--color-text-muted)] dark:text-slate-400">{src.coverageNoteFa}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return (
      <section className="p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800">
        {body}
      </section>
    );
  }

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="روش‌شناسی مرکز تحلیل بازار"
      data-testid="market-methodology-dialog"
      onClick={onClose}
      className="fixed inset-0 z-[9500] bg-slate-950/60 flex items-center justify-center p-4"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 p-5"
      >
        {body}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
