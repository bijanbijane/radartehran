import React, { useMemo } from 'react';
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
import type { CityId } from '../../data/multiCityData';
import { buildNeighborhoodSpatialContagionReport } from '../../cells/decision-epistemology/spatialContagionEngine';

export interface SpatialContagionLabCardProps {
  hoodId: number;
  hoodName: string;
  cityKey?: CityId | string;
  basePriceSqm?: number;
  onSelectCompareHood?: (hoodName: string) => void;
}

export const SpatialContagionLabCard: React.FC<SpatialContagionLabCardProps> = ({
  hoodId,
  hoodName,
  cityKey = 'tehran',
  basePriceSqm = 120,
  onSelectCompareHood,
}) => {
  const report = useMemo(
    () => buildNeighborhoodSpatialContagionReport(hoodId, hoodName, cityKey, basePriceSqm),
    [hoodId, hoodName, cityKey, basePriceSqm],
  );

  const { akerlofLemon, contagionNodes, spatialAutocorrelationMoranI, prospectTheory } = report;

  const lemonBadgeStyle =
    akerlofLemon.regime === 'SEVERE_LEMON_TRAP'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800'
      : akerlofLemon.regime === 'MODERATE_OPACITY'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';

  return (
    <div className="space-y-3 text-right" dir="rtl" data-testid="spatial-contagion-lab-card">
      {/* Section 1: Akerlof Information Asymmetry & Lemon Risk Index */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              شاخص عدم تقارن اطلاعاتی و «بازار لیموها» (مدل نوبل جرج آکرلوف)
            </h4>
          </div>
          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${lemonBadgeStyle}`}>
            شاخص ریسک آکرلوف: {toPersianNum(akerlofLemon.lemonIndexScore)} از ۱۰۰ · {akerlofLemon.regimeLabelFa}
          </span>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          {akerlofLemon.sellerAdvantageWarningFa}
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center tabular-nums">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">پراکندگی بین‌چارکی (IQR)</span>
            <strong className="text-xs font-black text-slate-800 dark:text-slate-100">
              {toPersianNum(akerlofLemon.priceDispersionRatioPct)}٪
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">نرخ آگهی طعمه/ردشده</span>
            <strong className="text-xs font-black text-rose-600 dark:text-rose-400">
              {toPersianNum(akerlofLemon.baitRejectionRatePct)}٪
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800">
            <span className="text-[10px] text-indigo-700 dark:text-indigo-300 block">تخفیف جبرانی عدم تقارن</span>
            <strong className="text-xs font-black text-indigo-800 dark:text-indigo-200">
              -{toPersianNum(akerlofLemon.requiredInformationDiscountPct)}٪
            </strong>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5 border border-slate-200/60 dark:border-slate-700/70 space-y-1">
          <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
            پروتکل خنثی‌سازی برتری اطلاعاتی فروشنده پیش از عقد قرارداد:
          </div>
          {akerlofLemon.dueDiligenceProtocolFa.map((step, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Spatial Econometric Contagion & Ripple Network */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Network className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
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
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <GitBranch className={`w-3.5 h-3.5 ${isDriver ? 'text-amber-500' : 'text-emerald-500'}`} />
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100">
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
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-[10px] font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>پرش نقشه</span>
                      <ArrowUpLeft className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {node.mechanismFa}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-1.5 tabular-nums">
                  <span>فاصله: {toPersianNum(node.distanceKm)} کیلومتر</span>
                  <span>ضریب سرایت: β={toPersianNum(node.spatialCorrelationBeta)}</span>
                  <span>وقفه زمانی: {toPersianNum(node.transmissionLagWeeks)} هفته</span>
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
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              نظریه چشم‌انداز کانمن-تورسکی (Prospect Theory) و مهندسی مذاکره ضد زیان‌گریزی
            </h4>
          </div>
          <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-200 text-[10px] font-bold tabular-nums">
            مقاومت روانی فروشنده: {toPersianNum(prospectTheory.dispositionRigidityPct)}٪ · ضریب زیان‌گریزی λ={toPersianNum(prospectTheory.lossAversionLambda)}
          </span>
        </div>

        <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
          {prospectTheory.recommendedNegotiationFramingFa}
        </p>

        <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900/50 text-[10.5px] text-indigo-950 dark:text-indigo-200 font-medium">
          <strong className="font-bold">تاکتیک اجرایی کسپر در جلسه قرارداد: </strong>
          {prospectTheory.stagedPaymentTacticFa}
        </div>
      </div>
    </div>
  );
};
