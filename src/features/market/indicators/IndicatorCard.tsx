import React from 'react';
import { ArrowUpLeft } from 'lucide-react';
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
  estimated_value: 'text-[#176B63] dark:text-emerald-300',
  transaction_price: 'text-[#A61B1B] dark:text-rose-300',
  rent: 'text-[#155E9A] dark:text-sky-300',
  supply: 'text-[#34433E] dark:text-slate-300',
};

const STATUS_DOT_TEXT: Record<MarketIndicatorStatus, string> = {
  published: 'text-[#176B4C] dark:text-emerald-400',
  provisional: 'text-[#155E9A] dark:text-sky-400',
  insufficient_sample: 'text-[#875000] dark:text-amber-400',
  stale: 'text-[#586760] dark:text-slate-400',
  unavailable: 'text-[#586760] dark:text-slate-500',
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
      className={`p-4 rounded-[12px] bg-white dark:bg-slate-900 border text-start flex flex-col justify-between gap-2.5 transition cursor-pointer ${
        active
          ? 'border-[#176B63] dark:border-emerald-400 ring-1 ring-[#176B63]'
          : 'border-[#DCE3DF] dark:border-slate-800 hover:border-[#182522] dark:hover:border-slate-600'
      }`}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
          <span className={KIND_TEXT_CLS[indicator.dataKind]}>{indicator.dataKindLabelFa}</span>
          <ArrowUpLeft className="w-3.5 h-3.5 text-[#94A39B] shrink-0" aria-hidden="true" />
        </div>
        <div className="text-xs font-bold text-[#182522] dark:text-slate-100 leading-snug">
          {indicator.titleFa}
        </div>
      </div>

      <div className="tabular-nums space-y-0.5">
        <div className="text-2xl font-black text-[#182522] dark:text-white tracking-tight">
          {indicator.formattedValueFa}
        </div>
        {indicator.intlText && (
          <div className="text-[11px] font-semibold text-[#176B63] dark:text-emerald-400">
            {indicator.intlText}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-[#DCE3DF]/80 dark:border-slate-800 text-[11px] text-[#586760] dark:text-slate-400 space-y-1 tabular-nums">
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
        <div className="text-[10.5px] leading-relaxed text-[#586760] dark:text-slate-400">
          {indicator.secondaryNoteFa}
        </div>
      </div>
    </button>
  );
};
