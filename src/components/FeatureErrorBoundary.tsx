/**
 * @file src/components/FeatureErrorBoundary.tsx
 * @description Feature-Level React Error Boundary & Runtime Failure Isolation (Prompts 899 & 991).
 *
 * Isolates rendering errors within independent application features (Map, Drawers, Modals,
 * Calculators, Charts, Admin/Publisher Workspaces) so a single feature failure never crashes
 * unrelated parts of Tehran Radar. Prevents infinite error-remount loops with a bounded retry counter.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { logDiag } from '../utils/diagnostics';
import {
  formatAreaShort,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
} from '../utils/areaUnit';

export interface FeatureErrorBoundaryProps {
  featureNameFa?: string;
  boundaryId?: string;
  sectionName?: string;
  resetKey?: string | number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
  children: ReactNode;
  onDismissModal?: () => void;
  compact?: boolean;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
  errorCategory: string;
  correlationId: string;
  retryCount: number;
}

const MAX_SAFE_RETRIES = 3;

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  public state: FeatureErrorBoundaryState = {
    hasError: false,
    errorCategory: 'RENDER_BOUNDARY_EXCEPTION',
    correlationId: '',
    retryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<FeatureErrorBoundaryState> {
    const msg = String(error?.message || '').toLowerCase();
    const isChunkError =
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('chunkloaderror');
    return {
      hasError: true,
      errorCategory: isChunkError ? 'STALE_CHUNK_LOAD_FAILURE' : 'COMPONENT_RUNTIME_ERROR',
      correlationId: `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    };
  }

  public componentDidUpdate(prevProps: FeatureErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({
        hasError: false,
        errorCategory: 'RENDER_BOUNDARY_EXCEPTION',
        correlationId: '',
        retryCount: 0,
      });
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const bId = this.props.boundaryId || this.props.sectionName || 'FeatureSection';
    const fName = this.props.featureNameFa || this.props.sectionName || 'بخش رابط کاربری';
    const areaUnit: AreaUnit = this.props.areaUnit || getStoredAreaUnit();
    const intlCurrency: IntlCurrencyCode = this.props.intlCurrency || getStoredIntlCurrency();
    const sampleMonthlyRentMillions = 24;
    logDiag('ERROR', `FeatureErrorBoundary caught error in [${bId}]`, {
      boundaryId: bId,
      featureNameFa: fName,
      errorCategory: this.state.errorCategory,
      correlationId: this.state.correlationId,
      retryCount: this.state.retryCount,
      benchmarkArea: formatAreaShort(80, areaUnit),
      benchmarkCurrency: intlCurrency,
      sampleMonthlyRentMillions,
      message: String(error?.message || 'Unknown error').slice(0, 200),
      componentStackTop: String(errorInfo?.componentStack || '').slice(0, 240),
    });
  }

  private handleSafeRetry = (): void => {
    if (this.state.retryCount >= MAX_SAFE_RETRIES) return;
    this.setState((prev) => ({
      hasError: false,
      retryCount: prev.retryCount + 1,
    }));
  };

  public render(): ReactNode {
    const bId = this.props.boundaryId || this.props.sectionName || 'FeatureSection';
    const fName = this.props.featureNameFa || this.props.sectionName || 'بخش رابط کاربری';
    if (!this.state.hasError) {
      return (
        <React.Fragment key={`${bId}_${this.props.resetKey ?? ''}_r${this.state.retryCount}`}>
          {this.props.children}
        </React.Fragment>
      );
    }

    const canRetry = this.state.retryCount < MAX_SAFE_RETRIES;

    return (
      <div
        role="alert"
        aria-live="assertive"
        className={`rounded-2xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50/95 dark:bg-amber-950/60 text-slate-900 dark:text-slate-100 shadow-sm ${
          this.props.compact ? 'p-3 text-xs' : 'p-5 text-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                اختلال موقت در بخش «{fName}»
              </h3>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                سایر بخش‌های رادار تهران بدون مشکل فعال هستند. کد پیگیری فنی:{' '}
                <code className="font-mono text-xs bg-white/80 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                  {this.state.correlationId}
                </code>
              </p>
            </div>
          </div>
          {this.props.onDismissModal && (
            <button
              type="button"
              onClick={this.props.onDismissModal}
              aria-label="بستن این پنجره"
              className="min-w-[44px] min-h-[44px] md:min-w-[36px] md:min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canRetry ? (
            <button
              type="button"
              onClick={this.handleSafeRetry}
              className="min-h-[44px] md:min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              تلاش مجدد امن ({MAX_SAFE_RETRIES - this.state.retryCount} فرصت باقی‌مانده)
            </button>
          ) : (
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
              سقف تلاش مجدد خودکار برای جلوگیری از حلقه خطا تکمیل شد.
            </span>
          )}
        </div>
      </div>
    );
  }
}
