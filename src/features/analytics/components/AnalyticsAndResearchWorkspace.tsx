/**
 * RT-UI-ANALYTICS-001 (Stage 29) | Data Platform, Analytics & Research Intelligence Workspace
 * Covers:
 * - Three Analytics Shells: Public Analytics (/analytics), Professional Workspace (/workspace/analytics),
 *   and Reproducible Research Workspace (/research/workspace)
 * - First 3 Core Data Products (§25.1): Listing Supply Index, Asking Price Distribution (Median, P10, P25, P75, P90, IQR),
 *   and Neighborhood Analytical Profile with SCD Type 2 Boundary Versioning
 * - Official Metric Registry & Semantic Layer Browser
 */

import React, { useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, Layers, Microscope, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { AnalyticsAudienceShell } from '../models/analytics.types';
import {
  computeSafePeriodComparison,
  defaultAnalyticsPlatformEngine,
} from '../services/analyticsPlatformEngine';
import { convertPricePerSqmToUnitRaw, formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';

export interface AnalyticsAndResearchWorkspaceProps {
  selectedNeighborhoodId?: string | null;
  selectedNeighborhoodNameFa?: string;
  activePlaceId?: string | null;
  activePlaceNameFa?: string;
  baseBuyPerSqm: number;
  observedValues?: number[];
}

export const AnalyticsAndResearchWorkspace: React.FC<AnalyticsAndResearchWorkspaceProps> = ({
  selectedNeighborhoodId: propHoodId,
  selectedNeighborhoodNameFa: propHoodNameFa,
  activePlaceId,
  activePlaceNameFa,
  baseBuyPerSqm,
  observedValues,
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const selectedNeighborhoodId = propHoodId !== undefined ? propHoodId : (activePlaceId ?? null);
  const selectedNeighborhoodNameFa = propHoodNameFa || activePlaceNameFa || 'محله انتخاب‌شده';
  const [activeShell, setActiveShell] = useState<AnalyticsAudienceShell>('PUBLIC_ANALYTICS');
  const [exportNoticeFa, setExportNoticeFa] = useState<string | null>(null);

  const bundle = defaultAnalyticsPlatformEngine.getOverviewBundle(selectedNeighborhoodId, baseBuyPerSqm, observedValues);
  const snap = bundle.activeSnapshot;
  const dist = snap.distribution;
  const uMetric = (v: number) => Math.round(convertPricePerSqmToUnitRaw(v, areaUnit) * 10) / 10;
  const areaLbl = areaUnit === 'sqft' ? 'فوت مربع (ft²)' : 'مترمربع';
  const fxNote = (v: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uMetric(v), intlCurrency, radarLocale)})` : '');

  const periodComparison = dist
    ? computeSafePeriodComparison({
        currentPeriodLabelFa: snap.period.labelFa,
        previousPeriodLabelFa: 'دوره قبل (ثبت‌نشده)',
        currentValue: dist.median,
        previousValue: 0,
        currentSampleCount: dist.count,
        previousSampleCount: 0,
        currentBoundaryVersion: snap.geography.boundaryVersion,
        previousBoundaryVersion: snap.geography.boundaryVersion,
      })
    : null;

  const handleRequestExport = () => {
    if (!dist) return;
    const check = defaultAnalyticsPlatformEngine.canExportDatasetSlice({
      sampleCount: dist.uniqueEntityCount,
      datasetClassification: 'PUBLIC',
      callerRole: activeShell === 'RESEARCH_WORKSPACE' ? 'RESEARCHER' : 'PUBLIC_USER',
    });
    setExportNoticeFa(
      check.allowed
        ? `خروجی تجمیعی مجاز (${toPersianNum(dist.uniqueEntityCount)} نمونه، شناسه ${snap.dataSnapshotId}) آماده دریافت شد.`
        : check.reasonFa
    );
  };

  return (
    <section
      data-testid="analytics-and-research-workspace"
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-4 text-xs"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-[#176B63]" />
            <span>سکوی داده، تحلیل آماری و هوشمندی پژوهشی ({selectedNeighborhoodNameFa})</span>
          </strong>
          <p className="text-[11px] text-slate-500 mt-0.5">
            مبتنی بر لایه تحلیلی مجزا (Medallion Gold/Semantic)، دفتر رسمی شاخص‌ها (Metric Registry) و نسخه مرز محله ({snap.geography.boundaryVersion})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="محیط‌های تحلیلی رادار">
          {[
            { id: 'PUBLIC_ANALYTICS', label: 'داشبورد تحلیلی عمومی (/analytics)' },
            { id: 'PROFESSIONAL_WORKSPACE', label: 'میز کار حرفه‌ای (/workspace/analytics)' },
            { id: 'RESEARCH_WORKSPACE', label: 'محیط پژوهش بازتولیدپذیر (/research/workspace)' },
          ].map((sh) => (
            <button
              key={sh.id}
              type="button"
              role="tab"
              aria-selected={activeShell === sh.id}
              data-testid={`analytics-shell-tab-${sh.id.toLowerCase()}`}
              onClick={() => setActiveShell(sh.id as AnalyticsAudienceShell)}
              className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer ${
                activeShell === sh.id
                  ? 'bg-[#176B63] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {sh.label}
            </button>
          ))}
        </div>
      </div>

      {!dist || snap.value === null ? (
        <div
          data-testid="analytics-no-data-state"
          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-slate-700 dark:text-slate-300"
        >
          <strong className="font-black text-slate-900 dark:text-white block">
            داده تحلیلی معتبر برای «{selectedNeighborhoodNameFa}» هنوز در دسترس نیست (UNAVAILABLE)
          </strong>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            برای این محله هنوز آگهی زنده تاییدشده یا توزیع صدک‌های قیمت در مخزن تحلیلی ثبت نشده است؛ داده ساختگی یا داده محله‌های دیگر جایگزین نمی‌شود.
          </p>
        </div>
      ) : (
        <>
          {snap.dataOrigin === 'SIMULATED' && (
            <div
              data-testid="analytics-simulated-warning"
              className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold"
            >
              هشدار شفافیت: توزیع زیر به صورت نمونه شبیه‌سازی آزمایشی تولید شده است و بیانگر معاملات واقعی بازار نیست.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="analytics-core-data-products">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>محصول داده ۱: شاخص قیمت پیشنهادی (IQR)</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                  {snap.dataOrigin === 'SIMULATED' ? 'شبیه‌سازی' : snap.sufficiencyStatus}
                </span>
              </div>
              <strong className="text-base font-black text-slate-900 dark:text-white block tabular-nums">
                میانه (P50): {toPersianNum(uMetric(dist.median))} م.ت / {areaLbl}{fxNote(dist.median)}
              </strong>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                صدک ۱۰ (P10): {toPersianNum(uMetric(dist.p10))} · صدک ۲۵ (P25): {toPersianNum(uMetric(dist.p25))} · صدک ۷۵ (P75): {toPersianNum(uMetric(dist.p75))} · صدک ۹۰ (P90): {toPersianNum(uMetric(dist.p90))}
              </div>
              <div className="text-[10.5px] text-slate-500">
                دامنه میان‌چارکی (IQR): {toPersianNum(uMetric(dist.iqr))} · پالایش پرت: {toPersianNum(dist.trimmedOutlierCount)} رکورد
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="text-[11px] text-slate-500">محصول داده ۲: شاخص عرضه و مقایسه متقارن دوره‌ای</div>
              <strong className="text-base font-black text-slate-900 dark:text-white block tabular-nums">
                {snap.dataOrigin === 'SIMULATED'
                  ? `۰ نمونه زنده (${toPersianNum(dist.count)} نقطه شبیه‌سازی)`
                  : `${toPersianNum(dist.uniqueEntityCount)} نمونه زنده محلی`}
              </strong>
              <div className="text-[11px] text-amber-700 dark:text-amber-300 font-bold tabular-nums">
                {periodComparison && periodComparison.computable
                  ? `تغییر: ${toPersianNum(periodComparison.changePercent!)}٪`
                  : 'داده کافی برای مقایسه با دوره قبل وجود ندارد.'}
              </div>
              <div className="text-[10.5px] text-slate-500">
                نسخه مرز مکانی: {snap.geography.boundaryVersion}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="text-[11px] text-slate-500">محصول داده ۳: نمایه مکانی نسخه‌بندی‌شده (SCD Type 2)</div>
              <strong className="text-sm font-black text-slate-900 dark:text-white block">
                {selectedNeighborhoodNameFa} ({snap.geography.boundaryVersion})
              </strong>
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                اسنپ‌شات مرجع: <code className="font-mono">{snap.dataSnapshotId}</code> · روش v{toPersianNum(snap.methodologyVersion)}
              </div>
              <button
                type="button"
                data-testid="btn-export-analytical-slice"
                onClick={handleRequestExport}
                className="mt-1 px-2.5 py-1 rounded-lg bg-[#176B63] text-white font-bold text-[11px] cursor-pointer"
              >
                دریافت خروجی تجمیعی مجاز (کنترل k-Anonymity)
              </button>
            </div>
          </div>
        </>
      )}

      {exportNoticeFa && (
        <div
          data-testid="analytics-export-notice"
          className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-1.5"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportNoticeFa}</span>
        </div>
      )}

      {activeShell === 'PROFESSIONAL_WORKSPACE' && (
        <div
          data-testid="professional-metric-registry-panel"
          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2"
        >
          <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[#176B63]" />
            <span>دفتر رسمی شاخص‌ها (Official Metric Registry) و لایه معنایی واحد:</span>
          </strong>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {bundle.metricsRegistry.map((m) => (
              <div key={m.id} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-bold text-slate-900 dark:text-white">{m.displayNameFa}</strong>
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{m.metricCode}</code>
                </div>
                <div className="text-[10.5px] text-slate-500">
                  مفهوم مالی: <strong>{m.financialConcept}</strong> · دانه (Grain): {m.grain} · روش v{toPersianNum(m.methodologyVersion)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeShell === 'RESEARCH_WORKSPACE' && (
        <div
          data-testid="reproducible-research-workspace-panel"
          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2"
        >
          <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Microscope className="w-4 h-4 text-[#176B63]" />
            <span>محیط پژوهش بازتولیدپذیر (Reproducible Analysis Canvas & Dataset Versions):</span>
          </strong>
          {bundle.savedAnalyses.length === 0 ? (
            <p className="text-[11px] text-slate-500">گزارش پژوهشی اختصاصی برای «{selectedNeighborhoodNameFa}» ثبت نشده است.</p>
          ) : (
            bundle.savedAnalyses.map((ana) => (
              <div key={ana.analysisId} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-black text-slate-900 dark:text-white">{ana.titleFa}</strong>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[10px]">
                    {ana.reproducibleHash}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">پرسش پژوهش: {ana.researchQuestionFa}</p>
                <div className="text-[10.5px] text-slate-500 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> اسنپ‌شات داده: {ana.datasetVersions.join(', ')}</span>
                  <span>· شاخص‌ها: {ana.metricCodes.join(', ')}</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-600" /> مرز: {ana.geographicScope.boundaryVersion}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 pt-1">{ana.outputSummaryFa}</p>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};
