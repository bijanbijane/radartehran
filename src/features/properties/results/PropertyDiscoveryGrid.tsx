/** @file src/features/properties/results/PropertyDiscoveryGrid.tsx — Split Results & Map Grid */
import React from 'react';
import { Building2 } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { AreaUnit, IntlCurrencyCode, PrimaryViewId, RadarLocale } from '../../../utils/areaUnit';
import type { AppliedPropertyFilters, GeoBounds } from '../filters/PropertyFilterDraft';
import type { PropertyExplorerViewMode } from '../filters/PropertyFilterBar';
import type { PropertyListingRecord } from '../types/listing.types';
import type { SavedPropertySnapshot } from '../services/listingService';
import { PropertyCard } from './PropertyCard';
import { PropertyMapPane } from '../map/PropertyMapPane';

export interface PropertyDiscoveryGridProps {
  records: PropertyListingRecord[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  applied: AppliedPropertyFilters;
  viewMode: PropertyExplorerViewMode;
  splitMapMode?: boolean;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  savedItems: SavedPropertySnapshot[];
  compareIds: string[];
  highlightedId: string | null;
  targetSqm: number;
  onHighlight: (id: string | null) => void;
  onChangeViewMode: (m: PropertyExplorerViewMode) => void;
  onOpenDetail: (id: string) => void;
  onToggleSave: (rec: PropertyListingRecord) => void;
  onToggleCompare: (id: string) => void;
  onOpenValuation: (hood: EvaluatedNeighborhood, params?: { sqm?: number }) => void;
  onSearchInViewport: (bounds: GeoBounds) => void;
  onClearViewportBounds: () => void;
  onNavigateView: (view: PrimaryViewId) => void;
  onResetAll: () => void;
}

export const PropertyDiscoveryGrid: React.FC<PropertyDiscoveryGridProps> = ({
  records,
  evaluatedNeighborhoods,
  selectedHood,
  applied,
  viewMode,
  splitMapMode,
  areaUnit,
  intlCurrency,
  radarLocale,
  savedItems,
  compareIds,
  highlightedId,
  targetSqm,
  onHighlight,
  onChangeViewMode,
  onOpenDetail,
  onToggleSave,
  onToggleCompare,
  onOpenValuation,
  onSearchInViewport,
  onClearViewportBounds,
  onNavigateView,
  onResetAll,
}) => {
  if (
    (applied.propertyType === 'commercial' || applied.propertyType === 'office' || applied.propertyType === 'land') &&
    records.length === 0
  ) {
    return (
      <div className="p-8 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 text-center space-y-3">
        <Building2 className="w-8 h-8 text-[#875000] mx-auto" />
        <h2 className="text-base font-black text-[var(--color-text-primary)] dark:text-white">
          فایل ثبت‌شده‌ای با این کاربری هنوز وجود ندارد
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
          پایگاه پیش‌فرض رادار تهران بر فایل‌های مسکونی متمرکز است و داده‌های مصنوعی برای کاربری‌های دیگر تولید نمی‌شود؛ می‌توانید از دکمه «ثبت فایل جدید» فایل خود را ثبت یا فیلترها را بازنشانی کنید.
        </p>
        <button type="button" onClick={onResetAll} className="px-4 py-2 rounded-[9px] bg-[var(--color-brand-600)] text-white text-xs font-bold cursor-pointer">
          نمایش همه فایل‌های موجود
        </button>
      </div>
    );
  }

  if (records.length === 0 && (!applied.onlyInMapBounds || viewMode === 'list')) {
    return (
      <div className="p-8 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 text-center space-y-3">
        <p className="text-sm font-bold text-[var(--color-text-primary)] dark:text-slate-200">فایلی با فیلتر فعلی یافت نشد.</p>
        <button type="button" onClick={onResetAll} className="px-4 py-1.5 rounded-[9px] bg-[var(--color-brand-600)] text-white text-xs font-bold cursor-pointer">
          پاک کردن فیلترها
        </button>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 items-start ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
      {viewMode !== 'map' && (
        <div
          className={`${
            viewMode === 'split'
              ? 'lg:col-span-6 grid grid-cols-1'
              : splitMapMode
                ? 'grid grid-cols-1 md:grid-cols-2'
                : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          } gap-4`}
        >
          {records.length === 0 ? (
            <div className="p-8 rounded-[14px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 text-center space-y-3">
              <p className="text-sm font-bold text-[var(--color-text-primary)] dark:text-slate-200">در این محدوده نقشه فایلی یافت نشد. می‌توانید نقشه را جابه‌جا یا کوچک‌نمایی کنید.</p>
              <button type="button" onClick={onClearViewportBounds} className="px-4 py-1.5 rounded-[9px] bg-[var(--color-brand-600)] text-white text-xs font-bold cursor-pointer">
                حذف محدوده نقشه
              </button>
            </div>
          ) : (
            records.slice(0, 24).map((rec) => {
              const hood = evaluatedNeighborhoods.find((h) => h.id === rec.property.hoodId) || selectedHood;
              return (
                <PropertyCard
                  key={rec.listing.listingId}
                  record={rec}
                  areaUnit={areaUnit}
                  intlCurrency={intlCurrency}
                  radarLocale={radarLocale}
                  isSaved={savedItems.some((s) => s.listingId === rec.listing.listingId)}
                  isCompared={compareIds.includes(rec.listing.listingId)}
                  isHighlighted={highlightedId === rec.listing.listingId}
                  onHoverChange={onHighlight}
                  onOpenDetail={onOpenDetail}
                  onToggleSave={onToggleSave}
                  onToggleCompare={onToggleCompare}
                  onLocateOnMap={(r) => {
                    onHighlight(r.listing.listingId);
                    if (viewMode === 'list') onChangeViewMode('split');
                  }}
                  onOpenValuation={(r) => onOpenValuation(hood, { sqm: r.property.areaSqm || targetSqm })}
                />
              );
            })
          )}
        </div>
      )}

      {viewMode !== 'list' && (
        <div className={viewMode === 'split' ? 'lg:col-span-6' : 'w-full'}>
          <PropertyMapPane
            records={records}
            highlightedListingId={highlightedId}
            selectedHoodName={selectedHood.name}
            centerLat={selectedHood.lat}
            centerLng={selectedHood.lng}
            cityScopeKey={`${selectedHood.id}:${selectedHood.name}`}
            boundsActive={applied.onlyInMapBounds}
            onHighlightListing={onHighlight}
            onOpenDetail={onOpenDetail}
            onSearchInViewport={onSearchInViewport}
            onClearViewportBounds={onClearViewportBounds}
            onOpenFullMap={() => onNavigateView('map')}
          />
        </div>
      )}
    </div>
  );
};
