/** @file src/features/properties/results/PropertyExplorerHeader.tsx — Top Header & Section Switcher for PropertyExplorerPage */
import React from 'react';
import { Bookmark, Building2, Calculator, FolderKanban, GitCompare, PlusCircle } from 'lucide-react';
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
  savedCount,
  myListingsCount,
  compareCount,
  onChangeSection,
  onOpenValuation,
  onOpenCompare,
}) => (
  <>
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-4">
      <div>
        <span className="text-xs font-bold text-[var(--color-brand-fg)] block mb-1">
          {isEn
            ? 'Verified Property Discovery & Valuation Context'
            : 'کشف، مقایسه و راستی‌آزمایی فایل‌های ملکی · همگام با نقشه و ارزش‌گذاری'}
        </span>
        <h1 className="text-2xl sm:text-[28px] font-black leading-[1.35] text-[var(--color-text-primary)] tracking-tight">
          {isEn ? 'Property Explorer' : 'بازار املاک و فایل‌های هدف'}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="open-submit-listing-btn"
          onClick={() => onChangeSection('submit')}
          className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] border border-[var(--color-brand-600)] text-[var(--color-brand-fg)] text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--color-brand-soft)] cursor-pointer transition"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{isEn ? 'Submit Listing' : 'ثبت فایل جدید'}</span>
        </button>
        <button
          type="button"
          onClick={onOpenValuation}
          className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
        >
          <Calculator className="w-4 h-4" />
          <span>{isEn ? 'Estimate Value' : 'ارزش‌گذاری ملک'}</span>
        </button>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={isEn ? 'Property workspace tabs' : 'بخش‌های فضای املاک'}>
        {[
          { id: 'discover' as const, label: isEn ? 'All Listings' : 'همه فایل‌ها', icon: Building2 },
          { id: 'saved' as const, label: isEn ? `Saved (${savedCount})` : `ذخیره‌شده‌ها (${toPersianNum(savedCount)})`, icon: Bookmark },
          { id: 'my_listings' as const, label: isEn ? `My Listings (${myListingsCount})` : `فایل‌های من (${toPersianNum(myListingsCount)})`, icon: FolderKanban },
        ].map((t) => {
          const IconC = t.icon;
          const isActive = sectionTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`properties-section-${t.id}`}
              onClick={() => onChangeSection(t.id)}
              className={`min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] font-bold flex items-center gap-1.5 cursor-pointer transition ${
                isActive
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
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
          className="min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>{isEn ? `Compare (${compareCount})` : `مقایسه (${toPersianNum(compareCount)} فایل)`}</span>
        </button>
      )}
    </div>
  </>
);
