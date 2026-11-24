import React from 'react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { MarketIndicatorValue } from '../types/indicator.types';
import type { MarketDataKind, MarketIndicatorStatus } from '../types/market.types';

export interface IndicatorCardProps {
  indicator: MarketIndicatorValue;
  active?: boolean;
  onSelect?: (indicator: MarketIndicatorValue) => void;
}

const KIND_TEXT_CLS: Record<MarketDataKind, string> = {
  asking_price: 'text-[#875000] dark:text-amber-300',
  estimated_value: 'text-[var(--color-brand-fg)]',
  transaction_price: 'text-[#A61B1B] dark:text-rose-300',
  rent: 'text-[#155E9A] dark:text-sky-300',
  supply: 'text-[var(--color-text-secondary)]',
};

const STATUS_DOT_TEXT: Record<MarketIndicatorStatus, string> = {
  published: 'text-[var(--color-brand-fg)]',
  provisional: 'text-[#155E9A] dark:text-sky-300',
  insufficient_sample: 'text-[#875000] dark:text-amber-300',
  stale: 'text-[var(--color-text-muted)]',
  unavailable: 'text-[var(--color-text-muted)]',
};

export const IndicatorCard: React.FC<IndicatorCardProps> = ({
  indicator,
  active = false,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(indicator)}
      data-testid={`market-indicator-card-${indicator.id}`}
      className={`p-4 rounded-[12px] bg-[var(--color-bg-surface)] border text-start flex flex-col justify-between gap-2.5 transition cursor-pointer ${
        active
          ? 'border-[var(--color-brand-600)] dark:border-emerald-400 ring-1 ring-[var(--color-brand-600)]'
          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)]/60'
      }`}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs font-bold">
          <span className={KIND_TEXT_CLS[indicator.dataKind]}>{indicator.dataKindLabelFa}</span>
        </div>
        <div className="text-xs font-bold text-[var(--color-text-primary)] leading-snug">
          {indicator.titleFa}
        </div>
      </div>

      <div className="tabular-nums space-y-0.5">
        <div className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          {indicator.formattedValueFa}
        </div>
        {indicator.intlText && (
          <div className="text-xs font-semibold text-[var(--color-brand-fg)]">
            {indicator.intlText}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[var(--color-border-subtle)]/80 text-xs text-[var(--color-text-muted)] space-y-1 tabular-nums">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span>{indicator.geoScopeFa}</span>
          <span>·</span>
          <span>{indicator.periodLabelFa}</span>
          <span>·</span>
          <span>{toPersianNum(indicator.sampleCount)} نمونه</span>
        </div>
        <div className={`font-semibold ${STATUS_DOT_TEXT[indicator.status]}`}>
          {indicator.statusLabelFa}
        </div>
        <div className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          {indicator.secondaryNoteFa}
        </div>
      </div>
    </button>
  );
};
