/**
 * @file src/components/DualLayerErrorTrap.tsx
 * @description Dual-Layer Error Trap (Render-Phase React Error Boundary + Live Self-Diagnostic
 * & Auto-Test Overlay). Logs exact file/function names and error messages on any crash.
 */

import React from 'react';
import { toPersianNum } from '../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  getStoredRadarLocale,
} from '../utils/areaUnit';
import { recordDiagnosticEvent, sanitizeInput } from '../utils/security';
import { executeSafeTemporaryCacheReset } from '../platform/storage/safeCacheReset';
import { getCacheStorage, getTemporaryStorage } from '../platform/storage/storageAdapter';
import { clientGeoJsonLruCache } from '../utils/neighborhoodBoundaries';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import {
  LiveDiagnosticOverlay,
  extractFileAndFunctionFromStack,
  pushCaughtDiagnosticError,
} from './LiveDiagnosticOverlay';

export interface DualLayerErrorTrapProps {
  children: React.ReactNode;
}

interface RenderErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
  errorSource: string;
  errorStack: string;
  retryCount: number;
}

class RenderPhaseErrorBoundary extends React.Component<
  DualLayerErrorTrapProps,
  RenderErrorBoundaryState
> {
  constructor(props: DualLayerErrorTrapProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMsg: '',
      errorSource: '',
      errorStack: '',
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RenderErrorBoundaryState> {
    const safeMsg = sanitizeInput(error?.message || 'خطای غیرمنتظره در رندر رابط کاربری', 300);
    const safeStack = typeof error?.stack === 'string' ? error.stack.slice(0, 1500) : '';
    const source = extractFileAndFunctionFromStack(error?.stack, 'React.RenderPhase');
    return {
      hasError: true,
      errorMsg: safeMsg,
      errorSource: source,
      errorStack: safeStack,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    try {
      const source = extractFileAndFunctionFromStack(
        error?.stack || errorInfo?.componentStack || undefined,
        'React.componentDidCatch'
      );
      pushCaughtDiagnosticError('RENDER', error?.message || 'Render crash', source);
      recordDiagnosticEvent(
        'DualLayerErrorTrap',
        `Caught render crash in ${source}: ${sanitizeInput(error?.message, 120)}`,
        'fallback'
      );
      console.error('DualLayerErrorTrap caught render error:', error, errorInfo);
    } catch {
      // Never throw inside componentDidCatch
    }
  }

  private handleRetry = (): void => {
    try {
      recordDiagnosticEvent('DualLayerErrorTrap', 'User triggered non-destructive retry', 'success');
      this.setState((prev) => ({
        hasError: false,
        errorMsg: '',
        errorSource: '',
        errorStack: '',
        retryCount: prev.retryCount + 1,
      }));
    } catch {
      if (typeof window !== 'undefined') window.location.reload();
    }
  };

  private handleFullCacheReset = (): void => {
    void (async () => {
      try {
        const result = await executeSafeTemporaryCacheReset({
          clearMemoryCaches: [
            () => getCacheStorage().clearAll(),
            () => getTemporaryStorage().clearAll(),
            () => clientGeoJsonLruCache.clear(),
          ],
        });
        recordDiagnosticEvent(
          'DualLayerErrorTrap',
          `Safe temporary cache reset completed (removedLocal=${result.removedLocalStorageKeys.length}, removedCaches=${result.removedBrowserCaches.length}, preservedKeys=${result.preservedLocalStorageKeys.length}, partialFailure=${result.partialFailure})`,
          result.partialFailure ? 'fallback' : 'success'
        );
      } catch {
        // Ignore storage errors in restricted sandboxes
      } finally {
        if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
          window.location.reload();
        }
      }
    })();
  };

  render(): React.ReactNode {
    const activeUnit = getStoredAreaUnit();
    const activeCurrency = getStoredIntlCurrency();
    const activeLocale = getStoredRadarLocale();
    if (this.state.hasError) {
      const refUnitBuy = convertPricePerSqmToUnit(120, activeUnit);
      const sample80mTotalMillions = 120 * 80;
      const sampleMonthlyRentMillions = 45;
      return (
        <div
          dir="rtl"
          role="alert"
          aria-live="assertive"
          className="min-h-screen bg-slate-50 dark:bg-[var(--color-bg-canvas)] text-slate-900 dark:text-[var(--color-text-primary)] flex items-center justify-center p-6"
        >
          <div className="bg-white dark:bg-[var(--color-bg-surface)] border border-rose-200 dark:border-rose-800 rounded-3xl max-w-lg w-full p-6 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 flex items-center justify-center mx-auto font-bold text-lg">
              !
            </div>
            <h2 className="text-lg font-bold text-rose-700 dark:text-rose-400">
              محافظ خطای رندر (رادارتهران)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-[var(--color-text-muted)] tabular-nums">
              واحد فعال: {formatAreaUnitLabel(activeUnit)} ({toPersianNum(refUnitBuy)} م) · ارز: {activeCurrency}
              {activeCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(refUnitBuy, activeCurrency, activeLocale)})` : ''} · معیار {formatAreaShort(80, activeUnit)}: {toPersianNum(sample80mTotalMillions)} م{activeCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(sample80mTotalMillions, activeCurrency, activeLocale)})` : ''} · اجاره ماهانه: {toPersianNum(sampleMonthlyRentMillions)} م
            </p>
            {!import.meta.env.PROD && this.state.errorSource && (
              <div dir="ltr" className="text-xs font-mono text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5">
                Source: {this.state.errorSource}
              </div>
            )}
            {this.state.errorMsg && (
              <div className="bg-rose-50/70 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl px-3 py-2 text-xs text-rose-900 dark:text-rose-200 font-bold text-right break-words">
                {this.state.errorMsg}
              </div>
            )}
            {!import.meta.env.PROD && this.state.errorStack && (
              <pre
                dir="ltr"
                className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[10px] font-mono text-left overflow-x-auto max-h-40 leading-relaxed"
              >
                {this.state.errorStack}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer transition"
              >
                تلاش مجدد
              </button>
              <button
                type="button"
                onClick={this.handleFullCacheReset}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[var(--color-bg-muted)] hover:bg-slate-200 dark:hover:bg-[var(--color-bg-elevated)] text-slate-700 dark:text-[var(--color-text-primary)] font-bold text-xs cursor-pointer transition"
              >
                بازنشانی حافظه موقت و بارگذاری مجدد
              </button>
            </div>
          </div>
          <LiveDiagnosticOverlay areaUnit={activeUnit} intlCurrency={activeCurrency} />
        </div>
      );
    }
    return (
      <>
        {this.props.children}
        <LiveDiagnosticOverlay areaUnit={activeUnit} intlCurrency={activeCurrency} />
      </>
    );
  }
}

export function DualLayerErrorTrap({ children }: DualLayerErrorTrapProps): React.ReactElement {
  useAreaUnit();
  useIntlCurrency();
  useRadarLocale();
  return <RenderPhaseErrorBoundary>{children}</RenderPhaseErrorBoundary>;
}
