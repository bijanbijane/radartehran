import type { BargainListing, CityId } from '../types/models'; import { convertAreaFromSqm, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; export type ListingSubmissionStage = | 'idle'
  | 'validating'
  | 'committing_firestore'
  | 'reconciling_ambiguous_commit'
  | 'syncing_server_cache'
  | 'attaching_media'
  | 'completed'
  | 'media_attach_pending_retry'
  | 'failed'; export type DualWriteConsistencyState = | 'pending'
  | 'firestore_persisted'
  | 'server_persisted'
  | 'partially_persisted'
  | 'reconciled'
  | 'failed'
  | 'outcome_unknown'; export interface PendingMediaAttachmentState { bargainId: string; hoodId: number; objectIds: string[]; lastErrorFa: string; attemptCount: number; }
let inFlightBargainSubmissionLock = false; let activeSubmissionIdempotencyKey: string | null = null; let lockAcquiredAtMs = 0; const LOCK_TTL_MS = 60_000;
export function isBargainSubmissionLocked(nowMs = Date.now()): boolean { if (inFlightBargainSubmissionLock && nowMs - lockAcquiredAtMs > LOCK_TTL_MS) { inFlightBargainSubmissionLock = false; activeSubmissionIdempotencyKey = null; lockAcquiredAtMs = 0; } return inFlightBargainSubmissionLock; }
export function acquireBargainSubmissionLock(idempotencyKey?: string, nowMs = Date.now()): boolean { if (isBargainSubmissionLocked(nowMs)) { return false; }
  inFlightBargainSubmissionLock = true; lockAcquiredAtMs = nowMs; activeSubmissionIdempotencyKey = idempotencyKey || `sub-${nowMs}`; return true; }
export function releaseBargainSubmissionLock(): void { inFlightBargainSubmissionLock = false; activeSubmissionIdempotencyKey = null; lockAcquiredAtMs = 0; }
export function getActiveSubmissionIdempotencyKey(): string | null { return isBargainSubmissionLocked() ? activeSubmissionIdempotencyKey : null; }
export function resetBargainSubmissionLockForTests(): void { inFlightBargainSubmissionLock = false; activeSubmissionIdempotencyKey = null; lockAcquiredAtMs = 0; }
export function formatPublishedBargainIntlSummary(item: Pick<BargainListing, 'sqm'> & { totalPriceMillion?: number }, areaUnit: AreaUnit = getStoredAreaUnit(), referenceCurrency: IntlCurrencyCode = getStoredIntlCurrency()) { const safeSqm = Math.max(20, Number(item.sqm) || 80); return { displayAreaValue: Math.round(convertAreaFromSqm(safeSqm, areaUnit)), displayAreaUnitLabel: formatAreaUnitLabel(areaUnit), totalPriceIntlText: formatMillionTomanAsIntlCurrency(Math.max(0, Number(item.totalPriceMillion ?? 0)), referenceCurrency) }; }
export async function reconcileAmbiguousBargainCommit(
  _db: unknown,
  bargainId: string,
  expectedUserId: string,
): Promise<{ persisted: boolean; ownerVerified: boolean; status: 'confirmed_persisted' | 'confirmed_absent' | 'outcome_unknown' }> {
  if (!bargainId || !expectedUserId) {
    return { persisted: false, ownerVerified: false, status: 'confirmed_absent' };
  }
  try {
    const res = await fetch('/api/my-bargains', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return { persisted: false, ownerVerified: false, status: 'outcome_unknown' };
    const body = (await res.json()) as { items?: { id: string; ownerUid?: string }[] };
    const found = (body.items || []).find((x) => x.id === bargainId);
    const ownerMatches = Boolean(found && found.ownerUid === expectedUserId);
    return {
      persisted: ownerMatches,
      ownerVerified: ownerMatches,
      status: ownerMatches ? 'confirmed_persisted' : 'confirmed_absent',
    };
  } catch {
    return { persisted: false, ownerVerified: false, status: 'outcome_unknown' };
  }
}
export async function attachMediaToPublishedBargain(params: {
  bargainId: string;
  objectIds: readonly string[];
  /** @deprecated Authentication is carried by the HttpOnly same-origin session cookie. */
  getIdToken?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  attachedObjectIds: string[];
  errorMessageFa?: string;
}> {
  const cleanBargainId = String(params.bargainId || '').trim();
  const cleanIds = params.objectIds.map((id) => String(id || '').trim()).filter((id) => /^[A-Za-z0-9_.-]{3,128}$/.test(id)).slice(0, 12);
  if (!cleanBargainId || !/^[A-Za-z0-9_-]{3,128}$/.test(cleanBargainId) || cleanIds.length === 0) {
    return { ok: true, attachedObjectIds: [] };
  }
  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const res = await fetchFn('/api/object-storage/attach-to-bargain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({
        bargainId: cleanBargainId,
        objectIds: cleanIds,
      }),
    });
    if (!res.ok) {
      let serverMsg = '';
      try {
        const body = await res.json();
        serverMsg = typeof body?.error === 'string' ? body.error : '';
      } catch {
      }
      return {
        ok: false,
        attachedObjectIds: [],
        errorMessageFa:
          serverMsg ||
          'آگهی ثبت شد اما اتصال فایل‌های رسانه‌ای به دلیل خطای شبکه کامل نشد. می‌توانید بدون ثبت مجدد آگهی، اتصال تصاویر را دوباره تلاش کنید.',
      };
    }
    return { ok: true, attachedObjectIds: cleanIds };
  } catch {
    return {
      ok: false,
      attachedObjectIds: [],
      errorMessageFa:
        'آگهی در پایگاه داده ثبت شد اما اتصال تصاویر کامل نشد. با دکمه «تلاش مجدد اتصال تصاویر» بدون تکرار آگهی، رسانه‌ها را متصل کنید.',
    };
  }
}
/**
 * Synchronizes a published bargain with the Express server cache (`POST /api/bargains`)
 * using the exact same deterministic `id` as the Firestore document (Prompt 767).
 */
export async function syncPublishedBargainToExpressServer(params: {
  id: string;
  city: CityId;
  hoodId: number;
  title: string;
  type: 'خرید' | 'اجاره';
  sqm: number;
  priceText: string;
  discountPercent: number;
  buyerProfitText: string;
  street: string;
  createdAtIso: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  objectStorageBucket?: string;
  objectStorageKeys?: string[];
  objectStorageObjectIds?: string[];
  /** @deprecated Authentication is carried by the HttpOnly same-origin session cookie. */
  getIdToken?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  consistencyState: DualWriteConsistencyState;
  errorMessageFa?: string;
}> {
  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const res = await fetchFn('/api/bargains', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({
        id: params.id,
        city: params.city,
        hoodId: params.hoodId,
        title: params.title,
        type: params.type,
        sqm: params.sqm,
        priceText: params.priceText,
        discountPercent: params.discountPercent,
        buyerProfitText: params.buyerProfitText,
        street: params.street,
        createdAtIso: params.createdAtIso,
        imageUrl: params.imageUrl,
        imageUrls: params.imageUrls,
        videoUrl: params.videoUrl,
        objectStorageBucket: params.objectStorageBucket,
        objectStorageKeys: params.objectStorageKeys,
        objectStorageObjectIds: params.objectStorageObjectIds,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        consistencyState: 'partially_persisted',
        errorMessageFa: 'آگهی در فضای ابری ثبت شد اما همگام‌سازی فوری با کش سرور با تأخیر مواجه شد.',
      };
    }
    return { ok: true, consistencyState: 'reconciled' };
  } catch {
    return {
      ok: false,
      consistencyState: 'partially_persisted',
      errorMessageFa: 'آگهی در فضای ابری ثبت شد؛ همگام‌سازی با کش سرور در پس‌زمینه انجام خواهد شد.',
    };
  }
}
export interface PublisherOwnedBargainItem extends BargainListing {
  hoodId: number;
  hoodName?: string;
  cityId?: CityId;
  createdAtIso?: string;
  updatedAtIso?: string;
  ownerUserId?: string;
}
export async function fetchMyPublishedBargains(
  fetchImpl: typeof fetch = fetch
): Promise<{
  ok: boolean;
  items: PublisherOwnedBargainItem[];
  errorMessageFa?: string;
}> {
  try {
    const res = await fetchImpl('/api/my-bargains', { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        ok: false,
        items: [],
        errorMessageFa: errBody?.error || 'خطا در دریافت فهرست آگهی‌های ثبت‌شده شما.',
      };
    }
    const data = await res.json();
    return {
      ok: true,
      items: Array.isArray(data?.items) ? data.items : [],
    };
  } catch {
    return {
      ok: false,
      items: [],
      errorMessageFa: 'امکان برقراری ارتباط با سرور برای دریافت آگهی‌های شما وجود ندارد.',
    };
  }
}
export async function updateMyPublishedBargain(params: {
  bargainId: string;
  updates: {
    title?: string;
    street?: string;
    sqm?: number;
    type?: 'خرید' | 'اجاره';
    priceText?: string;
    discountPercent?: number;
    buyerProfitText?: string;
    imageUrl?: string;
    imageUrls?: string[];
  };
  /** @deprecated Authentication is carried by the HttpOnly same-origin session cookie. */
  getIdToken?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  item?: PublisherOwnedBargainItem;
  errorMessageFa?: string;
}> {
  const cleanId = String(params.bargainId || '').trim();
  if (!cleanId || !/^[A-Za-z0-9_-]{3,128}$/.test(cleanId)) return { ok: false, errorMessageFa: 'شناسه آگهی نامعتبر است.' };
  const isSafeMediaUrl = (u: string) => /^(?:https:\/\/[^\s<>"'`]+|\/api\/object-storage\/[^\s<>"'`]+)$/i.test(u.trim()) && !u.includes('..');
  if (params.updates.imageUrl !== undefined && params.updates.imageUrl !== '' && !isSafeMediaUrl(params.updates.imageUrl)) {
    return { ok: false, errorMessageFa: 'آدرس تصویر نامعتبر است.' };
  }
  if (Array.isArray(params.updates.imageUrls) && params.updates.imageUrls.some((u) => typeof u !== 'string' || !isSafeMediaUrl(u))) {
    return { ok: false, errorMessageFa: 'آدرس تصاویر نامعتبر است.' };
  }
  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`/api/my-bargains/${encodeURIComponent(cleanId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify(params.updates),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, errorMessageFa: body?.error || 'ویرایش آگهی انجام نشد. لطفاً مقادیر واردشده را بررسی کنید.' };
    return { ok: true, item: body?.item };
  } catch {
    return { ok: false, errorMessageFa: 'خطای شبکه هنگام ذخیره تغییرات آگهی رخ داد.' };
  }
}
export async function deleteMyPublishedBargain(params: {
  bargainId: string;
  /** @deprecated Authentication is carried by the HttpOnly same-origin session cookie. */
  getIdToken?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  mediaCleanupStatus?: string;
  errorMessageFa?: string;
}> {
  const cleanId = String(params.bargainId || '').trim();
  if (!cleanId || !/^[A-Za-z0-9_-]{3,128}$/.test(cleanId)) return { ok: false, errorMessageFa: 'شناسه آگهی نامعتبر است.' };
  const fetchFn = params.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`/api/my-bargains/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, errorMessageFa: body?.error || 'حذف آگهی انجام نشد.' };
    return { ok: true, mediaCleanupStatus: body?.mediaCleanupStatus || 'completed' };
  } catch {
    return { ok: false, errorMessageFa: 'خطای ارتباط با سرور هنگام حذف آگهی رخ داد.' };
  }
}