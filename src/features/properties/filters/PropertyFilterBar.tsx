/** @file src/features/properties/filters/PropertyFilterBar.tsx — Search, Quick Filters, Active Chips & View Switch */
import React from 'react';
import { ArrowUpDown, Columns2, List, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  buildActiveFilterChips,
  normalizeFiltersForPropertyType,
  type AppliedPropertyFilters,
  type PropertyFilterDraft,
  type PropertySortKey,
} from './PropertyFilterDraft';
import { PROPERTY_TYPE_LABELS_FA, type PropertyType } from '../types/property.types';
import type { TransactionType } from '../types/listing.types';

export type PropertyExplorerViewMode = 'split' | 'list' | 'map';

export interface PropertyFilterBarProps {
  draft: PropertyFilterDraft;
  applied: AppliedPropertyFilters;
  isDirty: boolean;
  totalResults: number;
  selectedHoodName: string;
  viewMode: PropertyExplorerViewMode;
  onChangeViewMode: (m: PropertyExplorerViewMode) => void;
  onUpdateDraft: (patch: Partial<PropertyFilterDraft>) => void;
  onApply: (nextDraft?: PropertyFilterDraft) => void;
  onReset: () => void;
  onOpenFilterDrawer: () => void;
}

const TX_OPTIONS: Array<{ id: 'all' | TransactionType; label: string }> = [
  { id: 'all', label: 'همه معاملات' },
  { id: 'sale', label: 'فروش' },
  { id: 'rent', label: 'رهن و اجاره' },
  { id: 'full_deposit', label: 'رهن کامل' },
  { id: 'presale', label: 'پیش‌فروش' },
];

const SORT_OPTIONS: Array<{ id: PropertySortKey; label: string }> = [
  { id: 'relevance', label: 'مرتب‌سازی: مرتبط‌ترین' },
  { id: 'discount_desc', label: 'بیشترین شکاف زیر عرف' },
  { id: 'price_per_sqm_asc', label: 'ارزان‌ترین متری' },
  { id: 'price_asc', label: 'ارزان‌ترین کل' },
  { id: 'price_desc', label: 'گران‌ترین کل' },
  { id: 'area_desc', label: 'بزرگ‌ترین متراژ' },
  { id: 'newest', label: 'تازه‌ترین فایل‌ها' },
];

export const PropertyFilterBar: React.FC<PropertyFilterBarProps> = ({
  draft,
  applied,
  isDirty,
  totalResults,
  selectedHoodName,
  viewMode,
  onChangeViewMode,
  onUpdateDraft,
  onApply,
  onReset,
  onOpenFilterDrawer,
}) => {
  const chips = buildActiveFilterChips(applied, selectedHoodName);

  const handleTxQuickSelect = (tx: 'all' | TransactionType) => {
    const next = { ...draft, transactionType: tx };
    onUpdateDraft({ transactionType: tx });
    onApply(next);
  };

  const handlePropertyTypeQuickSelect = (pt: 'all' | PropertyType) => {
    const next = normalizeFiltersForPropertyType(draft, pt);
    onUpdateDraft(next);
    onApply(next);
  };

  return (
    <div className="p-3.5 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3" data-testid="property-filter-bar">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64716B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            aria-label="جست‌وجوی ملک، خیابان یا محله"
            data-testid="property-search-input"
            value={draft.searchQuery}
            onChange={(e) => {
              const next = { ...draft, searchQuery: e.target.value };
              onUpdateDraft({ searchQuery: e.target.value });
              onApply(next);
            }}
            placeholder="جست‌وجو بر اساس محله، خیابان، عنوان ملک..."
            className="w-full pr-9 pl-7 py-2 rounded-[9px] bg-[var(--color-bg-muted)] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 text-xs text-[var(--color-text-primary)] dark:text-white focus:outline-none focus:border-[var(--color-brand-600)]"
          />
          {draft.searchQuery && (
            <button
              type="button"
              onClick={() => {
                const next = { ...draft, searchQuery: '' };
                onUpdateDraft({ searchQuery: '' });
                onApply(next);
              }}
              aria-label="پاک کردن جست‌وجو"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64716B] hover:text-[var(--color-text-primary)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-[9px] bg-[var(--color-bg-muted)] dark:bg-slate-800 p-1 overflow-x-auto">
            {TX_OPTIONS.map((tx) => (
              <button
                key={tx.id}
                type="button"
                data-testid={`property-tx-${tx.id}`}
                onClick={() => handleTxQuickSelect(tx.id)}
                className={`px-2.5 py-1 rounded-[7px] text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                  applied.transactionType === tx.id
                    ? 'bg-[var(--color-brand-600)] text-white'
                    : 'text-[#48534F] dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700'
                }`}
              >
                {tx.label}
              </button>
            ))}
          </div>

          <select
            aria-label="نوع ملک"
            data-testid="property-type-select"
            value={applied.propertyType}
            onChange={(e) => handlePropertyTypeQuickSelect(e.target.value as 'all' | PropertyType)}
            className="px-2.5 py-2 rounded-[9px] bg-[var(--color-bg-muted)] dark:bg-slate-800 border border-[var(--color-border-subtle)] dark:border-slate-700 text-xs font-bold text-[var(--color-text-primary)] dark:text-white cursor-pointer"
          >
            <option value="all">همه کاربری‌ها</option>
            {(Object.keys(PROPERTY_TYPE_LABELS_FA) as PropertyType[]).map((pt) => (
              <option key={pt} value={pt}>{PROPERTY_TYPE_LABELS_FA[pt]}</option>
            ))}
          </select>

          <button
            type="button"
            data-testid="open-property-filters-btn"
            onClick={onOpenFilterDrawer}
            className="min-h-[36px] px-3 py-1.5 rounded-[9px] border border-[var(--color-border-subtle)] dark:border-slate-700 text-xs font-bold text-[var(--color-text-primary)] dark:text-slate-200 hover:bg-[var(--color-bg-muted)] dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
            <span>فیلترهای پیشرفته{chips.length > 0 ? ` (${toPersianNum(chips.length)})` : ''}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-border-subtle)] dark:border-slate-800 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[var(--color-text-muted)] dark:text-slate-400 tabular-nums">
            {toPersianNum(totalResults)} فایل منطبق
          </span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                const next = { ...draft, ...c.clearPatch };
                onUpdateDraft(c.clearPatch);
                onApply(next);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#EAF3F0] dark:bg-emerald-950/60 text-[var(--color-brand-700)] dark:text-emerald-300 font-bold hover:opacity-80 cursor-pointer"
            >
              <span>{c.label}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          {chips.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-[#B3261E] dark:text-rose-400 font-bold hover:underline px-1 cursor-pointer"
            >
              پاک‌کردن همه
            </button>
          )}
          {isDirty && (
            <button
              type="button"
              onClick={() => onApply()}
              className="px-2.5 py-0.5 rounded-[7px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
            >
              اعمال تغییرات پیش‌نویس
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#64716B]" />
            <select
              aria-label="مرتب‌سازی فایل‌ها"
              data-testid="property-sort-select"
              value={applied.sortBy}
              onChange={(e) => {
                const sortBy = e.target.value as PropertySortKey;
                const next = { ...draft, sortBy };
                onUpdateDraft({ sortBy });
                onApply(next);
              }}
              className="bg-transparent text-xs font-bold text-[var(--color-text-primary)] dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="hidden lg:flex items-center gap-0.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 p-0.5">
            {[
              { id: 'split' as const, icon: Columns2, label: 'فهرست و نقشه' },
              { id: 'list' as const, icon: List, label: 'فقط فهرست' },
              { id: 'map' as const, icon: MapIcon, label: 'فقط نقشه' },
            ].map((m) => {
              const IconC = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`property-viewmode-${m.id}`}
                  onClick={() => onChangeViewMode(m.id)}
                  className={`px-2 py-1 rounded-[6px] flex items-center gap-1 text-[11px] font-bold transition cursor-pointer ${
                    viewMode === m.id
                      ? 'bg-[var(--color-brand-600)] text-white'
                      : 'text-[var(--color-text-muted)] dark:text-slate-400 hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <IconC className="w-3.5 h-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
