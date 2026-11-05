import type { CityId } from '../types/models'; import { clampNumber, sanitizeInput } from './security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type ObjectStorageProviderId = 'arvancloud' | 'liara' | 'minio' | 's3_compatible' | 'firebase_storage' | 'local_bucket';
export interface ListingMediaObject { id: string; objectKey: string; bucket: string; provider: ObjectStorageProviderId; mediaType: 'image' | 'video'; mimeType: string; sizeBytes: number; url: string; remoteS3Synced?: boolean; createdAtIso: string; contentHashSha256?: string; width?: number; height?: number; qualityWarningFa?: string; }
export interface ObjectStorageStatusPayload { status: 'ok'; providerLabelFa: string; maxImageMb: number; maxVideoMb: number; }
export const ALLOWED_IMAGE_MIMES: readonly string[] = [
  'image/jpeg', 'image/png', 'image/webp', ]; export const ALLOWED_VIDEO_MIMES: readonly string[] = [
  'video/mp4', 'video/webm', 'video/quicktime', ]; const FILE_EXTENSION_BY_MIME: Readonly<Record<string, string>> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', };
export function fileNameForUploadMime( fileName: string, mimeType: string, ): string { const extension = FILE_EXTENSION_BY_MIME[mimeType.trim().toLowerCase()]; if (!extension) {
    throw new Error('UNSUPPORTED_UPLOAD_MIME_TYPE'); }
  const normalized = String(fileName || 'upload')
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120); const dot = normalized.lastIndexOf('.'); const stem = dot > 0 ? normalized.slice(0, dot) : normalized; const safeStem = stem
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100) || 'upload';
  return `${safeStem}${extension}`;
}
/**
 * Persian display label for a configured Object Storage provider.
 */
export function getStorageProviderLabelFa(provider: string): string { switch (provider) { case 'arvancloud': return 'آبجکت استوریج ابری آروان (ArvanCloud S3)';
    case 'liara': return 'آبجکت استوریج لیارا (Liara S3 Bucket)'; case 'minio': return 'سرور اختصاصی MinIO S3';
    case 'firebase_storage':
      return 'فضای ابری Firebase Cloud Storage';
    case 's3_compatible':
      return 'آبجکت استوریج استاندارد S3';
    default:
      return 'باکت آبجکت استوریج سرور (Persistent Object Bucket)';
  }
}
/**
 * Create a hierarchical object key.
 *
 * Format:
 * listings/{city}/hood-{hoodId}/{mediaType}/{yyyy-mm}/{objectId}.{ext}
 *
 * Note: objectId must be unique and should normally be generated
 * using a cryptographically secure identifier.
 */
const VALID_STORAGE_CITIES: ReadonlySet<CityId> = new Set<CityId>(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
export function buildListingObjectKey(params: {
  city: CityId;
  hoodId: number;
  mediaType: 'image' | 'video';
  mimeType: string;
  objectId: string;
}): string {
  const safeCity: CityId = VALID_STORAGE_CITIES.has(params.city) ? params.city : 'tehran';
  const safeHood = clampNumber(params.hoodId, 1, 999, 1);
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  const extension = extensionByMime[params.mimeType] || (params.mediaType === 'video' ? 'mp4' : 'jpg');
  const cleanId = sanitizeInput(params.objectId, 48).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) {
    throw new Error('INVALID_OBJECT_ID');
  }
  return `listings/${safeCity}/hood-${safeHood}/${params.mediaType}/${yearMonth}/${cleanId}.${extension}`;
}
export function buildObjectStorageKey(
  city: CityId,
  hoodId: number,
  mediaType: 'image' | 'video',
  fileName: string,
): string {
  const safeCity: CityId = VALID_STORAGE_CITIES.has(city) ? city : 'tehran';
  const safeHood = clampNumber(hoodId, 1, 999, 1);
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const cleanName = sanitizeInput(fileName || 'media.webp', 80).replace(/[^a-zA-Z0-9._-]/g, '').replace(/^\.+/, '');
  return `listings/${safeCity}/hood-${safeHood}/${mediaType}/${yearMonth}/${cleanName || 'media.webp'}`;
}
export function calculateDynamicSponsorTariff(
  buyPerSqmMillion: number,
  _hoodName = '',
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode }
): { tierLabelFa: string; monthlyMillion: number; quarterlyMillion: number; displayAreaUnitLabel: string; monthlyIntlText: string } {
  const sqmPrice = clampNumber(buyPerSqmMillion, 10, 2000, 120);
  const monthlyMillion = sqmPrice >= 200 ? 15 : sqmPrice >= 110 ? 10 : 6;
  const tierLabelFa = sqmPrice >= 200 ? 'تراز اول (Premium)' : sqmPrice >= 110 ? 'پرتقاضا (Standard)' : 'اقتصادی (Starter)';
  return {
    tierLabelFa,
    monthlyMillion,
    quarterlyMillion: Math.round(monthlyMillion * 3 * 0.85),
    displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
    monthlyIntlText: formatMillionTomanAsIntlCurrency(monthlyMillion, options?.intlCurrency ?? 'IRT'),
  };
}
export function formatStorageBytesFa(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '۰ کیلوبایت';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('fa-IR')} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
}
/**
 * Read a browser File as Base64 without the data URL prefix.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(new Error('خطا در خواندن فایل از حافظه دستگاه'));
    };
    reader.readAsDataURL(file);
  });
}
/**
 * Downscale and compress a supported image in the browser.
 *
 * The client-side transformation improves upload reliability,
 * but does not replace server-side MIME, signature and size checks.
 */
export async function compressImageFileInBrowser(
  file: File,
  maxWidth = 1200,
  quality = 0.85,
): Promise<{
  dataBase64: string;
  mimeType: string;
}> {
  const rawMime = (file.type || '').trim().toLowerCase();
  const sourceMime = ALLOWED_IMAGE_MIMES.includes(rawMime) ? rawMime : 'image/jpeg';
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      dataBase64: await readFileAsBase64(file),
      mimeType: sourceMime,
    };
  }
  const rawBase64 = await readFileAsBase64(file);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        let targetWidth = image.width || maxWidth;
        let targetHeight = image.height || maxWidth;
        if (targetWidth > maxWidth || targetHeight > maxWidth) {
          const ratio = Math.min(maxWidth / targetWidth, maxWidth / targetHeight);
          targetWidth = Math.max(1, Math.round(targetWidth * ratio));
          targetHeight = Math.max(1, Math.round(targetHeight * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve({ dataBase64: rawBase64, mimeType: sourceMime });
          return;
        }
        context.drawImage(image, 0, 0, targetWidth, targetHeight);
        let outputMime = 'image/webp';
        let dataUrl = canvas.toDataURL(outputMime, quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          outputMime = 'image/jpeg';
          dataUrl = canvas.toDataURL(outputMime, quality);
        }
        const commaIndex = dataUrl.indexOf(',');
        resolve({
          dataBase64: commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : rawBase64,
          mimeType: outputMime,
        });
      } catch {
        resolve({ dataBase64: rawBase64, mimeType: sourceMime });
      }
    };
    image.onerror = () => {
      resolve({ dataBase64: rawBase64, mimeType: sourceMime });
    };
    image.src = `data:${sourceMime};base64,${rawBase64}`;
  });
}
/**
 * Upload image/video content to the authenticated server endpoint.
 *
 * The server must verify:
 * - Firebase ID token and user authorization.
 * - MIME type and file signatures.
 * - File size, dimensions and media count limits.
 * - City/neighborhood permissions.
 * - Object key generation and storage destination.
 */
export async function uploadMediaToObjectStorage(params: {
  fileName: string;
  mimeType: string;
  mediaType: 'image' | 'video';
  dataBase64: string;
  hoodId: number;
  city: CityId;
  idToken: string;
}): Promise<ListingMediaObject> {
  if (typeof params.idToken !== 'string' || params.idToken.length < 32) {
    throw new Error('برای آپلود رسانه، توکن معتبر حساب کاربری لازم است.');
  }
  const allowedMimes = params.mediaType === 'image' ? ALLOWED_IMAGE_MIMES : ALLOWED_VIDEO_MIMES;
  if (!allowedMimes.includes(params.mimeType)) {
    throw new Error('UNSUPPORTED_MEDIA_MIME_TYPE');
  }
  if (typeof params.dataBase64 !== 'string' || params.dataBase64.length === 0) {
    throw new Error('EMPTY_MEDIA_PAYLOAD');
  }
  const safeFileName = fileNameForUploadMime(params.fileName, params.mimeType);
  const response = await fetch('/api/object-storage/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify({
      fileName: safeFileName,
      mimeType: params.mimeType,
      mediaType: params.mediaType,
      dataBase64: params.dataBase64,
      hoodId: params.hoodId,
      city: params.city,
    }),
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !payload ||
    typeof payload !== 'object' ||
    !('status' in payload) ||
    payload.status !== 'ok' ||
    !('mediaObject' in payload)
  ) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : 'خطا در ذخیرهسازی فایل روی آبجکت استوریج';
    throw new Error(message);
  }
  const mediaObject = payload.mediaObject;
  if (
    !mediaObject || typeof mediaObject !== 'object' || !('id' in mediaObject) || typeof mediaObject.id !== 'string' ||
    !('url' in mediaObject) || typeof mediaObject.url !== 'string' || !/^(?:https:\/\/|\/api\/object-storage\/)/i.test(mediaObject.url.trim()) ||
    !('mediaType' in mediaObject) || mediaObject.mediaType !== params.mediaType
  ) {
    throw new Error('INVALID_MEDIA_OBJECT_RESPONSE');
  }
  return mediaObject as ListingMediaObject;
}
/**
 * Fetch Object Storage status.
 *
 * The endpoint must expose only non-sensitive configuration metadata.
 * It must never return credentials, access keys, or secret bucket settings.
 */
export async function fetchObjectStorageStatus(): Promise<ObjectStorageStatusPayload | null> {
  try {
    const response = await fetch('/api/object-storage/status', { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok' || !('providerLabelFa' in data) || typeof data.providerLabelFa !== 'string' || !('maxImageMb' in data) || typeof data.maxImageMb !== 'number' || !('maxVideoMb' in data) || typeof data.maxVideoMb !== 'number') {
      return null;
    }
    return {
      status: 'ok',
      providerLabelFa: data.providerLabelFa,
      maxImageMb: clampNumber(data.maxImageMb, 1, 50, 5), maxVideoMb: clampNumber(data.maxVideoMb, 5, 50, 50), }; } catch { return null; } } export { generateSamplePropertyPhotoBase64, generateSamplePropertyVideoBase64, } from './objectStorageSampleMedia';