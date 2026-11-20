/**
 * @file src/components/stage2/CasperDecisionMatrixCard.tsx
 * @description CASPER Epistemic Data Layers, Cognitive Bias Guardrails & Interactive MCDA Decision Simulator
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Layers, Scale, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import {
  DEFAULT_CASPER_DECISION_WEIGHTS,
  evaluateCasperNeighborhoodDecision,
  type UserDecisionWeights,
} from '../../cells/socioeconomic-intelligence/casperDecisionEngine';
import { toPersianNum, type Neighborhood, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { computeLiquidityDepthAndTom } from '../../utils/liquidityDepthAndTomEngine';

export interface CasperDecisionMatrixCardProps {
  hoodId: number;
  hoodName: string;
  basePriceSqm?: number;
  overallScore?: number;
  transitScore?: number;
  safetyScore?: number;
  rahn80m?: number;
  targetSqm?: number;
  marketStatus?: 'undervalued' | 'balanced' | 'bubble';
  intlCurrency?: IntlCurrencyCode;
  compact?: boolean;
  hood?: Neighborhood | EvaluatedNeighborhood;
}

export const CasperDecisionMatrixCard: React.FC<CasperDecisionMatrixCardProps> = ({
  hoodId,
  hoodName,
  basePriceSqm = 125,
  overallScore = 7.6,
  transitScore = 7.5,
  safetyScore = 7.4,
  rahn80m,
  targetSqm = 80,
  marketStatus = 'balanced',
  intlCurrency = 'USD',
  compact = false,
  hood,
}) => {
  const [weights, setWeights] = useState<UserDecisionWeights>(DEFAULT_CASPER_DECISION_WEIGHTS);
  const [activePreset, setActivePreset] = useState<'balanced' | 'investor' | 'family' | 'commuter'>('balanced');

  const agg = useMemo(
    () =>
      aggregateNeighborhoodMarketMetrics(
        hoodId,
        hoodName,
        basePriceSqm,
        hood ? buildNeighborhoodListingSamples({ ...hood, buyPerSqm: basePriceSqm || hood.buyPerSqm }) : buildNeighborhoodListingSamples({ id: hoodId, name: hoodName, buyPerSqm: basePriceSqm }),
      ),
    [hoodId, hoodName, basePriceSqm, hood],
  );

  const evalHood = hood as Partial<EvaluatedNeighborhood> | undefined;
  const effectiveOverall = evalHood?.overallScore ?? overallScore;
  const effectiveTransit = hood?.metro ?? transitScore;
  const effectiveSafety = hood?.security ?? safetyScore;
  const hoodBaseBuy = hood?.buyPerSqm || basePriceSqm || 125;
  const yieldBoost = Math.max(0.85, Math.min(1.18, hoodBaseBuy / Math.max(1, basePriceSqm)));
  const rawRahn80m = hood?.rahn80m ?? rahn80m ?? Math.round(agg.estimatedDealPricePerSqm * 80 * 0.14);
  const effectiveRahn80m = Math.round((basePriceSqm / Math.max(1, hoodBaseBuy)) * yieldBoost * rawRahn80m);
  const effectiveStatus = evalHood?.status === 'green' ? 'undervalued' : evalHood?.status === 'red' ? 'bubble' : marketStatus;
  const totalWeightSum =
    weights.priceWeight + weights.commuteWeight + weights.environmentWeight + weights.liquidityWeight + weights.safetyWeight || 1;

  const liquidityAssessment = useMemo(
    () => computeLiquidityDepthAndTom({ basePriceSqm: agg.estimatedDealPricePerSqm, unitAreaSqm: targetSqm, zone: hood?.zone ?? 'تهران', hasElevator: (hood?.security ?? 7) >= 7, floor: 2, isBargainPrice: evalHood?.status === 'green' }),
    [agg.estimatedDealPricePerSqm, targetSqm, hood?.zone, hood?.security, evalHood?.status],
  );
  const evaluation = useMemo(
    () => evaluateCasperNeighborhoodDecision({
      hoodId, hoodName, askingPricePerSqm: agg.askingPricePerSqm, estimatedDealPricePerSqm: agg.estimatedDealPricePerSqm,
      iqrLowPerSqm: agg.iqrLowPerSqm, iqrHighPerSqm: agg.iqrHighPerSqm, validSampleCount: agg.validSampleCount,
      rejectedFraudCount: agg.rejectedFraudCount, confidenceScore: agg.confidenceScore, marketStatus: effectiveStatus,
      marketRegime: agg.marketRegime, overallScore: effectiveOverall, transitScore: effectiveTransit,
      safetyScore: effectiveSafety, liquidityScore: liquidityAssessment.liquidityScore, rahn80m: effectiveRahn80m, targetSqm, intlCurrency,
    }, weights),
    [hoodId, hoodName, agg, effectiveStatus, effectiveOverall, effectiveTransit, effectiveSafety, liquidityAssessment.liquidityScore, effectiveRahn80m, targetSqm, intlCurrency, weights],
  );

  const applyPreset = (preset: 'balanced' | 'investor' | 'family' | 'commuter') => {
    setActivePreset(preset);
    if (preset === 'investor') {
      setWeights({ priceWeight: 45, commuteWeight: 10, environmentWeight: 10, liquidityWeight: 25, safetyWeight: 10 });
    } else if (preset === 'family') {
      setWeights({ priceWeight: 20, commuteWeight: 15, environmentWeight: 25, liquidityWeight: 10, safetyWeight: 30 });
    } else if (preset === 'commuter') {
      setWeights({ priceWeight: 25, commuteWeight: 40, environmentWeight: 15, liquidityWeight: 10, safetyWeight: 10 });
    } else {
      setWeights(DEFAULT_CASPER_DECISION_WEIGHTS);
    }
  };

  const verdictBadgeClass =
    evaluation.decisionVerdict === 'OPTIMAL_BUY'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
      : evaluation.decisionVerdict === 'NEGOTIATE_HARD'
        ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
        : evaluation.decisionVerdict === 'CAUTIOUS_HOLD'
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200';

  const intlDealFormatted = formatMillionTomanAsIntlCurrency(evaluation.targetOfferPerSqm, intlCurrency, 'fa');

  return (
    <div dir="rtl" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-4 text-right" data-testid="casper-decision-matrix-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              موتور تصمیم‌گیری چندمعیاره و تفکیک اعتبار داده — {hoodName}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تفکیک صریح «داده مشاهده‌شده»، «ادعای آگهی»، «تخمین مدل v6.4» و «متغیرهای نامعلوم میدانی» + سپر ضدسوگیری شناختی
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="rounded-lg bg-slate-900 dark:bg-white px-3 py-1 text-xs font-black text-white dark:text-slate-900">
            مطلوبیت تعدیل‌شده با ریسک: {toPersianNum(evaluation.riskAdjustedUtilityScore)} از ۱۰۰
          </span>
        </div>
      </div>

      {/* Section 1: 4-Layer Epistemic Data Matrix */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
          <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span>ماتریس ۴ لایه معرفتی داده و عدم قطعیت</span>
        </div>
        <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-2.5`}>
          {evaluation.epistemicLayers.map((layer) => (
            <div key={layer.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">{layer.titleFa}</span>
                <span className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  {layer.badgeTextFa}
                </span>
              </div>
              <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">
                {toPersianNum(layer.primaryMetricFa)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {toPersianNum(layer.secondaryDetailFa)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Interactive Multi-Criteria Decision Simulator (MCDA) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
            <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
            <span>شبیه‌ساز وزن‌دهی اولویت‌های تصمیم‌گیری شما (MCDA)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'balanced' as const, label: 'متوازن استاندارد' },
              { id: 'investor' as const, label: 'سرمایه‌گذار و شکار ارزش' },
              { id: 'family' as const, label: 'خانواده و آرامش سکونتی' },
              { id: 'commuter' as const, label: 'حداقل زمان رفت‌وآمد' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={activePreset === p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  activePreset === p.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-5'} gap-2.5 text-[11px]`}>
          {[
            { key: 'priceWeight' as const, label: 'حساسیت قیمت', score: evaluation.dimensionScores.priceUtility },
            { key: 'commuteWeight' as const, label: 'دسترسی و مترو', score: evaluation.dimensionScores.commuteUtility },
            { key: 'environmentWeight' as const, label: 'کیفیت محیطی', score: evaluation.dimensionScores.environmentUtility },
            { key: 'liquidityWeight' as const, label: 'نقدشوندگی خروج', score: evaluation.dimensionScores.liquidityUtility },
            { key: 'safetyWeight' as const, label: 'ایمنی و سازه', score: evaluation.dimensionScores.safetyUtility },
          ].map((item) => {
            const normalizedSharePct = Math.round((weights[item.key] / totalWeightSum) * 100);
            return (
              <label key={item.key} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  <span>{item.label}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {toPersianNum(normalizedSharePct)}٪ (وزن {toPersianNum(weights[item.key])})
                  </span>
                </div>
                <input
                  type="range" min={5} max={70} step={5} aria-label={`وزن ${item.label}`}
                  value={weights[item.key]}
                  onChange={(e) => {
                    setActivePreset('balanced');
                    setWeights((prev) => ({ ...prev, [item.key]: Number(e.target.value) }));
                  }}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 tabular-nums">امتیاز محله: {toPersianNum(item.score)}/۱۰۰</span>
              </label>
            );
          })}
        </div>

        {evaluation.nonCompensatoryVetoTriggered && (
          <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-[11px] font-bold text-rose-900 dark:text-rose-200">
            هشدار خط قرمز غیرجبرانی: {evaluation.vetoReasonsFa.join(' • ')}
          </div>
        )}

        <div className={`rounded-xl border p-3 space-y-1.5 ${verdictBadgeClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>حکم تحلیلی مدل: {evaluation.verdictTitleFa}</span>
            </div>
            <span className="text-xs font-extrabold tabular-nums">
              نرخ هدف مذاکره: متری {toPersianNum(evaluation.targetOfferPerSqm)} م.ت ({intlDealFormatted})
            </span>
          </div>
          <p className="text-xs leading-relaxed">{toPersianNum(evaluation.verdictSummaryFa)}</p>
          <div className="pt-1 border-t border-current/15 text-[11px] font-bold flex items-start gap-1.5">
            <Scale className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{toPersianNum(evaluation.counterfactualFlipFa)}</span>
          </div>
        </div>
      </div>

      {/* Section 3: Behavioral & Cognitive Bias Guardrails */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <span>سپر محافظت در برابر خطاهای شناختی و تله‌های روانی بازار</span>
        </div>
        <div className={`grid grid-cols-1 ${compact ? '' : 'md:grid-cols-2'} gap-2.5`}>
          {evaluation.biasAlerts.map((b) => (
            <div key={b.id} className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>{b.titleFa}</span>
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900 text-amber-950 dark:text-amber-200 shrink-0">
                  {b.severity === 'HIGH' ? 'ریسک بالا' : b.severity === 'MEDIUM' ? 'ریسک متوسط' : 'هشدار پایه'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{toPersianNum(b.explanationFa)}</p>
              <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 leading-relaxed">
                راهکار ضدسوگیری: {toPersianNum(b.countermeasureFa)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CasperDecisionMatrixCard;
