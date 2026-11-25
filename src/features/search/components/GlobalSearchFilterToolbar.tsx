import React from 'react';
import { BookmarkPlus, Filter, MapPin, RotateCcw } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type {
  SavedSearchAlertFrequency,
  SearchBoundingBox,
  SearchFilterSet,
  SearchSortOption,
} from '../models/search.types';

export interface GlobalSearchFilterToolbarProps {
  cityNameFa: string;
  cityPlaces: Array<{ id: string; canonicalName: string; district?: number }>;
  filterStatus: 'DEFAULT' | 'DRAFT' | 'APPLIED';
  draftFilters: SearchFilterSet;
  setDraftFilters: React.Dispatch<React.SetStateAction<SearchFilterSet>>;
  setFilterStatus: React.Dispatch<React.SetStateAction<'DEFAULT' | 'DRAFT' | 'APPLIED'>>;
  handleTransactionChange: (nextTx: SearchFilterSet['transactionType']) => void;
  onApplyFilters: () => void;
  hasValidViewportBounds: boolean;
  onApplyMapBounds: () => void;
  onResetFiltersOnly: () => void;
  onResetFullSearch: () => void;
  sort: SearchSortOption;
  setSort: React.Dispatch<React.SetStateAction<SearchSortOption>>;
  saveAlertFreq: SavedSearchAlertFrequency;
  setSaveAlertFreq: React.Dispatch<React.SetStateAction<SavedSearchAlertFrequency>>;
  onSaveCurrentSearch: () => void;
  contextTransitionBannerFa: string | null;
  savedBannerFa: string | null;
}

export const GlobalSearchFilterToolbar: React.FC<GlobalSearchFilterToolbarProps> = ({
  cityNameFa,
  cityPlaces,
  filterStatus,
  draftFilters,
  setDraftFilters,
  setFilterStatus,
  handleTransactionChange,
  onApplyFilters,
  hasValidViewportBounds,
  onApplyMapBounds,
  onResetFiltersOnly,
  onResetFullSearch,
  sort,
  setSort,
  saveAlertFreq,
  setSaveAlertFreq,
  onSaveCurrentSearch,
  contextTransitionBannerFa,
  savedBannerFa,
}) => (
  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[var(--color-bg-muted)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-700 dark:text-[var(--color-text-primary)] flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-[var(--color-brand-600)]" />
          <span>فیلترها ({filterStatus}):</span>
        </span>
        <select
          aria-label="فیلتر محله"
          data-testid="search-filter-neighborhood"
          value={draftFilters.neighborhoodId || ''}
          onChange={(e) => {
            setDraftFilters({ ...draftFilters, neighborhoodId: e.target.value || undefined });
            setFilterStatus('DRAFT');
          }}
          className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-300 font-bold"
        >
          <option value="">همه محله‌های {cityNameFa}</option>
          {cityPlaces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.canonicalName}{p.district !== undefined ? ` (منطقه ${toPersianNum(p.district)})` : ''}
            </option>
          ))}
        </select>
        <select
          aria-label="نوع معامله"
          data-testid="search-filter-transaction"
          value={draftFilters.transactionType || ''}
          onChange={(e) => handleTransactionChange((e.target.value || undefined) as SearchFilterSet['transactionType'])}
          className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-300 font-bold"
        >
          <option value="">همه انواع معامله</option>
          <option value="BUY">خرید و فروش</option>
          <option value="RENT">رهن و اجاره</option>
          <option value="FULL_MORTGAGE">رهن کامل</option>
        </select>
        <select
          aria-label="تعداد اتاق خواب"
          data-testid="search-filter-bedrooms"
          value={draftFilters.bedrooms ? String(draftFilters.bedrooms) : ''}
          onChange={(e) => {
            setDraftFilters({ ...draftFilters, bedrooms: e.target.value ? Number(e.target.value) : undefined });
            setFilterStatus('DRAFT');
          }}
          className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-300 font-bold"
        >
          <option value="">همه تعداد اتاق</option>
          <option value="1">۱ خوابه</option>
          <option value="2">۲ خوابه</option>
          <option value="3">۳ خوابه</option>
        </select>
        <button
          type="button"
          data-testid="btn-apply-search-filters"
          onClick={onApplyFilters}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer"
        >
          اعمال فیلتر
        </button>
        <button
          type="button"
          data-testid="btn-search-in-map-bounds"
          disabled={!hasValidViewportBounds}
          title={hasValidViewportBounds ? 'افزودن محدوده فعلی نقشه به پیش‌نویس فیلترها' : 'محدوده نقشه هنوز آماده نیست'}
          onClick={onApplyMapBounds}
          className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border font-bold flex items-center gap-1 ${
            hasValidViewportBounds ? 'border-[var(--color-brand-600)] text-[var(--color-brand-600)] cursor-pointer' : 'border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>جست‌وجو در این محدوده نقشه</span>
        </button>
        <button
          type="button"
          data-testid="btn-reset-search-filters"
          onClick={onResetFiltersOnly}
          className="min-h-[38px] px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>پاک‌کردن فیلترها</span>
        </button>
        <button
          type="button"
          data-testid="btn-reset-full-search"
          onClick={onResetFullSearch}
          className="min-h-[38px] px-2 py-1.5 rounded-lg border border-rose-200 text-rose-700 flex items-center gap-1 cursor-pointer"
        >
          <span>پاک‌کردن جست‌وجوی کامل</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="مرتب‌سازی نتایج"
          data-testid="search-sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SearchSortOption)}
          className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-300 font-bold"
        >
          <option value="RELEVANCE">مرتبط‌ترین</option>
          <option value="NEWEST">جدیدترین</option>
          <option value="PRICE_ASC">کمترین قیمت پیشنهادی</option>
          <option value="PRICE_DESC">بیشترین قیمت پیشنهادی</option>
          <option value="QUALITY_SCORE_DESC">بالاترین کیفیت مستندات</option>
        </select>
        <select
          aria-label="تنظیم اعلان جست‌وجوی ذخیره‌شده"
          value={saveAlertFreq}
          onChange={(e) => setSaveAlertFreq(e.target.value as SavedSearchAlertFrequency)}
          className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-300"
        >
          <option value="OFF">ذخیره بدون اعلان</option>
          <option value="INSTANT">درخواست اعلان فوری</option>
          <option value="DAILY">درخواست خلاصه روزانه</option>
          <option value="WEEKLY">درخواست خلاصه هفتگی</option>
        </select>
        <button
          type="button"
          data-testid="btn-save-current-search"
          onClick={onSaveCurrentSearch}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1 cursor-pointer"
        >
          <BookmarkPlus className="w-3.5 h-3.5" />
          <span>ذخیره جست‌وجو</span>
        </button>
      </div>
    </div>
    {contextTransitionBannerFa && (
      <div data-testid="search-context-transition-banner" className="text-amber-700 dark:text-amber-300 font-bold">
        {contextTransitionBannerFa}
      </div>
    )}
    {savedBannerFa && (
      <div data-testid="saved-search-confirmation-banner" className="text-emerald-700 font-bold">
        {savedBannerFa}
      </div>
    )}
  </div>
);
