/** @file src/features/properties/filters/PropertyFilterBar.tsx — Search, Quick Filters, Active Chips & View Switch */
import React from 'react';
import { ArrowUpDown, Columns2, List, Map as MapIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  buildActiveFilterChips,
  type AppliedPropertyFilters,
  type PropertyFilterDraft,
  type PropertySortKey,
} from './PropertyFilterDraft';
import type { PropertiesSubTabId } from '../../../navigation/registry/route.types';

export type PropertyExplorerViewMode = 'split' | 'list' | 'map';

export interface PropertyFilterBarProps {
  draft: PropertyFilterDraft;
  applied: AppliedPropertyFilters;
  isDirty: boolean;
  totalResults: number;
  selectedHoodName: string;
  viewMode: PropertyExplorerViewMode;
  activeSubTab?: PropertiesSubTabId;
  splitMapMode?: boolean;
  onChangeViewMode: (m: PropertyExplorerViewMode) => void;
  onUpdateDraft: (patch: Partial<PropertyFilterDraft>) => void;
  onApply: (nextDraft?: PropertyFilterDraft) => void;
  onReset: () => void;
  onOpenFilterDrawer: () => void;
}

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
  splitMapMode,
  onChangeViewMode,
  onUpdateDraft,
  onApply,
  onReset,
  onOpenFilterDrawer,
}) => {
  const chips = buildActiveFilterChips(applied, selectedHoodName);

  return (
    <div className="p-3.5 rounded-[14px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3" data-testid="property-filter-bar">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            className="w-full min-h-[44px] md:min-h-[40px] ps-9 pe-9 py-2 rounded-[9px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-brand-600)]"
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
              className="absolute end-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] md:min-h-[34px] md:min-w-[34px] inline-flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="open-property-filters-btn"
            onClick={onOpenFilterDrawer}
            className="min-h-[44px] md:min-h-[40px] px-3.5 py-1.5 rounded-[9px] border border-[var(--color-border-subtle)] text-sm font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-[var(--color-brand-fg)]" />
            <span>فیلترهای پیشرفته{chips.length > 0 ? ` (${toPersianNum(chips.length)})` : ''}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[var(--color-border-subtle)] text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-[var(--color-text-secondary)] tabular-nums">
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
              className="min-h-[44px] md:min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] text-sm font-bold hover:opacity-80 cursor-pointer"
            >
              <span>{c.label}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          ))}
          {chips.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="min-h-[44px] md:min-h-[34px] text-[#B3261E] dark:text-rose-400 font-bold hover:underline px-2 cursor-pointer"
            >
              پاک‌کردن همه
            </button>
          )}
          {isDirty && (
            <button
              type="button"
              onClick={() => onApply()}
              className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-[7px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
            >
              اعمال تغییرات پیش‌نویس
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-4 h-4 text-[var(--color-text-muted)]" />
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
              className="min-h-[44px] md:min-h-[36px] bg-transparent text-sm font-bold text-[var(--color-text-primary)] focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {!splitMapMode && (
            <div
              role="group"
              aria-label="حالت نمایش فهرست و نقشه"
              className="flex items-center gap-0.5 rounded-[8px] border border-[var(--color-border-subtle)] p-0.5"
            >
              {[
                { id: 'list' as const, icon: List, label: 'فهرست' },
                { id: 'split' as const, icon: Columns2, label: 'دوتایی با نقشه' },
                { id: 'map' as const, icon: MapIcon, label: 'نقشه' },
              ].map((m) => {
                const IconC = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={viewMode === m.id}
                    data-testid={`property-viewmode-${m.id}`}
                    onClick={() => onChangeViewMode(m.id)}
                    className={`min-h-[44px] md:min-h-[34px] px-2.5 py-1 rounded-[6px] flex items-center gap-1 text-sm font-bold transition cursor-pointer ${
                      viewMode === m.id
                        ? 'bg-[var(--color-brand-600)] text-white'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    <IconC className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
