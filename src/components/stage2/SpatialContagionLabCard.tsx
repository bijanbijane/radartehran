import React, { useMemo, useState } from 'react';
import {
  Network,
  ShieldAlert,
  BrainCircuit,
  ArrowUpLeft,
  CheckCircle2,
  Activity,
  GitBranch,
} from 'lucide-react';
import { toPersianNum } from '../../data/neighborhoods';
import type { Neighborhood } from '../../data/neighborhoods';
import type { CityId } from '../../data/multiCityData';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import {
  buildNeighborhoodSpatialContagionReport,
  computeKahnemanProspectAnalysis,
} from '../../cells/decision-epistemology/spatialContagionEngine';

export interface SpatialContagionLabCardProps {
  hoodId: number;
  hoodName: string;
  cityKey?: CityId | string;
  basePriceSqm?: number;
  hood?: Neighborhood;
  intlCurrency?: IntlCurrencyCode;
  targetSqm?: number;
  onSelectCompareHood?: (hoodName: string) => void;
}

export const SpatialContagionLabCard: React.FC<SpatialContagionLabCardProps> = ({
  hoodId,
  hoodName,
  cityKey = 'tehran',
  basePriceSqm = 120,
  hood,
  intlCurrency = 'USD',
  targetSqm = 80,
  onSelectCompareHood,
}) => {
  const [anchorMarkupPct, setAnchorMarkupPct] = useState<number>(0);

  const report = useMemo(
    () => buildNeighborhoodSpatialContagionReport(hoodId, hoodName, cityKey, basePriceSqm, hood, targetSqm),
    [hoodId, hoodName, cityKey, basePriceSqm, hood, targetSqm],
  );

  const { akerlofLemon, contagionNodes, spatialAutocorrelationMoranI } = report;

  const prospectTheory = useMemo(() => {
    if (anchorMarkupPct === 0) return report.prospectTheory;
    const baseAsk = Math.round(basePriceSqm * (1 + anchorMarkupPct / 100));
    const fairDeal = report.prospectTheory.fairDealPricePerSqm || Math.round(basePriceSqm * 0.92);
    return computeKahnemanProspectAnalysis(baseAsk, fairDeal, targetSqm);
  }, [anchorMarkupPct, basePriceSqm, report.prospectTheory, targetSqm]);

  const lemonBadgeStyle =
    akerlofLemon.regime === 'SEVERE_LEMON_TRAP'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
      : akerlofLemon.regime === 'MODERATE_OPACITY'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';

  return (
    <div className="space-y-3 text-right" dir="rtl" data-testid="spatial-contagion-lab-card">
      {/* Section 1: Akerlof Information Asymmetry & Lemon Risk Index */}
      <div className="rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)] bg-white dark:bg-[var(--color-bg-surface)] p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-[var(--color-text-primary)]">
              شفافیت قیمت محله و ریسک آگهی‌های طعمه یا قیمت‌سازی‌شده (مدل آکرلوف)
            </h4>
          </div>
          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${lemonBadgeStyle}`}>
            شاخص ریسک آکرلوف: {toPersianNum(akerlofLemon.lemonIndexScore)} از ۱۰۰ · {akerlofLemon.regimeLabelFa}
          </span>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed">
          {akerlofLemon.sellerAdvantageWarningFa}
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center tabular-nums">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200/70 dark:border-[var(--color-border-strong)]">
            <span className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] block">پراکندگی بین‌چارکی (IQR)</span>
            <strong className="text-xs font-bold text-slate-800 dark:text-[var(--color-text-primary)]">
              {toPersianNum(akerlofLemon.priceDispersionRatioPct)}٪
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200/70 dark:border-[var(--color-border-strong)]">
            <span className="text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] block">نرخ آگهی طعمه/ردشده</span>
            <strong className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {toPersianNum(akerlofLemon.baitRejectionRatePct)}٪
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800">
            <span className="text-[10px] text-indigo-700 dark:text-indigo-300 block">تخفیف جبرانی عدم تقارن</span>
            <strong className="text-xs font-bold text-indigo-800 dark:text-indigo-200">
              -{toPersianNum(akerlofLemon.requiredInformationDiscountPct)}٪
            </strong>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] p-2.5 border border-slate-200/60 dark:border-[var(--color-border-strong)] space-y-1">
          <div className="text-[10px] font-bold text-slate-700 dark:text-[var(--color-text-primary)]">
            پروتکل خنثی‌سازی برتری اطلاعاتی فروشنده پیش از عقد قرارداد:
          </div>
          {akerlofLemon.dueDiligenceProtocolFa.map((step, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-600 dark:text-[var(--color-text-secondary)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Spatial Econometric Contagion & Ripple Network */}
      <div className="rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)] bg-white dark:bg-[var(--color-bg-surface)] p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Network className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-[var(--color-text-primary)]">
              شبکه سرایت فضایی قیمت و قطب‌های پیش‌ران / جاذب سرریز (Spatial Econometrics)
            </h4>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold tabular-nums">
            <Activity className="w-3 h-3" />
            <span>خودهمبستگی فضایی موران (Moran&apos;s I): {toPersianNum(spatialAutocorrelationMoranI)}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {contagionNodes.map((node) => {
            const isDriver = node.role === 'LEADING_DRIVER';
            return (
              <div
                key={node.hoodId}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-[var(--color-border-subtle)] bg-slate-50/60 dark:bg-[var(--color-bg-muted)] flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <GitBranch className={`w-3.5 h-3.5 ${isDriver ? 'text-amber-500' : 'text-emerald-500'}`} />
                      <span className="text-xs font-bold text-slate-800 dark:text-[var(--color-text-primary)]">
                        محله {node.hoodName}
                      </span>
                      <span className="text-[10px] text-slate-400">({node.zone})</span>
                    </div>
                    <span
                      className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                        isDriver
                          ? 'bg-amber-100/80 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {node.roleLabelFa}
                    </span>
                  </div>

                  {onSelectCompareHood && (
                    <button
                      type="button"
                      onClick={() => onSelectCompareHood(node.hoodName)}
                      aria-label={`انتخاب محله ${node.hoodName} روی نقشه`}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] hover:border-indigo-500 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>پرش نقشه</span>
                      <ArrowUpLeft className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <p className="text-[10.5px] text-slate-600 dark:text-[var(--color-text-secondary)] leading-relaxed">
                  {node.mechanismFa}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-500 dark:text-[var(--color-text-muted)] border-t border-slate-200/60 dark:border-[var(--color-border-strong)] pt-1.5 tabular-nums">
                  <span className="font-bold text-slate-700 dark:text-[var(--color-text-primary)]">
                    متری {toPersianNum(node.dealPricePerSqm)} م.ت ({formatMillionTomanAsIntlCurrency(node.dealPricePerSqm, intlCurrency, 'fa')})
                  </span>
                  <span>فاصله: {toPersianNum(node.distanceKm)} ک.م</span>
                  <span>β={toPersianNum(node.spatialCorrelationBeta)}</span>
                  <span>وقفه: {toPersianNum(node.transmissionLagWeeks)} هفته</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Kahneman-Tversky Prospect Theory & Seller Loss Aversion */}
      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/25 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BrainCircuit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-[var(--color-text-primary)]">
              نظریه چشم‌انداز کانمن-تورسکی (Prospect Theory) و مهندسی مذاکره ضد زیان‌گریزی
            </h4>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {[
              { pct: 0, label: 'لنگر رایج بازار' },
              { pct: 8, label: '+۸٪ مقاومت' },
              { pct: 16, label: '+۱۶٪ قفل روانی' },
            ].map((opt) => (
              <button
                key={opt.pct}
                type="button"
                onClick={() => setAnchorMarkupPct(opt.pct)}
                className={`px-2 py-0.5 rounded font-bold cursor-pointer transition ${
                  anchorMarkupPct === opt.pct
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-[var(--color-bg-surface)] text-slate-600 dark:text-[var(--color-text-secondary)] border border-indigo-200 dark:border-[var(--color-border-strong)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-bold text-indigo-900 dark:text-indigo-200 bg-white/60 dark:bg-[var(--color-bg-surface)] px-2.5 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50 tabular-nums">
          <span>مقاومت روانی فروشنده (Disposition Effect): {toPersianNum(prospectTheory.dispositionRigidityPct)}٪</span>
          <span>ضریب زیان‌گریزی: λ={toPersianNum(prospectTheory.lossAversionLambda)}</span>
          <span>شکاف چانه‌زنی {toPersianNum(targetSqm)} متر: {toPersianNum(prospectTheory.nominalDiscountMillion80m)} م.ت ({formatMillionTomanAsIntlCurrency(prospectTheory.nominalDiscountMillion80m, intlCurrency, 'fa')})</span>
        </div>

        <p className="text-[11px] text-slate-700 dark:text-[var(--color-text-secondary)] leading-relaxed">
          {prospectTheory.recommendedNegotiationFramingFa}
        </p>

        <div className="p-2 rounded-lg bg-white/80 dark:bg-[var(--color-bg-surface)] border border-indigo-100 dark:border-indigo-900/50 text-[10.5px] text-indigo-950 dark:text-indigo-200 font-medium">
          <strong className="font-bold">تاکتیک اجرایی در جلسه قرارداد: </strong>
          {prospectTheory.stagedPaymentTacticFa}
        </div>
      </div>
    </div>
  );
};

