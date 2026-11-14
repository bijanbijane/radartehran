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
        main: `${toPersianNum((totalM / 1000).toFixed(2))} میلیارد تومان`,
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
      className={`rounded-[14px] bg-white dark:bg-slate-900 border transition overflow-hidden flex flex-col justify-between ${
        isHighlighted
          ? 'border-[#176B63] ring-1 ring-[#176B63]/40'
          : 'border-[#DCE3DF] dark:border-slate-800 hover:border-[#176B63]/60'
      }`}
    >
      {/* Fixed 16:9 media frame OR honest architectural placeholder (no fake stock photos) */}
      <div className="aspect-[16/9] w-full bg-[#F1F4F2] dark:bg-slate-800/80 relative overflow-hidden border-b border-[#DCE3DF] dark:border-slate-800">
        {firstValidImage ? (
          <img src={firstValidImage} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 text-[#586760] dark:text-slate-400">
            <Building2 className="w-7 h-7 opacity-60 mb-1.5" />
            <span className="text-[11px] font-bold">بدون تصویر تأییدشده توسط ثبت‌کننده</span>
            <span className="text-[10px] opacity-75">
              محدوده: {property.hoodName} · {property.locationPrecision === 'approximate' ? 'موقعیت تقریبی' : 'سطح محله'}
            </span>
          </div>
        )}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-[7px] bg-slate-900/85 text-white text-[10.5px] font-bold">
            {TRANSACTION_TYPE_LABELS_FA[listing.transactionType]} · {PROPERTY_TYPE_LABELS_FA[property.propertyType]}
          </span>
        </div>
        {verified && (
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-[7px] bg-[#EAF5EE] text-[#176B4C] text-[10.5px] font-bold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>راستی‌آزمایی‌شده</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
        <div className="space-y-1.5">
          <div className="text-[11px] text-[#586760] dark:text-slate-400 font-medium flex items-center justify-between gap-2">
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
            className="text-start text-sm font-black text-[#182522] dark:text-white hover:text-[#176B63] dark:hover:text-emerald-400 transition line-clamp-2 cursor-pointer"
          >
            {listing.title}
          </button>

          <div className="text-[11px] text-[#48534F] dark:text-slate-300 tabular-nums flex flex-wrap gap-x-2">
            <span>{property.areaSqm ? formatAreaShort(property.areaSqm, areaUnit) : 'متراژ نامشخص'}</span>
            <span>·</span>
            <span>{property.roomsCount !== null ? `${toPersianNum(property.roomsCount)} خواب` : 'تعداد خواب نامشخص'}</span>
            <span>·</span>
            <span>پارکینگ: {property.unitFeatures.parking === 'has' ? 'دارد' : property.unitFeatures.parking === 'lacks' ? 'ندارد' : 'نامشخص'}</span>
          </div>
        </div>

        <div className="pt-2.5 border-t border-[#DCE3DF] dark:border-slate-800 space-y-2.5">
          <div className="flex items-baseline justify-between gap-2 tabular-nums">
            <div>
              <div className="text-sm font-black text-[#182522] dark:text-white">{priceText.main}</div>
              <div className="text-[10.5px] text-[#586760] dark:text-slate-400">{priceText.sub}</div>
            </div>
            {listing.marketContext.gapPercentFromV64 !== null && (
              <span
                className={`text-[11px] font-bold shrink-0 ${
                  listing.marketContext.gapPercentFromV64 <= 0 ? 'text-[#176B4C] dark:text-emerald-400' : 'text-[#875000] dark:text-amber-400'
                }`}
              >
                {listing.marketContext.gapPercentFromV64 <= 0 ? '' : '+'}
                {toPersianNum(listing.marketContext.gapPercentFromV64)}٪ نسبت به سناریو v6.4
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              data-testid={`open-detail-${listing.listingId}`}
              onClick={() => onOpenDetail(listing.listingId)}
              className="flex-1 min-h-[36px] px-2.5 rounded-[8px] bg-[#176B63] hover:bg-[#14534E] text-white font-bold cursor-pointer transition"
            >
              جزئیات کامل ملک
            </button>
            {onOpenValuation && (
              <button
                type="button"
                onClick={() => onOpenValuation(record)}
                aria-label="ارزش‌گذاری این ملک"
                title="ارزش‌گذاری هدونیک این ملک"
                className="min-h-[36px] px-2.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-slate-200 hover:bg-[#F1F4F2] dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center"
              >
                <Calculator className="w-3.5 h-3.5 text-[#176B63]" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleCompare(listing.listingId)}
              aria-pressed={isCompared}
              aria-label="افزودن به مقایسه"
              title="مقایسه ملک"
              className={`min-h-[36px] px-2.5 rounded-[8px] border cursor-pointer flex items-center justify-center ${
                isCompared
                  ? 'bg-[#176B63] text-white border-[#176B63]'
                  : 'border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onToggleSave(record)}
              aria-pressed={isSaved}
              aria-label="ذخیره ملک"
              title="ذخیره فایل"
              className={`min-h-[36px] px-2.5 rounded-[8px] border cursor-pointer flex items-center justify-center ${
                isSaved
                  ? 'bg-[#EAF3F0] border-[#176B63] text-[#176B63]'
                  : 'border-[#DCE3DF] dark:border-slate-700 text-[#48534F] dark:text-slate-300'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onLocateOnMap(record)}
              aria-label="نمایش روی نقشه"
              title="نمایش موقعیت"
              className="min-h-[36px] px-2.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[#14534E] dark:text-emerald-300 cursor-pointer flex items-center justify-center"
            >
              <MapPin className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
