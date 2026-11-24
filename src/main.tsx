import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.tsx'; import './index.css'; import { recordDiagnosticEvent, sanitizeInput } from './utils/security'; import { registerRadarServiceWorker } from './utils/pwaOfflineSupport'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './utils/areaUnit'; import { executeSafeTemporaryCacheReset } from './platform/storage/safeCacheReset'; import { executeHookErrorAutoRecovery, type AutoRecoveryOutcome } from './platform/recovery/hookErrorAutoRecovery'; import { getCacheStorage, getTemporaryStorage } from './platform/storage/storageAdapter'; import { clientGeoJsonLruCache } from './utils/neighborhoodBoundaries';
interface RootErrorBoundaryProps { children: React.ReactNode; }
interface RootErrorBoundaryState { hasError: boolean; errorMsg: string; retryCount: number; autoRecoveryOutcome: AutoRecoveryOutcome | null; }
class RootErrorBoundary extends React.Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  constructor(props: RootErrorBoundaryProps) { super(props); this.state = { hasError: false, errorMsg: '', retryCount: 0, autoRecoveryOutcome: null }; }
  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return { hasError: true, errorMsg: sanitizeInput(error?.message || 'خطای غیرمنتظره در رندر رابط کاربری', 240) };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const rawMessage = String(error?.message || '');
    try { recordDiagnosticEvent('RootErrorBoundary', `Caught UI crash [${formatAreaUnitLabel(getStoredAreaUnit())}]: ${sanitizeInput(rawMessage, 120)}`, 'fallback'); } catch { /* Fail-safe diagnostic logging */ }
    try { console.error('RootErrorBoundary caught error:', error, errorInfo); } catch { /* Fail-safe console logging */ }
    if (typeof window === 'undefined') return;
    void executeHookErrorAutoRecovery(rawMessage, {
      windowObj: window,
      navigatorObj: typeof navigator !== 'undefined' ? navigator : null,
      onDiagnostic: (diag) => { recordDiagnosticEvent('RootErrorBoundary', sanitizeInput(diag.message, 180), diag.severity); },
    })
      .then((result) => {
        if (result.requiresManualRecovery && result.outcome !== 'not_applicable') {
          try { this.setState({ autoRecoveryOutcome: result.outcome }); } catch { /* Ignore if unmounted */ }
        }
      })
      .catch(() => {
        try {
          recordDiagnosticEvent('RootErrorBoundary', 'Auto-recovery promise rejected unexpectedly; presenting manual recovery controls', 'fallback');
          this.setState({ autoRecoveryOutcome: 'manual_fallback_storage_unavailable' });
        } catch { /* Fail-safe fallback */ }
      });
  }
  private handleNonDestructiveRetry = (): void => {
    try {
      recordDiagnosticEvent('RootErrorBoundary', 'User triggered non-destructive retry', 'success');
      this.setState((prev) => ({ hasError: false, errorMsg: '', retryCount: prev.retryCount + 1, autoRecoveryOutcome: null }));
    } catch { window.location.reload(); }
  };
  private handleFullCacheReset = (): void => {
    void (async () => {
      let cacheResetStatus: string = 'success';
      try {
        const result = await executeSafeTemporaryCacheReset({
          clearMemoryCaches: [() => getCacheStorage().clearAll(), () => getTemporaryStorage().clearAll(), () => clientGeoJsonLruCache.clear()],
        });
        cacheResetStatus = result.browserCacheStatus;
        recordDiagnosticEvent(
          'RootErrorBoundary',
          `Safe temporary cache reset completed (cacheStatus=${result.browserCacheStatus}, removedLocal=${result.removedLocalStorageKeys.length}, removedCaches=${result.removedBrowserCaches.length}, preservedCaches=${result.preservedBrowserCaches.length}, failedCaches=${result.failedBrowserCaches.length}, preservedKeys=${result.preservedLocalStorageKeys.length}, partialFailure=${result.partialFailure})`,
          result.partialFailure ? 'fallback' : 'success'
        );
      } catch {
        cacheResetStatus = 'complete_failure';
        recordDiagnosticEvent('RootErrorBoundary', 'Safe temporary cache reset encountered unexpected error', 'fallback');
      } finally {
        if (cacheResetStatus === 'complete_failure') {
          try { this.setState({ errorMsg: 'پاکسازی Cache Storage با خطا مواجه شد؛ صفحه مجدداً بارگذاری می‌شود.' }); } catch { /* ignore */ }
        }
        if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') window.location.reload();
      }
    })();
  };
  render(): React.ReactNode {
    if (this.state.hasError) {
      const refCurrencySample = formatMillionTomanAsIntlCurrency(10_000, getStoredIntlCurrency());
      const showStorageManualNotice =
        this.state.autoRecoveryOutcome === 'manual_fallback_storage_unavailable' ||
        this.state.autoRecoveryOutcome === 'manual_fallback_marker_write_failed';
      return (
        <div
          dir="rtl"
          role="alert"
          aria-live="assertive"
          className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 select-none"
        >
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-xl" title={refCurrencySample}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto font-bold text-lg">
              !
            </div>
            <h2 className="text-lg font-bold text-emerald-700">
              رادارتهران
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              در بارگذاری موقت یکی از بخش‌ها اختلالی رخ داد. می‌توانید بدون حذف اطلاعات دوباره تلاش کنید یا حافظه موقت مرورگر را بازنشانی نمایید.
            </p>
            {showStorageManualNotice && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
                حافظه نشست مرورگر (Session Storage) در دسترس نیست؛ برای جلوگیری از بارگذاری مکرر، بازیابی خودکار متوقف شد. لطفاً از دکمه‌های بازیابی دستی زیر استفاده کنید.
              </p>
            )}
            {this.state.errorMsg && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-[11px] text-slate-500 font-mono truncate">
                {this.state.errorMsg}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleNonDestructiveRetry}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition"
              >
                تلاش مجدد
              </button>
              <button
                type="button"
                onClick={this.handleFullCacheReset}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
              >
                بازنشانی حافظه موقت و بارگذاری مجدد
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
declare global {
  interface Window {
    __unhandledErrorsFound?: boolean;
    __viteChunkLoadFailures?: Array<{
      timestampIso: string;
      phase: 'vite:preloadError' | 'resource-load-capture' | 'dynamic-import-rejection';
      matchedManualChunk: string | null;
      chunkOrModuleUrl: string;
      message: string;
      stack?: string;
    }>;
  }
}
const KNOWN_MANUAL_CHUNKS = [
  'vendor-firebase-firestore', 'vendor-firebase-auth', 'vendor-d3', 'vendor-charts',
  'vendor-icons', 'vendor-react', 'data-iran-provinces', 'data-extended-insights',
  'data-neighborhoods', 'engine-decision-cells', 'ui-modals',
] as const;
function detectManualChunkGroup(urlOrMessage: string): string | null {
  const normalized = String(urlOrMessage || '');
  for (const chunkName of KNOWN_MANUAL_CHUNKS) {
    if (normalized.includes(chunkName)) return chunkName;
  }
  if (normalized.includes('@firebase/firestore') || normalized.includes('firebase/firestore')) {
    return 'vendor-firebase-firestore';
  }
  if (normalized.includes('firebase')) return 'vendor-firebase-auth';
  if (normalized.includes('d3-')) return 'vendor-d3';
  if (normalized.includes('recharts')) return 'vendor-charts';
  if (normalized.includes('lucide-react')) return 'vendor-icons';
  if (normalized.includes('react-dom') || normalized.includes('/react')) return 'vendor-react';
  if (normalized.includes('iranProvincesData')) return 'data-iran-provinces';
  if (normalized.includes('tehranExtendedInsights') || normalized.includes('neighborhoodInsights')) {
    return 'data-extended-insights';
  }
  if (normalized.includes('neighborhoods') || normalized.includes('multiCityData')) {
    return 'data-neighborhoods';
  }
  return null;
}
if (typeof window !== 'undefined') {
  window.__unhandledErrorsFound = false;
  window.__viteChunkLoadFailures = [];
  const isDevEnvironment = Boolean(import.meta.env?.DEV);
  const reportViteChunkLoadFailure = (
    phase: 'vite:preloadError' | 'resource-load-capture' | 'dynamic-import-rejection',
    chunkOrModuleUrl: string,
    errorObj: unknown
  ): void => {
    const rawMsg =
      errorObj instanceof Error
        ? errorObj.message
        : typeof errorObj === 'string'
          ? errorObj
          : 'Unknown chunk load failure';
    const stack = errorObj instanceof Error ? errorObj.stack : undefined;
    const matchedManualChunk = detectManualChunkGroup(`${chunkOrModuleUrl} ${rawMsg} ${stack ?? ''}`);
    const entry = {
      timestampIso: new Date().toISOString(),
      phase,
      matchedManualChunk,
      chunkOrModuleUrl: chunkOrModuleUrl || 'unknown-url',
      message: sanitizeInput(rawMsg, 240),
      stack,
    };
    window.__viteChunkLoadFailures?.push(entry);
    recordDiagnosticEvent(
      'ViteChunkLoader',
      `[${phase}] ${matchedManualChunk ? `manualChunk=${matchedManualChunk} ` : ''}${entry.chunkOrModuleUrl}: ${entry.message}`,
      'fallback'
    );
    if (isDevEnvironment) {
      console.groupCollapsed(
        `%c[Vite Chunk Load Diagnostic]%c ${phase} ${matchedManualChunk ? `(${matchedManualChunk})` : ''}`,
        'color:#fff;background:#dc2626;padding:2px 6px;border-radius:4px;font-weight:bold;',
        'color:#dc2626;font-weight:bold;'
      );
      console.error('Chunk / Module URL:', entry.chunkOrModuleUrl);
      console.error(
        'Matched manualChunks Group:',
        matchedManualChunk ?? 'dynamic-route-or-component-chunk (not in manualChunks)'
      );
      console.error('Error Message:', rawMsg);
      if (stack) {
        console.error('Stack Trace:', stack);
      }
      console.table([
        {
          phase: entry.phase,
          manualChunk: entry.matchedManualChunk ?? 'N/A',
          url: entry.chunkOrModuleUrl,
          message: entry.message,
          timestamp: entry.timestampIso,
        },
      ]);
      console.groupEnd();
    }
  };
  window.addEventListener('vite:preloadError', (event: Event) => {
    const preloadEvt = event as Event & { payload?: unknown };
    const payloadErr = preloadEvt?.payload ?? event;
    const msg = payloadErr instanceof Error ? payloadErr.message : String(payloadErr ?? 'vite:preloadError');
    reportViteChunkLoadFailure('vite:preloadError', msg, payloadErr);
  });
  window.addEventListener(
    'error',
    (event: Event) => {
      const target = event?.target as HTMLElement | null;
      if (!target || target === (window as unknown as HTMLElement)) return;
      const tagName = target.tagName?.toUpperCase();
      if (tagName === 'SCRIPT' || tagName === 'LINK') {
        const url =
          (target as HTMLScriptElement).src ||
          (target as HTMLLinkElement).href ||
          target.getAttribute('src') ||
          target.getAttribute('href') ||
          'unknown-script-or-link-chunk';
        reportViteChunkLoadFailure(
          'resource-load-capture',
          url,
          new Error(`Failed to load ${tagName} chunk resource: ${url}`)
        );
      }
    },
    true
  );
  const isBenignEventMessage = (msg: string): boolean => {
    const text = String(msg || '').toLowerCase();
    if (!text) return true;
    return (
      text.includes('resizeobserver') ||
      text.includes('websocket') ||
      text.includes('aborterror') ||
      text.includes('script error') ||
      text.includes('popup-closed-by-user') ||
      text.includes('cancelled-popup-request')
    );
  };
  window.addEventListener('error', (event: ErrorEvent) => {
    if (event?.target && event.target !== window) return;
    const msg = event?.error?.message || event?.message || '';
    if (isBenignEventMessage(msg)) return;
    window.__unhandledErrorsFound = true;
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event?.reason;
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
    const lower = msg.toLowerCase();
    if (
      lower.includes('failed to fetch dynamically imported module') ||
      lower.includes('importing a module script failed') ||
      lower.includes('error loading dynamically imported module') ||
      lower.includes('chunkloaderror') ||
      detectManualChunkGroup(msg) !== null
    ) {
      const urlMatch = msg.match(/https?:\/\/[^\s'"]+|\/[^\s'"]+\.(?:js|mjs|ts|tsx)(?:\?[^\s'"]*)?/i);
      reportViteChunkLoadFailure(
        'dynamic-import-rejection',
        urlMatch ? urlMatch[0] : 'dynamic-import-chunk',
        reason
      );
    }
    if (isBenignEventMessage(msg)) return;
    window.__unhandledErrorsFound = true; }); } const rootElement = document.getElementById('root'); if (!rootElement) { throw new Error('ریشه DOM (#root) در صفحه یافت نشد.'); } createRoot(rootElement).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
); if (typeof window !== 'undefined') { window.addEventListener('load', () => { void registerRadarServiceWorker(); }); }