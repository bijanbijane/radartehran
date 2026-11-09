/**
 * @file UnifiedDecisionSynthesisCard.tsx
 * @module components/stage2
 * @description CASPER Unified Decision Quality & Executive Deal Readiness Synthesis Card.
 * Aggregates all 8 underlying epistemic engines into an executive verdict, walk-away ceiling,
 * and 6-pillar sensitivity score.
 */

import React, { useMemo } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowDownRight,
  TrendingDown,
  Target,
  Sparkles,
  Award
} from 'lucide-react';
import {
  synthesizeExecutiveDecisionReport,
  UnifiedDecisionSynthesisReport
} from '../../cells/decision-epistemology/unifiedDecisionSynthesisEngine';
import { toPersianNum } from '../../data/neighborhoods';
import type { IntlCurrencyCode } from '../../utils/areaUnit';

export interface UnifiedDecisionSynthesisCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  intlCurrency?: IntlCurrencyCode;
  onSelectTab?: (tabId: string) => void;
}

export const UnifiedDecisionSynthesisCard: React.FC<UnifiedDecisionSynthesisCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
}) => {
  const report: UnifiedDecisionSynthesisReport = useMemo(() => {
    return synthesizeExecutiveDecisionReport(hoodId, hoodName, cityKey, basePriceSqm);
  }, [hoodId, hoodName, cityKey, basePriceSqm]);

  const scoreBadgeColors = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  };

  const badgeClass = scoreBadgeColors[report.verdictBadgeColor as keyof typeof scoreBadgeColors] || scoreBadgeColors.indigo;

  return (
    <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-4 text-slate-800 dark:text-slate-200" dir="rtl">
      {/* Executive Hero Banner */}
      <div className={`p-4 rounded-xl border ${badgeClass} space-y-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 shrink-0" />
            <h4 className="text-sm font-black tracking-tight">{report.verdictTitleFa}</h4>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-current shadow-xs text-xs font-black tabular-nums">
            <span>شاخص آمادگی اجرای معامله:</span>
            <span className="text-sm font-black">{toPersianNum(report.readinessScore)}٪</span>
          </div>
        </div>
        <p className="text-xs leading-relaxed font-medium">
          {report.executiveDirectiveFa}
        </p>
      </div>

      {/* Negotiation Numbers & Walk-Away Ceiling */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">قیمت اعلامی فروشنده:</span>
          <strong className="text-base font-black text-slate-900 dark:text-white tabular-nums block">
            {toPersianNum(Math.round(report.askingPricePerSqm * report.targetSqm))} م.ت
          </strong>
          <span className="text-[10px] text-slate-400">متری {toPersianNum(report.askingPricePerSqm)} م</span>
        </div>

        <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">ارزش منصفانه کارشناسی:</span>
          <strong className="text-base font-black text-indigo-700 dark:text-indigo-300 tabular-nums block">
            {toPersianNum(Math.round(report.fairPricePerSqm * report.targetSqm))} م.ت
          </strong>
          <span className="text-[10px] text-slate-400">متری {toPersianNum(report.fairPricePerSqm)} م</span>
        </div>

        <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">پیشنهاد افتتاحیه چانه‌زنی:</span>
          <strong className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums block">
            {toPersianNum(report.negotiationOpeningOfferMillion)} م.ت
          </strong>
          <span className="text-[10px] text-slate-400">تخفیف هدف: {toPersianNum(report.targetDiscountMillion)} م.ت</span>
        </div>

        <div className="p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40">
          <span className="text-[10px] text-rose-700 dark:text-rose-400 block font-extrabold flex items-center gap-1">
            <Target className="w-3 h-3" />
            <span>سقف ترک جلسه (Walk-Away):</span>
          </span>
          <strong className="text-base font-black text-rose-700 dark:text-rose-300 tabular-nums block">
            {toPersianNum(report.walkAwayCeilingTotalMillion)} م.ت
          </strong>
          <span className="text-[10px] text-slate-400">بالاتر از این، معامله را متوقف کنید</span>
        </div>
      </div>

      {/* 6-Pillar Sensitivity Matrix */}
      <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>ماتریس ۶گانه ارزیابی کیفیت تصمیم معامله در {report.hoodName}</span>
          </span>
          <span className="text-[10px] text-slate-400">سنتز همزمان ۸ مدل تصمیم‌گیری</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
          {report.pillars.map((pillar) => (
            <div key={pillar.id} className="p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-extrabold text-slate-800 dark:text-slate-200">{pillar.nameFa}</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{toPersianNum(pillar.score)}٪</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    pillar.score >= 70 ? 'bg-emerald-500' : pillar.score >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${pillar.score}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 flex justify-between">
                <span>وضعیت: {pillar.gradeFa}</span>
                <span>{pillar.detailFa}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 rounded-lg bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>رهنمود مهندسی کسپر:</strong> تصمیم‌گیری عقلانی در مسکن حاصل برهم‌کنش ریاضی قیمت، نقدشوندگی، تقارن اطلاعاتی و رژیم تورم کلان است. برای بررسی جزئیات هر یک از اضلاع، از تب‌های تخصصی آزمایشگاه استفاده فرمایید.
        </p>
      </div>
    </div>
  );
};
