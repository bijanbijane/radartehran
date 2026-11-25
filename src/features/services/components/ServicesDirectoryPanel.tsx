/** @file src/features/services/components/ServicesDirectoryPanel.tsx — Disclosure, Unified Category Filter & Paginated Provider Grid (AUD-005, AUD-011, AUD-015) */
import React, { useEffect, useMemo, useState } from 'react';
import { Info, Search } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { ExpansionModalType } from '../../../components/ExpansionModulesModal';
import type { SuperModuleTabId } from '../../../components/FutureSuperModulesModal';
import { computePaginationSlice } from '../../../utils/productViewRouterShellClasses';
import { RadarPaginationBar } from '../../../components/common/RadarPaginationBar';
import { IDENTITY_NOT_CREDENTIAL_NOTE_FA } from '../services/servicesDirectoryService';
import { trackServiceEvent } from '../services/serviceWorkflowService';
import {
  type ServiceCanonicalCategory,
  type ServiceFilterState,
  type ServiceProviderEntity,
  type ServiceSortMode,
} from '../types/service.types';
import type { ServicesSubTabId } from '../../../navigation/registry/route.types';
import { ServiceProviderCard } from './ServiceProviderCard';

import { useRadarLocale } from '../../../components/AreaUnitToggle';

export interface ServicesDirectoryPanelProps {
  activeSubTab?: ServicesSubTabId;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  visibleProviders: ServiceProviderEntity[];
  filters: ServiceFilterState;
  setFilters: React.Dispatch<React.SetStateAction<ServiceFilterState>>;
  onOpenHedonic: () => void;
  onOpenListingVerifier: () => void;
  onOpenExpansionModal: (t: ExpansionModalType) => void;
  onOpenSuperModule: (t: SuperModuleTabId) => void;
  onOpenDetail: (p: ServiceProviderEntity) => void;
  onRequestQuote: (p: ServiceProviderEntity) => void;
  onSwitchToWizard: () => void;
}

const CATEGORY_FILTER_CHIPS: Array<{
  id: string;
  labelFa: string;
  labelEn: string;
  canonicalCategory: ServiceCanonicalCategory | 'all';
  category: 'all' | 'brokerage';
}> = [
  { id: 'all', labelFa: 'همه رسته‌ها', labelEn: 'All', canonicalCategory: 'all', category: 'all' },
  { id: 'valuation', labelFa: 'ارزیابی', labelEn: 'Valuation', canonicalCategory: 'valuation', category: 'all' },
  { id: 'advisory', labelFa: 'مشاوره', labelEn: 'Advisory', canonicalCategory: 'advisory', category: 'all' },
  { id: 'legal', labelFa: 'حقوقی و قرارداد', labelEn: 'Legal', canonicalCategory: 'legal', category: 'all' },
  { id: 'inspection', labelFa: 'بازرسی فنی', labelEn: 'Inspection', canonicalCategory: 'inspection', category: 'all' },
  { id: 'agencies', labelFa: 'دفاتر املاک', labelEn: 'Agencies', canonicalCategory: 'all', category: 'brokerage' },
];

export const ServicesDirectoryPanel: React.FC<ServicesDirectoryPanelProps> = ({
  activeSubTab,
  evaluatedNeighborhoods,
  visibleProviders,
  filters,
  setFilters,
  onOpenDetail,
  onRequestQuote,
  onSwitchToWizard,
}) => {
  const [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const showCategorySelect = !activeSubTab || activeSubTab === 'all';
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.canonicalCategory, filters.category, filters.hoodId, filters.searchQuery, filters.hideSponsored, filters.sortMode]);

  const paginationSlice = useMemo(
    () => computePaginationSlice(visibleProviders, currentPage, pageSize),
    [visibleProviders, currentPage, pageSize],
  );

  return (
    <>
      <div className="p-3.5 rounded-[12px] bg-[#FFF4E5]/70 dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 text-sm text-[#6B3F00] dark:text-amber-200 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          {isEn
            ? 'Identity checks are separate from official professional licensing. Default ranking is organic by neighborhood relevance; sponsored listings are explicitly labeled.'
            : `${IDENTITY_NOT_CREDENTIAL_NOTE_FA} رتبه‌بندی پیش‌فرض بر اساس ارتباط با محله و پوشش است و موارد تبلیغاتی با برچسب مجزای «نمایش تبلیغاتی» متمایز می‌شوند.`}
        </p>
      </div>

      <div className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 items-center">
          <div className={`relative ${showCategorySelect ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              data-testid="service-search-input"
              aria-label={isEn ? 'Search service providers by name, area, or specialty' : 'جست‌وجو بر اساس نام دفتر، محله یا تخصص'}
              value={filters.searchQuery}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
              placeholder={isEn ? 'Search provider, area, or specialty...' : 'جست‌وجو بر اساس نام دفتر، محله یا تخصص...'}
              className="w-full min-h-[44px] md:min-h-[38px] ps-8 pe-3 py-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          {showCategorySelect && (
            <select
              aria-label={isEn ? 'Specialty category' : 'رسته تخصصی'}
              value={
                filters.category === 'brokerage'
                  ? 'agencies'
                  : filters.canonicalCategory || 'all'
              }
              onChange={(e) => {
                const found = CATEGORY_FILTER_CHIPS.find((c) => c.id === e.target.value) || CATEGORY_FILTER_CHIPS[0];
                trackServiceEvent('service_category_selected', { category: found.canonicalCategory });
                setFilters((prev) => ({
                  ...prev,
                  canonicalCategory: found.canonicalCategory,
                  category: found.category,
                }));
              }}
              className="min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
            >
              {CATEGORY_FILTER_CHIPS.map((chip) => (
                <option key={chip.id} value={chip.id}>{isEn ? chip.labelEn : chip.labelFa}</option>
              ))}
            </select>
          )}
          <select
            aria-label={isEn ? 'Filter by neighborhood' : 'فیلتر محله'}
            value={filters.hoodId}
            onChange={(e) => setFilters((prev) => ({ ...prev, hoodId: e.target.value === 'all' ? 'all' : Number(e.target.value) }))}
            className="min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
          >
            <option value="all">{isEn ? 'All neighborhoods' : 'همه محله‌ها'}</option>
            {evaluatedNeighborhoods.map((h) => (
              <option key={h.id} value={h.id}>{isEn ? h.name : `محله ${h.name}`}</option>
            ))}
          </select>
          <select
            aria-label={isEn ? 'Sort providers' : 'مرتب‌سازی'}
            value={filters.sortMode || 'recommended'}
            onChange={(e) => setFilters((prev) => ({ ...prev, sortMode: e.target.value as ServiceSortMode }))}
            className="lg:col-span-2 min-h-[44px] md:min-h-[38px] p-2 rounded-[8px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold"
          >
            <option value="recommended">{isEn ? 'Sort: Organic neighborhood relevance' : 'مرتب‌سازی: منطبق با محله و ارگانیک'}</option>
            <option value="verified_first">{isEn ? 'Highest verification track' : 'بیشترین مسیر تأیید هویت/صلاحیت'}</option>
            <option value="experienced">{isEn ? 'Most declared experience' : 'بیشترین سابقه اظهارشده'}</option>
          </select>
          <label className="min-h-[44px] md:min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-[8px] bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] font-bold cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={filters.hideSponsored}
              onChange={(e) => setFilters((prev) => ({ ...prev, hideSponsored: e.target.checked }))}
              className="accent-[var(--color-brand-600)]"
            />
            <span>{isEn ? 'Hide sponsored' : 'مخفی کردن تبلیغات'}</span>
          </label>
        </div>
      </div>

      {visibleProviders.length === 0 ? (
        <div className="p-8 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-center space-y-2 text-sm">
          <p className="font-bold text-[var(--color-text-primary)]">
            {isEn ? 'No service providers match your current filter.' : 'ارائه‌دهنده‌ای با فیلتر انتخاب‌شده در این رسته ثبت نشده است.'}
          </p>
          <p className="text-[var(--color-text-muted)]">
            {isEn ? 'Submit an open request via the wizard or reset filters.' : 'می‌توانید درخواست خود را از فرم ۷ مرحله‌ای ثبت کنید یا فیلترها را بازنشانی نمایید.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFilters({ category: 'all', canonicalCategory: 'all', searchQuery: '', hoodId: 'all', onlyWithDeclaredPhone: false, hideSponsored: false })}
              className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
            >
              {isEn ? 'Show all providers' : 'نمایش همه ارائه‌دهندگان'}
            </button>
            <button
              type="button"
              onClick={onSwitchToWizard}
              className="min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] border border-[var(--color-border-strong)] text-[var(--color-text-primary)] font-bold cursor-pointer"
            >
              {isEn ? 'Submit open request' : 'ثبت درخواست آزاد در این رسته'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="service-providers-grid">
            {paginationSlice.items.map((provider) => (
              <ServiceProviderCard
                key={provider.identity.id}
                provider={provider}
                onOpenDetail={onOpenDetail}
                onRequestQuote={onRequestQuote}
              />
            ))}
          </div>
          <RadarPaginationBar
            slice={paginationSlice}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            pageSizeOptions={[12, 24, 0]}
            isEn={isEn}
          />
        </div>
      )}
    </>
  );
};
