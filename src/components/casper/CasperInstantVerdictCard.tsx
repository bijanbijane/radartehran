/**
 * @file src/components/casper/CasperInstantVerdictCard.tsx
 * @description Casper Instant Decision Verdict Card - Radical simplification of real estate decision-making.
 * Delivers immediate fair deal price discovery, buy/hold signal, deed legitimacy, liquidity depth, and spatial arbitrage.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Sparkles, ShieldCheck, FileCheck, MessageSquareText, Clock, FileWarning } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { evaluateCasperNeighborhoodDecision } from '../../cells/socioeconomic-intelligence/casperDecisionEngine';
import { CasperNegotiationPlaybookModal } from './CasperNegotiationPlaybookModal';
import { CasperCertifiedDossierModal } from './CasperCertifiedDossierModal';
import { evaluateDeedImpact, type IranianDeedType } from '../../utils/deedLegitimacyShieldEngine';
import { computeLiquidityDepthAndTom } from '../../utils/liquidityDepthAndTomEngine';
import { computeInflationAdjustedPrice } from '../../utils/fxInflationDriftEngine';
import { saveDossierToResilienceCache } from '../../utils/nationalNetworkResilienceCache';
import { useIntlCurrency } from '../AreaUnitToggle';

const VERDICT_THEMES = {
  OPTIMAL_BUY: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800', icon: 'bg-[var(--color-brand-600)]/10 border-emerald-600/20 text-[var(--color-brand-600)] dark:text-emerald-400' },
  NEGOTIATE_HARD: { badge: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800', icon: 'bg-indigo-600/10 border-indigo-600/20 text-indigo-600 dark:text-indigo-400' },
  CAUTIOUS_HOLD: { badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800', icon: 'bg-amber-600/10 border-amber-600/20 text-amber-600 dark:text-amber-400' },
  HIGH_RISK_AVOID: { badge: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800', icon: 'bg-rose-600/10 border-rose-600/20 text-rose-600 dark:text-rose-400' },
} as const;

export interface CasperInstantVerdictCardProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  targetSqm: number;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
}

export function CasperInstantVerdictCard({ selectedHood, targetSqm }: CasperInstantVerdictCardProps): React.ReactElement {
  const [intlCurrency] = useIntlCurrency();
  const [priority, setPriority] = useState<'investment' | 'family' | 'liquidity'>('investment');
  const [deedType, setDeedType] = useState<IranianDeedType>('TEK_BARG_OFFICIAL');
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showDossier, setShowDossier] = useState(false);
  const area = targetSqm > 0 ? targetSqm : 80;
  const agg = useMemo(() => aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)), [selectedHood]);

  const calibratedDealBaseSqm = agg.eligibleObservedCount === 0 ? Math.round(agg.askingPricePerSqm * 0.93) : agg.estimatedDealPricePerSqm;
  const deed = useMemo(() => evaluateDeedImpact(calibratedDealBaseSqm, deedType), [calibratedDealBaseSqm, deedType]);
  const fx = useMemo(() => computeInflationAdjustedPrice({ basePriceSqm: deed.discountedPriceSqm, dataAgeDays: agg.eligibleObservedCount > 0 ? 7 : 0, cityZone: selectedHood.zone }), [deed.discountedPriceSqm, agg.eligibleObservedCount, selectedHood.zone]);
  const negotiationFloorSqm = Math.min(agg.askingPricePerSqm, fx.adjustedCurrentPriceSqm);
  const liquidity = useMemo(() => computeLiquidityDepthAndTom({ basePriceSqm: negotiationFloorSqm, unitAreaSqm: area, zone: selectedHood.zone, hasElevator: selectedHood.security >= 7, floor: 2, isBargainPrice: selectedHood.status === 'green' }), [negotiationFloorSqm, area, selectedHood]);

  const weights = useMemo(() => (
    priority === 'investment' ? { priceWeight: 40, commuteWeight: 15, environmentWeight: 15, liquidityWeight: 20, safetyWeight: 10 }
      : priority === 'family' ? { priceWeight: 20, commuteWeight: 20, environmentWeight: 30, liquidityWeight: 10, safetyWeight: 20 }
        : { priceWeight: 30, commuteWeight: 25, environmentWeight: 10, liquidityWeight: 25, safetyWeight: 10 }
  ), [priority]);

  const decision = useMemo(() => {
    const status = selectedHood.status === 'green' ? 'undervalued' : selectedHood.status === 'red' ? 'bubble' : 'balanced';
    return evaluateCasperNeighborhoodDecision({
      hoodId: selectedHood.id, hoodName: selectedHood.name, askingPricePerSqm: agg.askingPricePerSqm, estimatedDealPricePerSqm: negotiationFloorSqm,
      iqrLowPerSqm: agg.iqrLowPerSqm, iqrHighPerSqm: agg.iqrHighPerSqm, validSampleCount: agg.validSampleCount, rejectedFraudCount: agg.rejectedFraudCount,
      confidenceScore: agg.confidenceScore, marketStatus: status, marketRegime: agg.marketRegime, overallScore: selectedHood.overallScore,
      transitScore: selectedHood.metro, safetyScore: selectedHood.security, liquidityScore: liquidity.liquidityScore, rahn80m: selectedHood.rahn80m,
      targetSqm: area, intlCurrency,
    }, weights);
  }, [selectedHood, agg, negotiationFloorSqm, liquidity.liquidityScore, area, intlCurrency, weights]);

  useEffect(() => {
    saveDossierToResilienceCache({ hoodId: selectedHood.id, hoodName: selectedHood.name, cachedAtIso: new Date().toISOString(), dealPricePerSqm: negotiationFloorSqm, askingPricePerSqm: agg.askingPricePerSqm, verdictTitleFa: decision.verdictTitleFa, deedDiscountPct: deed.discountPct, liquidityDays: liquidity.estimatedDaysToLiquidate });
  }, [selectedHood, negotiationFloorSqm, agg.askingPricePerSqm, decision.verdictTitleFa, deed.discountPct, liquidity.estimatedDaysToLiquidate]);

  const { badge: verdictBadgeTheme, icon: verdictIconTheme } = VERDICT_THEMES[decision.decisionVerdict];

  const askingTotalBillion = ((agg.askingPricePerSqm * area) / 1000).toFixed(2);
  const dealTotalBillion = ((negotiationFloorSqm * area) / 1000).toFixed(2);
  const fireSaleTotalBillion = ((liquidity.fireSaleCashPriceSqm * area) / 1000).toFixed(2);
  const bubblePct = Math.round(Math.max(0, ((agg.askingPricePerSqm - negotiationFloorSqm) / Math.max(1, negotiationFloorSqm)) * 100));

  return (
    <div
      dir="rtl"
      data-testid="casper-instant-verdict-card"
      className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-slate-50 to-slate-100/70 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 p-5 shadow-sm space-y-4"
    >
      {/* Top Banner: Verdict & Priorities */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${verdictIconTheme}`}>
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white">حکم آنی رادار برای {selectedHood.name}</span>
              <span
                data-testid="casper-verdict-badge"
                data-verdict={decision.decisionVerdict}
                className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${verdictBadgeTheme}`}
              >
                {decision.verdictTitleFa}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              واحد {toPersianNum(area)} متری · {agg.observedSampleCount > 0 ? `${toPersianNum(agg.observedSampleCount)} آگهی زنده در مدل` : 'فاقد آگهی زنده (مدل پایه)'} · بتای ارزی {toPersianNum(fx.betaSensitivity)}
            </p>
          </div>
        </div>

        {/* Priority Segmented Toggle */}
        <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800/70 p-1 rounded-xl self-start sm:self-auto text-[11px] font-bold">
          <button type="button" onClick={() => setPriority('investment')} className={`px-2 py-1 rounded-lg transition cursor-pointer ${priority === 'investment' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}>📈 رشد سرمایه</button>
          <button type="button" onClick={() => setPriority('family')} className={`px-2 py-1 rounded-lg transition cursor-pointer ${priority === 'family' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}>🏡 سکونت</button>
          <button type="button" onClick={() => setPriority('liquidity')} className={`px-2 py-1 rounded-lg transition cursor-pointer ${priority === 'liquidity' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}>⚡ نقدشوندگی</button>
        </div>
      </div>

      {/* Deed Legitimacy & Law 1403 Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-xs">
        <div className="flex items-center gap-1.5">
          <FileWarning className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">سپر اصالت سند (قانون الزام ۱۴۰۳):</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(['TEK_BARG_OFFICIAL', 'MANGOOLE_DAR_BOOKLET', 'OGHAF_ENDOWED', 'GHOULNAME_ADI', 'MASKAN_MEHR_NO_ARSE'] as IranianDeedType[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDeedType(d)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                deedType === d
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              {d === 'TEK_BARG_OFFICIAL' ? 'تک‌برگ رسمی' : d === 'MANGOOLE_DAR_BOOKLET' ? 'منگوله‌دار (-۵٪)' : d === 'OGHAF_ENDOWED' ? 'اوقافی (-۱۵٪)' : d === 'GHOULNAME_ADI' ? 'قولنامه‌ای (-۳۰٪)' : 'مسکن مهر (-۲۲٪)'}
            </button>
          ))}
        </div>
      </div>

      {/* Core Numbers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Deal Price with Deed/FX Adjustment */}
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">کف سناریوی مذاکره (تعدیل روز · غیرثبتی)</span>
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900 dark:text-white">{toPersianNum(dealTotalBillion)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">میلیارد تومان</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            متری {toPersianNum(negotiationFloorSqm)} م {deed.discountPct > 0 ? `(کسر ${toPersianNum(deed.discountPct)}٪ سند)` : ''}
          </span>
        </div>

        {/* Asking Price & Bubble */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">قیمت اعلامی آگهی‌های دیوار</span>
            {bubblePct > 0 && (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900">
                +{toPersianNum(bubblePct)}٪ حباب اولیه
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-700 dark:text-slate-300">{toPersianNum(askingTotalBillion)}</span>
            <span className="text-xs text-slate-400">میلیارد تومان</span>
          </div>
          <span className="text-[11px] text-slate-400 block">متری {toPersianNum(agg.askingPricePerSqm)} م</span>
        </div>

        {/* Liquidity Depth & Fire-Sale Price */}
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">فروش فوری نقدی (&lt;۲۰ روز)</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900 dark:text-white">{toPersianNum(fireSaleTotalBillion)}</span>
            <span className="text-xs text-slate-400">میلیارد تومان</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            فروش عادی: {toPersianNum(liquidity.estimatedDaysToLiquidate)} روز ({liquidity.liquidityTierFa})
          </span>
        </div>
      </div>

      {/* Bottom Action Strip: Advice & Modals Triggers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
          💡 <span className="text-slate-900 dark:text-white font-bold">توصیه عملیاتی رادار:</span> {toPersianNum(decision.verdictSummaryFa)}
        </p>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowDossier(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <FileCheck className="w-3.5 h-3.5" />
            کارنامه رسمی کارشناسی
          </button>
          <button
            type="button"
            onClick={() => setShowPlaybook(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            سلاح چانه‌زنی پای نشست
          </button>
        </div>
      </div>

      {/* Negotiation Playbook Modal */}
      <CasperNegotiationPlaybookModal
        isOpen={showPlaybook}
        onClose={() => setShowPlaybook(false)}
        hoodName={selectedHood.name}
        askingPricePerSqm={agg.askingPricePerSqm}
        dealPricePerSqm={negotiationFloorSqm}
        targetOfferPerSqm={decision.targetOfferPerSqm}
        walkAwayPricePerSqm={Math.min(agg.askingPricePerSqm, Math.round(negotiationFloorSqm * 1.04))}
        targetSqm={area}
        intlCurrency={intlCurrency}
      />

      {/* Certified Valuation Dossier Modal */}
      <CasperCertifiedDossierModal
        isOpen={showDossier}
        onClose={() => setShowDossier(false)}
        hoodName={selectedHood.name}
        zone={selectedHood.zone}
        askingPricePerSqm={agg.askingPricePerSqm}
        dealPricePerSqm={negotiationFloorSqm}
        targetSqm={area}
        deedType={deedType}
      />
    </div>
  );
}
