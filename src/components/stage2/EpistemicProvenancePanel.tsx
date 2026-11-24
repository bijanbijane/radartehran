import React, { useMemo, useState } from 'react';
import { ShieldCheck, Scale, AlertTriangle, Sliders, Eye, FileWarning, Cpu, Brain } from 'lucide-react';
import { toPersianNum, type Neighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { CasperDecisionMatrixCard } from './CasperDecisionMatrixCard';
import {
  buildNeighborhoodEpistemicDossier,
  evaluateCounterfactualDecisionScenario,
  EpistemicStatementClass,
  RadarDataProvenanceLayerId,
} from '../../cells/decision-epistemology/epistemicDecisionEngine';

export interface EpistemicProvenancePanelProps {
  hoodId: number; hoodName: string; cityKey: string; basePriceSqm: number;
  hood?: Neighborhood; initialTargetSqm?: number; onTargetSqmChange?: (sqm: number) => void; intlCurrency?: IntlCurrencyCode;
}

const PROVENANCE_BADGE_STYLE: Record<RadarDataProvenanceLayerId, string> = {
  OBSERVED_DATA: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  ADVERTISER_CLAIM: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  VERIFIED_DATA: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  USER_PROVIDED_DATA: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
  THIRD_PARTY_DATA: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  ESTIMATED_DATA: 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
  INFERRED_DATA: 'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
  PREDICTED_DATA: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:border-fuchsia-800',
  CONFLICTING_DATA: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  OUTDATED_DATA: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  MISSING_DATA: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  UNKNOWN_DATA: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

const EPISTEMIC_CLASS_LABEL: Record<EpistemicStatementClass, string> = {
  FACT: 'واقعیت ثبت‌شده (Fact)',
  EVIDENCE: 'شاهد تجربی (Evidence)',
  INFERENCE: 'استنباط تحلیلی (Inference)',
  HYPOTHESIS: 'فرضیه آزمون‌پذیر (Hypothesis)',
  ASSUMPTION: 'فرض مدل (Assumption)',
  UNKNOWN: 'عدم قطعیت / ناشناخته (Unknown)',
  RECOMMENDATION: 'توصیه مشروط (Recommendation)',
};

export const EpistemicProvenancePanel: React.FC<EpistemicProvenancePanelProps> = ({
  hoodId, hoodName, cityKey, basePriceSqm, hood, initialTargetSqm = 85, onTargetSqmChange, intlCurrency = 'USD',
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'EVIDENCE_AND_FACT' | 'INFERENCE_AND_MODEL' | 'UNCERTAINTY_AND_CONFLICT'>('ALL');
  const [buyerDiscountPct, setBuyerDiscountPct] = useState<number>(8);
  const [unitAreaSqm, setUnitAreaSqm] = useState<number>(initialTargetSqm);
  React.useEffect(() => { setUnitAreaSqm(initialTargetSqm); }, [initialTargetSqm]);

  const dossier = useMemo(
    () => buildNeighborhoodEpistemicDossier({ cityId: cityKey, hoodId, hoodName, buyPerSqm: basePriceSqm, rahn80m: hood?.rahn80m, intlCurrency, customHood: hood }),
    [hoodId, hoodName, cityKey, basePriceSqm, hood, intlCurrency]
  );

  const counterfactual = useMemo(
    () =>
      evaluateCounterfactualDecisionScenario({
        askingPricePerSqm: dossier.askingPricePerSqm,
        estimatedDealPricePerSqm: dossier.estimatedDealPricePerSqm,
        targetSqm: unitAreaSqm,
        buyerProposedDiscountPct: buyerDiscountPct,
        intlCurrency,
      }),
    [dossier.askingPricePerSqm, dossier.estimatedDealPricePerSqm, unitAreaSqm, buyerDiscountPct, intlCurrency]
  );

  const filteredItems = useMemo(() => {
    if (filterMode === 'ALL') return dossier.provenanceLayers;
    if (filterMode === 'EVIDENCE_AND_FACT') {
      return dossier.provenanceLayers.filter((i) => i.epistemicClass === 'FACT' || i.epistemicClass === 'EVIDENCE');
    }
    if (filterMode === 'INFERENCE_AND_MODEL') {
      return dossier.provenanceLayers.filter(
        (i) => i.epistemicClass === 'INFERENCE' || i.epistemicClass === 'HYPOTHESIS' || i.epistemicClass === 'ASSUMPTION'
      );
    }
    return dossier.provenanceLayers.filter(
      (i) => i.epistemicClass === 'UNKNOWN' || i.layerId === 'CONFLICTING_DATA' || i.layerId === 'OUTDATED_DATA' || i.layerId === 'MISSING_DATA'
    );
  }, [dossier.provenanceLayers, filterMode]);

  const { confidenceDecomposition: cd, accountabilityManifest: am } = dossier;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4" dir="rtl">
      <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 rounded-xl p-3 flex items-start gap-2.5">
        <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-indigo-950 dark:text-indigo-200">
          <span className="font-bold">اصول شفافیت داده و حاکمیت کاربر: </span>
          {am.humanAgencyPrincipleFa}
        </div>
      </div>

      {/* Mathematical Confidence Decomposition */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              کالبدشکافی ریاضی شاخص اطمینان محله ({toPersianNum(cd.totalConfidencePct)} از ۱۰۰)
            </h4>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            حاشیه خطای تخمین: ±{toPersianNum(cd.marginOfErrorPct)}٪ • دوره نقدشوندگی: ~{toPersianNum(dossier.estimatedExitDays)} روز
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'کفایت نمونه آماری', val: cd.sampleSufficiencyPoints, max: toPersianNum(cd.maxSampleSufficiencyPoints) },
            { label: 'انسجام میان‌چارکی (IQR)', val: cd.iqrConsistencyPoints, max: toPersianNum(cd.maxIqrConsistencyPoints) },
            { label: 'پالایش ضدتقلب (Z-Score)', val: cd.fraudFilterPoints, max: toPersianNum(cd.maxFraudFilterPoints) },
            { label: 'تازگی زمانی مشاهده', val: cd.temporalFreshnessPoints, max: toPersianNum(cd.maxTemporalFreshnessPoints) },
          ].map((m) => (
            <div key={m.label} className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/70 dark:border-slate-700">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{m.label}</div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {toPersianNum(m.val)} <span className="text-[10px] font-normal text-slate-400">/ {m.max}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono dir-ltr text-left">{cd.formulaText}</div>
      </div>

      {/* CASPER 4-Vector Behavioral & Cognitive Bias Shield */}
      <div className="bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Brain className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              سپر خطاهای شناختی و اقتصاد رفتاری (Cognitive & Behavioral Debiasing Shield)
            </h4>
          </div>
          <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">
            بازده ناخالص اجاره سالانه: {toPersianNum(dossier.grossRentalYieldPct)}٪
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dossier.cognitiveBiases.map((b) => (
            <div key={b.biasId} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{b.titleFa}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${b.severity === 'HIGH' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300' : b.severity === 'MODERATE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'}`}>
                  ریسک {toPersianNum(b.riskScore)}٪
                </span>
              </div>
              <div className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">{b.metricSummaryFa}</div>
              <p className="text-[10px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                <strong>پادزهر تصمیم‌گیری: </strong>{b.debiasingActionFa}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Counterfactual Negotiation Simulator */}
      <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              شبیه‌ساز پیامد تصمیم و مذاکره خلاف‌واقع (Counterfactual Simulator)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <label htmlFor="casper-area-select" className="text-slate-600 dark:text-slate-300 font-medium">متراژ مبنا:</label>
            <select
              id="casper-area-select" aria-label="متراژ مبنا برای شبیه‌سازی مذاکره" value={unitAreaSqm}
              onChange={(e) => { const v = Number(e.target.value); setUnitAreaSqm(v); onTargetSqmChange?.(v); }}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-[11px] text-slate-800 dark:text-slate-100"
            >
              {[65, 85, 110, 135].map((sqm) => <option key={sqm} value={sqm}>{toPersianNum(sqm)} متر</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <span>نرخ چانه‌زنی پیشنهادی خریدار نسبت به قیمت اعلامی:</span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">{toPersianNum(buyerDiscountPct)}٪ تخفیف از قیمت آگهی</span>
          </div>
          <input
            type="range" min={0} max={20} step={1} aria-label="نرخ چانه‌زنی پیشنهادی خریدار"
            value={buyerDiscountPct} onChange={(e) => setBuyerDiscountPct(Number(e.target.value))}
            className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">کل مبلغ اعلامی آگهی</div>
            <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{toPersianNum(counterfactual.askingTotalMillion)} م‌ت ({formatMillionTomanAsIntlCurrency(counterfactual.askingTotalMillion, intlCurrency, 'fa')})</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">پیشنهاد شما ({toPersianNum(buyerDiscountPct)}٪-)</div>
            <div className="font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">{counterfactual.buyerOfferIntlText}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">حفظ سرمایه در برابر آگهی</div>
            <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{toPersianNum(counterfactual.capitalPreservedMillion)} م‌ت ({formatMillionTomanAsIntlCurrency(counterfactual.capitalPreservedMillion, intlCurrency, 'fa')})</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">احتمال پذیرش فروشنده</div>
            <div className="font-bold text-amber-700 dark:text-amber-400 mt-0.5">{toPersianNum(counterfactual.acceptanceProbabilityPct)}٪</div>
          </div>
        </div>
        <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">{counterfactual.consequenceSummaryFa}</p>
      </div>

      <CasperDecisionMatrixCard hoodId={hoodId} hoodName={hoodName} basePriceSqm={basePriceSqm} targetSqm={unitAreaSqm} hood={hood} intlCurrency={intlCurrency} compact />

      {/* 12-Layer Provenance Matrix */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
              ماتریس ۱۲ لایه منشأ داده و تفکیک معرفتی ({toPersianNum(filteredItems.length)} لایه)
            </h4>
          </div>
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'ALL', label: 'همه لایه‌ها (۱۲)' },
              { id: 'EVIDENCE_AND_FACT', label: 'شواهد و واقعیات' },
              { id: 'INFERENCE_AND_MODEL', label: 'مدل و استنباط' },
              { id: 'UNCERTAINTY_AND_CONFLICT', label: 'تعارض و داده‌های مفقود' },
            ].map((btn) => (
              <button
                key={btn.id} type="button" onClick={() => setFilterMode(btn.id as typeof filterMode)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                  filterMode === btn.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5">
          {filteredItems.map((item) => (
            <div key={item.layerId} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between gap-1.5">
              <div>
                <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${PROVENANCE_BADGE_STYLE[item.layerId]}`}>{item.titleFa}</span>
                  <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">{EPISTEMIC_CLASS_LABEL[item.epistemicClass]}</span>
                </div>
                <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 my-0.5">{item.currentValueSummaryFa}</div>
                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">منشأ: {item.sourceFa} • روش کنترل: {item.verificationMethodFa}</p>
              </div>
              <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-start gap-1 text-[10px] text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span>{item.limitationFa}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Algorithmic Accountability & Bias Manifest */}
      <div className="border-t border-slate-200 dark:border-slate-800 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[10px]">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/70 space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            مفروضات و ورودی‌های مدل ({am.version})
          </div>
          <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-0.5 leading-relaxed">
            {am.assumptionsFa.map((a, idx) => <li key={idx}>{a}</li>)}
          </ul>
        </div>
        <div className="bg-rose-50/40 dark:bg-rose-950/20 p-2.5 rounded-xl border border-rose-200/70 dark:border-rose-900/50 space-y-1">
          <div className="font-bold text-rose-900 dark:text-rose-300 flex items-center gap-1">
            <FileWarning className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            محدودیت‌ها و ریسک‌های سوگیری (Survivorship & Selection Bias)
          </div>
          <ul className="list-disc list-inside text-rose-800 dark:text-rose-200/90 space-y-0.5 leading-relaxed">
            {am.biasRisksFa.map((b, idx) => <li key={idx}>{b}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
};
