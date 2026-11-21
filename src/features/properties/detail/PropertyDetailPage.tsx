/** @file src/features/properties/detail/PropertyDetailPage.tsx — Complete 12-Col Property Detail Page */
import React from 'react';
import { ArrowRight, Bookmark, Calculator, GitCompare, MapPin } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type PrimaryViewId,
  type RadarLocale,
} from '../../../utils/areaUnit';
import { DataProvenanceBar } from '../../../components/common/RadarDataBadges';
import { PROPERTY_TYPE_LABELS_FA } from '../types/property.types';
import {
  LISTING_STATUS_LABELS_FA,
  TRANSACTION_TYPE_LABELS_FA,
  type PropertyListingRecord,
} from '../types/listing.types';
import type { ListingHistoryEvent, ListingReportReason } from '../types/listing-history.types';
import { PropertyGallery } from './PropertyGallery';
import { PropertySpecsAndLocationSection, PublisherAndReportBox } from './PropertyDetailSections';
import { PropertyCard } from '../results/PropertyCard';

export interface PropertyDetailPageProps {
  record: PropertyListingRecord;
  hood: EvaluatedNeighborhood;
  similarRecords: PropertyListingRecord[];
  historyEvents: ListingHistoryEvent[];
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  isSaved: boolean;
  isCompared: boolean;
  onBack: () => void;
  onOpenOtherDetail: (listingId: string) => void;
  onToggleSave: (record: PropertyListingRecord) => void;
  onToggleCompare: (listingId: string) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenValuation: (record: PropertyListingRecord) => void;
  onReportSubmitted: (listingId: string, reason: ListingReportReason, details: string) => void;
}

export const PropertyDetailPage: React.FC<PropertyDetailPageProps> = ({
  record,
  hood,
  similarRecords,
  historyEvents,
  areaUnit,
  intlCurrency,
  radarLocale,
  isSaved,
  isCompared,
  onBack,
  onOpenOtherDetail,
  onToggleSave,
  onToggleCompare,
  onSelectNeighborhood,
  onNavigateView,
  onOpenInspector,
  onOpenValuation,
  onReportSubmitted,
}) => {
  const { property, listing } = record;
  const p = listing.price;
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : 'متر';

  const priceSummaryText =
    p.priceType === 'undisclosed'
      ? 'توافقی / استعلامی'
      : p.saleTotalMillion
      ? `${toPersianNum((p.saleTotalMillion / 1000).toFixed(2))} میلیارد تومان`
      : `ودیعه ${toPersianNum(Math.round(p.depositMillion || 0).toLocaleString())} م`;

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 py-6 pb-24 lg:pb-8 space-y-5 animate-fadeIn" data-testid="property-detail-panel">
      {/* Breadcrumb & Back */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold text-[var(--color-text-primary)] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-[var(--color-bg-muted)] dark:hover:bg-slate-800"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به فهرست</span>
          </button>
          <span className="text-[var(--color-text-muted)] dark:text-slate-400">
            املاک / {property.hoodName} / {PROPERTY_TYPE_LABELS_FA[property.propertyType]}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`px-2.5 py-1 rounded-[7px] font-bold ${
              listing.status === 'published'
                ? 'bg-[#EAF5EE] text-[#176B4C]'
                : 'bg-[#FFF4E5] text-[#875000]'
            }`}
          >
            وضعیت فایل: {LISTING_STATUS_LABELS_FA[listing.status]}
          </span>
        </div>
      </div>

      {/* Responsive 12-Col Layout: 8 cols main / 4 cols sticky actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-5">
          <PropertyGallery media={property.media} title={listing.title} hoodName={property.hoodName} />

          <section className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-3">
            <div className="text-[11px] font-bold text-[var(--color-brand-600)] dark:text-emerald-400">
              {TRANSACTION_TYPE_LABELS_FA[listing.transactionType]} · {PROPERTY_TYPE_LABELS_FA[property.propertyType]} · {property.hoodName}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text-primary)] dark:text-white leading-snug">{listing.title}</h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] dark:text-slate-300 leading-relaxed">{listing.description}</p>
            <DataProvenanceBar
              sourceLabel={
                listing.sourceKind === 'curated_bargain'
                  ? 'فایل پیشنهادی منتخب در محله'
                  : listing.sourceKind === 'user_submitted'
                  ? 'آگهی ثبت‌شده مستقیم'
                  : 'شاخص مرجع محله در رادار تهران'
              }
              updatedAtLabel={`بروزرسانی: ${new Date(listing.updatedAtIso).toLocaleDateString('fa-IR')}`}
              methodLabel="تطبیق با شاخص پایه و سناریو v6.4 (غیرثبتی)"
              credibility={listing.verification.priceReasonableness === 'verified' ? 'verified' : 'estimated'}
              limitationNote="معامله ثبت‌شده در این صفحه نمایش داده نمی‌شود؛ مقایسه قیمتی بر اساس نرخ پیشنهادی پایه محله است و جایگزین کارشناسی فنی و استعلام ثبتی نیست."
            />
          </section>

          <PropertySpecsAndLocationSection record={record} hood={hood} areaUnit={areaUnit} historyEvents={historyEvents} />
        </div>

        <aside className="lg:col-span-4 lg:sticky lg:top-4 space-y-4">
          <div className="p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-4">
            <div>
              <div className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400">
                {p.priceType === 'negotiable' ? 'قیمت اعلامی (قابل مذاکره)' : p.priceType === 'fixed' ? 'قیمت قطعی اعلامی' : 'وضعیت قیمت'}
              </div>
              <div className="text-2xl font-black text-[var(--color-text-primary)] dark:text-white tabular-nums mt-0.5">{priceSummaryText}</div>
              {p.pricePerSqmMillion && (
                <div className="text-xs text-[var(--color-brand-600)] dark:text-emerald-400 font-bold tabular-nums mt-1">
                  هر {unitLabel}: {toPersianNum(convertPricePerSqmToUnit(p.pricePerSqmMillion, areaUnit))} میلیون
                  {intlCurrency !== 'IRT' && p.saleTotalMillion
                    ? ` · ${formatMillionTomanAsIntlCurrency(p.saleTotalMillion, intlCurrency, radarLocale)}`
                    : ''}
                </div>
              )}
              {property.areaSqm && (
                <div className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400 mt-1 tabular-nums">
                  متراژ ثبت‌شده: {formatAreaShort(property.areaSqm, areaUnit)}
                </div>
              )}
            </div>

            {listing.marketContext.gapPercentFromV64 !== null && (
              <div className="p-3 rounded-[9px] bg-[#EAF3F0] dark:bg-emerald-950/30 border border-[#B8D7CE] dark:border-emerald-800 text-xs">
                <span className="text-[var(--color-brand-700)] dark:text-emerald-300 font-bold tabular-nums">
                  {listing.marketContext.gapPercentFromV64 <= 0
                    ? `${toPersianNum(Math.abs(listing.marketContext.gapPercentFromV64))}٪ پایین‌تر از سناریو v6.4 محله`
                    : `+${toPersianNum(listing.marketContext.gapPercentFromV64)}٪ بالاتر از سناریو v6.4 محله`}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onOpenValuation(record)}
                className="w-full py-2.5 px-3 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Calculator className="w-4 h-4" />
                <span>ارزش‌گذاری هدونیک این ملک</span>
              </button>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onToggleSave(record)}
                  className={`py-2 px-2.5 rounded-[9px] border font-bold flex items-center justify-center gap-1 cursor-pointer ${
                    isSaved ? 'bg-[#EAF3F0] border-[var(--color-brand-600)] text-[var(--color-brand-600)]' : 'border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-primary)] dark:text-slate-200'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{isSaved ? 'ذخیره‌شده' : 'ذخیره فایل'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCompare(listing.listingId)}
                  className={`py-2 px-2.5 rounded-[9px] border font-bold flex items-center justify-center gap-1 cursor-pointer ${
                    isCompared ? 'bg-[var(--color-brand-600)] border-[var(--color-brand-600)] text-white' : 'border-[var(--color-border-subtle)] dark:border-slate-700 text-[var(--color-text-primary)] dark:text-slate-200'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>{isCompared ? 'در مقایسه' : 'افزودن به مقایسه'}</span>
                </button>
              </div>
            </div>

            <PublisherAndReportBox
              record={record}
              onReportSubmitted={(reason, details) => onReportSubmitted(listing.listingId, reason, details)}
            />
          </div>

          {/* Neighborhood Context Card */}
          <div className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-2.5 text-xs">
            <h2 className="font-black text-[var(--color-text-primary)] dark:text-white">زمینه شهری محله {hood.name}</h2>
            <div className="space-y-1.5 tabular-nums">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">امتیاز کلی سکونت</span>
                <strong>{toPersianNum(hood.overallScore)} / ۱۰</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">مترو و دسترسی</span>
                <strong>{toPersianNum(hood.metro)} / ۱۰</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">کیفیت هوا</span>
                <strong>{toPersianNum(hood.air)} / ۱۰</strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => { onSelectNeighborhood(hood); onOpenInspector(hood); }}
                className="py-2 rounded-[8px] border border-[var(--color-border-subtle)] dark:border-slate-700 font-bold text-[var(--color-text-primary)] dark:text-slate-200 cursor-pointer"
              >
                کارنامه محله
              </button>
              <button
                type="button"
                onClick={() => { onSelectNeighborhood(hood); onNavigateView('map'); }}
                className="py-2 rounded-[8px] border border-[#B8D7CE] bg-[#EAF3F0] dark:bg-emerald-950/50 text-[var(--color-brand-700)] dark:text-emerald-300 font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>روی نقشه</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Similar Properties (Strictly distinct from Valuation Comparables) */}
      {similarRecords.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)] dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-[var(--color-text-primary)] dark:text-white">فایل‌های مشابه برای مرور (Similar Listings)</h2>
            <span className="text-[11px] text-[var(--color-text-muted)] dark:text-slate-400">مرتبط با جست‌وجو؛ مبنای معامله قطعی نیست</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {similarRecords.map((sim) => (
              <PropertyCard
                key={sim.listing.listingId}
                record={sim}
                areaUnit={areaUnit}
                intlCurrency={intlCurrency}
                radarLocale={radarLocale}
                isSaved={false}
                isCompared={false}
                isHighlighted={false}
                onOpenDetail={onOpenOtherDetail}
                onToggleSave={onToggleSave}
                onToggleCompare={onToggleCompare}
                onLocateOnMap={() => { onSelectNeighborhood(hood); onNavigateView('map'); }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
