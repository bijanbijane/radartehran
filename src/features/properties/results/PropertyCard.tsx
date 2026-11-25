/** @file src/features/properties/results/PropertyCard.tsx — Fixed-Aspect Non-Inflated Property Discovery Card */
import React from 'react';
import { Bookmark, Building2, MapPin, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
} from '../../../utils/areaUnit';
import { PROPERTY_TYPE_LABELS_FA } from '../types/property.types';
import {
  TRANSACTION_TYPE_LABELS_FA,
  type PropertyListingRecord,
} from '../types/listing.types';
import { isVerifiedListing } from '../services/propertySearchService';

export interface PropertyCardProps {
  record: PropertyListingRecord;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  isSaved: boolean;
  isCompared: boolean;
  isHighlighted: boolean;
  onHoverChange?: (listingId: string | null) => void;
  onOpenDetail: (listingId: string) => void;
  onToggleSave: (record: PropertyListingRecord) => void;
  onToggleCompare: (listingId: string) => void;
  onLocateOnMap: (record: PropertyListingRecord) => void;
  onOpenValuation?: (record: PropertyListingRecord) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  record,
  areaUnit,
  intlCurrency,
  radarLocale,
  isSaved,
  isHighlighted,
  onHoverChange,
  onOpenDetail,
  onToggleSave,
}) => {
  const { property, listing } = record;
  const verified = isVerifiedListing(record);
  const firstValidImage = property.media.find((m) => m.valid && m.url)?.url || null;
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : 'متر';

  const priceBlock = () => {
    const p = listing.price;
    if (p.priceType === 'undisclosed') {
      return { main: 'توافقی / استعلامی', sub: 'قیمت عددی ثبت نشده است' };
    }
    if (listing.transactionType === 'sale' || listing.transactionType === 'presale') {
      const totalM = p.saleTotalMillion || 0;
      const perUnit = p.pricePerSqmMillion ? convertPricePerSqmToUnit(p.pricePerSqmMillion, areaUnit) : null;
      const fx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(totalM, intlCurrency, radarLocale)}` : '';
      return {
        main: `${toPersianNum((totalM / 1000).toFixed(2).replace('.', '٫'))} میلیارد تومان`,
        sub: `${perUnit ? `هر ${unitLabel}: ${toPersianNum(perUnit)} م` : 'قیمت کل'}${fx}`,
      };
    }
    const depM = p.depositMillion || 0;
    const rentM = p.monthlyRentMillion || 0;
    return {
      main: `ودیعه ${toPersianNum(Math.round(depM).toLocaleString())} م`,
      sub: rentM > 0 ? `اجاره ماهانه: ${toPersianNum(rentM)} م` : 'رهن کامل',
    };
  };

  const priceText = priceBlock();

  const knownSpecs: string[] = [];
  if (property.areaSqm) knownSpecs.push(formatAreaShort(property.areaSqm, areaUnit));
  if (property.roomsCount !== null) knownSpecs.push(`${toPersianNum(property.roomsCount)} خواب`);
  if (property.unitFeatures.parking === 'has') knownSpecs.push('دارای پارکینگ');
  else if (property.unitFeatures.parking === 'lacks') knownSpecs.push('بدون پارکینگ');

  return (
    <article
      data-testid={`property-card-${listing.listingId}`}
      onMouseEnter={() => onHoverChange?.(listing.listingId)}
      onMouseLeave={() => onHoverChange?.(null)}
      className={`rt-card rounded-[14px] bg-[var(--color-bg-surface)] border transition overflow-hidden flex flex-col justify-between ${
        isHighlighted
          ? 'border-[var(--color-brand-600)] ring-1 ring-[var(--color-brand-600)]/40'
          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand-600)]/60'
      }`}
    >
      {/* Visual media frame: real photo when available, or crisp architectural zone map illustration */}
      {firstValidImage ? (
        <div className="aspect-[16/9] w-full bg-[var(--color-bg-muted)] relative overflow-hidden border-b border-[var(--color-border-subtle)]">
          <img src={firstValidImage} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute top-2.5 right-2.5">
            <span className="px-2.5 py-1 rounded-[7px] bg-slate-900/85 text-white text-xs font-bold">
              {TRANSACTION_TYPE_LABELS_FA[listing.transactionType]} · {PROPERTY_TYPE_LABELS_FA[property.propertyType]}
            </span>
          </div>
          {verified && (
            <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-[7px] bg-[#EAF5EE] text-[#176B4C] text-xs font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>راستی‌آزمایی‌شده</span>
            </div>
          )}
        </div>
      ) : (
        <div className="relative h-[126px] w-full bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-subtle)] overflow-hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 320 126"
            className="w-full h-full opacity-55 text-[var(--color-brand-600)]"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern id={`rt-grid-${listing.listingId}`} width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="320" height="126" fill={`url(#rt-grid-${listing.listingId})`} />
            <path d="M0 98 Q85 62 168 78 T320 44" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.6" />
            <circle cx="160" cy="64" r="26" fill="currentColor" fillOpacity="0.08" />
            <circle cx="160" cy="64" r="7" fill="currentColor" fillOpacity="0.32" />
          </svg>
          <div className="absolute inset-0 p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2.5 py-1 rounded-[7px] bg-[var(--color-bg-surface)]/95 border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] text-xs font-bold inline-flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" aria-hidden="true" />
                <span>{TRANSACTION_TYPE_LABELS_FA[listing.transactionType]} · {PROPERTY_TYPE_LABELS_FA[property.propertyType]}</span>
              </span>
              {verified && (
                <span className="px-2.5 py-1 rounded-[7px] bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] text-xs font-bold inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>راستی‌آزمایی‌شده</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-text-primary)]">
              <MapPin className="w-4 h-4 text-[var(--color-brand-fg)] shrink-0" aria-hidden="true" />
              <span className="truncate">{property.hoodName} · {property.street}</span>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          {firstValidImage && (
            <div className="text-sm text-[var(--color-text-muted)] font-medium truncate">
              {property.hoodName} · {property.street}
            </div>
          )}

          <h2 className="text-base font-bold text-[var(--color-text-primary)] leading-snug">
            <button
              type="button"
              onClick={() => onOpenDetail(listing.listingId)}
              className="w-full min-h-[44px] md:min-h-0 flex items-center text-start hover:text-[var(--color-brand-fg)] transition line-clamp-2 cursor-pointer"
            >
              {listing.title}
            </button>
          </h2>

          {knownSpecs.length > 0 && (
            <div className="text-sm text-[var(--color-text-secondary)] tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
              {knownSpecs.map((spec, idx) => (
                <React.Fragment key={spec}>
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <span>{spec}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
          <div className="flex items-baseline justify-between gap-2 tabular-nums">
            <div>
              <div className="text-base font-bold text-[var(--color-text-primary)]">{priceText.main}</div>
              <div className="text-sm text-[var(--color-text-muted)]">{priceText.sub}</div>
            </div>
            {listing.marketContext.gapPercentFromV64 !== null && (
              <span
                className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-[7px] ${
                  listing.marketContext.gapPercentFromV64 <= 0
                    ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)]'
                    : 'bg-amber-500/15 text-[#875000] dark:text-amber-300'
                }`}
              >
                {listing.marketContext.gapPercentFromV64 < 0
                  ? `${toPersianNum(Math.abs(listing.marketContext.gapPercentFromV64))}٪ زیر میانگین`
                  : listing.marketContext.gapPercentFromV64 > 0
                    ? `${toPersianNum(listing.marketContext.gapPercentFromV64)}٪ بالای میانگین`
                    : 'هم‌سطح میانگین'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              data-testid={`open-detail-${listing.listingId}`}
              onClick={() => onOpenDetail(listing.listingId)}
              className="flex-1 min-h-[44px] md:min-h-[40px] px-3 rounded-[9px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer transition"
            >
              جزئیات کامل ملک
            </button>
            <button
              type="button"
              onClick={() => onToggleSave(record)}
              aria-pressed={isSaved}
              aria-label="ذخیره ملک"
              title="ذخیره فایل"
              className={`min-h-[44px] min-w-[44px] md:min-h-[40px] md:min-w-[40px] px-2.5 rounded-[9px] border cursor-pointer flex items-center justify-center transition ${
                isSaved
                  ? 'bg-[var(--color-brand-soft)] border-[var(--color-brand-600)] text-[var(--color-brand-fg)]'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
              }`}
            >
              <Bookmark className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
