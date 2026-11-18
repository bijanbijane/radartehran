/**
 * @file src/platform/entity-detail/sections/SectionErrorBoundary.tsx
 * @description Independent section-level ErrorBoundary so failure in one section never crashes the entire detail page (Stage 7).
 */

import React from 'react';

export interface SectionErrorBoundaryProps {
  sectionId: string;
  sectionTitleFa: string;
  onRetrySection?: (sectionId: string) => void;
  children: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  public state: SectionErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: unknown): SectionErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'خطای غیرمنتظره در بارگذاری این بخش',
    };
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onRetrySection?.(this.props.sectionId);
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          role="alert"
          data-testid={`section-error-boundary-${this.props.sectionId}`}
          className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-right"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-amber-300">
                اختلال موقت در بخش «{this.props.sectionTitleFa}»
              </h4>
              <p className="mt-1 text-xs text-slate-300">
                سایر بخش‌های صفحه جزئیات بدون مشکل فعال هستند. ({this.state.errorMessage})
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
            >
              تلاش مجدد بخش
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
