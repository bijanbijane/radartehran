import React, { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Scale, Eye, Sliders, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import type { Neighborhood } from '../../types/models';
import { FAST_SALE_FACTOR } from '../../data/hedonicPricingEngine';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { convertAreaFromSqm, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { useAreaUnit } from '../AreaUnitToggle';
import { evaluateCasperDecisionIntelligence, type CasperDecisionPriorityProfile } from '../../utils/casper/casperDecisionEngine';

interface Props { neighborhood: Neighborhood; initialSqm?: number; isDarkMode?: boolean; intlCurrency?: IntlCurrencyCode; }

const PRIORITY_PROFILES: ReadonlyArray<{ id: CasperDecisionPriorityProfile; labelFa: string }> = [
  { id: 'balanced', labelFa: 'متوازن (سکونت و سرمایه)' },
  { id: 'end_user_family', labelFa: 'مصرف‌کننده و سکونت خانوار' },
  { id: 'capital_preservation', labelFa: 'حفظ ارزش سرمایه و حاشیه امنیت' },
  { id: 'liquidity_first', labelFa: 'اولویت نقدشوندگی و خروج سریع' },
];

export const CasperDecisionIntelligencePanel: React.FC<Props> = ({
  neighborhood, initialSqm = 85, isDarkMode = false, intlCurrency = 'USD',
}) => {
  const [areaUnit] = useAreaUnit();
  const canonicalAgg = useMemo(
    () =>
      aggregateNeighborhoodMarketMetrics(
        neighborhood.id,
        neighborhood.name,
        neighborhood.buyPerSqm,
        buildNeighborhoodListingSamples(neighborhood),
      ),
    [neighborhood],
  );

  const defaultSpread = useMemo(() => {
    const ask = Math.max(10, canonicalAgg.askingPricePerSqm || neighborhood.buyPerSqm || 100);
    const deal = Math.max(8, canonicalAgg.estimatedDealPricePerSqm || ask * 0.93);
    return Math.max(1, Math.min(20, Math.round(((ask - deal) / ask) * 100)));
  }, [canonicalAgg.askingPricePerSqm, canonicalAgg.estimatedDealPricePerSqm, neighborhood.buyPerSqm]);

  const [targetAreaSqm, setTargetAreaSqm] = useState<number>(initialSqm || 85);
  const [achievedDiscountPct, setAchievedDiscountPct] = useState<number>(defaultSpread);
  const [holdingHorizonYears, setHoldingHorizonYears] = useState<number>(3);
  const [priorityProfile, setPriorityProfile] = useState<CasperDecisionPriorityProfile>('balanced');
  const [activeSubView, setActiveSubView] = useState<'mcda' | 'biases' | 'epistemic'>('mcda');

  useEffect(() => {
    if (initialSqm && initialSqm > 0) setTargetAreaSqm(initialSqm);
  }, [initialSqm]);

  useEffect(() => {
    setAchievedDiscountPct(defaultSpread);
  }, [neighborhood.id, defaultSpread]);

  const report = useMemo(
    () =>
      evaluateCasperDecisionIntelligence(neighborhood, {
        targetAreaSqm,
        achievedDiscountPct,
        holdingHorizonYears,
        priorityProfile,
        intlCurrency,
        areaUnit,
        canonicalDealPerSqmMillion: canonicalAgg.estimatedDealPricePerSqm,
        fastSaleFactor: FAST_SALE_FACTOR,
        observedSampleCount: canonicalAgg.validSampleCount,
        evidenceIndexScore: canonicalAgg.confidenceScore,
        isBootstrapped: canonicalAgg.isBootstrapped,
        marketRegime: canonicalAgg.marketRegime,
      }),
    [neighborhood, targetAreaSqm, achievedDiscountPct, holdingHorizonYears, priorityProfile, intlCurrency, areaUnit, canonicalAgg],
  );

  const displayArea = Math.round(convertAreaFromSqm(targetAreaSqm, areaUnit));
  const areaLabelFa = formatAreaUnitLabel(areaUnit);
  const cardBg = isDarkMode ? 'bg-slate-800/80 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800';
  const mutedBg = isDarkMode ? 'bg-slate-900/60 border-slate-700/80' : 'bg-slate-50 border-slate-200/80';

  return (
    <div className="space-y-3 text-right" dir="rtl" data-testid="casper-decision-intelligence-panel">
      {/* Executive Summary Banner */}
      <div className={`p-3.5 rounded-xl border ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <h4 className="text-xs font-black tracking-tight">
              موتور تصمیم‌یار، سپر خطای شناختی و راستی‌آزمایی داده (نسخه v6.4)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold tabular-nums">
            <span className="text-slate-500 dark:text-slate-400">شاخص اعتبار شواهد:</span>
            <span className="text-teal-600 dark:text-teal-400">{report.epistemicReliabilityIndex}٪</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="text-slate-500 dark:text-slate-400">امتیاز کل تصمیم:</span>
            <span className={report.overallDecisionScore >= 75 ? 'text-emerald-600 dark:text-emerald-400' : report.overallDecisionScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>
              {report.overallDecisionScore}/۱۰۰
            </span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 mb-3">{report.decisionSummaryFa}</p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className={`p-2 rounded-lg border ${mutedBg}`}>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">قیمت کل پیشنهادی (آگهی)</div>
            <div className="text-xs font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">{report.askingTotalMillion.toLocaleString('fa-IR')} م‌ت</div>
            <div className="text-[10px] text-slate-400 tabular-nums" dir="ltr">{formatMillionTomanAsIntlCurrency(report.askingTotalMillion, intlCurrency)}</div>
          </div>
          <div className={`p-2 rounded-lg border ${mutedBg}`}>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">سقف ورود منطقی شما</div>
            <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{report.scenarioTargetTotalMillion.toLocaleString('fa-IR')} م‌ت</div>
            <div className="text-[10px] text-slate-400 tabular-nums" dir="ltr">{report.scenarioTargetTotalIntl}</div>
          </div>
          <div className={`p-2 rounded-lg border ${mutedBg}`}>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">صرفه‌جویی مذاکره هدف</div>
            <div className="text-xs font-black text-teal-600 dark:text-teal-400 tabular-nums mt-0.5">{report.negotiationSavingsMillion.toLocaleString('fa-IR')} م‌ت</div>
            <div className="text-[10px] text-slate-400 tabular-nums" dir="ltr">{report.negotiationSavingsIntl}</div>
          </div>
        </div>
      </div>

      {/* Interactive Scenario Controls */}
      <div className={`p-3 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-1.5 text-[11px] font-bold mb-2.5">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>تنظیم مفروضات سناریو و اولویت تصمیم‌گیری کاربر</span>
          </div>
          <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400 tabular-nums">
            سناریو v6.4 (غیرثبتی): متری {report.dealBaselinePerSqmMillion.toLocaleString('fa-IR')} م‌ت | ضریب خروج فوری: {report.fastSaleFactorUsed}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2.5">
          <label className="block text-[11px]">
            <span className="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>مساحت هدف:</span>
              <strong className="text-slate-800 dark:text-slate-100 tabular-nums">{displayArea} {areaLabelFa}</strong>
            </span>
            <input type="range" min={45} max={250} step={5} value={targetAreaSqm} onChange={(e) => setTargetAreaSqm(Number(e.target.value))} aria-label="متراژ هدف واحد مسکونی" className="w-full accent-teal-600 cursor-pointer" />
          </label>
          <label className="block text-[11px]">
            <span className="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>تخفیف مذاکره از آگهی:</span>
              <strong className="text-teal-600 dark:text-teal-400 tabular-nums">{achievedDiscountPct}٪</strong>
            </span>
            <input type="range" min={0} max={20} step={1} value={achievedDiscountPct} onChange={(e) => setAchievedDiscountPct(Number(e.target.value))} aria-label="درصد تخفیف مذاکره از قیمت آگهی" className="w-full accent-teal-600 cursor-pointer" />
          </label>
          <label className="block text-[11px]">
            <span className="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>افق نگهداری دارایی:</span>
              <strong className="text-slate-800 dark:text-slate-100 tabular-nums">{holdingHorizonYears} سال</strong>
            </span>
            <input type="range" min={1} max={7} step={1} value={holdingHorizonYears} onChange={(e) => setHoldingHorizonYears(Number(e.target.value))} aria-label="افق نگهداری دارایی به سال" className="w-full accent-teal-600 cursor-pointer" />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITY_PROFILES.map((prof) => (
            <button
              key={prof.id}
              type="button"
              onClick={() => setPriorityProfile(prof.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors border ${
                priorityProfile === prof.id
                  ? 'bg-teal-600 text-white border-teal-600'
                  : isDarkMode ? 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {prof.labelFa}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={() => setActiveSubView('mcda')} data-testid="casper-subtab-mcda" className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-colors ${activeSubView === 'mcda' ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-500' : `${cardBg} opacity-80 hover:opacity-100`}`}>
          <Scale className="w-3.5 h-3.5" />
          <span>ماتریس و پادواقعی</span>
        </button>
        <button type="button" onClick={() => setActiveSubView('biases')} data-testid="casper-subtab-biases" className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-colors ${activeSubView === 'biases' ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-500' : `${cardBg} opacity-80 hover:opacity-100`}`}>
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>سپر خطای شناختی (۴)</span>
        </button>
        <button type="button" onClick={() => setActiveSubView('epistemic')} data-testid="casper-subtab-epistemic" className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition-colors ${activeSubView === 'epistemic' ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-500' : `${cardBg} opacity-80 hover:opacity-100`}`}>
          <Eye className="w-3.5 h-3.5" />
          <span>تفکیک معرفتی (۱۲)</span>
        </button>
      </div>

      {activeSubView === 'mcda' && (
        <div className="space-y-2.5" data-testid="casper-view-mcda">
          <div className={`p-3 rounded-xl border ${cardBg} space-y-2.5`}>
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">ارزیابی ۵ محور تصمیم‌گیری (وزن‌دهی متناسب با پروفایل شما):</div>
            {report.criteriaScores.map((crit) => (
              <div key={crit.id} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold">{crit.labelFa} <span className="text-[10px] font-normal text-slate-400">(وزن {crit.weightPct}٪)</span></span>
                  <span className="font-black tabular-nums text-teal-600 dark:text-teal-400">{crit.score}/۱۰۰</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className={`h-full rounded-full ${crit.score >= 75 ? 'bg-emerald-500' : crit.score >= 55 ? 'bg-teal-500' : 'bg-amber-500'}`} style={{ width: `${crit.score}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{crit.benchmarkSummaryFa}</div>
              </div>
            ))}
          </div>
          <div className={`p-3 rounded-xl border ${cardBg} space-y-2`}>
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">تحلیل حساسیت و سناریوهای پادواقعی (Counterfactual Analysis):</div>
            {report.counterfactuals.map((sc) => (
              <div key={sc.id} className={`p-2.5 rounded-lg border ${mutedBg} space-y-1`}>
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                  <span>{sc.titleFa}</span>
                  <span className="tabular-nums text-teal-600 dark:text-teal-400">{sc.resultingTotalMillionToman.toLocaleString('fa-IR')} م‌ت ({sc.resultingIntlFormatted})</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{sc.assumptionChangeFa}</div>
                <div className={`text-[10px] font-semibold ${sc.deltaMillionToman < 0 && sc.id !== 'full_asking_no_negotiation' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>{sc.verdictShiftFa}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubView === 'biases' && (
        <div className="space-y-2" data-testid="casper-view-biases">
          {report.biasAlerts.map((alert) => (
            <div key={alert.id} className={`p-3 rounded-xl border ${cardBg} space-y-1.5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${alert.severity === 'high' ? 'text-rose-500' : alert.severity === 'medium' ? 'text-amber-500' : 'text-teal-500'}`} />
                  <span>{alert.titleFa}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">{alert.metricBadgeFa}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{alert.diagnosisFa}</p>
              <div className={`p-2 rounded-lg border ${mutedBg} flex items-center justify-between gap-2 text-[10px]`}>
                <span className="font-semibold text-teal-700 dark:text-teal-300">پادزهر رفتاری: {alert.debiasingActionFa}</span>
                <span className="font-black tabular-nums shrink-0 text-slate-700 dark:text-slate-200">اثر مالی: {alert.financialImpactMillionToman.toLocaleString('fa-IR')} م‌ت ({alert.financialImpactIntlFormatted})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubView === 'epistemic' && (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5" data-testid="casper-view-epistemic">
          {report.epistemicLedger.map((entry) => (
            <div key={entry.code} className={`p-2.5 rounded-xl border ${cardBg} space-y-1`}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold">
                  {entry.statusTone === 'verified' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : entry.statusTone === 'caution' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> : <HelpCircle className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                  <span>{entry.labelFa}:</span>
                  <span className="text-slate-600 dark:text-slate-300">{entry.metricNameFa}</span>
                </div>
                <span className="text-[10px] font-bold tabular-nums text-teal-600 dark:text-teal-400">اطمینان {entry.confidencePct}٪ ({entry.marginOfErrorFa})</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className="font-bold text-slate-800 dark:text-slate-100">{entry.valueDisplayFa}</span>
                <span className="text-slate-500 dark:text-slate-400">منبع: {entry.sourceFa}</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{entry.explanationFa}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
