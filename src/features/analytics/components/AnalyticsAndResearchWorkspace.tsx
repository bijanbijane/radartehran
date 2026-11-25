/**
 * RT-UI-ANALYTICS-001 & Stage 27/28 | Data Platform, Analytics & Research Intelligence Workspace
 * Connected to authoritative Backend API (/api/v1/analytics/*, /api/v1/research/workspace)
 * with strict Temporal Integrity (observedAt vs computedAt, FRESH | AGING | STALE | UNKNOWN).
 */
import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, Clock, Download, Layers, Microscope, PlusCircle, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { AnalyticsAudienceShell, AnalyticsExportResponse, MetricSnapshotResponse, ReproducibleAnalysisDefinition } from '../models/analytics.types';
import { computeSafePeriodComparison, defaultAnalyticsPlatformEngine } from '../services/analyticsPlatformEngine';
import { defaultAnalyticsApiClient } from '../services/analyticsApiClient';
import { convertPricePerSqmToUnitRaw, formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';

export interface AnalyticsAndResearchWorkspaceProps {
  selectedNeighborhoodId?: string | null;
  selectedNeighborhoodNameFa?: string;
  activePlaceId?: string | null;
  activePlaceNameFa?: string;
  baseBuyPerSqm: number;
  observedValues?: number[];
  observedAtIso?: string | null;
}

export const AnalyticsAndResearchWorkspace: React.FC<AnalyticsAndResearchWorkspaceProps> = ({
  selectedNeighborhoodId: propHoodId, selectedNeighborhoodNameFa: propHoodNameFa,
  activePlaceId, activePlaceNameFa, baseBuyPerSqm, observedValues, observedAtIso,
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const selectedNeighborhoodId = propHoodId !== undefined ? propHoodId : (activePlaceId ?? null);
  const selectedNeighborhoodNameFa = propHoodNameFa || activePlaceNameFa || 'محله انتخاب‌شده';
  const [activeShell, setActiveShell] = useState<AnalyticsAudienceShell>('PUBLIC_ANALYTICS');
  const [exportNoticeFa, setExportNoticeFa] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<AnalyticsExportResponse | null>(null);
  const [serverSnapshot, setServerSnapshot] = useState<MetricSnapshotResponse | null>(null);
  const [serverAnalyses, setServerAnalyses] = useState<ReproducibleAnalysisDefinition[]>([]);
  const [researchNoticeFa, setResearchNoticeFa] = useState<string | null>(null);

  const localBundle = defaultAnalyticsPlatformEngine.getOverviewBundle(
    selectedNeighborhoodId, baseBuyPerSqm, observedValues, { observedAt: observedAtIso ?? null },
  );

  useEffect(() => {
    let active = true;
    setServerSnapshot(null);
    if (selectedNeighborhoodId && (!observedValues || observedValues.length === 0)) {
      defaultAnalyticsApiClient
        .fetchAnalyticsMarketBundle(selectedNeighborhoodId, observedValues, { observedAt: observedAtIso ?? null })
        .then((res) => { if (active && res.authoritySource === 'BACKEND_API') setServerSnapshot(res.activeSnapshot); })
        .catch(() => {});
    }
    defaultAnalyticsApiClient
      .fetchResearchWorkspaceBundle(selectedNeighborhoodId)
      .then((res) => { if (active) setServerAnalyses(res.savedAnalyses); })
      .catch(() => {});
    return () => { active = false; };
  }, [selectedNeighborhoodId, observedValues, observedAtIso]);

  const snap = serverSnapshot ?? localBundle.activeSnapshot;
  const dist = snap.distribution;
  const savedAnalyses = serverAnalyses.length > 0 ? serverAnalyses : localBundle.savedAnalyses;
  const uMetric = (v: number) => Math.round(convertPricePerSqmToUnitRaw(v, areaUnit) * 10) / 10;
  const areaLbl = areaUnit === 'sqft' ? 'فوت مربع (ft²)' : 'مترمربع';
  const fxNote = (v: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uMetric(v), intlCurrency, radarLocale)})` : '');

  const periodComparison = dist
    ? computeSafePeriodComparison({
        currentPeriodLabelFa: snap.period.labelFa, previousPeriodLabelFa: 'دوره قبل (ثبت‌نشده)',
        currentValue: dist.median, previousValue: 0, currentSampleCount: dist.count, previousSampleCount: 0,
        currentBoundaryVersion: snap.geography.boundaryVersion, previousBoundaryVersion: snap.geography.boundaryVersion,
      })
    : null;

  const handleRequestExport = async () => {
    if (!dist) return;
    const callerRole = activeShell === 'RESEARCH_WORKSPACE' ? 'RESEARCHER' : 'PUBLIC_USER';
    const check = defaultAnalyticsPlatformEngine.canExportDatasetSlice({
      sampleCount: dist.uniqueEntityCount, uniqueEntityCount: dist.uniqueEntityCount, datasetClassification: 'PUBLIC', callerRole,
    });
    if (!check.allowed) {
      setExportResult({ ok: false, status: 'DENIED', reasonFa: check.reasonFa });
      setExportNoticeFa(check.reasonFa);
      return;
    }
    setExportNoticeFa(`خروجی تجمیعی مجاز (${toPersianNum(dist.uniqueEntityCount)} نمونه، شناسه ${snap.dataSnapshotId}) در حال ثبت در سرور...`);
    const apiRes = await defaultAnalyticsApiClient.requestAnalyticalDatasetExport({
      placeId: selectedNeighborhoodId || snap.geography.placeId, metricCode: snap.metricCode,
      sampleCount: dist.count, uniqueEntityCount: dist.uniqueEntityCount,
      datasetClassification: 'PUBLIC', callerRole, dataSnapshotId: snap.dataSnapshotId,
    });
    setExportResult(apiRes);
    setExportNoticeFa(
      apiRes.ok && apiRes.exportId
        ? `خروجی تجمیعی مجاز (${toPersianNum(dist.uniqueEntityCount)} نمونه، شناسه ${apiRes.exportId}) آماده دانلود از سرور شد.`
        : apiRes.status === 'DENIED'
          ? (apiRes.reasonFa ?? check.reasonFa)
          : `خروجی تجمیعی مجاز (${toPersianNum(dist.uniqueEntityCount)} نمونه، شناسه ${snap.dataSnapshotId}) آماده دریافت شد.`,
    );
  };

  const handleCreateResearchAnalysis = async () => {
    if (!selectedNeighborhoodId) return;
    const res = await defaultAnalyticsApiClient.createResearchWorkspaceAnalysis({
      titleFa: `تحلیل توزیع قیمت پیشنهادی ${selectedNeighborhoodNameFa}`,
      researchQuestionFa: `بررسی میانه و دامنه میان‌چارکی قیمت در ${selectedNeighborhoodNameFa}`,
      datasetVersions: [snap.dataSnapshotId || 'UNAVAILABLE'], metricCodes: [snap.metricCode],
      methodologyVersions: [snap.methodologyVersion], placeIds: [selectedNeighborhoodId], boundaryVersion: snap.geography.boundaryVersion,
    });
    if (res.ok && res.analysis) {
      setServerAnalyses((prev) => [res.analysis!, ...prev]);
      setResearchNoticeFa(`تحلیل پژوهشی با هش بازتولیدپذیر ${res.analysis.reproducibleHash} در سرور ثبت شد.`);
    } else {
      setResearchNoticeFa(res.errorFa || 'امکان ثبت تحلیل در سرور وجود نداشت.');
    }
  };

  return (
    <section data-testid="analytics-and-research-workspace" className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] space-y-4 text-xs" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-[var(--color-brand-600)]" />
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
              key={sh.id} type="button" role="tab" aria-selected={activeShell === sh.id}
              data-testid={`analytics-shell-tab-${sh.id.toLowerCase()}`}
              onClick={() => setActiveShell(sh.id as AnalyticsAudienceShell)}
              className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer ${activeShell === sh.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-[var(--color-bg-muted)] text-slate-700 dark:text-[var(--color-text-secondary)]'}`}
            >
              {sh.label}
            </button>
          ))}
        </div>
      </div>

      <div data-testid="analytics-temporal-provenance-bar" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] text-[11px]">
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-[var(--color-text-secondary)]">
          <Clock className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
          <span>زمان مشاهده بازار (Observed): <strong dir="ltr">{snap.observedAt || 'ثبت‌نشده (UNKNOWN)'}</strong></span>
          <span>· زمان محاسبه (Computed): <strong dir="ltr">{snap.computedAt ? snap.computedAt.slice(0, 19) : '—'}</strong></span>
        </span>
        <span data-testid="analytics-freshness-badge" className="px-2 py-0.5 rounded bg-slate-200 dark:bg-[var(--color-bg-elevated)] font-bold">
          وضعیت تازگی: {snap.freshnessStatus || 'UNKNOWN'}
        </span>
      </div>

      {!dist || snap.value === null ? (
        <div data-testid="analytics-no-data-state" className="p-4 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-1 text-slate-700 dark:text-[var(--color-text-secondary)]">
          <strong className="font-bold text-slate-900 dark:text-white block">
            داده تحلیلی معتبر برای «{selectedNeighborhoodNameFa}» هنوز در دسترس نیست (UNAVAILABLE)
          </strong>
          <p className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)]">
            برای این محله هنوز آگهی زنده تاییدشده یا توزیع صدک‌های قیمت در مخزن تحلیلی ثبت نشده است؛ داده ساختگی یا داده محله‌های دیگر جایگزین نمی‌شود.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="analytics-core-data-products">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>محصول داده ۱: شاخص قیمت پیشنهادی (IQR)</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                {snap.dataOrigin === 'SIMULATED' ? 'شبیه‌سازی' : snap.sufficiencyStatus}
              </span>
            </div>
            <strong className="text-base font-bold text-slate-900 dark:text-white block tabular-nums">
              میانه (P50): {toPersianNum(uMetric(dist.median))} میلیون تومان / {areaLbl}{fxNote(dist.median)}
            </strong>
            <div className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)] tabular-nums">
              صدک ۱۰ (P10): {toPersianNum(uMetric(dist.p10))} · صدک ۲۵ (P25): {toPersianNum(uMetric(dist.p25))} · صدک ۷۵ (P75): {toPersianNum(uMetric(dist.p75))} · صدک ۹۰ (P90): {toPersianNum(uMetric(dist.p90))}
            </div>
            <div className="text-[10.5px] text-slate-500">
              دامنه میان‌چارکی (IQR): {toPersianNum(uMetric(dist.iqr))} · پالایش پرت: {toPersianNum(dist.trimmedOutlierCount)} رکورد
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-1.5">
            <div className="text-[11px] text-slate-500">محصول داده ۲: شاخص عرضه و مقایسه متقارن دوره‌ای</div>
            <strong className="text-base font-bold text-slate-900 dark:text-white block tabular-nums">
              {snap.dataOrigin === 'SIMULATED' ? `۰ نمونه زنده (${toPersianNum(dist.count)} نقطه شبیه‌سازی)` : `${toPersianNum(dist.uniqueEntityCount)} نمونه زنده محلی`}
            </strong>
            <div className="text-[11px] text-amber-700 dark:text-amber-300 font-bold tabular-nums">
              {periodComparison && periodComparison.computable ? `تغییر: ${toPersianNum(periodComparison.changePercent!)}٪` : 'داده کافی برای مقایسه با دوره قبل وجود ندارد.'}
            </div>
            <div className="text-[10.5px] text-slate-500">نسخه مرز مکانی: {snap.geography.boundaryVersion}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-1.5">
            <div className="text-[11px] text-slate-500">محصول داده ۳: نمایه مکانی نسخه‌بندی‌شده (SCD Type 2)</div>
            <strong className="text-sm font-bold text-slate-900 dark:text-white block">
              {selectedNeighborhoodNameFa} ({snap.geography.boundaryVersion})
            </strong>
            <div className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)]">
              اسنپ‌شات مرجع: <code className="font-mono">{snap.dataSnapshotId}</code> · روش v{toPersianNum(snap.methodologyVersion)}
            </div>
            <button type="button" data-testid="btn-export-analytical-slice" onClick={handleRequestExport} className="mt-1 px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold text-[11px] cursor-pointer">
              دریافت خروجی تجمیعی مجاز (کنترل k-Anonymity)
            </button>
          </div>
        </div>
      )}

      {exportNoticeFa && (
        <div data-testid="analytics-export-notice" className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 dark:text-emerald-200 font-bold flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{exportNoticeFa}</span></span>
          {exportResult?.ok && exportResult.downloadUrl && (
            <a href={exportResult.downloadUrl} download={`analytics-export-${exportResult.exportId}.json`} data-testid="analytics-export-download-link" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-[11px]">
              <Download className="w-3.5 h-3.5" /> دانلود فایل خروجی ({exportResult.exportId})
            </a>
          )}
        </div>
      )}

      {activeShell === 'PROFESSIONAL_WORKSPACE' && (
        <div data-testid="professional-metric-registry-panel" className="p-3.5 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2">
          <strong className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>دفتر رسمی شاخص‌ها (Official Metric Registry) و لایه معنایی واحد:</span>
          </strong>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {localBundle.metricsRegistry.map((m) => (
              <div key={m.id} className="p-2.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-bold text-slate-900 dark:text-white">{m.displayNameFa}</strong>
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[var(--color-bg-muted)]">{m.metricCode}</code>
                </div>
                <div className="text-[10.5px] text-slate-500">مفهوم مالی: <strong>{m.financialConcept}</strong> · دانه (Grain): {m.grain} · روش v{toPersianNum(m.methodologyVersion)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeShell === 'RESEARCH_WORKSPACE' && (
        <div data-testid="reproducible-research-workspace-panel" className="p-3.5 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Microscope className="w-4 h-4 text-[var(--color-brand-600)]" />
              <span>محیط پژوهش بازتولیدپذیر (متصل به مرجع Backend):</span>
            </strong>
            <button type="button" data-testid="btn-create-research-analysis" onClick={handleCreateResearchAnalysis} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold text-[11px] cursor-pointer">
              <PlusCircle className="w-3.5 h-3.5" /> ثبت تحلیل بازتولیدپذیر در سرور
            </button>
          </div>
          {researchNoticeFa && <div data-testid="research-workspace-notice" className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{researchNoticeFa}</div>}
          {savedAnalyses.length === 0 ? (
            <p className="text-[11px] text-slate-500">گزارش پژوهشی ثبت‌شده در سرور برای «{selectedNeighborhoodNameFa}» یافت نشد (داده‌های نمونه نمایشی غیرفعال‌اند).</p>
          ) : (
            savedAnalyses.map((ana) => (
              <div key={ana.analysisId} className="p-3 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-bold text-slate-900 dark:text-white">{ana.titleFa}</strong>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[10px]">{ana.reproducibleHash}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)]">پرسش پژوهش: {ana.researchQuestionFa}</p>
                <div className="text-[10.5px] text-slate-500 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> اسنپ‌شات داده: {ana.datasetVersions.join(', ')}</span>
                  <span>· شاخص‌ها: {ana.metricCodes.join(', ')}</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-[var(--color-brand-600)]" /> مرز: {ana.geographicScope.boundaryVersion}</span>
                </div>
                <p className="text-[11px] font-bold text-slate-800 dark:text-[var(--color-text-primary)] pt-1">{ana.outputSummaryFa}</p>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};
