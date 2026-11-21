import React, { useState } from 'react'; import { Cpu, Database, Play, Server, ShieldCheck } from 'lucide-react'; import { toPersianNum } from '../data/neighborhoods'; import type { CityId } from '../data/multiCityData'; import { MANDATORY_PAYMENT_SIMULATION_BANNER, type AuthorizedMcpToolName } from '../utils/dataCommerceMcpAndMonetization'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { NumericDraftInput } from './ui/NumericDraftInput'; import { AdminUnifiedControlPlanePanel } from './admin/AdminUnifiedControlPlanePanel'; interface AdminMcpAndPortabilitySandboxPanelProps { cloudflareAndPortability: any | null; monetizationSummary: any | null; aiRoutingAuditTrail: any[]; }

const MCP_TOOLS_SPEC: ReadonlyArray<{ id: AuthorizedMcpToolName; labelFa: string; descFa: string; }> = [ { id: 'compute_hedonic_valuation', labelFa: 'ارزش‌گذاری قطعی هدانیک (compute_hedonic_valuation)', descFa: 'فراخوانی مستقیم موتور قطعی هدانیک (FAST_SALE_FACTOR=0.95) بدون دخالت LLM در محاسبه عدد.', }, { id: 'get_neighborhood_statistics', labelFa: 'شاخص آماری محله (get_neighborhood_statistics)', descFa: 'دریافت قیمت خرید، رهن ۸۰ متری، امتیاز امنیت و مترو برای محله انتخاب‌شده (Zero PII).', }, { id: 'search_approved_market_data', labelFa: 'فیلتر محلات بر اساس سقف بودجه (search_approved_market_data)', descFa: 'جست‌وجوی محلات مجاز بر اساس سقف قیمت هر متر مربع در کلان‌شهر انتخابی.', }, { id: 'compare_market_indicators', labelFa: 'مقایسه دو محله (compare_market_indicators)', descFa: 'محاسبه اختلاف قیمت خرید و رهن میان دو محله منتخب.', }, ];
export function AdminMcpAndPortabilitySandboxPanel({ cloudflareAndPortability, monetizationSummary, aiRoutingAuditTrail, }: AdminMcpAndPortabilitySandboxPanelProps): React.ReactElement { const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const [selectedTool, setSelectedTool] = useState<AuthorizedMcpToolName>('compute_hedonic_valuation'); const [city, setCity] = useState<CityId>('tehran'); const [hoodId, setHoodId] = useState<number>(1); const [secondHoodId, setSecondHoodId] = useState<number>(2); const [sqm, setSqm] = useState<number>(90); const [buildingAge, setBuildingAge] = useState<number>(4); const [maxBuyPerSqm, setMaxBuyPerSqm] = useState<number>(160); const [mcpResult, setMcpResult] = useState<any | null>(null); const [isExecuting, setIsExecuting] = useState<boolean>(false); const [aiWorkflow, setAiWorkflow] = useState<string>('valuation_explanation'); const [aiGatewayResult, setAiGatewayResult] = useState<any | null>(null);
  const [isRunningAiGateway, setIsRunningAiGateway] = useState<boolean>(false); const [dossierResult, setDossierResult] = useState<any | null>(null); const [isRunningDossier, setIsRunningDossier] = useState<boolean>(false); const handleRunMcpTool = async () => { setIsExecuting(true); try { const res = await fetch('/api/v1/mcp/execute', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolName: selectedTool, args: { city, hoodId, firstHoodId: hoodId, secondHoodId, sqm, buildingAge, maxBuyPerSqm, hasElevator: true, hasParking: true, hasStorage: true, }, }), }); const data = await res.json(); setMcpResult(data); } catch {
      setMcpResult({ status: 'error', message: 'خطا در ارتباط با وب‌سرویس /api/v1/mcp/execute', }); } finally { setIsExecuting(false); } };
  const handleRunAiGatewayInfer = async () => { setIsRunningAiGateway(true); try { const res = await fetch('/api/ai/gateway/infer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow: aiWorkflow,
          city, hoodId, sqm, buildingAge, prompt: `تحلیل تخصصی بازار مسکن برای محله #${hoodId} در ${city}`, }), });
      const data = await res.json(); setAiGatewayResult(data); } catch {
      setAiGatewayResult({ status: 'error', message: 'خطا در ارتباط با وب‌سرویس /api/ai/gateway/infer' });
    } finally { setIsRunningAiGateway(false); } };
  const handleTestNeighborhoodDossier = async (simulate: boolean) => {
    setIsRunningDossier(true);
    try {
      const url = `/api/v1/commerce/neighborhood-dossier/${hoodId}?city=${encodeURIComponent(city)}${simulate ? '&simulate=1' : ''}`;
      const res = await fetch(url); const paymentHeader = res.headers.get('PAYMENT-REQUIRED'); const data = await res.json();
      setDossierResult({ httpStatus: res.status, paymentHeaderPresent: Boolean(paymentHeader), payload: data });
    } catch { setDossierResult({ httpStatus: 500, payload: { status: 'error', message: 'خطا در فراخوانی پرونده محله x402' } });
    } finally { setIsRunningDossier(false); } }; return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
      {/* Interactive MCP Read-Only Tool Sandbox */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>سندباکس تست ابزارهای مجاز MCP (`/api/v1/mcp/execute`)</span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold">
            Read-Only · Zero PII
          </span>
        </div>
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              انتخاب ابزار مجاز پروتکل MCP:
            </label>
            <select aria-label="انتخاب ابزار مجاز پروتکل MCP"
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value as AuthorizedMcpToolName)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-800 dark:text-slate-100"
            >
              {MCP_TOOLS_SPEC.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.labelFa}
                </option>
              ))}
            </select>
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1">
              {MCP_TOOLS_SPEC.find((t) => t.id === selectedTool)?.descFa}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">کلان‌شهر</label>
              <select aria-label="انتخاب کلان‌شهر MCP"
                value={city}
                onChange={(e) => setCity(e.target.value as CityId)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-900 dark:text-slate-100"
              >
                <option value="tehran">تهران</option>
                <option value="karaj">کرج</option>
                <option value="mashhad">مشهد</option>
                <option value="isfahan">اصفهان</option>
                <option value="shiraz">شیراز</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">شناسه محله اول</label>
              <NumericDraftInput
                aria-label="شناسه محله اول MCP"
                min={1}
                max={999}
                fallback={1}
                value={hoodId}
                onValueChange={setHoodId}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-900 dark:text-slate-100 tabular-nums"
              />
            </div>
            {selectedTool === 'compute_hedonic_valuation' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">متراژ ({formatAreaUnitLabel(areaUnit)}: {formatAreaShort(sqm, areaUnit)})</label>
                  <NumericDraftInput
                    aria-label="متراژ ملک MCP"
                    min={25}
                    max={1000}
                    fallback={90}
                    value={sqm}
                    onValueChange={setSqm}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">سن بنا (سال)</label>
                  <NumericDraftInput
                    aria-label="سن بنا MCP"
                    min={0}
                    max={50}
                    fallback={4}
                    value={buildingAge}
                    onValueChange={setBuildingAge}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
              </>
            )}
            {selectedTool === 'search_approved_market_data' && (
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                  سقف قیمت هر متر (میلیون تومان · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((maxBuyPerSqm * 80) / 1000).toFixed(1))} میلیارد{areaUnit === 'sqft' ? ` ≈ ${toPersianNum(convertPricePerSqmToUnit(maxBuyPerSqm, 'sqft'))} م/ft²` : ''}{intlCurrency !== 'IRT' ? ` / ${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(maxBuyPerSqm, areaUnit), intlCurrency, locale)}` : ''})
                </label>
                <NumericDraftInput
                  aria-label="سقف قیمت هر متر MCP"
                  min={20}
                  max={900}
                  fallback={160}
                  value={maxBuyPerSqm}
                  onValueChange={setMaxBuyPerSqm}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>
            )}
            {selectedTool === 'compare_market_indicators' && (
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">شناسه محله دوم</label>
                <NumericDraftInput
                  aria-label="شناسه محله دوم MCP"
                  min={1}
                  max={999}
                  fallback={2}
                  value={secondHoodId}
                  onValueChange={setSecondHoodId}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleRunMcpTool}
            disabled={isExecuting}
            className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isExecuting ? 'در حال اجرای ابزار MCP...' : 'اجرای ابزار MCP و بررسی Provenance'}</span>
          </button>
          {mcpResult && (
            <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 space-y-1 text-[10.5px]">
              <div className="flex flex-wrap items-center justify-between gap-1 text-emerald-400 font-mono">
                <span>Tool: {mcpResult.toolName || selectedTool}</span>
                <span>Provenance: {mcpResult.provenance || 'Verified'}</span>
              </div>
              <pre
                dir="ltr"
                className="overflow-x-auto max-h-36 text-[10px] font-mono text-slate-200 bg-slate-950/80 p-2 rounded border border-slate-800"
              >
                {JSON.stringify(mcpResult.result ?? mcpResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
      {/* Cloudflare Runtime Portability & Production vs Simulation Ledger + AI Gateway & Dossier Sandbox */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2.5">
        <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Server className="w-4 h-4 text-[var(--color-brand-600)] dark:text-emerald-400" />
          <span>دفتر کل تفکیک حسابداری (Production vs Simulation) و پرتابلیتی Cloudflare</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
            <div className="text-[10.5px] font-bold text-emerald-900 dark:text-emerald-200">دفتر کل درآمد واقعی (Production)</div>
            <div className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 mt-0.5">
              {toPersianNum(monetizationSummary?.productionLedger?.actualSettledRevenueToman ?? 0)} تومان{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency((monetizationSummary?.productionLedger?.actualSettledRevenueToman ?? 0) / 1_000_000, intlCurrency, locale)})` : ''}
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
              تراکنش‌های تسویه‌شده واقعی:{' '}
              {toPersianNum(monetizationSummary?.productionLedger?.confirmedSettlementsCount ?? 0)} مورد
            </div>
          </div>
          <div className="p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
            <div className="text-[10.5px] font-bold text-amber-900 dark:text-amber-200">دفتر کل شبیه‌سازی (Simulation)</div>
            <div className="text-xs font-extrabold text-amber-800 dark:text-amber-300 mt-0.5">
              {toPersianNum(monetizationSummary?.simulationLedger?.simulatedTransactionsCount ?? 0)} تست شبیه‌سازی (۰ تومان{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(0, intlCurrency, locale)}` : ''})
            </div>
            <div className="text-[9.5px] font-mono text-amber-800 dark:text-amber-400 truncate">
              {MANDATORY_PAYMENT_SIMULATION_BANNER}
            </div>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 text-[11px]">
          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-1">
            <span>تست مسیریاب چندمدلی AI Gateway (`/api/ai/gateway/infer`)</span>
            <select aria-label="انتخاب جریان کاری AI Gateway"
              value={aiWorkflow}
              onChange={(e) => setAiWorkflow(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-900 dark:text-slate-100"
            >
              <option value="valuation_explanation">تبیین ارزش‌گذاری هدانیک</option>
              <option value="intelligent_search">جست‌وجوی هوشمند</option>
              <option value="contract_legal_analysis">تحلیل حقوقی قرارداد</option>
              <option value="data_extraction">استخراج ساختاریافته</option>
              <option value="market_assistant">دستیار بازار</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={handleRunAiGatewayInfer} disabled={isRunningAiGateway} className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[10.5px] font-bold cursor-pointer">
              {isRunningAiGateway ? 'در حال استنتاج...' : 'تست استنتاج AI Gateway'}
            </button>
            <button type="button" onClick={() => handleTestNeighborhoodDossier(false)} disabled={isRunningDossier} className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold cursor-pointer">
              تست چالش ۴۰۲ پرونده محله
            </button>
            <button type="button" onClick={() => handleTestNeighborhoodDossier(true)} disabled={isRunningDossier} className="px-2 py-1 rounded-md bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer">
              تست شبیه‌سازی پرونده (`?simulate=1`)
            </button>
          </div>
          {aiGatewayResult && (
            <div className="p-2 rounded bg-slate-900 text-slate-100 text-[10px] font-mono space-y-0.5" dir="ltr">
              <div className="text-amber-300">{aiGatewayResult.simulationBanner || 'LIVE_PROVIDER'}</div>
              <div>Model: {aiGatewayResult.routedModelId} | Engine: {aiGatewayResult.resolvedEngineId}</div>
            </div>
          )} {dossierResult && (
            <div className="p-2 rounded bg-slate-900 text-slate-100 text-[10px] font-mono space-y-0.5" dir="ltr">
              <div className="text-emerald-300">HTTP {dossierResult.httpStatus} · PAYMENT-REQUIRED Header: {String(dossierResult.paymentHeaderPresent)}</div>
              {dossierResult.payload?.simulationBanner && <div className="text-amber-300">{dossierResult.payload.simulationBanner}</div>}
            </div>
          )} </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-[11px]">
          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-brand-600)] dark:text-emerald-400" />
            <span>وضعیت پرتابلیتی چندابر (Portable-by-Design):</span>
          </div>
          <div className="text-slate-600 dark:text-slate-300">
            حالت اجرای فعلی:{' '} <code className="font-mono font-bold text-slate-800 dark:text-slate-100">
              {cloudflareAndPortability?.runtimeMode || 'PORTABLE_NODE_AND_EDGE_HYBRID'} </code>{' '} · وابستگی قفل‌شده به ارائه‌دهنده واحد: <strong>صفر (Zero Vendor Lock-in)</strong>
          </div>
        </div>
        {aiRoutingAuditTrail.length > 0 && (
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-[11px]">
              <Database className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              <span>آخرین رخدادهای ممیزی تغییر مسیریابی AI Gateway:</span>
            </div>
            <div className="max-h-20 overflow-y-auto space-y-1 text-[10px] text-slate-600 dark:text-slate-300">
              {aiRoutingAuditTrail.slice(0, 3).map((item, idx) => ( <div key={idx} className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-700 pb-0.5">
                  <span>
                    نسخه v{toPersianNum(item.version || 1)} توسط <code className="font-mono">{item.actorEmail}</code>
                  </span>
                  <span className="font-mono text-[9.5px] text-slate-400">
                    {String(item.updatedAtIso || '').slice(11, 19)} </span>
                </div>
              ))} </div>
          </div>
        )} </div>
      <div className="lg:col-span-2"><AdminUnifiedControlPlanePanel /></div>
    </div>
  ); }