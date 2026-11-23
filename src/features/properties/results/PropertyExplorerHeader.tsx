/** @file src/features/properties/results/PropertyExplorerHeader.tsx — Top Header & Section Switcher for PropertyExplorerPage */
import React from 'react';
import { Bookmark, Building2, Calculator, FolderKanban, GitCompare, Layers, PlusCircle } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PropertyExplorerViewMode } from '../filters/PropertyFilterBar';

export type ExplorerSectionTab = 'discover' | 'saved' | 'my_listings' | 'submit';

export interface PropertyExplorerHeaderProps {
  isEn: boolean;
  sectionTab: ExplorerSectionTab;
  viewMode: PropertyExplorerViewMode;
  splitMapMode?: boolean;
  savedCount: number;
  myListingsCount: number;
  compareCount: number;
  onChangeSection: (tab: ExplorerSectionTab) => void;
  onToggleSplitMap?: () => void;
  onToggleViewMode: () => void;
  onOpenValuation: () => void;
  onOpenCompare: () => void;
}

export const PropertyExplorerHeader: React.FC<PropertyExplorerHeaderProps> = ({
  isEn,
  sectionTab,
  viewMode,
  splitMapMode,
  savedCount,
  myListingsCount,
  compareCount,
  onChangeSection,
  onToggleSplitMap,
  onToggleViewMode,
  onOpenValuation,
  onOpenCompare,
}) => (
  <>
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-4">
      <div>
        <span className="text-[11px] font-bold text-[var(--color-brand-600)] dark:text-emerald-400 block mb-1">
          {isEn
            ? 'Verified Property Discovery & Valuation Context'
            : 'کشف، مقایسه و راستی‌آزمایی فایل‌های ملکی · همگام با نقشه و ارزش‌گذاری'}
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-primary)] dark:text-white tracking-tight">
          {isEn ? 'Property Explorer' : 'بازار املاک و فایل‌های هدف'}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onToggleSplitMap && (
          <button
            type="button"
            data-testid="properties-split-map-toggle"
            aria-pressed={Boolean(splitMapMode)}
            onClick={() => { onToggleSplitMap(); onToggleViewMode(); }}
            className="hidden lg:inline-flex px-3 py-2 rounded-[9px] border border-[var(--color-border-subtle)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[var(--color-text-secondary)] dark:text-slate-200 text-xs font-bold items-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
            <span>{viewMode === 'split' ? 'بزرگ‌نمایی فهرست' : 'چیدمان فهرست + نقشه'}</span>
          </button>
        )}
        <button
          type="button"
          data-testid="open-submit-listing-btn"
          onClick={() => onChangeSection('submit')}
          className="px-3.5 py-2 rounded-[9px] border border-[var(--color-brand-600)] text-[var(--color-brand-600)] dark:text-emerald-400 text-xs font-bold flex items-center gap-1.5 hover:bg-[#EAF3F0] dark:hover:bg-emerald-950/40 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>ثبت فایل جدید</span>
        </button>
        <button
          type="button"
          onClick={onOpenValuation}
          className="px-3.5 py-2 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Calculator className="w-4 h-4" />
          <span>ارزش‌گذاری یک ملک دلخواه</span>
        </button>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { id: 'discover' as const, label: 'جست‌وجو و نقشه', icon: Building2 },
          { id: 'saved' as const, label: `ذخیره‌شده‌ها (${toPersianNum(savedCount)})`, icon: Bookmark },
          { id: 'my_listings' as const, label: `فایل‌های من (${toPersianNum(myListingsCount)})`, icon: FolderKanban },
          { id: 'submit' as const, label: 'ثبت فایل (۷ مرحله)', icon: PlusCircle },
        ].map((t) => {
          const IconC = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`properties-section-${t.id}`}
              onClick={() => onChangeSection(t.id)}
              className={`px-3 py-1.5 rounded-[8px] font-bold flex items-center gap-1.5 cursor-pointer transition ${
                sectionTab === t.id
                  ? 'bg-[var(--color-text-primary)] text-white'
                  : 'bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
              }`}
            >
              <IconC className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {compareCount > 0 && (
        <button
          type="button"
          data-testid="open-compare-drawer-btn"
          onClick={onOpenCompare}
          className="px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>مقایسه ({toPersianNum(compareCount)} فایل)</span>
        </button>
      )}
    </div>
  </>
);
