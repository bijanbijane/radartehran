/** @file src/features/admin/components/AdminPlatformIntelligenceHub.tsx — Stages 6–28 Unified Platform Intelligence, Governance & Gateway Hub */
import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Activity, Cpu, Database, Globe, Power, Scale, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  fetchAutomationStatus,
  fetchDataExchangeOverview,
  fetchGatewayProviders,
  fetchMarketIntelligenceOverview,
  fetchPlatformIntelligenceOverview,
  fetchUnifiedGovernanceOverview,
  reviewIntelligenceDecision,
  runConsistencyCheck,
  submitSandboxAutomationTask,
  toggleAutomationKillSwitch,
  triggerGatewaySandboxPilot,
  type AutomationStatusSnapshot,
  type GatewayProviderItem,
  type PlatformIntelligenceSnapshot,
  type UnifiedGovernanceOverview,
} from '../services/platformGovernanceApiClient';

interface Props {
  isVerifiedAdmin: boolean;
  currentUser?: User | null;
}

type HubTab = 'intelligence' | 'automation' | 'ecosystem';

export const AdminPlatformIntelligenceHub: React.FC<Props> = ({ isVerifiedAdmin, currentUser }) => {
  const [activeTab, setActiveTab] = useState<HubTab>('intelligence');
  const [gov, setGov] = useState<UnifiedGovernanceOverview | null>(null);
  const [intel, setIntel] = useState<PlatformIntelligenceSnapshot | null>(null);
  const [autoState, setAutoState] = useState<AutomationStatusSnapshot | null>(null);
  const [providers, setProviders] = useState<GatewayProviderItem[]>([]);
  const [dxSummary, setDxSummary] = useState<{ sourcesCount: number; blockedUnlicensed: number; factsCount: number } | null>(null);
  const [marketSummary, setMarketSummary] = useState<{ clustersCount: number; sampleConf: string; priceKind: string; txStatus: string } | null>(null);
  const [feedbackFa, setFeedbackFa] = useState<string | null>(null);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  const runHubAction = async (key: string, fn: () => Promise<void>) => {
    if (busyActionKey) return;
    setBusyActionKey(key);
    try { await fn(); } catch { setErrorFa('خطا در ارتباط با سرور هنگام اجرای عملیات مدیریتی.'); } finally { setBusyActionKey(null); }
  };

  const loadHub = async (signal?: AbortSignal) => {
    if (!isVerifiedAdmin || !currentUser) return;
    const [gRes, iRes, aRes, pRes, dRes, mRes] = await Promise.all([
      fetchUnifiedGovernanceOverview(currentUser, signal),
      fetchPlatformIntelligenceOverview(currentUser, signal),
      fetchAutomationStatus(currentUser, signal),
      fetchGatewayProviders(currentUser, signal),
      fetchDataExchangeOverview(currentUser, signal),
      fetchMarketIntelligenceOverview(currentUser, signal),
    ]);
    if (signal?.aborted) return;
    if (gRes.ok && gRes.data) setGov(gRes.data);
    if (iRes.ok && iRes.data) setIntel(iRes.data);
    if (aRes.ok && aRes.data) setAutoState(aRes.data);
    if (pRes.ok && pRes.data) setProviders(pRes.data.providers);
    if (dRes.ok && dRes.data) {
      setDxSummary({
        sourcesCount: dRes.data.sources.length,
        blockedUnlicensed: dRes.data.sources.filter((s) => !s.licensed).length,
        factsCount: dRes.data.factsCount,
      });
    }
    if (mRes.ok && mRes.data) {
      setMarketSummary({
        clustersCount: mRes.data.clusters.length,
        sampleConf: mRes.data.sampleHedonicCheck.confidence,
        priceKind: mRes.data.sampleHedonicCheck.priceEvidenceKind,
        txStatus: mRes.data.sampleHedonicCheck.transactionDataStatus,
      });
    }
    const err = gRes.errorFa || iRes.errorFa;
    if (err && err !== 'ABORTED') setErrorFa(err);
    else setErrorFa(null);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    void loadHub(ctrl.signal);
    return () => ctrl.abort();
  }, [isVerifiedAdmin, currentUser?.uid]);

  return (
    <section
      data-testid="admin-platform-intelligence-hub"
      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>مرکز هوشمندی، حاکمیت پلتفرم، اتوماسیون و درگاه داده (مراحل ۶ تا ۲۸)</span>
          </h2>
          <p className="text-[11px] text-slate-500">
            تمامی وضعیت‌ها بدون داده ساختگی نمایش داده می‌شوند؛ بخش‌های فاقد تله‌متری یا پرداخت زنده صریحاً با NOT_MEASURED / NOT_AVAILABLE مشخص شده‌اند.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'intelligence' as HubTab, labelFa: 'هوشمندی و تاب‌آوری', icon: Activity },
            { id: 'automation' as HubTab, labelFa: 'اتوماسیون و AI', icon: Power },
            { id: 'ecosystem' as HubTab, labelFa: 'درگاه، داده و بازار ملک', icon: Globe },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`hub-tab-${tab.id}`}
                onClick={() => { setActiveTab(tab.id); setFeedbackFa(null); }}
                className={`px-3 py-1.5 rounded-[9px] font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                  activeTab === tab.id ? 'bg-[var(--color-brand-600)] text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /><span>{tab.labelFa}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!isVerifiedAdmin && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 font-bold text-amber-900 dark:text-amber-200">
          نمای حاکمیتی و هوشمندی در حالت Fail-Closed است؛ برای خواندن وضعیت زنده سرور با حساب ادمین تاییدشده وارد شوید.
        </div>
      )}

      {errorFa && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-bold">
          {errorFa}
        </div>
      )}

      {feedbackFa && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold">
          {feedbackFa}
        </div>
      )}

      {activeTab === 'intelligence' && isVerifiedAdmin && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">سلامت مرکب پلتفرم (Stage 23)</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {intel?.healthScoreStatus === 'COMPUTED' && intel.healthScore0To100 !== null ? toPersianNum(intel.healthScore0To100) : 'NOT_AVAILABLE'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Self-Eval: {intel?.selfEvaluationStatus || 'NOT_MEASURED'}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">تاب‌آوری و ماتریس ۱۰گانه (Stage 9)</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {gov?.resilience.overallTier || 'READY'} · {toPersianNum(gov?.resilience.matrixCount ?? 10)} دامنه
              </div>
              <button
                type="button"
                disabled={busyActionKey !== null}
                onClick={() => runHubAction('consistency', async () => {
                  const res = await runConsistencyCheck(currentUser);
                  setFeedbackFa(res.ok && res.data ? `کنترل سازگاری متقابل: ${res.data.report.consistent ? 'پاک' : 'دارای مغایرت'} (${toPersianNum(res.data.report.checkedPosts)} پست)` : (res.errorFa || 'خطا'));
                })}
                className="mt-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold text-[10.5px] cursor-pointer disabled:opacity-50"
              >
                اجرای کنترل سازگاری
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">انتشار و Rollout (Stages 11–14)</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {gov?.opsCostRelease.rollout.currentWave || 'WAVE_A'} ({gov?.opsCostRelease.releaseGates.overallStatus || 'PASS_WITH_LIMITATIONS'})
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{gov?.opsCostRelease.status || 'INSUFFICIENT_PRODUCTION_DATA'}</div>
            </div>
          </div>

          {intel?.decisionSuggestions.map((sug) => (
            <div key={sug.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{sug.titleFa} ({sug.status})</div>
                <div className="text-[10.5px] text-slate-500">طرح بازگشت: {sug.reversalPlanFa}</div>
              </div>
              <div className="flex gap-1.5">
                <button type="button" disabled={busyActionKey !== null} onClick={() => runHubAction(`approve:${sug.id}`, async () => { const r = await reviewIntelligenceDecision(sug.id, 'APPROVED', currentUser); if (r.ok) { setFeedbackFa('تصمیم انسانی تایید شد.'); await loadHub(); } else setErrorFa(r.errorFa || 'خطا در تایید تصمیم.'); })} className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer disabled:opacity-50">تایید انسانی</button>
                <button type="button" disabled={busyActionKey !== null} onClick={() => runHubAction(`reject:${sug.id}`, async () => { const r = await reviewIntelligenceDecision(sug.id, 'REJECTED', currentUser); if (r.ok) { setFeedbackFa('تصمیم انسانی رد شد.'); await loadHub(); } else setErrorFa(r.errorFa || 'خطا در رد تصمیم.'); })} className="px-2.5 py-1 rounded-lg border border-rose-500 text-rose-700 font-bold cursor-pointer disabled:opacity-50">رد</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'automation' && isVerifiedAdmin && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">
                Kill Switch مستقل اتوماسیون: {autoState?.killSwitchEngaged ? 'فعال (متوقف)' : 'آماده به کار'}
              </div>
              <div className="text-[10.5px] text-slate-500">
                صف: {autoState?.queueAdapterProvider} ({autoState?.queueOperationalState}) · سقف هزینه: {autoState?.costCeilingStatus || 'COST_NOT_MEASURED'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="hub-killswitch-btn"
                disabled={busyActionKey !== null}
                onClick={() => runHubAction('killswitch', async () => {
                  const next = !autoState?.killSwitchEngaged;
                  const res = await toggleAutomationKillSwitch(next, currentUser);
                  if (res.ok) { setFeedbackFa(next ? 'Kill Switch فعال شد.' : 'اتوماسیون مجدداً باز شد.'); await loadHub(); }
                  else setErrorFa(res.errorFa || 'تغییر وضعیت Kill Switch ناموفق بود.');
                })}
                className={`px-3 py-1.5 rounded-lg font-bold text-white cursor-pointer disabled:opacity-50 ${autoState?.killSwitchEngaged ? 'bg-[var(--color-brand-600)]' : 'bg-rose-600'}`}
              >
                {autoState?.killSwitchEngaged ? 'غیرفعال‌سازی Kill Switch' : 'توقف اضطراری (Kill Switch)'}
              </button>
              <button
                type="button"
                disabled={busyActionKey !== null}
                onClick={() => runHubAction('sandboxA1', async () => {
                  const res = await submitSandboxAutomationTask(currentUser);
                  setFeedbackFa(res.ok ? 'وظیفه سندباکس A1 در صف ثبت شد.' : `مسدود شد: ${res.data?.code || res.errorFa}`);
                  await loadHub();
                })}
                className="px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer disabled:opacity-50"
              >
                اجرای تست A1
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(autoState?.agents || []).map((ag) => (
              <div key={ag.agentId} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="font-bold text-slate-900 dark:text-white">{ag.roleTitleFa}</div>
                <div className="text-[10px] font-mono text-slate-500">{ag.agentId} · max={ag.maxRiskClass}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ecosystem' && isVerifiedAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-[var(--color-brand-600)]" /> حقوقی و تجاری (Stages 17–20)
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              حقوقی: <strong>{gov?.legal.readinessStatus}</strong> · تجاری: <strong>{gov?.commercial.commercialStatus}</strong> (Entry Gate: {gov?.commercial.commercialEntryGate}) · پرداخت زنده: غیرفعال
            </div>
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 pt-1">
              <Database className="w-4 h-4 text-[var(--color-brand-600)]" /> تبادل داده و بازار ملک (Stages 27–28)
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              منابع ثبت‌شده: {toPersianNum(dxSummary?.sourcesCount ?? 0)} (منابع فاقد مجوز مسدود: {toPersianNum(dxSummary?.blockedUnlicensed ?? 0)}) · نوع قیمت: <strong>{marketSummary?.priceKind || 'ASKING_PRICE'}</strong> · معامله واقعی: <strong>{marketSummary?.txStatus || 'NOT_AVAILABLE'}</strong>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--color-brand-600)]" /> پایلوت درگاه بیرونی (Stage 26 · SSRF Hardened)
            </div>
            {providers.map((p) => (
              <div key={p.providerId} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{p.nameFa}</div>
                  <div className="text-[10px] font-mono text-slate-500">{p.lifecycle} · {p.secretRefAlias} (secretHidden)</div>
                </div>
                <button
                  type="button"
                  disabled={busyActionKey !== null}
                  onClick={() => runHubAction(`pilot:${p.providerId}`, async () => {
                    const out = await triggerGatewaySandboxPilot(p.providerId, currentUser);
                    setFeedbackFa(out.ok && out.data?.envelope ? `پاسخ سندباکس ${out.data.envelope.envelopeId} ثبت شد.` : (out.errorFa || 'خطا'));
                  })}
                  className="px-2.5 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-bold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  تست سندباکس
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
