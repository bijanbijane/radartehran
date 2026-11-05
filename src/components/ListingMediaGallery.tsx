/**
 * @file src/components/ListingMediaGallery.tsx
 * @description گالری نمایش تصاویر و پخش ویدیوی آگهی‌های ملکی ذخیره‌شده روی آبجکت استوریج (Object Storage)
 */

import { useState } from 'react';
import { Database, Film, Image as ImageIcon, X } from 'lucide-react';
import type { BargainListing } from '../types/models';
import { toPersianNum } from '../data/neighborhoods';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import {
  AreaUnit,
  IntlCurrencyCode,
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../utils/areaUnit';

export interface ListingMediaGalleryProps {
  listing: BargainListing;
  estimatedMillionToman?: number;
  areaUnit?: AreaUnit;
  intlCurrency?: IntlCurrencyCode;
}

const FALLBACK_APARTMENT_SVG_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><rect width="320" height="220" fill="#0f172a"/><rect x="55" y="38" width="90" height="142" rx="4" fill="#334155"/><rect x="160" y="24" width="105" height="156" rx="4" fill="#1e293b"/><rect x="72" y="55" width="22" height="16" fill="#fde68a"/><rect x="108" y="55" width="22" height="16" fill="#38bdf8"/><rect x="72" y="85" width="22" height="16" fill="#38bdf8"/><rect x="108" y="85" width="22" height="16" fill="#fde68a"/><rect x="180" y="46" width="26" height="18" fill="#fde68a"/><rect x="220" y="46" width="26" height="18" fill="#38bdf8"/><rect x="180" y="78" width="26" height="18" fill="#38bdf8"/><rect x="220" y="78" width="26" height="18" fill="#fde68a"/><rect y="180" width="320" height="40" fill="#059669"/><text x="160" y="205" text-anchor="middle" fill="#ffffff" font-family="Tahoma,sans-serif" font-size="12" font-weight="bold">نمای واحد مسکونی — رادار مسکن</text></svg>`
  );

export function ListingMediaGallery({
  listing,
  estimatedMillionToman,
  areaUnit: areaUnitProp,
  intlCurrency: intlCurrencyProp,
}: ListingMediaGalleryProps) {
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [hookUnit] = useAreaUnit();
  const [hookCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  const areaUnit = areaUnitProp ?? hookUnit;
  const intlCurrency = intlCurrencyProp ?? hookCurrency;

  const rawImages = [
    ...(typeof listing.imageUrl === 'string' ? [listing.imageUrl] : []),
    ...(Array.isArray(listing.imageUrls) ? listing.imageUrls : []),
  ];
  const isSafeMediaUrl = (u: string): boolean => {
    const trimmed = u.trim();
    return (
      trimmed.startsWith('/api/object-storage/file/') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:image/')
    );
  };
  const imageUrls = Array.from(
    new Set(rawImages.filter((u): u is string => typeof u === 'string' && isSafeMediaUrl(u)))
  );
  const videoUrl =
    typeof listing.videoUrl === 'string' && isSafeMediaUrl(listing.videoUrl)
      ? listing.videoUrl.trim()
      : null;

  if (imageUrls.length === 0 && !videoUrl) {
    return null;
  }

  const bucketName = listing.objectStorageBucket || 'tehran-housing-radar-media';
  const objectKeys = Array.isArray(listing.objectStorageKeys) ? listing.objectStorageKeys : [];
  const resolveImgSrc = (url: string) => (failedUrls[url] ? FALLBACK_APARTMENT_SVG_DATA_URI : url);
  const effectiveMillion = typeof estimatedMillionToman === 'number' && estimatedMillionToman > 0 ? estimatedMillionToman : Math.max(100, listing.sqm * 80);
  const unitPricePerSqm = Math.max(10, Math.round(effectiveMillion / Math.max(1, listing.sqm)));
  const unitPrice = convertPricePerSqmToUnit(unitPricePerSqm, areaUnit);
  const estMonthlyRentMillions = Math.max(5, Math.round(effectiveMillion * 0.0038));

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-1.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-2.5 py-1.5 text-[10.5px]">
        <span className="flex items-center gap-1 font-bold text-emerald-900">
          <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            مدیای آگهی ({formatAreaShort(listing.sqm, areaUnit)} · هر {areaUnit === 'sqft' ? 'ft²' : 'متر'}: {toPersianNum(unitPrice)} م · کل: {toPersianNum(effectiveMillion.toLocaleString('en-US'))} م ({formatMillionTomanAsIntlCurrency(effectiveMillion, intlCurrency, radarLocale)}) · اجاره ماهانه: {toPersianNum(estMonthlyRentMillions)} م ({formatMillionTomanAsIntlCurrency(estMonthlyRentMillions, intlCurrency, radarLocale)})) روی Object Storage ({toPersianNum(imageUrls.length)} عکس
            {videoUrl ? ' + ۱ فیلم' : ''})
          </span>
        </span>
        <span dir="ltr" className="font-mono text-[9.5px] text-emerald-800 font-semibold truncate">
          s3://{bucketName}
        </span>
      </div>

      {imageUrls.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {imageUrls.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedImageUrl(url)}
              className="relative group rounded-xl overflow-hidden border border-slate-200 hover:border-emerald-500 w-20 h-16 shrink-0 cursor-pointer"
              title="مشاهده تصویر در اندازه کامل از آبجکت استوریج"
            >
              <img
                src={resolveImgSrc(url)}
                onError={() => setFailedUrls((prev) => ({ ...prev, [url]: true }))}
                alt={`${listing.title} - تصویر ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-900/75 text-white text-[9px] font-bold flex items-center gap-0.5">
                <ImageIcon className="w-2.5 h-2.5" />
                {toPersianNum(idx + 1)}
              </span>
            </button>
          ))}
        </div>
      )}

      {videoUrl && (
        <div>
          {!showVideoPlayer ? (
            <button
              type="button"
              onClick={() => setShowVideoPlayer(true)}
              className="w-full py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Film className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>پخش ویدیوی تور ملک از آبجکت استوریج (Stream 206)</span>
            </button>
          ) : (
            <div className="bg-slate-900 rounded-xl p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-300 px-1">
                <span>پخش مستقیم از Object Storage ({bucketName})</span>
                <button
                  type="button"
                  onClick={() => setShowVideoPlayer(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  بستن ویدیو
                </button>
              </div>
              <video
                src={videoUrl}
                controls
                preload="metadata"
                className="w-full max-h-48 rounded-lg bg-black"
              />
            </div>
          )}
        </div>
      )}

      {objectKeys.length > 0 && (
        <div
          dir="ltr"
          className="text-[9.5px] font-mono text-slate-400 truncate"
          title={objectKeys.join(', ')}
        >
          Key: {objectKeys[0]}
        </div>
      )}

      {selectedImageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedImageUrl(null)}
          className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full p-3 space-y-2 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-extrabold text-slate-900 truncate">
                {listing.title} — فایل آبجکت استوریج
              </span>
              <button
                type="button"
                onClick={() => setSelectedImageUrl(null)}
                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={resolveImgSrc(selectedImageUrl)}
              onError={() =>
                setFailedUrls((prev) => ({ ...prev, [selectedImageUrl]: true }))
              }
              alt={listing.title}
              className="w-full max-h-[70vh] object-contain rounded-xl bg-slate-950"
            />
          </div>
        </div>
      )}
    </div>
  );
}
