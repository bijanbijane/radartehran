/** @file src/features/properties/results/PropertyExplorerHeader.tsx — Top Header & Section Switcher for PropertyExplorerPage */
import React from 'react';
import { Bookmark, Building2, Calculator, FolderKanban, GitCompare, PlusCircle } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type { PropertyExplorerViewMode } from '../filters/PropertyFilterBar';

import type { PropertiesSubTabId } from '../../../navigation/registry/route.types';

export type ExplorerSectionTab = 'discover' | 'saved' | 'my_listings' | 'submit';

export interface PropertyExplorerHeaderProps {
  isEn: boolean;
  activeSubTab?: PropertiesSubTabId;
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

function resolvePropertiesHeading(subTab: PropertiesSubTabId | undefined, sectionTab: ExplorerSectionTab, isEn: boolean): string {
  if (sectionTab === 'submit') return isEn ? 'Submit New Property Listing' : 'ثبت آگهی و فایل ملکی جدید';
  if (sectionTab === 'saved') return isEn ? 'Saved Properties' : 'فایل‌های ملکی ذخیره‌شده';
  if (sectionTab === 'my_listings') return isEn ? 'My Submitted Listings' : 'فایل‌های ثبت‌شده من';
  if (subTab === 'buy') return isEn ? 'Properties for Sale' : 'آگهی‌های خرید و فروش آپارتمان';
  if (subTab === 'rent') return isEn ? 'Properties for Rent' : 'آگهی‌های رهن و اجاره';
  if (subTab === 'commercial') return isEn ? 'Commercial & Retail Properties' : 'املاک تجاری و مغازه';
  if (subTab === 'office') return isEn ? 'Office & Administrative Properties' : 'املاک اداری و دفتر کار';
  return isEn ? 'Property Explorer' : 'بازار املاک و فایل‌های هدف تهران';
}

export const PropertyExplorerHeader: React.FC<PropertyExplorerHeaderProps> = ({
  isEn,
  activeSubTab,
  sectionTab,
  savedCount,
  myListingsCount,
  compareCount,
  onChangeSection,
  onOpenValuation,
  onOpenCompare,
}) => {
  const heading = resolvePropertiesHeading(activeSubTab, sectionTab, isEn);

  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
      <div>
        <span className="text-sm font-bold text-[var(--color-brand-fg)] block mb-1">
          {isEn
            ? 'Verified Property Discovery & Valuation Context'
            : 'کشف و راستی‌آزمایی فایل‌های ملکی · همگام با ارزش‌گذاری هدونیک'}
        </span>
        <h1 className="text-2xl sm:text-[30px] font-bold leading-[1.3] text-[var(--color-text-primary)] tracking-tight">
          {heading}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {sectionTab !== 'discover' && (
          <button
            type="button"
            data-testid="properties-section-discover"
            onClick={() => onChangeSection('discover')}
            className="min-h-[44px] md:min-h-[38px] px-3 py-1.5 rounded-[9px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] font-bold flex items-center gap-1.5 hover:bg-[var(--color-bg-muted)] cursor-pointer transition"
          >
            <Building2 className="w-4 h-4 text-[var(--color-brand-fg)]" />
            <span>{isEn ? 'All Listings' : 'بازگشت به فهرست فایل‌ها'}</span>
          </button>
        )}

        <button
          type="button"
          aria-pressed={sectionTab === 'saved'}
          data-testid="properties-section-saved"
          onClick={() => onChangeSection(sectionTab === 'saved' ? 'discover' : 'saved')}
          className={`min-h-[44px] md:min-h-[38px] px-3 py-1.5 rounded-[9px] font-bold flex items-center gap-1.5 cursor-pointer transition ${
            sectionTab === 'saved'
              ? 'bg-[var(--color-brand-soft)] border border-[var(--color-brand-600)] text-[var(--color-brand-fg)]'
              : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>{isEn ? `Saved (${savedCount})` : `ذخیره‌شده‌ها (${toPersianNum(savedCount)})`}</span>
        </button>

        <button
          type="button"
          aria-pressed={sectionTab === 'my_listings'}
          data-testid="properties-section-my_listings"
          onClick={() => onChangeSection(sectionTab === 'my_listings' ? 'discover' : 'my_listings')}
          className={`min-h-[44px] md:min-h-[38px] px-3 py-1.5 rounded-[9px] font-bold flex items-center gap-1.5 cursor-pointer transition ${
            sectionTab === 'my_listings'
              ? 'bg-[var(--color-brand-soft)] border border-[var(--color-brand-600)] text-[var(--color-brand-fg)]'
              : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          <span>{isEn ? `My Listings (${myListingsCount})` : `فایل‌های من (${toPersianNum(myListingsCount)})`}</span>
        </button>

        {compareCount > 0 && (
          <button
            type="button"
            data-testid="open-compare-drawer-btn"
            onClick={onOpenCompare}
            className="min-h-[44px] md:min-h-[38px] px-3 py-1.5 rounded-[9px] bg-[var(--color-brand-soft)] border border-[var(--color-brand-600)] text-[var(--color-brand-fg)] font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <GitCompare className="w-4 h-4" />
            <span>{isEn ? `Compare (${compareCount})` : `مقایسه (${toPersianNum(compareCount)})`}</span>
          </button>
        )}

        <button
          type="button"
          data-testid="open-submit-listing-btn"
          onClick={() => onChangeSection('submit')}
          className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] border border-[var(--color-brand-600)] text-[var(--color-brand-fg)] font-bold flex items-center gap-1.5 hover:bg-[var(--color-brand-soft)] cursor-pointer transition"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{isEn ? 'Submit Listing' : 'ثبت فایل جدید'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenValuation}
          className="min-h-[44px] md:min-h-[38px] px-3.5 py-2 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold flex items-center gap-1.5 cursor-pointer transition"
        >
          <Calculator className="w-4 h-4" />
          <span>{isEn ? 'Estimate Value' : 'ارزش‌گذاری ملک'}</span>
        </button>
      </div>
    </div>
  );
};
