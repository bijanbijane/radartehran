/** @file src/features/properties/results/PropertyCard.tsx — Fixed-Aspect Non-Inflated Property Discovery Card */
import React from 'react';
import { Bookmark, Building2, Calculator, GitCompare, MapPin, ShieldCheck } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
  type AreaUnit,
  type IntlCurrencyCode,
  type RadarLocale,
} from '../../../utils/areaUnit';
import {
  PROPERTY_TYPE_LABELS_FA,
} from '../types/property.types';
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
  isCompared,
  isHighlighted,
  onHoverChange,
  onOpenDetail,
  onToggleSave,
  onToggleCompare,
  onLocateOnMap,
  onOpenValuation,
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
      {/* Media frame if valid photo exists, otherwise compact typographic header (zero empty grey placeholder boxes) */}
      {firstValidImage ? (
        <div className="aspect-[16/9] w-full bg-[var(--color-bg-muted)] relative overflow-hidden border-b border-[var(--color-border-subtle)]">
          <img src={firstValidImage} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-[7px] bg-slate-900/85 text-white text-xs font-bold">
              {TRANSACTION_TYPE_LABELS_FA[listing.transactionType]} · {PROPERTY_TYPE_LABELS_FA[property.propertyType]}
            </span>
          </div>
          {verified && (
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-[7px] bg-[#EAF5EE] text-[#176B4C] text-xs font-bold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>راستی‌آزمایی‌شده</span>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-2.5 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-[var(--color-brand-fg)] shrink-0" aria-hidden="true" />
            <span className="font-bold text-[var(--color-text-primary)] truncate">
              {TRANSACTION_TYPE_LABELS_FA[listing.transactionType]} · {PROPERTY_TYPE_LABELS_FA[property.propertyType]}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-[var(--color-text-muted)]">
            {verified && (
              <span className="text-[var(--color-brand-fg)] font-bold inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>راستی‌آزمایی‌شده</span>
              </span>
            )}
            {verified && <span aria-hidden="true">·</span>}
            <span>{property.locationPrecision === 'approximate' ? 'موقعیت تقریبی' : 'سطح محله'}</span>
          </div>
        </div>
      )}

      <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
        <div className="space-y-1.5">
          <div className="text-xs text-[var(--color-text-muted)] font-medium flex items-center justify-between gap-2">
            <span className="truncate">
              {property.hoodName} · {property.street}
            </span>
            <span className="shrink-0 tabular-nums">
              {listing.sourceKind === 'curated_bargain' ? 'فایل زیر عرف' : listing.sourceKind === 'user_submitted' ? 'ثبت مستقیم' : 'شاخص محله'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenDetail(listing.listingId)}
            className="text-start text-sm font-bold text-[var(--color-text-primary)] hover:text-[var(--color-brand-fg)] transition line-clamp-2 cursor-pointer"
          >
            {listing.title}
          </button>

          <div className="text-xs text-[var(--color-text-secondary)] tabular-nums flex flex-wrap gap-x-2">
            <span>{property.areaSqm ? formatAreaShort(property.areaSqm, areaUnit) : 'متراژ نامشخص'}</span>
            <span aria-hidden="true">·</span>
            <span>{property.roomsCount !== null ? `${toPersianNum(property.roomsCount)} خواب` : 'تعداد خواب نامشخص'}</span>
            <span aria-hidden="true">·</span>
            <span>پارکینگ: {property.unitFeatures.parking === 'has' ? 'دارد' : property.unitFeatures.parking === 'lacks' ? 'ندارد' : 'نامشخص'}</span>
          </div>
        </div>

        <div className="pt-2.5 border-t border-[var(--color-border-subtle)] space-y-2.5">
          <div className="flex items-baseline justify-between gap-2 tabular-nums">
            <div>
              <div className="text-sm font-bold text-[var(--color-text-primary)]">{priceText.main}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{priceText.sub}</div>
            </div>
            {listing.marketContext.gapPercentFromV64 !== null && (
              <span
                className={`text-xs font-bold shrink-0 ${
                  listing.marketContext.gapPercentFromV64 <= 0 ? 'text-[var(--color-brand-fg)]' : 'text-[#875000] dark:text-amber-300'
                }`}
              >
                {listing.marketContext.gapPercentFromV64 < 0
                  ? `${toPersianNum(Math.abs(listing.marketContext.gapPercentFromV64))}٪ پایین‌تر از میانگین محله`
                  : listing.marketContext.gapPercentFromV64 > 0
                    ? `${toPersianNum(listing.marketContext.gapPercentFromV64)}٪ بالاتر از میانگین محله`
                    : 'هم‌سطح میانگین محله'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              data-testid={`open-detail-${listing.listingId}`}
              onClick={() => onOpenDetail(listing.listingId)}
              className="flex-1 min-h-[44px] md:min-h-[36px] px-2.5 rounded-[8px] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer transition"
            >
              جزئیات کامل ملک
            </button>
            {onOpenValuation && (
              <button
                type="button"
                onClick={() => onOpenValuation(record)}
                aria-label="ارزش‌گذاری این ملک"
                title="ارزش‌گذاری هدونیک این ملک"
                className="min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] px-2 rounded-[8px] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer flex items-center justify-center"
              >
                <Calculator className="w-4 h-4 text-[var(--color-brand-fg)]" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleCompare(listing.listingId)}
              aria-pressed={isCompared}
              aria-label="افزودن به مقایسه"
              title="مقایسه ملک"
              className={`min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] px-2 rounded-[8px] border cursor-pointer flex items-center justify-center ${
                isCompared
                  ? 'bg-[var(--color-brand-600)] text-white border-[var(--color-brand-600)]'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
              }`}
            >
              <GitCompare className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleSave(record)}
              aria-pressed={isSaved}
              aria-label="ذخیره ملک"
              title="ذخیره فایل"
              className={`min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] px-2 rounded-[8px] border cursor-pointer flex items-center justify-center ${
                isSaved
                  ? 'bg-[var(--color-brand-soft)] border-[var(--color-brand-600)] text-[var(--color-brand-fg)]'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
              }`}
            >
              <Bookmark className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onLocateOnMap(record)}
              aria-label="نمایش روی نقشه"
              title="نمایش موقعیت"
              className="min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] px-2 rounded-[8px] border border-[var(--color-border-subtle)] text-[var(--color-brand-fg)] hover:bg-[var(--color-bg-muted)] cursor-pointer flex items-center justify-center"
            >
              <MapPin className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
