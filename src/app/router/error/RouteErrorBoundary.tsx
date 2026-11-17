import React from 'react';
import { normalizeError, reportNormalizedError } from '../../../platform/error-handling';

interface RouteErrorBoundaryProps {
  routeId?: string;
  children: React.ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  messageFa: string;
}

export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    messageFa: '',
  };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    const normalized = normalizeError(error);
    return {
      hasError: true,
      messageFa: normalized.userMessageFa,
    };
  }

  componentDidCatch(error: unknown): void {
    const normalized = normalizeError(error, { routeId: this.props.routeId });
    reportNormalizedError(normalized);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, messageFa: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="route-error-boundary"
          className="p-6 rounded-xl bg-slate-900 border border-rose-500/40 text-slate-100 text-center space-y-3"
          dir="rtl"
        >
          <p className="text-sm font-semibold text-rose-300">{this.state.messageFa}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
          >
            تلاش مجدد
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
