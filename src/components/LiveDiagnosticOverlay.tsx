import React, { useState, useEffect, useCallback } from 'react'; import { Activity, AlertTriangle, Bug, CheckCircle2, ChevronDown, ChevronUp, Play, RefreshCw, ShieldCheck, Trash2, X, XCircle, } from 'lucide-react'; import { INITIAL_NEIGHBORHOODS, getNeighborhoodMarketReport, getNeighborhoodTrafficInfo, toPersianNum, } from '../data/neighborhoods';
import { MULTI_CITY_CONFIGS, calculateOfficialCommissionAndNotary } from '../data/multiCityData'; import { calculateHedonicValuation, FAST_SALE_FACTOR } from '../data/hedonicPricingEngine'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { isMarketPulseData } from '../types/typeGuards'; import { DEFAULT_FEATURE_FLAGS, loadValidatedFeatureFlags, safeLocalStorageGet,
  safeLocalStorageRemove, safeLocalStorageSet, sanitizeInput, } from '../utils/security'; import { convertPricePerSqmToUnit, formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; export interface CaughtDiagnosticError { id: string; category: 'RENDER' | 'PROMISE' | 'WINDOW' | 'FETCH' | 'STATE'; fileOrFunction: string; message: string; timestampFa: string; }
export interface AutoTestResultItem { id: string; name: string; target: string; status: 'PASS' | 'FAIL'; reason: string; durationMs: number; }
const IGNORED_ERROR_PATTERNS = [
  'ResizeObserver', 'WebSocket', 'AbortError', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', ]; export function isIgnoredNoiseError(msg: string): boolean { const text = String(msg || '').trim(); if (!text) return true;
  return IGNORED_ERROR_PATTERNS.some((p) => text.toLowerCase().includes(p.toLowerCase())); }
export function extractFileAndFunctionFromStack(stack?: string, fallbackSource = 'global/runtime'): string { if (!stack || typeof stack !== 'string') return fallbackSource; const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.includes('LiveDiagnosticOverlay') && !l.includes('DualLayerErrorTrap') && !l.includes('node_modules')); for (const line of lines) { const matchWithFn = line.match(/at\s+([^\s(]+)\s+\((?:.*\/)?([^/?#)]+)(?:\?[^)]*)?:(\d+):(\d+)\)/);
    if (matchWithFn) return `${matchWithFn[2]} → ${matchWithFn[1]}() (L${matchWithFn[3]})`;
    const matchDirect = line.match(/(?:at\s+)?(?:.*\/)?([^/?#\s()]+\.(?:tsx?|jsx?|js))(?:\?[^:]*)?:(\d+):(\d+)/);
    if (matchDirect) return `${matchDirect[1]} (L${matchDirect[2]})`;
  }
  return fallbackSource; }
const errorSubscribers = new Set<(items: CaughtDiagnosticError[]) => void>(); let caughtErrorsStore: CaughtDiagnosticError[] = []; export function pushCaughtDiagnosticError(
  category: CaughtDiagnosticError['category'],
  message: string,
  fileOrFunction: string
): void {
  const cleanMsg = sanitizeInput(String(message || 'Unknown error'), 320);
  if (isIgnoredNoiseError(cleanMsg)) return;
  const timestampFa = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const item: CaughtDiagnosticError = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    fileOrFunction: sanitizeInput(fileOrFunction || 'runtime', 140),
    message: cleanMsg,
    timestampFa,
  };
  caughtErrorsStore = [item, ...caughtErrorsStore].slice(0, 40);
  errorSubscribers.forEach((cb) => cb(caughtErrorsStore));
}
export function clearCaughtDiagnosticErrors(): void {
  caughtErrorsStore = [];
  if (typeof window !== 'undefined') (window as any).__unhandledErrorsFound = false;
  errorSubscribers.forEach((cb) => cb(caughtErrorsStore));
}
export function LiveDiagnosticOverlay(props?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }): React.ReactElement {
  const [hookAreaUnit] = useAreaUnit(); const [hookIntlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const areaUnit = props?.areaUnit ?? hookAreaUnit; const intlCurrency = props?.intlCurrency ?? hookIntlCurrency; const sampleUnitBuy = convertPricePerSqmToUnit(INITIAL_NEIGHBORHOODS[0]?.buyPerSqm || 120, areaUnit); const sampleUnitDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(INITIAL_NEIGHBORHOODS[0]?.id || 1, INITIAL_NEIGHBORHOODS[0]?.name || 'تهران', INITIAL_NEIGHBORHOODS[0]?.buyPerSqm || 120, []).estimatedDealPricePerSqm, areaUnit);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => { try { return localStorage.getItem('radar_hide_dev_overlay') !== 'false'; } catch { return true; } });
  const [activeTab, setActiveTab] = useState<'autotest' | 'errors'>('autotest');
  const [errors, setErrors] = useState<CaughtDiagnosticError[]>(() => caughtErrorsStore);
  const [testResults, setTestResults] = useState<AutoTestResultItem[]>([]);
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [lastRunTimeFa, setLastRunTimeFa] = useState<string>('');
  useEffect(() => { const l = (items: CaughtDiagnosticError[]) => setErrors([...items]); errorSubscribers.add(l); return () => { errorSubscribers.delete(l); }; }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleErr = (e: ErrorEvent) => { if (e?.target && e.target !== window) return; const m = e?.error?.message || e?.message || ''; if (!isIgnoredNoiseError(m)) pushCaughtDiagnosticError('WINDOW', m, extractFileAndFunctionFromStack(e?.error?.stack, e?.filename ? `${e.filename.split('/').pop()}:${e.lineno || 0}` : 'window.onerror')); };
    const handleRej = (e: PromiseRejectionEvent) => { const r = e?.reason; const m = r instanceof Error ? r.message : typeof r === 'string' ? r : JSON.stringify(r || ''); if (!isIgnoredNoiseError(m)) pushCaughtDiagnosticError('PROMISE', m, extractFileAndFunctionFromStack(r instanceof Error ? r.stack : undefined, 'Promise.unhandledrejection')); };
    window.addEventListener('error', handleErr); window.addEventListener('unhandledrejection', handleRej);
    return () => { window.removeEventListener('error', handleErr); window.removeEventListener('unhandledrejection', handleRej); };
  }, []);
  const runLiveAutoTests = useCallback(async () => {
    setIsRunningTests(true);
    setActiveTab('autotest');
    const results: AutoTestResultItem[] = [];
    const recordTest = (id: string, name: string, target: string, passed: boolean, reason: string, startMs: number) => {
      if (!passed) pushCaughtDiagnosticError('STATE', reason, target);
      results.push({ id, name, target, status: passed ? 'PASS' : 'FAIL', reason, durationMs: Math.max(1, Math.round(performance.now() - startMs)) });
    };
    let t0 = performance.now();
    try {
      const cities = Object.keys(MULTI_CITY_CONFIGS);
      const validTehran = INITIAL_NEIGHBORHOODS.length >= 80 && INITIAL_NEIGHBORHOODS.every(
        (h) => Number.isFinite(h.buyPerSqm) && h.buyPerSqm > 0 && Number.isFinite(h.rahn80m) && h.rahn80m > 0 && Number.isFinite(h.lat) && Number.isFinite(h.lng)
      );
      const validMultiCity = validTehran && cities.length >= 5;
      recordTest('data-integrity', '1. Neighborhood & Multi-City Dataset State', 'src/data/neighborhoods.ts → INITIAL_NEIGHBORHOODS', validMultiCity,
        validMultiCity ? `PASS: ${INITIAL_NEIGHBORHOODS.length} Tehran hoods & ${cities.length} cities valid (no undefined/NaN)` : 'FAIL: Invalid or NaN neighborhood coordinates/prices', t0);
    } catch (e: any) {
      recordTest('data-integrity', '1. Neighborhood & Multi-City Dataset State', 'src/data/neighborhoods.ts', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const val = calculateHedonicValuation({
        neighborhood: INITIAL_NEIGHBORHOODS[0], sqm: 95, buildYear: 1403, renovationStatus: 'luxury_renovated',
        floor: 3, totalFloors: 5, hasElevator: true, hasParking: true, hasStorage: true,
      });
      const ok = FAST_SALE_FACTOR === 0.88 && Number.isFinite(val.hedonicPerSqm) && val.hedonicTotalMillion > 0 && val.fastSaleTotalMillion < val.hedonicTotalMillion;
      recordTest('hedonic-engine', '2. Hedonic Valuation Engine', 'src/data/hedonicPricingEngine.ts → calculateHedonicValuation()', ok,
        ok ? `PASS (${formatAreaShort(95, areaUnit)}): Fair=${val.hedonicTotalMillion}M, FastSale=${val.fastSaleTotalMillion}M (Factor=${FAST_SALE_FACTOR})` : 'FAIL: Hedonic calculation returned NaN or invalid factor', t0);
    } catch (e: any) {
      recordTest('hedonic-engine', '2. Hedonic Valuation Engine', 'src/data/hedonicPricingEngine.ts', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const { calculateDetailedValuation, calculatePropertyTaxes } = await import('../data/superModulesLogic');
      const s = INITIAL_NEIGHBORHOODS[0];
      const evalHood = { ...s, baseBuyPerSqm: s.buyPerSqm, status: 'green' as const, diffPercent: 0, distKm: 4, overallScore: 8.5, marketReport: getNeighborhoodMarketReport(s), trafficInfo: getNeighborhoodTrafficInfo(s) };
      const detailed = calculateDetailedValuation({ hood: evalHood, sqm: 85, age: 4, floor: 2, bedrooms: 2, deedType: 'single_deed', parkingType: 'dedicated', hasElevator: true, hasStorage: true, renovation: 'renovated', light: 'south' });
      const comm = calculateOfficialCommissionAndNotary({ dealType: 'buy', buyTotalMillion: 10000, depositMillion: 0, monthlyRentMillion: 0 });
      const tax = calculatePropertyTaxes({ monthlyRentMillion: 25, rahnMillion: 500, sqm: 110, city: 'tehran', qualifiesForAreaExemption: true });
      const ok = detailed.fairTotalMillion > 0 && comm.baseCommissionEachSideToman === 26_250_000 && tax.isAreaExempt === true;
      recordTest('supermodules-calc', '3. SuperModules & Legal Calculators', 'src/data/superModulesLogic.ts → calculateDetailedValuation()', ok,
        ok ? `PASS: Valuation=${detailed.fairTotalMillion}M, Commission=${comm.baseCommissionEachSideToman}T, TaxExempt=${tax.isAreaExempt}` : 'FAIL: Calculator output mismatch', t0);
    } catch (e: any) {
      recordTest('supermodules-calc', '3. SuperModules & Legal Calculators', 'src/data/superModulesLogic.ts', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const { runClient100StepAudit } = await import('../data/diagnosticRunner');
      const report = runClient100StepAudit(areaUnit, intlCurrency);
      const failed = report.steps.filter((s) => s.status === 'FAIL');
      recordTest('audit-100-steps', '4. 100-Step Domain & Security Audit', 'src/data/diagnosticRunner.ts → runClient100StepAudit()', report.allPassed,
        report.allPassed ? `PASS: ${report.totalPassed}/${report.totalSteps} checks passed in ${report.elapsedMs}ms` : `FAIL: ${failed.length} failed (${failed.map((f) => `#${f.step} ${f.name}`).join(', ')})`, t0);
    } catch (e: any) {
      recordTest('audit-100-steps', '4. 100-Step Domain & Security Audit', 'src/data/diagnosticRunner.ts', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const testKey = 'tehran_radar_autotest_probe';
      safeLocalStorageSet(testKey, { probe: 'ok_1' });
      const readBack = safeLocalStorageGet<{ probe?: string } | null>(testKey, null);
      safeLocalStorageRemove(testKey);
      const flags = loadValidatedFeatureFlags('tehran_radar_feature_flags_v2');
      const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS);
      const ok = (readBack?.probe === 'ok_1' || readBack === null) && flagKeys.length === 24 && typeof flags.enableMultiCity === 'boolean';
      recordTest('storage-flags', '5. LocalStorage & 24 Feature Flags', 'src/utils/security.ts → loadValidatedFeatureFlags()', ok,
        ok ? `PASS: LocalStorage="${readBack?.probe || 'sandboxed'}" & ${flagKeys.length}/24 FeatureFlags validated` : 'FAIL: FeatureFlags validation failed', t0);
    } catch (e: any) {
      recordTest('storage-flags', '5. LocalStorage & 24 Feature Flags', 'src/utils/security.ts', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const hasLeaflet = typeof window !== 'undefined' && Boolean((window as any).L);
      const mapEl = typeof document !== 'undefined' ? document.querySelector('.leaflet-container') as HTMLElement | null : null;
      const rect = mapEl?.getBoundingClientRect();
      const mapVisible = Boolean(rect && rect.width > 50 && rect.height > 50);
      const ok = hasLeaflet && mapVisible;
      recordTest('leaflet-dom', '6. Leaflet Map & UI Viewport Presence', 'src/components/useLeafletRadarMap.ts → L.map()', ok,
        ok ? `PASS: window.L active, map rendered (${Math.round(rect?.width || 0)}×${Math.round(rect?.height || 0)}px)` : `FAIL: Leaflet=${hasLeaflet}, MapDOMVisible=${mapVisible}`, t0);
    } catch (e: any) {
      recordTest('leaflet-dom', '6. Leaflet Map & UI Viewport Presence', 'src/components/useLeafletRadarMap.ts', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const res = await fetch('/api/market-pulse?city=tehran', { cache: 'no-store' });
      const data: unknown = res.ok ? await res.json() : null;
      const validSchema = isMarketPulseData(data);
      recordTest('api-market-pulse', '7. API Connection: /api/market-pulse', 'server.ts → GET /api/market-pulse?city=tehran', res.ok && validSchema,
        res.ok && validSchema ? `PASS: HTTP ${res.status} · AQI=${(data as any).airQuality?.tehranAverageAqi}, Snapshots=${(data as any).hoodLiveSnapshots?.length || 0}` : `FAIL: HTTP ${res.status}, schemaValid=${validSchema}`, t0);
    } catch (e: any) {
      recordTest('api-market-pulse', '7. API Connection: /api/market-pulse', 'server.ts → GET /api/market-pulse', false, `FAIL: ${e?.message}`, t0);
    }
    t0 = performance.now();
    try {
      const [airRes, storageRes] = await Promise.all([
        fetch('/api/air-quality?city=tehran', { cache: 'no-store' }),
        fetch('/api/object-storage/status', { cache: 'no-store' }),
      ]);
      const airJson: any = airRes.ok ? await airRes.json() : null;
      const storageJson: any = storageRes.ok ? await storageRes.json() : null;
      const storageProviderLabel = storageJson?.provider || storageJson?.providerLabelFa;
      const ok = airRes.ok && storageRes.ok && Boolean(airJson?.status === 'ok') && Boolean(storageProviderLabel);
      recordTest('api-health-storage', '8. API Connection: Air Quality & Object Storage', 'server.ts → /api/air-quality & /api/object-storage/status', ok,
        ok ? `PASS: AirAPI=${airJson.status} (${airJson.sourceStatus}), Storage=${storageProviderLabel}` : `FAIL: Air=${airRes.status}, Storage=${storageRes.status}`, t0);
    } catch (e: any) {
      recordTest('api-health-storage', '8. API Connection: Air Quality & Object Storage', 'server.ts', false, `FAIL: ${e?.message}`, t0);
    }
    setTestResults(results);
    setLastRunTimeFa(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setIsRunningTests(false);
  }, []);
  const passedCount = testResults.filter((r) => r.status === 'PASS').length;
  const failedCount = testResults.filter((r) => r.status === 'FAIL').length;
  if (isDismissed && errors.length === 0) {
    return (
      <button
        type="button"
        onClick={() => { setIsDismissed(false); try { localStorage.setItem('radar_hide_dev_overlay', 'false'); } catch {} }}
        className="fixed bottom-3 left-3 z-[95] w-6 h-6 rounded-full bg-slate-900/30 hover:bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center opacity-25 hover:opacity-100 transition cursor-pointer"
        title="دیباگر سیستم"
        aria-label="دیباگر سیستم"
      >
        <Bug className="w-3 h-3" />
      </button>
    );
  }
  return (
    <div dir="rtl" className="fixed bottom-[148px] lg:bottom-3 left-3 z-[95] max-w-[95vw] sm:max-w-xl font-sans select-none">
      {!isOpen ? (
        <div className="flex items-center gap-1.5 bg-slate-900/95 text-white px-3 py-2 rounded-2xl shadow-2xl border border-slate-700/90 backdrop-blur-md text-xs">
          <button type="button" onClick={() => setIsOpen(true)} className="flex items-center gap-2 font-extrabold cursor-pointer hover:text-emerald-300 transition">
            <Bug className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>دیباگر زنده</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${errors.length > 0 ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{toPersianNum(errors.length)} خطا</span>
            {testResults.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${failedCount === 0 ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'}`}>
                {failedCount === 0 ? `PASS (${toPersianNum(passedCount)}/${toPersianNum(testResults.length)})` : `FAIL (${toPersianNum(failedCount)})`}
              </span>
            )}
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button type="button" onClick={() => { setIsOpen(true); void runLiveAutoTests(); }} className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer transition">
            <Play className="w-3 h-3" /><span>Run Auto-Test</span>
          </button>
          <button type="button" onClick={() => { setIsDismissed(true); try { localStorage.setItem('radar_hide_dev_overlay', 'true'); } catch {} }} className="p-1 text-slate-400 hover:text-white cursor-pointer ml-1" title="پنهان‌سازی" aria-label="پنهان‌سازی">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-[92vw] sm:w-[540px] bg-slate-900/98 dark:bg-slate-900/98 text-slate-100 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-700 dark:border-slate-700 overflow-hidden backdrop-blur-xl text-xs">
          <div className="px-3.5 py-2.5 bg-slate-950 dark:bg-slate-950 border-b border-slate-800 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-extrabold text-white">پنل دیباگ زنده و تست خودکار (Live Self-Diagnostic)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => void runLiveAutoTests()} disabled={isRunningTests} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50 transition">
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
                <span>{isRunningTests ? 'در حال تست...' : 'Run Auto-Test'}</span>
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer" title="جمع کردن پنل دیباگ" aria-label="جمع کردن پنل دیباگ">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1.5 bg-slate-950/60 border-b border-slate-800 text-[11px] font-bold">
            <button type="button" onClick={() => setActiveTab('autotest')} className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition ${activeTab === 'autotest' ? 'bg-emerald-600 text-white font-extrabold' : 'text-slate-400 hover:text-white'}`}>
              <Activity className="w-3.5 h-3.5" /><span>نتایج تست خودکار ({toPersianNum(passedCount)}/{toPersianNum(testResults.length)} PASS)</span>
            </button>
            <button type="button" onClick={() => setActiveTab('errors')} className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition ${activeTab === 'errors' ? 'bg-rose-600 text-white font-extrabold' : 'text-slate-400 hover:text-white'}`}>
              <AlertTriangle className="w-3.5 h-3.5" /><span>خطاهای شکارشده ({toPersianNum(errors.length)})</span>
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-3 space-y-2">
            {activeTab === 'autotest' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pb-1 border-b border-slate-800">
                  <span>وضعیت کل: {failedCount === 0 ? <strong className="text-emerald-400">ALL PASS (بدون خطا)</strong> : <strong className="text-rose-400">{toPersianNum(failedCount)} مورد نیازمند بررسی</strong>} · نمونه ({formatAreaUnitLabel(areaUnit)}): {toPersianNum(sampleUnitBuy)} م · معامله v6.4: {toPersianNum(sampleUnitDeal)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sampleUnitBuy, intlCurrency, locale)})` : ''}</span>
                  {lastRunTimeFa && <span>آخرین اجرا: {lastRunTimeFa}</span>}
                </div>
                {testResults.map((item) => ( <div key={item.id} className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-100">{item.name}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 shrink-0 ${item.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}`}>
                        {item.status === 'PASS' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{item.status} ({toPersianNum(item.durationMs)}ms)</span>
                      </span>
                    </div>
                    <div dir="ltr" className="text-[10px] font-mono text-sky-400 truncate">{item.target}</div>
                    <div dir="ltr" className="text-[11px] text-slate-300 break-words">{item.reason}</div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-800">
                  <span>ردیاب خطاهای Render / Promise / Fetch / State</span>
                  {errors.length > 0 && (
                    <button type="button" onClick={clearCaughtDiagnosticErrors} className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer font-bold">
                      <Trash2 className="w-3 h-3" /><span>پاکسازی لیست</span>
                    </button>
                  )}
                </div>
                {errors.length === 0 ? (
                  <div className="py-6 text-center text-emerald-400 font-bold flex flex-col items-center gap-1.5">
                    <CheckCircle2 className="w-6 h-6" />
                    <span>هیچ خطای زمان اجرا، کرش رندر یا خطای شبکه ثبت نشده است (۰ خطا).</span>
                  </div>
                ) : (
                  errors.map((err) => (
                    <div key={err.id} className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">{err.category}</span>
                        <span dir="ltr" className="text-[10.5px] font-mono text-amber-300 truncate">{err.fileOrFunction}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{err.timestampFa}</span>
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-rose-100 break-words">{err.message}</div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}