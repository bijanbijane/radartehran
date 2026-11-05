import type { BargainListing } from '../types/models'; import type { ListingMediaObject } from './objectStorage';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface ListingPublicationInfoFa { hasKnownTimestamp: boolean; createdAtIso?: string; relativeLabelFa: string; fullDateFa: string; dateTimeFa: string; badgeTextFa: string; displayAreaUnitLabel?: string; publicationFeeBenchmarkIntlText?: string; }
export interface ImageDimensionQualityResult { valid: boolean; status: 'invalid' | 'low_resolution' | 'unusual_aspect_ratio' | 'optimal'; messageFa?: string; } const TEHRAN_TIMEZONE = 'Asia/Tehran'; const MIN_PLAUSIBLE_TIMESTAMP_MS = Date.UTC(2020, 0, 1, 0, 0, 0); const MAX_FUTURE_DRIFT_MS = 365 * 24 * 60 * 60 * 1000; const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']; function toPersianDigits(value: number | string): string { return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] || digit); }
export function normalizeListingTimestampIso( raw: unknown, nowMs: number = Date.now(), ): string | undefined { if (raw === null || raw === undefined) return undefined; let dateObj: Date | null = null;
  if (raw instanceof Date) { dateObj = raw; } else if (typeof raw === 'string') { const trimmed = raw.trim(); if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(trimmed)) { return undefined; }
    const parsedMs = Date.parse(trimmed); if (Number.isFinite(parsedMs)) { dateObj = new Date(parsedMs); }
  } else if (typeof raw === 'object') { const candidate = raw as { toDate?: () => unknown; toMillis?: () => unknown; seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown; _nanoseconds?: unknown;
    }; if (typeof candidate.toDate === 'function') { try { const converted = candidate.toDate();
        if (converted instanceof Date) { dateObj = converted; }
      } catch { dateObj = null; }
    } else if (typeof candidate.toMillis === 'function') { try { const ms = candidate.toMillis(); if (typeof ms === 'number' && Number.isFinite(ms)) {
          dateObj = new Date(ms);
        }
      } catch {
        dateObj = null;
      }
    } else {
      const secs =
        typeof candidate.seconds === 'number'
          ? candidate.seconds
          : typeof candidate._seconds === 'number'
            ? candidate._seconds
            : null;
      const nanos =
        typeof candidate.nanoseconds === 'number'
          ? candidate.nanoseconds
          : typeof candidate._nanoseconds === 'number'
            ? candidate._nanoseconds
            : 0;
      if (secs !== null && Number.isFinite(secs)) {
        dateObj = new Date(secs * 1000 + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1_000_000));
      }
    }
  }
  if (!dateObj) return undefined;
  const ms = dateObj.getTime();
  if (!Number.isFinite(ms)) return undefined;
  if (ms < MIN_PLAUSIBLE_TIMESTAMP_MS || ms > nowMs + MAX_FUTURE_DRIFT_MS) {
    return undefined;
  }
  return new Date(ms).toISOString();
}
function getTehranCalendarDayKey(ms: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
    const year = Number(parts.find((p) => p.type === 'year')?.value || 0);
    const month = Number(parts.find((p) => p.type === 'month')?.value || 1);
    const day = Number(parts.find((p) => p.type === 'day')?.value || 1);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  } catch {
    return Math.floor(ms / 86_400_000);
  }
}
export function formatListingPublicationInfoFa(
  createdAtIso?: string | null,
  nowMs: number = Date.now(),
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): ListingPublicationInfoFa {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const publicationFeeBenchmarkIntlText = formatMillionTomanAsIntlCurrency(1, intlCurrency);
  const normalized = normalizeListingTimestampIso(createdAtIso, nowMs);
  if (!normalized) {
    return {
      hasKnownTimestamp: false,
      relativeLabelFa: 'تاریخ انتشار نامشخص',
      fullDateFa: 'تاریخ انتشار نامشخص',
      dateTimeFa: 'تاریخ انتشار نامشخص',
      badgeTextFa: 'تاریخ انتشار نامشخص',
      displayAreaUnitLabel,
      publicationFeeBenchmarkIntlText,
    };
  }
  const createdMs = Date.parse(normalized);
  const dateObj = new Date(createdMs);
  let persianDateStr = normalized.slice(0, 10);
  let persianDateTimeStr = normalized;
  try {
    persianDateStr = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TEHRAN_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
    persianDateTimeStr = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TEHRAN_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dateObj);
  } catch {
  }
  const nowDayKey = getTehranCalendarDayKey(nowMs);
  const createdDayKey = getTehranCalendarDayKey(createdMs);
  const dayDiff = Math.max(0, nowDayKey - createdDayKey);
  let relativeLabelFa: string;
  if (dayDiff === 0) relativeLabelFa = 'امروز منتشر شده';
  else if (dayDiff === 1) relativeLabelFa = 'دیروز منتشر شده';
  else if (dayDiff <= 30) relativeLabelFa = `${toPersianDigits(dayDiff)} روز پیش منتشر شده`;
  else relativeLabelFa = `تاریخ انتشار: ${persianDateStr}`;
  const fullDateFa = `تاریخ انتشار: ${persianDateStr}`;
  return {
    hasKnownTimestamp: true,
    createdAtIso: normalized,
    relativeLabelFa,
    fullDateFa,
    dateTimeFa: `تاریخ انتشار: ${persianDateTimeStr}`,
    badgeTextFa: dayDiff <= 30 ? `${relativeLabelFa} (${persianDateStr})` : fullDateFa,
    displayAreaUnitLabel,
    publicationFeeBenchmarkIntlText,
  };
}
export function sortBargainListingsByCreatedAt<T extends Pick<BargainListing, 'id' | 'createdAtIso'>>(
  listings: readonly T[],
  nowMs: number = Date.now(),
): T[] {
  return [...listings].sort((a, b) => {
    const aNorm = normalizeListingTimestampIso(a.createdAtIso, nowMs);
    const bNorm = normalizeListingTimestampIso(b.createdAtIso, nowMs);
    const aMs = aNorm ? Date.parse(aNorm) : NaN;
    const bMs = bNorm ? Date.parse(bNorm) : NaN;
    const aValid = Number.isFinite(aMs);
    const bValid = Number.isFinite(bMs);
    if (aValid && bValid && aMs !== bMs) return bMs - aMs;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return String(a.id).localeCompare(String(b.id));
  });
}
export async function computeFileContentSha256Hex(
  input: ArrayBuffer | Uint8Array | Blob,
): Promise<string> {
  let bytes: Uint8Array;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (typeof input.arrayBuffer === 'function') {
    const ab = await input.arrayBuffer();
    bytes = new Uint8Array(ab);
  } else {
    bytes = new Uint8Array(0);
  }
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const bufferCopy = new Uint8Array(bytes.byteLength);
    bufferCopy.set(bytes);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bufferCopy.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`.repeat(4);
}
export function validateImageDimensionsAndQuality(
  width: number,
  height: number,
  sizeBytes: number,
  maxBytes: number,
): ImageDimensionQualityResult {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return {
      valid: false,
      status: 'invalid',
      messageFa: 'فایل تصویر خالی یا نامعتبر است.',
    };
  }
  if (Number.isFinite(maxBytes) && maxBytes > 0 && sizeBytes > maxBytes) {
    return {
      valid: false,
      status: 'invalid',
      messageFa: 'حجم فایل تصویر بیش از سقف مجاز است.',
    };
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      valid: false,
      status: 'invalid',
      messageFa: 'ابعاد فایل تصویر قابل خواندن نیست یا فایل آسیب دیده است.',
    };
  }
  if (width < 64 || height < 64) {
    return {
      valid: false,
      status: 'invalid',
      messageFa: 'ابعاد تصویر بسیار کوچک‌تر از حد قابل قبول برای آگهی ملک است (حداقل ۶۴×۶۴ پیکسل).',
    };
  }
  if (width > 8192 || height > 8192 || width * height > 25_000_000) {
    return {
      valid: false,
      status: 'invalid',
      messageFa: 'ابعاد پیکسلی تصویر بیش از حد مجاز است (حداکثر ۸۱۹۲ پیکسل یا ۲۵ مگاپیکسل).',
    };
  }
  const ratio = width / height;
  if (ratio > 3.5 || ratio < 0.28) {
    return {
      valid: true,
      status: 'unusual_aspect_ratio',
      messageFa: 'نسبت ابعاد تصویر غیرمعمول است؛ برای نمایش بهتر روی کارت آگهی از تصاویر افقی استاندارد (۴:۳ یا ۱۶:۹) استفاده کنید.',
    };
  }
  if (width < 600 || height < 400) {
    return {
      valid: true,
      status: 'low_resolution',
      messageFa: `کیفیت تصویر پایین است (${toPersianDigits(width)}×${toPersianDigits(height)} پیکسل — پیشنهاد: حداقل ۸۰۰×۶۰۰ پیکسل).`,
    };
  }
  return {
    valid: true,
    status: 'optimal',
  };
}
/**
 * Reorder listing media items or promote an image to be the primary cover photo (`index 0` of images).
 * Preserves all item metadata (`id`, `objectKey`, `bucket`, `url`, etc.) and keeps any video item intact.
 */
export function reorderListingMediaItems(
  items: readonly ListingMediaObject[],
  targetId: string,
  action: 'earlier' | 'later' | 'set_cover',
): ListingMediaObject[] {
  const imageItems = items.filter((item) => item.mediaType === 'image');
  const videoItems = items.filter((item) => item.mediaType === 'video');
  const idx = imageItems.findIndex((item) => item.id === targetId);
  if (idx === -1) {
    return [...items];
  }
  const nextImages = [...imageItems];
  if (action === 'set_cover') {
    if (idx === 0) return [...items];
    const [selected] = nextImages.splice(idx, 1);
    nextImages.unshift(selected);
  } else if (action === 'earlier') {
    if (idx === 0) return [...items];
    const temp = nextImages[idx - 1];
    nextImages[idx - 1] = nextImages[idx];
    nextImages[idx] = temp;
  } else if (action === 'later') {
    if (idx >= nextImages.length - 1) return [...items];
    const temp = nextImages[idx + 1];
    nextImages[idx + 1] = nextImages[idx];
    nextImages[idx] = temp;
  }
  return [...nextImages, ...videoItems];
}
function isSafeOrderedMediaItem(item: ListingMediaObject): boolean {
  if (!item || typeof item !== 'object') return false;
  const u = typeof item.url === 'string' ? item.url.trim() : '';
  const k = typeof item.objectKey === 'string' ? item.objectKey.trim() : '';
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  return Boolean(u && !u.startsWith('//') && !/[\r\n\0]/.test(u) && (u.startsWith('/') || /^https:\/\//i.test(u)) && k && !k.includes('..') && id && /^[A-Za-z0-9_:-]{1,128}$/.test(id));
}
export function buildBargainMediaPayloadFromOrderedItems(
  items: readonly ListingMediaObject[],
): {
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  objectStorageBucket?: string;
  objectStorageKeys?: string[];
  objectStorageObjectIds?: string[];
} {
  if (!items || items.length === 0) return {};
  const safeItems = items.filter(isSafeOrderedMediaItem).slice(0, 6);
  if (safeItems.length === 0) return {};
  const images = safeItems.filter((item) => item.mediaType === 'image');
  const video = safeItems.find((item) => item.mediaType === 'video');
  const orderedAll = [...images, ...(video ? [video] : [])];
  const imageUrls = images.map((img) => img.url).filter(Boolean);
  const keys = orderedAll.map((item) => item.objectKey).filter(Boolean);
  const ids = orderedAll.map((item) => item.id).filter(Boolean);
  return {
    imageUrl: imageUrls[0] || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    videoUrl: video?.url || undefined,
    objectStorageBucket: orderedAll[0]?.bucket || undefined,
    objectStorageKeys: keys.length > 0 ? keys : undefined,
    objectStorageObjectIds: ids.length > 0 ? ids : undefined,
  };
}
/**
 * Determine whether synthetic demo media upload buttons should be exposed.
 * Hidden in production builds unless an explicit test/demo flag is enabled.
 */
export function isDemoMediaUploadEnabled(options?: {
  isProdBuild?: boolean;
  explicitDemoFlag?: boolean;
}): boolean {
  if (options?.explicitDemoFlag === true) return true;
  if (options?.isProdBuild === true) return false; try { const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> })?.env; if (metaEnv) { if (metaEnv.VITE_ENABLE_DEMO_MEDIA === 'true') return true; if (metaEnv.PROD === true) return false; } } catch { } return true; }