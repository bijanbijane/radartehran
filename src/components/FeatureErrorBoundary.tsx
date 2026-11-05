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
import { toPersianNum } from '../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';
import { logDiag } from '../utils/diagnostics';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

function FeatureErrorUnitContextBadge(): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const refUnitPrice = convertPricePerSqmToUnit(120, areaUnit);
  const sample80mTotalMillions = 120 * 80;
  const sampleMonthlyRentMillions = 45;
  return (
    <span className="inline-block text-[10px] text-slate-500 mr-1.5 tabular-nums">
      · واحد: {formatAreaUnitLabel(areaUnit)} ({toPersianNum(refUnitPrice)} م) · ارز: {intlCurrency}
      {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(refUnitPrice, intlCurrency, locale)})` : ''} · معیار {formatAreaShort(80, areaUnit)}: {toPersianNum(sample80mTotalMillions)} م · اجاره: {toPersianNum(sampleMonthlyRentMillions)} م
    </span>
  );
}

export interface FeatureErrorBoundaryProps {
  featureNameFa?: string;
  boundaryId?: string;
  sectionName?: string;
  resetKey?: string | number;
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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const bId = this.props.boundaryId || this.props.sectionName || 'FeatureSection';
    const fName = this.props.featureNameFa || this.props.sectionName || 'بخش رابط کاربری';
    logDiag('ERROR', `FeatureErrorBoundary caught error in [${bId}]`, {
      boundaryId: bId,
      featureNameFa: fName,
      errorCategory: this.state.errorCategory,
      correlationId: this.state.correlationId,
      retryCount: this.state.retryCount,
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
        dir="rtl"
        className={`rounded-2xl border border-amber-300/80 bg-amber-50/95 text-slate-900 shadow-sm ${
          this.props.compact ? 'p-3 text-xs' : 'p-5 text-sm'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-slate-900">
                اختلال موقت در بخش «{fName}»
              </h3>
              <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                سایر بخش‌های رادار تهران بدون مشکل فعال هستند. کد پیگیری فنی:{' '}
                <code className="font-mono text-[11px] bg-white/80 px-1.5 py-0.5 rounded border border-amber-200">
                  {this.state.correlationId}
                </code>
                <FeatureErrorUnitContextBadge />
              </p>
            </div>
          </div>
          {this.props.onDismissModal && (
            <button
              type="button"
              onClick={this.props.onDismissModal}
              aria-label="بستن این پنجره"
              className="p-1.5 rounded-lg text-slate-600 hover:bg-amber-100 transition-colors"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              تلاش مجدد امن ({MAX_SAFE_RETRIES - this.state.retryCount} فرصت باقی‌مانده)
            </button>
          ) : (
            <span className="text-[11px] font-semibold text-rose-700">
              سقف تلاش مجدد خودکار برای جلوگیری از حلقه خطا تکمیل شد.
            </span>
          )}
        </div>
      </div>
    );
  }
}
