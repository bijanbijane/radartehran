/**
 * @file src/components/AdminCloudAiCommerceCenter.tsx
 * @description پنل مدیریت ← مرکز هوش مصنوعی (AI Gateway & Model Control) و
 * پنل مدیریت ← تجارت داده و درآمدزایی (Data Commerce, MCP & x402 Simulator).
 *
 * Enforces mandatory visible banners:
 * - `SIMULATED — NOT A REAL AI RESPONSE`
 * - `SIMULATION — NO REAL PAYMENT OR SETTLEMENT`
 */
import React, { useState, useEffect, useCallback } from 'react'; import { Bot, Coins, Layers, RotateCcw, Search, ShieldAlert } from 'lucide-react'; import { auth } from '../firebase'; import { toPersianNum } from '../data/neighborhoods';
import { MANDATORY_AI_SIMULATION_BANNER, OFFICIAL_AI_MODEL_REGISTRY, type RadarAiWorkflowId, } from '../utils/aiModelRegistryAndGateway'; import { MANDATORY_PAYMENT_SIMULATION_BANNER,
  RADAR_COMMERCIAL_PRODUCTS, } from '../utils/dataCommerceMcpAndMonetization'; import { AdminMcpAndPortabilitySandboxPanel } from './AdminMcpAndPortabilitySandboxPanel'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

const WORKFLOW_LABELS_FA: Record<RadarAiWorkflowId, string> = { intelligent_search: 'جست‌وجوی هوشمند فارسی (Intelligent Search)', contract_legal_analysis: 'تحلیل حقوقی قولنامه و اجاره‌نامه', valuation_explanation: 'توضیح متنی خروجی موتور قطعی هدانیک',
  data_extraction: 'استخراج ساختاریافته مشخصات ملک', market_assistant: 'دستیار تحلیلی شاخص‌های محلات رادار', };

export function AdminCloudAiCommerceCenter(): React.ReactElement { const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [radarLocale] = useRadarLocale(); const fxTag = (millionVal: number) => (intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(millionVal, intlCurrency, radarLocale)})` : ''); const [routingVersion, setRoutingVersion] = useState<number>(1); const [routes, setRoutes] = useState<Record<RadarAiWorkflowId, string>>({ intelligent_search: 'gemini-2.5-flash',
    contract_legal_analysis: 'gemini-2.5-flash', valuation_explanation: 'gemini-2.5-flash', data_extraction: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', market_assistant: 'gemini-2.5-flash',
  }); const [statusMsg, setStatusMsg] = useState<string | null>(null); const [searchSample, setSearchSample] = useState<string>('آپارتمان در منطقه ۵ تا ۱۴۰ میلیون با رشد مثبت'); const [searchTestResult, setSearchTestResult] = useState<any | null>(null);
  const [paymentSimResult, setPaymentSimResult] = useState<any | null>(null); const [rmepSummary, setRmepSummary] = useState<any | null>(null); const [cloudflareAndPortability, setCloudflareAndPortability] = useState<any | null>(null); const [monetizationSummary, setMonetizationSummary] = useState<any | null>(null);
  const [aiRoutingAuditTrail, setAiRoutingAuditTrail] = useState<any[]>([]);

  const getAdminHeaders = async (): Promise<Record<string, string>> => { const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchControlCenterState = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/architecture-and-ai-registry', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.aiRouting?.routes) {
          setRoutes(data.aiRouting.routes);
          setRoutingVersion(Number(data.aiRouting.version || 1));
        }
        if (data?.rmepExecutionSummary) {
          setRmepSummary(data.rmepExecutionSummary);
        }
        if (data?.cloudflareAndPortability) {
          setCloudflareAndPortability(data.cloudflareAndPortability);
        }
        if (data?.monetizationSummary) {
          setMonetizationSummary(data.monetizationSummary);
        }
        if (Array.isArray(data?.aiRoutingAuditTrail)) {
          setAiRoutingAuditTrail(data.aiRoutingAuditTrail);
        }
      }
    } catch {
      // Ignore network error in offline preview
    }
  }, []);

  useEffect(() => { void fetchControlCenterState(); const unsub = typeof auth.onAuthStateChanged === 'function' ? auth.onAuthStateChanged((u) => { if (u) void fetchControlCenterState(); }) : undefined; return () => { if (typeof unsub === 'function') unsub(); }; }, [fetchControlCenterState]);

  const handleSaveRouting = async () => {
    setStatusMsg(null);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/ai-routing', {
        method: 'POST',
        headers,
        body: JSON.stringify({ routes }),
      });
      const data = await res.json();
      if (res.ok && data?.aiRouting) {
        setRoutingVersion(data.aiRouting.version);
        if (Array.isArray(data.aiRoutingAuditTrail)) {
          setAiRoutingAuditTrail(data.aiRoutingAuditTrail);
        }
        setStatusMsg(`مسیریابی مدل‌ها در سرور ذخیره شد (نسخه v${toPersianNum(data.aiRouting.version)})`);
      } else {
        setStatusMsg(data?.message || 'خطا در ذخیره مسیریابی در سرور');
      }
    } catch {
      setStatusMsg('خطا در ارتباط با سرور برای ذخیره مسیریابی');
    }
  };

  const handleRollbackRouting = async () => {
    setStatusMsg(null);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch('/api/admin/ai-routing/rollback', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (res.ok && data?.aiRouting) {
        setRoutes(data.aiRouting.routes);
        setRoutingVersion(data.aiRouting.version);
        if (Array.isArray(data.aiRoutingAuditTrail)) {
          setAiRoutingAuditTrail(data.aiRoutingAuditTrail);
        }
        setStatusMsg(`بازگشت (Rollback) به نسخه قبلی انجام شد (v${toPersianNum(data.aiRouting.version)})`);
      } else {
        setStatusMsg(data?.message || 'نسخه قبلی برای بازگشت یافت نشد.');
      }
    } catch {
      setStatusMsg('خطا در اجرای Rollback');
    }
  };

  const handleRunSearchSimulation = async () => {
    try {
      const res = await fetch('/api/v1/ai/intelligent-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchSample }),
      });
      const data = await res.json();
      setSearchTestResult(data);
    } catch {
      setSearchTestResult(null);
    }
  };

  const handleRunPaymentSimulation = async (productId: string) => {
    try {
      const res = await fetch(
        `/api/v1/commerce/neighborhood-index?dataset=${encodeURIComponent(productId)}&simulate=1`
      );
      const data = await res.json();
      setPaymentSimResult(data);
      fetchControlCenterState();
    } catch {
      setPaymentSimResult(null);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-2xl p-4 space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[var(--color-border-strong)] pb-2.5">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-[var(--color-brand-600)] dark:text-emerald-400" />
          <div>
            <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] text-sm">
              مرکز هوش مصنوعی (AI Gateway) و تجارت داده و درآمدزایی (Data Commerce & x402)
            </div>
            <div className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)]">
              معماری Cloudflare-First · Portable-by-Design · نسخه مسیریابی فعال سرور: v{toPersianNum(routingVersion)}
              {rmepSummary?.programId && (
                <span className="mr-2 text-emerald-700 dark:text-emerald-400 font-bold">
                  · {rmepSummary.programId} ({rmepSummary.programStatus} · SHA256:{' '}
                  {rmepSummary.masterPromptVerified ? 'VERIFIED' : 'PENDING'})
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRollbackRouting}
            className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>بازگشت به نسخه قبل (Rollback)</span>
          </button>
          <button
            type="button"
            onClick={handleSaveRouting}
            className="px-3 py-1.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold cursor-pointer"
          >
            ذخیره مسیریابی در سرور
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold">
          {statusMsg}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* AI Model Routing */}
        <div className="bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-3 space-y-2.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>مسیریابی مدل‌های هوش مصنوعی به تفکیک جریان کاری</span>
          </div>
          {(Object.keys(WORKFLOW_LABELS_FA) as RadarAiWorkflowId[]).map((wf) => (
            <div key={wf} className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-[var(--color-border-subtle)] last:border-0">
              <span className="font-bold text-slate-700 dark:text-[var(--color-text-primary)]">{WORKFLOW_LABELS_FA[wf]}</span>
              <select aria-label={`انتخاب مدل هوش مصنوعی برای ${WORKFLOW_LABELS_FA[wf]}`}
                value={routes[wf]}
                onChange={(e) => setRoutes((prev) => ({ ...prev, [wf]: e.target.value }))}
                className="bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg px-2 py-1 text-[11px] font-mono text-slate-800 dark:text-[var(--color-text-primary)]"
              >
                {OFFICIAL_AI_MODEL_REGISTRY.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.modelId} ({m.provider})
                  </option>
                ))}
              </select>
            </div>
          ))}
          {/* Controlled AI Search Test */}
          <div className="pt-2 border-t border-slate-200 dark:border-[var(--color-border-strong)] space-y-2">
            <div className="font-bold text-slate-800 dark:text-[var(--color-text-primary)] flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400" />
              <span>تست کنترل‌شده تبدیل جست‌وجوی فارسی به کوئری ساختاریافته:</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text" aria-label="نمونه متن جست‌وجوی فارسی جهت تبدیل به کوئری ساختاریافته"
                value={searchSample}
                onChange={(e) => setSearchSample(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-[var(--color-text-primary)]"
              />
              <button
                type="button"
                onClick={handleRunSearchSimulation}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold cursor-pointer shrink-0"
              >
                تست کوئری
              </button>
            </div>
            {searchTestResult?.structuredQuery && (
              <div className="p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-1">
                <div className="font-mono font-bold text-[10px] text-amber-900 dark:text-amber-300 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>{searchTestResult.structuredQuery.simulationBanner || MANDATORY_AI_SIMULATION_BANNER}</span>
                </div>
                <div className="text-[11px] text-slate-800 dark:text-[var(--color-text-primary)]">
                  شهر: <strong>{searchTestResult.structuredQuery.cityId}</strong> · منطقه:{' '}
                  <strong>{searchTestResult.structuredQuery.targetZone ?? 'همه'}</strong> · سقف {areaUnit === 'sqft' ? 'ft²' : 'متری'}:{' '}
                  <strong>{searchTestResult.structuredQuery.maxBuyPerSqmMillions ? `${toPersianNum(convertPricePerSqmToUnit(searchTestResult.structuredQuery.maxBuyPerSqmMillions, areaUnit))} ${areaUnit === 'sqft' ? 'م/ft²' : 'م'} (کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((searchTestResult.structuredQuery.maxBuyPerSqmMillions * 80) / 1000).toFixed(1))} میلیارد)${fxTag(convertPricePerSqmToUnit(searchTestResult.structuredQuery.maxBuyPerSqmMillions, areaUnit))}` : 'نامحدود'}</strong> · محلات منطبق:{' '}
                  <strong>{toPersianNum(searchTestResult.matchedCount || 0)} محله</strong>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Commercial Data & x402 Simulator */}
        <div className="bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] rounded-xl p-3 space-y-2.5">
          <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)] flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>کاتالوگ محصولات داده تجاری، MCP و شبیه‌ساز x402</span>
          </div>
          <div className="space-y-2">
            {RADAR_COMMERCIAL_PRODUCTS.map((prod) => (
              <div key={prod.productId} className="p-2 rounded-lg bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 dark:text-[var(--color-text-primary)]">{prod.titleFa}</div>
                  <div className="text-[10.5px] text-slate-500 dark:text-[var(--color-text-muted)]">
                    کد محصول: <code className="font-mono">{prod.productId}</code> · تعرفه هر درخواست:{' '}
                    <strong>{toPersianNum(prod.pricePerRequestToman)} تومان{fxTag(prod.pricePerRequestToman / 1_000_000)}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRunPaymentSimulation(prod.productId)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] cursor-pointer shrink-0"
                >
                  تست شبیه‌ساز x402
                </button>
              </div>
            ))}
          </div>
          {paymentSimResult?.simulation && (
            <div className="p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-1">
              <div className="font-mono font-bold text-[10px] text-amber-900 dark:text-amber-300 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{paymentSimResult.simulation.simulationBanner || MANDATORY_PAYMENT_SIMULATION_BANNER}</span>
              </div>
              <div className="text-[11px] text-slate-800 dark:text-[var(--color-text-primary)]">
                محصول: <code className="font-mono">{paymentSimResult.simulation.productId}</code> · مبلغ شبیه‌سازی:{' '}
                <strong>{toPersianNum(paymentSimResult.simulation.simulatedAmountToman)} تومان{fxTag(Number(paymentSimResult.simulation.simulatedAmountToman || 0) / 1_000_000)}</strong> · درآمد واقعی ثبت‌شده:{' '}
                <strong>۰ تومان (تفکیک کامل از حسابداری واقعی)</strong>
              </div>
            </div>
          )}
        </div>
      </div>
      <AdminMcpAndPortabilitySandboxPanel
        cloudflareAndPortability={cloudflareAndPortability}
        monetizationSummary={monetizationSummary}
        aiRoutingAuditTrail={aiRoutingAuditTrail}
      />
    </div>
  );
}