/**
 * @file src/components/casper/CasperInstantVerdictCard.tsx
 * @description Casper Instant Decision Verdict Card - Radical simplification of real estate decision-making.
 * Delivers immediate fair deal price discovery, buy/hold signal, deed legitimacy, liquidity depth, and spatial arbitrage.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Sparkles, ArrowRightLeft, ShieldCheck, FileCheck, MessageSquareText, Clock, FileWarning } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { evaluateCasperNeighborhoodDecision } from '../../cells/socioeconomic-intelligence/casperDecisionEngine';
import { CasperNegotiationPlaybookModal } from './CasperNegotiationPlaybookModal';
import { CasperCertifiedDossierModal } from './CasperCertifiedDossierModal';
import { evaluateDeedImpact, type IranianDeedType, IRANIAN_DEED_SPECS } from '../../utils/deedLegitimacyShieldEngine';
import { computeLiquidityDepthAndTom } from '../../utils/liquidityDepthAndTomEngine';
import { computeInflationAdjustedPrice } from '../../utils/fxInflationDriftEngine';
import { saveDossierToResilienceCache } from '../../utils/nationalNetworkResilienceCache';
import { useIntlCurrency } from '../AreaUnitToggle';

export interface CasperInstantVerdictCardProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  targetSqm: number;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
}

export function CasperInstantVerdictCard({
  evaluatedNeighborhoods,
  selectedHood,
  onSelectNeighborhood,
  targetSqm,
  onOpenInspector,
}: CasperInstantVerdictCardProps): React.ReactElement {
  const [intlCurrency] = useIntlCurrency();
  const [priority, setPriority] = useState<'investment' | 'family' | 'liquidity'>('investment');
  const [deedType, setDeedType] = useState<IranianDeedType>('TEK_BARG_OFFICIAL');
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showDossier, setShowDossier] = useState(false);

  const area = targetSqm > 0 ? targetSqm : 80;

  const agg = useMemo(() => {
    return aggregateNeighborhoodMarketMetrics(
      selectedHood.id,
      selectedHood.name,
      selectedHood.buyPerSqm,
      buildNeighborhoodListingSamples(selectedHood),
    );
  }, [selectedHood]);

  // 1. Deed Evaluation & 1403 Law Discount
  const deed = useMemo(() => evaluateDeedImpact(agg.estimatedDealPricePerSqm, deedType), [agg.estimatedDealPricePerSqm, deedType]);

  // 2. Inflation / FX Drift Adjustment
  const fx = useMemo(() => computeInflationAdjustedPrice({ basePriceSqm: deed.discountedPriceSqm, dataAgeDays: 14, cityZone: selectedHood.zone }), [deed.discountedPriceSqm, selectedHood.zone]);

  // 3. Liquidity Depth & Days on Market
  const liquidity = useMemo(() => computeLiquidityDepthAndTom({
    basePriceSqm: fx.adjustedCurrentPriceSqm,
    unitAreaSqm: area,
    zone: selectedHood.zone,
    hasElevator: selectedHood.security >= 7,
    floor: 2,
    isBargainPrice: selectedHood.status === 'green',
  }), [fx.adjustedCurrentPriceSqm, area, selectedHood]);

  const weights = useMemo(() => {
    if (priority === 'investment') return { priceWeight: 40, commuteWeight: 15, environmentWeight: 15, liquidityWeight: 20, safetyWeight: 10 };
    if (priority === 'family') return { priceWeight: 20, commuteWeight: 20, environmentWeight: 30, liquidityWeight: 10, safetyWeight: 20 };
    return { priceWeight: 30, commuteWeight: 25, environmentWeight: 10, liquidityWeight: 25, safetyWeight: 10 };
  }, [priority]);

  const decision = useMemo(() => {
    const status = selectedHood.status === 'green' ? 'undervalued' : selectedHood.status === 'red' ? 'bubble' : 'balanced';
    return evaluateCasperNeighborhoodDecision(
      {
        hoodId: selectedHood.id,
        hoodName: selectedHood.name,
        askingPricePerSqm: agg.askingPricePerSqm,
        estimatedDealPricePerSqm: fx.adjustedCurrentPriceSqm,
        iqrLowPerSqm: agg.iqrLowPerSqm,
        iqrHighPerSqm: agg.iqrHighPerSqm,
        validSampleCount: agg.validSampleCount,
        rejectedFraudCount: agg.rejectedFraudCount,
        confidenceScore: agg.confidenceScore,
        marketStatus: status,
        marketRegime: agg.marketRegime,
        overallScore: selectedHood.overallScore,
        transitScore: selectedHood.metro,
        safetyScore: selectedHood.security,
        rahn80m: selectedHood.rahn80m,
        targetSqm: area,
        intlCurrency,
      },
      weights,
    );
  }, [selectedHood, agg, fx.adjustedCurrentPriceSqm, area, intlCurrency, weights]);

  // Auto-save to resilient offline cache
  useEffect(() => {
    saveDossierToResilienceCache({
      hoodId: selectedHood.id,
      hoodName: selectedHood.name,
      cachedAtIso: new Date().toISOString(),
      dealPricePerSqm: fx.adjustedCurrentPriceSqm,
      askingPricePerSqm: agg.askingPricePerSqm,
      verdictTitleFa: decision.verdictTitleFa,
      deedDiscountPct: deed.discountPct,
      liquidityDays: liquidity.estimatedDaysToLiquidate,
    });
  }, [selectedHood, fx.adjustedCurrentPriceSqm, agg.askingPricePerSqm, decision.verdictTitleFa, deed.discountPct, liquidity.estimatedDaysToLiquidate]);

  const arbitrageHood = useMemo(() => {
    const peers = evaluatedNeighborhoods.filter(
      (h) => h.id !== selectedHood.id && h.buyPerSqm <= selectedHood.buyPerSqm * 0.95 && h.overallScore >= selectedHood.overallScore - 0.5,
    );
    if (peers.length === 0) return null;
    return peers.sort((a, b) => b.overallScore - a.overallScore)[0];
  }, [evaluatedNeighborhoods, selectedHood]);

  const askingTotalBillion = ((agg.askingPricePerSqm * area) / 1000).toFixed(2);
  const dealTotalBillion = ((fx.adjustedCurrentPriceSqm * area) / 1000).toFixed(2);
  const fireSaleTotalBillion = ((liquidity.fireSaleCashPriceSqm * area) / 1000).toFixed(2);
  const bubblePct = Math.round(Math.max(0, ((agg.askingPricePerSqm - fx.adjustedCurrentPriceSqm) / fx.adjustedCurrentPriceSqm) * 100));

  return (
    <div
      dir="rtl"
      data-testid="casper-instant-verdict-card"
      className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-slate-50 to-slate-100/70 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 p-5 shadow-sm space-y-4"
    >
      {/* Top Banner: Verdict & Priorities */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 dark:text-white">حکم آنی کسپر برای {selectedHood.name}</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md border bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                {decision.verdictTitleFa}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              واحد {toPersianNum(area)} متری · {toPersianNum(agg.validSampleCount)} معامله قطعی · بتای ارزی {toPersianNum(fx.betaSensitivity)}
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
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">کف معامله قطعی (تعدیل روز)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900 dark:text-white">{toPersianNum(dealTotalBillion)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">میلیارد تومان</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
            متری {toPersianNum(fx.adjustedCurrentPriceSqm)} م {deed.discountPct > 0 ? `(کسر ${toPersianNum(deed.discountPct)}٪ سند)` : ''}
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
          💡 <span className="text-slate-900 dark:text-white font-bold">توصیه عملیاتی کسپر:</span> {decision.verdictSummaryFa}
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
        dealPricePerSqm={fx.adjustedCurrentPriceSqm}
        targetOfferPerSqm={decision.targetOfferPerSqm}
        walkAwayPricePerSqm={Math.round(fx.adjustedCurrentPriceSqm * 1.05)}
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
        dealPricePerSqm={fx.adjustedCurrentPriceSqm}
        targetSqm={area}
        deedType={deedType}
      />
    </div>
  );
}
