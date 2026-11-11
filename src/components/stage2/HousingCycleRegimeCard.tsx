import React, { useState, useMemo } from 'react';
import {
  PieChart,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  generateCasperHousingCycleReport,
  HousingCycleRegimeId
} from '../../cells/decision-epistemology/housingCycleRegimeEngine';
import { toPersianNum, type Neighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export interface HousingCycleRegimeCardProps {
  hoodId?: number;
  hoodName?: string;
  cityKey?: string;
  basePriceSqm?: number;
  targetSqm?: number;
  intlCurrency?: IntlCurrencyCode;
  hood?: Neighborhood;
}

export const HousingCycleRegimeCard: React.FC<HousingCycleRegimeCardProps> = ({
  hoodId = 1,
  hoodName = 'پونک',
  cityKey = 'tehran',
  basePriceSqm = 120,
  targetSqm = 80,
  intlCurrency = 'USD',
  hood,
}) => {
  const [selectedPersona, setSelectedPersona] = useState<'buyer' | 'upgrader' | 'investor'>('buyer');

  const report = useMemo(() => {
    return generateCasperHousingCycleReport(hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm);
  }, [hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency, targetSqm]);

  const cycle = report.cycle;
  const rahnFx = intlCurrency !== 'IRT' && report.rahn80mIntlText ? ` (${report.rahn80mIntlText})` : '';

  const phaseColors: Record<HousingCycleRegimeId, { bg: string; text: string; border: string }> = {
    ACCUMULATION_RECOVERY: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200/80 dark:border-emerald-800',
    },
    EXPANSION_SURGE: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200/80 dark:border-blue-800',
    },
    DISTRIBUTION_EXHAUSTION: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-200/80 dark:border-rose-800',
    },
    CONTRACTION_STAGNATION: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200/80 dark:border-amber-800',
    },
  };

  const currentPhaseStyle = phaseColors[cycle.regimeId];

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span>رادار فازهای ادواری مسکن، شتاب حقیقی و فرسایش حباب</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 font-normal">
                {report.hoodName}
              </span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تفکیک رشد اسمی از رشد حقیقی (تعدیل‌شده با تورم CPI) و لنگر پویا نسبت قیمت به اجاره
            </p>
          </div>
        </div>

        {/* Current Regime Badge */}
        <div className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border font-bold ${currentPhaseStyle.bg} ${currentPhaseStyle.text} ${currentPhaseStyle.border}`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{cycle.regimeNameFa}</span>
        </div>
      </div>

      {/* Stagflationary Money-Illusion Diagnostic Banner */}
      <div
        data-testid="stage2-stagflation-illusion-banner"
        className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
          cycle.isStagflationaryIllusion
            ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
            : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
        }`}
      >
        {cycle.isStagflationaryIllusion ? (
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-0.5 leading-relaxed">
          <div className="font-extrabold">
            شتاب ۶ماهه اسمی: +{toPersianNum(cycle.historicalMomentum6mPct)}٪ • شتاب ۶ماهه حقیقی (پس از کسر تورم):{' '}
            <span className={cycle.realMomentum6mPct >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}>
              {cycle.realMomentum6mPct >= 0 ? '+' : ''}{toPersianNum(cycle.realMomentum6mPct)}٪
            </span>
          </div>
          <p className="text-[11px] opacity-90">{toPersianNum(cycle.stagflationWarningFa)}</p>
        </div>
      </div>

      {/* Cycle Progress Track */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-200">فازهای چرخه ادواری بازار:</span>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            شاخص چرخه: {toPersianNum(cycle.cycleScore)} از ۱۰۰
          </span>
        </div>

        {/* 4-Step Cycle Bar */}
        <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
          <div className={`p-1.5 rounded-lg border transition-all ${cycle.regimeId === 'ACCUMULATION_RECOVERY' ? 'bg-emerald-500 text-white font-extrabold shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
            ۱. کف‌سازی و پیش‌رونق
          </div>
          <div className={`p-1.5 rounded-lg border transition-all ${cycle.regimeId === 'EXPANSION_SURGE' ? 'bg-blue-500 text-white font-extrabold shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
            ۲. رونق و شتاب
          </div>
          <div className={`p-1.5 rounded-lg border transition-all ${cycle.regimeId === 'DISTRIBUTION_EXHAUSTION' ? 'bg-rose-500 text-white font-extrabold shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
            ۳. اشباع و قله حباب
          </div>
          <div className={`p-1.5 rounded-lg border transition-all ${cycle.regimeId === 'CONTRACTION_STAGNATION' ? 'bg-amber-500 text-white font-extrabold shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
            ۴. رکود معاملاتی
          </div>
        </div>

        <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
          {cycle.regimeDescriptionFa}
        </p>
      </div>

      {/* 3 Indicators Grid */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">ریسک فرسایش و ترکیدن حباب:</div>
          <div className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
            {toPersianNum(cycle.bubbleExhaustionRiskPct)}٪
          </div>
          <div className="text-[9px] text-slate-400">احتمال سقف دوره‌ای</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">نسبت قیمت به اجاره سالانه:</div>
          <div className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5">
            {toPersianNum(cycle.priceToRentRatio)} سال
          </div>
          <div className="text-[9px] text-slate-400">لنگر تعادلی: {toPersianNum(cycle.dynamicEquilibriumPR)} سال{rahnFx ? ` · رهن ${toPersianNum(targetSqm)}م: ${toPersianNum(report.rahn80m)}م${rahnFx}` : ''}</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
          <div className="text-[10px] text-slate-400">شکاف پیشنهاد تا معامله:</div>
          <div className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">
            {toPersianNum(cycle.askingToDealSpreadPct)}٪
          </div>
          <div className="text-[9px] text-slate-400">حاشیه تخفیف قطعی پای میز</div>
        </div>
      </div>

      {/* Persona Guidance Section */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-200">راهبرد اختصاصی بر مبنای نقش شما:</span>
          <div className="flex items-center gap-1">
            {[
              { id: 'buyer' as const, label: 'خریدار خانه‌اولی' },
              { id: 'upgrader' as const, label: 'ارتقادهنده ملک' },
              { id: 'investor' as const, label: 'سرمایه‌گذار' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPersona(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  selectedPersona === p.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 leading-relaxed flex items-start gap-2">
          <ArrowRight className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <span>
            {selectedPersona === 'buyer'
              ? cycle.guidance.firstTimeBuyerActionFa
              : selectedPersona === 'upgrader'
              ? cycle.guidance.tradeUpUpgraderActionFa
              : cycle.guidance.investorPreservationActionFa}
          </span>
        </div>
      </div>
    </div>
  );
};
