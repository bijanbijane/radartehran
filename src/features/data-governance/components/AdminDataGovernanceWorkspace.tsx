/**
 * RT-UI-DATA-GOV-001 (§18) & RT-UI-ANALYTICS-001 (§14.4) |
 * Admin Data Governance, Source Registry, Conflict Resolution, Lineage & Analytics Pipeline Center
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, GitMerge, Layers, Play, Scale, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import { defaultDataGovernanceEngine } from '../services/dataGovernanceEngine';
import { defaultAnalyticsPlatformEngine } from '../../analytics/services/analyticsPlatformEngine';
import { defaultAnalyticsApiClient } from '../../analytics/services/analyticsApiClient';
import type { DataPipelineRecord, PredictiveModelRegistryEntry } from '../../analytics/models/analytics.types';

export const AdminDataGovernanceWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SOURCES' | 'CONFLICTS' | 'LINEAGE' | 'PIPELINES'>('OVERVIEW');
  const [sources, setSources] = useState(() => defaultDataGovernanceEngine.getSources());
  const [conflicts, setConflicts] = useState(() => defaultDataGovernanceEngine.getReconciliationCases());
  const [claims] = useState(() => defaultDataGovernanceEngine.getClaims());
  const [versions, setVersions] = useState(() => defaultDataGovernanceEngine.getEntityVersions());
  const [resolutionReason, setResolutionReason] = useState('تطبیق با سند پالایش‌شده و گواهی پایان کار');
  const [feedbackFa, setFeedbackFa] = useState<string | null>(null);

  const analyticsBundle = defaultAnalyticsPlatformEngine.getOverviewBundle(null, 142);
  const [serverPipelines, setServerPipelines] = useState<DataPipelineRecord[]>(() => analyticsBundle.pipelines);
  const [serverModels, setServerModels] = useState<PredictiveModelRegistryEntry[]>(() => analyticsBundle.modelRegistry);

  useEffect(() => {
    let active = true;
    defaultAnalyticsApiClient
      .fetchResearchWorkspaceBundle(null)
      .then((res) => {
        if (active && res.authoritySource === 'BACKEND_API') {
          setServerPipelines(res.pipelines);
          setServerModels(res.modelRegistry);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const registeredEntityCount = new Set(versions.map((v) => v.entityId)).size;
  const restrictedSourceCount = sources.filter((s) => s.usagePolicy.displayAllowed === false).length;

  const handleTriggerPipeline = async (pipelineId: string) => {
    const res = await defaultAnalyticsApiClient.triggerAdminPipelineRun(pipelineId);
    setFeedbackFa(res.messageFa);
    if (res.ok && res.pipeline) {
      setServerPipelines((prev) => prev.map((p) => (p.id === pipelineId ? res.pipeline! : p)));
    }
  };

  const handleResolveConflict = (caseId: string, val: number) => {
    const res = defaultDataGovernanceEngine.resolveConflictCase({
      caseId, reviewerId: 'steward-senior-1', resolutionValue: val,
      resolutionReasonFa: resolutionReason, isAutomatedAttempt: false,
    });
    if (!res.ok) {
      setFeedbackFa(res.errorFa || 'خطا در ثبت تصمیم حل تعارض');
      return;
    }
    setConflicts([...defaultDataGovernanceEngine.getReconciliationCases()]);
    setVersions([...defaultDataGovernanceEngine.getEntityVersions()]);
    setFeedbackFa(`پرونده تعارض «${caseId}» با ثبت دلیل مستند حل شد و نسخه مرجع جدید ایجاد گردید.`);
  };

  const handleSuspendSource = (sourceId: string) => {
    const res = defaultDataGovernanceEngine.transitionSourceStatus(
      sourceId, 'SUSPENDED', 'Data Governance Admin', 'تعلیق موقت جهت بازبینی مجوز بازنشر و تطبیق ساختار',
    );
    if (res.ok) {
      setSources([...defaultDataGovernanceEngine.getSources()]);
      setFeedbackFa(`منبع «${sourceId}» به وضعیت SUSPENDED تغییر یافت (${toPersianNum(res.impactedClaimIds?.length || 0)} ادعای وابسته شناسایی شد).`);
    }
  };

  return (
    <section data-testid="admin-data-governance-workspace" className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Database className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>مرکز حاکمیت داده، دفتر ثبت منابع (Source Registry) و سکوی پایش تحلیلی</span>
          </strong>
          <p className="text-[11px] text-slate-500 mt-0.5">
            تفکیک اعتبار منبع، کیفیت رکورد، سطح اطمینان ادعا (Confidence)، مجوز استفاده و پایش Pipelineهای تحلیلی
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="بخش‌های حاکمیت داده">
          {[
            { id: 'OVERVIEW', label: 'نمای کلی کیفیت' },
            { id: 'SOURCES', label: `دفتر منابع (${toPersianNum(sources.length)})` },
            { id: 'CONFLICTS', label: `تعارض و ادعاها (${toPersianNum(conflicts.length)})` },
            { id: 'LINEAGE', label: `نسخه‌ها و منشأ (${toPersianNum(versions.length)})` },
            { id: 'PIPELINES', label: 'Pipeline و مدل‌های تحلیلی' },
          ].map((tab) => (
            <button
              key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id}
              data-testid={`dgov-tab-${tab.id.toLowerCase()}`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer ${activeTab === tab.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedbackFa && (
        <div data-testid="dgov-admin-feedback" className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackFa}</span>
        </div>
      )}

      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="dgov-overview-kpis">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500">موجودیت‌های دارای زنجیره منشأ (Provenance)</div>
            <strong className="text-base font-black text-emerald-700 dark:text-emerald-400 block mt-0.5 tabular-nums">
              {toPersianNum(registeredEntityCount)} موجودیت ({toPersianNum(versions.length)} نسخه)
            </strong>
            <span className="text-[10.5px] text-slate-500">محاسبه از دفتر نسخه‌ها و زنجیره منشأ ثبت‌شده</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500">منابع ثبت‌شده فعال و مجاز</div>
            <strong className="text-base font-black text-slate-900 dark:text-white block mt-0.5 tabular-nums">
              {toPersianNum(sources.filter((s) => s.status === 'ACTIVE' || s.status === 'RESTRICTED').length)} از {toPersianNum(sources.length)} منبع
            </strong>
            <span className="text-[10.5px] text-slate-500">ارزیابی اعتبار به تفکیک حوزه</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500">پرونده‌های تعارض در صف بررسی</div>
            <strong className="text-base font-black text-amber-700 dark:text-amber-400 block mt-0.5 tabular-nums">
              {toPersianNum(conflicts.filter((c) => c.status !== 'RESOLVED').length)} پرونده
            </strong>
            <span className="text-[10.5px] text-slate-500">حل خودکار برای متراژ/مرز/معامله ممنوع است</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500">منابع با محدودیت انتشار خام (Rights)</div>
            <strong className="text-base font-black text-emerald-700 dark:text-emerald-400 block mt-0.5 tabular-nums">
              {toPersianNum(restrictedSourceCount)} از {toPersianNum(sources.length)} منبع
            </strong>
            <span className="text-[10.5px] text-slate-500">منع انتشار داده خام منابع تحلیلی محدود</span>
          </div>
        </div>
      )}

      {activeTab === 'SOURCES' && (
        <div className="space-y-2.5" data-testid="dgov-sources-list">
          {sources.map((src) => (
            <div key={src.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-slate-900 dark:text-white font-black">{src.nameFa}</strong>
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-bold text-[10.5px]">{src.sourceType}</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold text-[10.5px]">وضعیت: {src.status}</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold text-[10.5px]">مجوز: {src.usagePolicy.status}</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  سازمان: {src.organizationFa} · مسئول: <strong>{src.owner}</strong> · روش دریافت: {src.collectionMethod}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {src.domainReliability.map((dr) => (
                    <span key={dr.domain} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px]">
                      {dr.domain}: <strong>{dr.level}</strong> ({dr.rationaleFa})
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => handleSuspendSource(src.id)} className="px-2.5 py-1 rounded-lg border border-amber-500 text-amber-700 dark:text-amber-300 font-bold cursor-pointer">
                تعلیق / بازبینی مجوز
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'CONFLICTS' && (
        <div className="space-y-3" data-testid="dgov-conflicts-queue">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="dgov-res-reason" className="font-bold text-slate-700 dark:text-slate-200">
              دلیل مستند حل تعارض (الزامی برای ثبت تصمیم):
            </label>
            <input
              id="dgov-res-reason" type="text" value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              className="flex-1 min-w-[240px] p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          {conflicts.map((c) => (
            <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-amber-600" />
                  <strong className="font-black text-slate-900 dark:text-white">
                    پرونده {c.id} · موجودیت: {c.entityId} · ویژگی: {c.attribute}
                  </strong>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10.5px]">{c.status} · شدت: {c.severity}</span>
                </div>
                <button type="button" data-testid={`btn-resolve-conflict-${c.id}`} onClick={() => handleResolveConflict(c.id, 105)} className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
                  تایید مقدار ۱۰۵ مترمربع (شاهد قراردادی)
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {claims.filter((cl) => c.claimIds.includes(cl.id)).map((cl) => (
                  <div key={cl.id} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <div className="font-bold text-slate-800 dark:text-slate-100">ادعای {cl.id}: مقدار {toPersianNum(cl.value)} {cl.unit} ({cl.verificationStatus})</div>
                    <div className="text-[10.5px] text-slate-500">منبع: {cl.sourceId} · مشاهده (Valid): {cl.observedAt.slice(0, 10)} · ثبت (System): {cl.recordedAt.slice(0, 10)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'LINEAGE' && (
        <div className="space-y-2" data-testid="dgov-versions-list">
          {versions.map((v) => (
            <div key={v.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  <GitMerge className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
                  <span>{v.entityId} · {v.attribute} (نسخه {toPersianNum(v.versionNumber)})</span>
                </strong>
                <div className="text-[11px] text-slate-500">مقدار: <strong>{toPersianNum(v.value)}</strong> · نسخه داده: {v.dataVersion} · نسخه روش: v{v.methodologyVersion} · تغییر: {v.changeType}</div>
              </div>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">{v.changeReasonFa}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'PIPELINES' && (
        <div className="space-y-3" data-testid="dgov-analytics-pipelines">
          {serverPipelines.length === 0 ? (
            <div data-testid="dgov-pipelines-empty" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              هیچ Pipeline عملیاتی از سرور دریافت نشد (رکوردهای نمونه آزمایشی در محیط عملیاتی غیرفعال شده‌اند).
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {serverPipelines.map((p) => (
                <div key={p.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>{p.titleFa}</span></strong>
                    <button type="button" data-testid={`btn-run-pipeline-${p.id}`} onClick={() => handleTriggerPipeline(p.id)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-brand-600)] text-white font-bold text-[10.5px] cursor-pointer">
                      <Play className="w-3 h-3" /> اجرا ({p.status})
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">رکورد پردازش‌شده: {toPersianNum(p.recordsProcessed)} · خطا: {toPersianNum(p.failedRecords)} · هزینه: {toPersianNum(p.actualCostUnits)} واحد</div>
                </div>
              ))}
            </div>
          )}
          {serverModels.map((m) => (
            <div key={m.modelId} className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="font-black text-slate-900 dark:text-white flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)]" /><span>رجیستری مدل تحلیلی: {m.modelNameFa} (v{toPersianNum(m.version)})</span></strong>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">خطای MAPE: {toPersianNum(m.mapePercent)}٪ · عدم‌قطعیت: ±{toPersianNum(m.uncertaintyBandPercent)}٪ · Drift: {m.dataDriftStatus}</div>
              </div>
              <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-[10.5px] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> نیازمند نظارت انسانی</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
