/** @file src/features/valuation/components/ValuationResultsPanel.tsx — Stages 90–94 Purpose-Separated Results, Parametric Sensitivity & Traceable Comparables */
import React from 'react';
import { AlertTriangle, BookmarkPlus, Check, Copy, Info, Layers, ShieldAlert } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { formatPersianDeltaPercent, toPersianDigits } from '../../../utils/persianBidiFormat';
import {
  convertPricePerSqmToUnit,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
} from '../../../utils/areaUnit';
import {
  COMPARABLE_EVIDENCE_KIND_LABELS_FA,
  VALUATION_PURPOSE_LABELS_FA,
  type ValuationPurpose,
  type ValuationWorkspaceResult,
} from '../types/valuation.types';

export interface ValuationResultsPanelProps {
  purpose: ValuationPurpose;
  result: ValuationWorkspaceResult;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  copied: boolean;
  onCopySummary: () => void;
  onSaveSnapshot: () => void;
  onResetCategoryToResidential: () => void;
}

export const ValuationResultsPanel: React.FC<ValuationResultsPanelProps> = ({
  purpose,
  result,
  areaUnit,
  intlCurrency,
  radarLocale,
  copied,
  onCopySummary,
  onSaveSnapshot,
  onResetCategoryToResidential,
}) => {
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : 'متر';

  if (!result.scopeSupported || !result.hedonic) {
    return (
      <div
        data-testid="valuation-scope-unavailable"
        className="p-6 rounded-[14px] bg-[#FFF4E5] dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 space-y-3 text-xs text-[#875000] dark:text-amber-200"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>خارج از محدوده پوشش مدل ارزش‌گذاری</span>
        </div>
        <p className="leading-relaxed">{result.unsupportedReasonFa}</p>
        <button
          type="button"
          onClick={onResetCategoryToResidential}
          className="px-4 py-2 rounded-[9px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
        >
          بازگشت به ارزش‌گذاری واحد مسکونی
        </button>
      </div>
    );
  }

  const h = result.hedonic;
  const perUnit = convertPricePerSqmToUnit(h.hedonicPerSqm, areaUnit);
  const rentRes = result.purposeResult?.kind === 'rent' ? result.purposeResult : null;
  const currentRes = result.purposeResult?.kind === 'current_value' ? result.purposeResult : null;

  return (
    <div className="space-y-4 text-xs" data-testid="valuation-results-panel">
      {/* Main Estimation Card */}
      <div className="p-5 rounded-[14px] bg-[var(--color-brand-soft)]/70 border border-[var(--color-border-subtle)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-[var(--color-brand-fg)]">
            ارزش برآوردی مدل (غیررسمی) · {VALUATION_PURPOSE_LABELS_FA[purpose]} · {h.hoodName}
          </span>
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">
            مدل برآوردی هدونیک رادار · نسخه مرجع
          </span>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-3 tabular-nums">
          <div>
            {rentRes ? (
              <>
                <div className="text-3xl font-bold text-[var(--color-text-primary)]" data-testid="valuation-primary-rent-output">
                  {toPersianDigits(rentRes.estimatedFullRahnMillion.toLocaleString('en-US').replace(/,/g, '٬'))}{' '}
                  <span className="text-sm font-bold text-[var(--color-text-secondary)]">میلیون تومان (برآورد محدود رهن کامل)</span>
                </div>
                <div className="text-xs text-[var(--color-warning)] font-bold mt-0.5">
                  {rentRes.methodologyLimitationFa}
                </div>
              </>
            ) : currentRes ? (
              <>
                <div className="text-3xl font-bold text-[var(--color-text-primary)]" data-testid="valuation-primary-current-output">
                  {toPersianDigits(h.hedonicTotalBillion)}{' '}
                  <span className="text-sm font-bold text-[var(--color-text-secondary)]">میلیارد تومان (ارزش جاری فروش دارایی)</span>
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {currentRes.definitionLabelFa} · تاریخ مرجع داده: {toPersianDigits(currentRes.referenceDateIso.slice(0, 10))} · هر {unitLabel}: {toPersianDigits(perUnit)} میلیون تومان
                </div>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-[var(--color-text-primary)]" data-testid="valuation-primary-sale-output">
                  {toPersianDigits(h.hedonicTotalBillion)}{' '}
                  <span className="text-sm font-bold text-[var(--color-text-secondary)]">میلیارد تومان</span>
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  هر {unitLabel}: {toPersianDigits(perUnit)} میلیون تومان (ارز مرجع: تومان)
                  {intlCurrency !== 'IRT' ? ` · معادل نمایشی (غیرثبتی): ${formatMillionTomanAsIntlCurrency(h.hedonicTotalMillion, intlCurrency, radarLocale)}` : ''}
                </div>
              </>
            )}
          </div>

          <div className="text-start bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[10px] px-3 py-2">
            <div className="text-xs text-[var(--color-text-muted)]">بازه حساسیت پارامتری مدل (±{toPersianDigits(result.uncertainty.bandPercent)}٪)</div>
            <strong className="text-xs font-bold text-[var(--color-text-primary)]">
              {rentRes
                ? `${toPersianDigits(rentRes.sensitivityRahnRangeMillion.min)} تا ${toPersianDigits(rentRes.sensitivityRahnRangeMillion.max)} میلیون رهن`
                : `${toPersianDigits((h.sensitivityRangeMillion.min / 1000).toFixed(2))} تا ${toPersianDigits((h.sensitivityRangeMillion.max / 1000).toFixed(2))} میلیارد`}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-[var(--color-border-subtle)] tabular-nums">
          {purpose === 'sale' ? (
            <div className="p-2.5 rounded-[8px] bg-[var(--color-bg-surface)]">
              <span className="text-xs text-[var(--color-text-muted)] block">فروش فوری نقدی (۱۲٪ تعدیل)</span>
              <strong className="font-bold text-[var(--color-warning)]">{toPersianDigits((h.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد</strong>
            </div>
          ) : (
            <div className="p-2.5 rounded-[8px] bg-white/80 dark:bg-[var(--color-bg-surface)]">
              <span className="text-xs text-[var(--color-text-muted)] block">وضعیت تبدیل اجاره ماهانه</span>
              <strong className="font-bold text-[var(--color-text-muted)] dark:text-[var(--color-text-secondary)]">نیازمند نرخ توافقی طرفین</strong>
            </div>
          )}
          <div className="p-2.5 rounded-[8px] bg-white/80 dark:bg-[var(--color-bg-surface)]">
            <span className="text-xs text-[var(--color-text-muted)] block">رهن کامل شاخص محله</span>
            <strong className="font-bold text-[var(--color-brand-600)] dark:text-emerald-400">{toPersianNum(h.estimatedRahnMillion)} میلیون</strong>
          </div>
          <div className="p-2.5 rounded-[8px] bg-white/80 dark:bg-[var(--color-bg-surface)]">
            <span className="text-xs text-[var(--color-text-muted)] block">شاخص پایه محله (غیرفایل)</span>
            <strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{toPersianNum(convertPricePerSqmToUnit(result.v64NeighborhoodDealPerSqm, areaUnit))} م/{unitLabel}</strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={onSaveSnapshot} data-testid="save-valuation-report-btn" className="px-3.5 py-2 rounded-[9px] bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1.5 cursor-pointer">
            <BookmarkPlus className="w-4 h-4" />
            <span>ذخیره این گزارش ارزش‌گذاری</span>
          </button>
          <button type="button" onClick={onCopySummary} className="px-3.5 py-2 rounded-[9px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-strong)] font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5 cursor-pointer">
            {copied ? <Check className="w-4 h-4 text-[#176B4C] dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'خلاصه کپی شد' : 'کپی گزارش تحلیلی'}</span>
          </button>
        </div>
      </div>

      {/* 4 Separated Quality & Epistemic Axes */}
      <div className="grid grid-cols-2 gap-2 text-xs tabular-nums" data-testid="valuation-four-quality-axes">
        <div className="p-2.5 rounded-[10px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-muted)] block">۱. کیفیت تکمیل ورودی ملک</span>
          <strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{toPersianNum(result.completenessPercent)}٪ وزن‌دهی منشأ</strong>
        </div>
        <div className="p-2.5 rounded-[10px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-muted)] block">۲. کفایت نمونه مقایسه</span>
          <strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{result.sufficiency.labelFa}</strong>
        </div>
        <div className="p-2.5 rounded-[10px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-muted)] block">۳. حساسیت پارامتری مدل</span>
          <strong className="font-bold text-[#875000] dark:text-amber-300">{result.uncertainty.labelFa}</strong>
        </div>
        <div className="p-2.5 rounded-[10px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-muted)] block">۴. وضعیت اعتبارسنجی مدل</span>
          <strong className="font-bold text-[var(--color-text-primary)] dark:text-white">{result.validation.labelFa}</strong>
        </div>
      </div>

      {/* Explicit Out-of-Scope Disclaimers & Snapshot Provenance */}
      <div className="p-3.5 rounded-[12px] bg-[var(--color-warning-bg)]/80 border border-[var(--color-border-subtle)] space-y-1.5 text-xs text-[var(--color-warning)]">
        <div className="font-bold flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>مرز کاربرد و شناسنامه محاسبه (تعداد معاملات رسمی تأییدشده: {toPersianNum(result.sufficiency.verifiedTransactionCount)} مورد)</span>
        </div>
        <p className="leading-relaxed">
          این خروجی <strong>قیمت قطعی معامله، کارشناسی رسمی دادگستری یا استعلام ثبتی نیست</strong>. {result.uncertainty.methodologyNoteFa}
        </p>
        <details className="pt-1">
          <summary className="cursor-pointer font-semibold underline underline-offset-4">جزئیات فنی و شناسه محاسبه</summary>
          <div className="mt-1.5 text-xs opacity-85 font-mono" dir="ltr">
            snapshot={result.snapshot.snapshotId} · city={result.snapshot.cityId} · dataset={result.snapshot.datasetVersion} · {result.snapshot.calculatedAtIso.slice(0, 19)}Z
          </div>
        </details>
      </div>

      {purpose === 'sale' && h.sellerPriceEvaluation && (
        <div className="p-4 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-1">
          <div className="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center justify-between">
            <span>سنجش قیمت اعلامی فروشنده</span>
            <span className="text-[var(--color-brand-600)]">{h.sellerPriceEvaluation.verdictLabel}</span>
          </div>
          <p className="text-xs text-[#48534F] dark:text-[var(--color-text-secondary)] leading-relaxed">{h.sellerPriceEvaluation.verdictDescription}</p>
        </div>
      )}

      {h.nonCompensatoryWarnings.length > 0 && (
        <div className="p-3.5 rounded-[12px] bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-1 text-xs">
          {h.nonCompensatoryWarnings.map((w) => (
            <div key={w} className="flex items-start gap-1.5 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Factor Breakdown */}
      <div className="p-4 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-2.5">
        <h3 className="font-bold text-[var(--color-text-primary)] dark:text-white">ضرایب اثرگذار در برآورد</h3>
        <div className="divide-y divide-[var(--color-border-subtle)] dark:divide-[var(--color-border-subtle)] tabular-nums">
          {h.factors.map((f) => (
            <div key={f.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-[var(--color-text-primary)] dark:text-white">
                  {f.label}: <span className="font-normal text-[var(--color-text-muted)]">{f.valueLabel}</span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] truncate">{f.explanation}</div>
              </div>
              <strong className={f.impactPercent > 0 ? 'text-[var(--color-success)]' : f.impactPercent < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'}>
                {formatPersianDeltaPercent(f.impactPercent)}
              </strong>
            </div>
          ))}
        </div>
      </div>

      {/* Separated Comparable Properties vs Neighborhood Baseline */}
      <div className="p-4 rounded-[12px] bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[var(--color-text-primary)] dark:text-white flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>شواهد مقایسه‌ای ({toPersianNum(result.sufficiency.usableListingsCount)} آگهی کامل · {toPersianNum(result.sufficiency.verifiedTransactionCount)} معامله ثبتی)</span>
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">تفکیک فایل از شاخص پایه محله</span>
        </div>

        <div className="p-2.5 rounded-[8px] bg-[#EEF5FC]/70 dark:bg-sky-950/30 border border-[#BBD6F2] dark:border-sky-800 flex items-center justify-between gap-2 tabular-nums">
          <div>
            <div className="font-bold text-[#1D4E89] dark:text-sky-300">{result.neighborhoodBaselineEvidence.title}</div>
            <div className="text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              {COMPARABLE_EVIDENCE_KIND_LABELS_FA[result.neighborhoodBaselineEvidence.evidenceKind]} · {result.neighborhoodBaselineEvidence.observedAt}
            </div>
          </div>
          <strong className="font-bold text-[#1D4E89] dark:text-sky-300 shrink-0">
            {toPersianNum(convertPricePerSqmToUnit(result.neighborhoodBaselineEvidence.askPerSqmMillion, areaUnit))} م/{unitLabel}
          </strong>
        </div>

        <div className="space-y-2 tabular-nums">
          {result.comparables.length === 0 ? (
            <div className="p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] text-xs text-[var(--color-text-muted)]">
              فایل دارای متراژ و قیمت مستقل در این محله ثبت نشده است؛ برآورد صرفاً بر شاخص مرجع محله بالا تکیه دارد.
            </div>
          ) : (
            result.comparables.map((c) => (
              <div key={c.id} className="p-2.5 rounded-[8px] bg-[#F8F9FA] dark:bg-[var(--color-bg-muted)] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[var(--color-text-primary)] dark:text-white truncate">
                    {c.title} {c.sqm ? `(${toPersianNum(c.sqm)} متر)` : ''}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {COMPARABLE_EVIDENCE_KIND_LABELS_FA[c.evidenceKind]} · {c.street} · {c.similarityReason}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <strong className="font-bold text-[var(--color-brand-600)] dark:text-emerald-400">
                    {toPersianNum(convertPricePerSqmToUnit(c.askPerSqmMillion, areaUnit))} م/{unitLabel}
                  </strong>
                  <div className="text-xs text-[var(--color-text-muted)]">شباهت: {toPersianNum(c.similarityScore)}٪</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
