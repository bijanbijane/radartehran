import type { BargainListing } from '../types/models'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import type { ListingMediaObject } from './objectStorage'; import { normalizeMultiScriptDigits, parseMultiScriptNumericInput } from './multiScriptNumericAndUnits'; import { sanitizeInput } from './security'; export const LISTING_DRAFT_SCHEMA_VERSION = 1; export const LISTING_DRAFT_STORAGE_KEY_PREFIX = 'tehran_radar_listing_draft_v1'; export interface ListingDraftMediaRef { id: string; objectKey: string; publicUrl: string; contentType: string; sizeBytes: number; originalFileName?: string; contentHashSha256?: string; }
export interface ListingDraftModelV1 { schemaVersion: 1; draftId: string; updatedAt: string; updatedAtMs: number; userUidScope: string; bargainHoodId: number; bargainType: 'خرید' | 'اجاره'; bargainSqm: number; bargainProposedPrice: number; bargainStreet: string; bargainTitle: string; uploadedMedia: ListingDraftMediaRef[]; }
export function getListingDraftStorageKey(userUid?: string | null): string { const scope = typeof userUid === 'string' && userUid.trim() ? userUid.trim() : 'guest'; return `${LISTING_DRAFT_STORAGE_KEY_PREFIX}:${scope}`;
} export function filterPersistableDraftMedia( media: readonly (ListingMediaObject | ListingDraftMediaRef)[]
): ListingDraftMediaRef[] { if (!Array.isArray(media)) return []; const valid: ListingDraftMediaRef[] = []; for (const item of media) { if (!item || typeof item !== 'object') continue; const url = typeof item.publicUrl === 'string' ? item.publicUrl.trim() : ''; const key = typeof item.objectKey === 'string' ? item.objectKey.trim() : ''; const id = typeof item.id === 'string' ? item.id.trim() : ''; const mime = typeof item.contentType === 'string' ? item.contentType.trim() : 'image/jpeg'; const safeUrl = !url.startsWith('//') && !/[\r\n\0]/.test(url) && (url.startsWith('/') || /^https:\/\//i.test(url) || /^http:\/\/localhost(?::\d+)?\//i.test(url)); const safeMime = /^(?:image\/(?:jpeg|png|webp|avif)|video\/(?:mp4|webm|quicktime))$/i.test(mime); if (!safeUrl || !safeMime || !key || key.includes('..') || !id || !/^[A-Za-z0-9_:-]{1,128}$/.test(id)) continue; valid.push({ id, objectKey: key, publicUrl: url, contentType: mime, sizeBytes: Math.max(0, Number(item.sizeBytes) || 0), originalFileName: typeof item.originalFileName === 'string' ? sanitizeInput(item.originalFileName, 120) : undefined,
      contentHashSha256: typeof (item as ListingMediaObject).contentHashSha256 === 'string' ? (item as ListingMediaObject).contentHashSha256 : undefined, }); } return valid.slice(0, 6); }
export function hasMeaningfulListingDraftContent(draft: Partial<ListingDraftModelV1>): boolean { const hasTitle = typeof draft.bargainTitle === 'string' && draft.bargainTitle.trim().length > 0; const hasStreet = typeof draft.bargainStreet === 'string' && draft.bargainStreet.trim().length > 0; const hasMedia = Array.isArray(draft.uploadedMedia) && draft.uploadedMedia.length > 0; const hasCustomSqm = typeof draft.bargainSqm === 'number' && draft.bargainSqm !== 85 && draft.bargainSqm > 0; const hasCustomPrice = typeof draft.bargainProposedPrice === 'number' && draft.bargainProposedPrice !== 110 && draft.bargainProposedPrice > 0; return hasTitle || hasStreet || hasMedia || hasCustomSqm || hasCustomPrice;
} export function saveListingDraftToStorage( input: Omit<ListingDraftModelV1, 'schemaVersion' | 'updatedAt' | 'updatedAtMs' | 'draftId' | 'userUidScope'>, userUid?: string | null, storage?: Pick<Storage, 'setItem' | 'removeItem'> | null, existingDraftId?: string
): ListingDraftModelV1 | null { const targetStorage = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null); if (!targetStorage) return null; const cleanMedia = filterPersistableDraftMedia(input.uploadedMedia || []); const candidate: Partial<ListingDraftModelV1> = { ...input, uploadedMedia: cleanMedia }; const key = getListingDraftStorageKey(userUid);
  if (!hasMeaningfulListingDraftContent(candidate)) { try { targetStorage.removeItem(key); } catch { /* ignore */ }
    return null; }
  const nowMs = Date.now(); const scope = typeof userUid === 'string' && userUid.trim() ? userUid.trim() : 'guest'; const model: ListingDraftModelV1 = { schemaVersion: LISTING_DRAFT_SCHEMA_VERSION,
    draftId: existingDraftId || `draft-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
    updatedAt: new Date(nowMs).toISOString(), updatedAtMs: nowMs, userUidScope: scope, bargainHoodId: Number(input.bargainHoodId) || 1, bargainType: input.bargainType === 'اجاره' ? 'اجاره' : 'خرید', bargainSqm: Number(input.bargainSqm) || 85,
    bargainProposedPrice: Number(input.bargainProposedPrice) || 0, bargainStreet: sanitizeInput(input.bargainStreet || '', 120), bargainTitle: sanitizeInput(input.bargainTitle || '', 160), uploadedMedia: cleanMedia, }; try { targetStorage.setItem(key, JSON.stringify(model)); return model; } catch { return null; } }
export function loadListingDraftFromStorage( userUid?: string | null, storage?: Pick<Storage, 'getItem' | 'removeItem'> | null, maxAgeMs = 48 * 60 * 60 * 1000
): { status: 'valid' | 'empty' | 'expired' | 'corrupted' | 'scope_mismatch'; draft: ListingDraftModelV1 | null;
  droppedMediaCount: number; } {
  const targetStorage = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null); if (!targetStorage) return { status: 'empty', draft: null, droppedMediaCount: 0 };
  const key = getListingDraftStorageKey(userUid);
  let raw: string | null = null;
  try { raw = targetStorage.getItem(key); } catch { return { status: 'empty', draft: null, droppedMediaCount: 0 }; }
  if (!raw || raw.length > 65_536) return { status: 'empty', draft: null, droppedMediaCount: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
  } catch {
    try { targetStorage.removeItem(key); } catch { /* ignore */ }
    return { status: 'corrupted', draft: null, droppedMediaCount: 0 };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    try { targetStorage.removeItem(key); } catch { /* ignore */ }
    return { status: 'corrupted', draft: null, droppedMediaCount: 0 };
  }
  const d = parsed as Partial<ListingDraftModelV1>;
  if (
    d.schemaVersion !== LISTING_DRAFT_SCHEMA_VERSION ||
    typeof d.draftId !== 'string' ||
    typeof d.updatedAtMs !== 'number' ||
    !Number.isFinite(d.updatedAtMs)
  ) {
    try { targetStorage.removeItem(key); } catch { /* ignore */ }
    return { status: 'corrupted', draft: null, droppedMediaCount: 0 };
  }
  const expectedScope = typeof userUid === 'string' && userUid.trim() ? userUid.trim() : 'guest';
  if (d.userUidScope !== expectedScope) {
    return { status: 'scope_mismatch', draft: null, droppedMediaCount: 0 };
  }
  const nowMs = Date.now();
  if (nowMs - d.updatedAtMs > maxAgeMs || d.updatedAtMs > nowMs + 86_400_000) {
    try { targetStorage.removeItem(key); } catch { /* ignore */ }
    return { status: 'expired', draft: null, droppedMediaCount: 0 };
  }
  const rawMedia = Array.isArray(d.uploadedMedia) ? d.uploadedMedia : [];
  const validMedia = filterPersistableDraftMedia(rawMedia);
  const droppedMediaCount = Math.max(0, rawMedia.length - validMedia.length);
  return {
    status: 'valid',
    droppedMediaCount,
    draft: {
      schemaVersion: 1,
      draftId: sanitizeInput(d.draftId, 80),
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date(d.updatedAtMs).toISOString(),
      updatedAtMs: d.updatedAtMs,
      userUidScope: expectedScope,
      bargainHoodId: Number(d.bargainHoodId) || 1,
      bargainType: d.bargainType === 'اجاره' ? 'اجاره' : 'خرید',
      bargainSqm: Number(d.bargainSqm) || 85,
      bargainProposedPrice: Number(d.bargainProposedPrice) || 0,
      bargainStreet: typeof d.bargainStreet === 'string' ? sanitizeInput(d.bargainStreet, 120) : '',
      bargainTitle: typeof d.bargainTitle === 'string' ? sanitizeInput(d.bargainTitle, 160) : '',
      uploadedMedia: validMedia,
    },
  };
}
export function discardListingDraftInStorage(
  userUid?: string | null,
  storage?: Pick<Storage, 'removeItem'> | null
): void {
  const targetStorage =
    storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!targetStorage) return;
  try {
    targetStorage.removeItem(getListingDraftStorageKey(userUid));
  } catch {
  }
}
export interface TransparentBargainPricingEvaluation {
  dealType: 'خرید' | 'اجاره';
  neighborhoodReferencePrice: number;
  referenceUnitLabelFa: string;
  publisherProposedPrice: number;
  differenceMillion: number;
  discountPercent: number;
  rawDiscountPercent: number;
  isEligibleBargain: boolean;
  minimumRequiredDiscountPercent: number;
  maxEligiblePriceMillion: number;
  buyerProfitTextFa: string;
  priceTextFa: string;
  headingFa: string;
  limitationNoteFa: string;
  guidanceMessageFa: string;
  displayAreaUnitLabel?: string;
  totalPriceIntlText?: string;
}
export function evaluateTransparentBargainPricing(params: {
  hoodName: string;
  hoodBuyPerSqm: number;
  hoodRahn80m: number;
  dealType: 'خرید' | 'اجاره';
  sqm: number;
  proposedPrice: number;
  areaUnit?: AreaUnit;
  referenceCurrency?: IntlCurrencyCode;
}): TransparentBargainPricingEvaluation {
  const safeSqm = Math.max(20, Math.min(1000, Number(params.sqm) || 80));
  const dealType = params.dealType === 'اجاره' ? 'اجاره' : 'خرید';
  const referencePrice =
    dealType === 'خرید'
      ? Math.max(1, Number(params.hoodBuyPerSqm) || 100)
      : Math.max(10, Math.round((Number(params.hoodRahn80m) || 1000) * (safeSqm / 80)));
  const proposed = Number(params.proposedPrice) || 0;
  const diffMillion = Math.round((referencePrice - proposed) * 10) / 10;
  const rawDiscountPercent =
    referencePrice > 0 && proposed > 0
      ? ((referencePrice - proposed) / referencePrice) * 100
      : 0;
  const discountPercent = Math.round(rawDiscountPercent);
  const maxEligiblePriceMillion = Math.floor(referencePrice * 0.9);
  const isEligibleBargain =
    proposed > 0 && discountPercent >= 10 && discountPercent <= 60;
  const totalMillion = Math.round(proposed * safeSqm);
  const totalBillion = (totalMillion / 1000).toFixed(2).replace(/\.00$/, '');
  const priceTextFa =
    dealType === 'خرید'
      ? `متری ${proposed} میلیون تومان (کل: ${totalBillion} میلیارد)`
      : `${proposed.toLocaleString('fa-IR')} میلیون تومان رهن کامل`;
  const profitMillion =
    dealType === 'خرید'
      ? Math.max(0, Math.round((referencePrice - proposed) * safeSqm))
      : Math.max(0, Math.round(referencePrice - proposed));
  const buyerProfitTextFa =
    dealType === 'خرید'
      ? `${(profitMillion / 1000).toFixed(2).replace(/\.00$/, '')} میلیارد تومان زیر شاخص پایه محله`
      : `${profitMillion.toLocaleString('fa-IR')} میلیون تومان کمتر از شاخص رهن محله`;
  let guidanceMessageFa = '';
  if (proposed <= 0) {
    guidanceMessageFa = 'لطفاً مبلغ پیشنهادی معتبر و بزرگ‌تر از صفر وارد کنید.';
  } else if (discountPercent < 10) {
    guidanceMessageFa = `برای ثبت در فهرست شکار، مبلغ پیشنهادی باید حداقل ۱۰٪ کمتر از شاخص پایه محله (حداکثر ${maxEligiblePriceMillion.toLocaleString('fa-IR')} میلیون تومان) باشد.`;
  } else if (discountPercent > 60) {
    guidanceMessageFa = 'اختلاف قیمت بیش از ۶۰٪ زیر شاخص پایه محله غیرواقعی تشخیص داده شد و نیازمند اصلاح مبلغ است.';
  } else {
    guidanceMessageFa = `واجد شرایط انتشار در فهرست شکار (${discountPercent}٪ پایین‌تر از شاخص پایه محله ${params.hoodName}).`;
  }
  return {
    dealType, neighborhoodReferencePrice: referencePrice,
    referenceUnitLabelFa: dealType === 'خرید' ? 'میلیون تومان به ازای هر متر مربع' : `میلیون تومان رهن کامل (${safeSqm} متر)`,
    publisherProposedPrice: proposed, differenceMillion: diffMillion, discountPercent,
    rawDiscountPercent: Math.round(rawDiscountPercent * 10) / 10, isEligibleBargain,
    minimumRequiredDiscountPercent: 10, maxEligiblePriceMillion, buyerProfitTextFa, priceTextFa,
    headingFa: 'مقایسه با شاخص پایه قیمت محله',
    limitationNoteFa:
      'این ارزیابی، کارشناسی اختصاصی ملک نیست و تفاوت‌های سن بنا و امکانات واحد را به‌طور کامل پوشش نمی‌دهد.',
    guidanceMessageFa,
    displayAreaUnitLabel: formatAreaUnitLabel(params.areaUnit ?? getStoredAreaUnit()),
    totalPriceIntlText: formatMillionTomanAsIntlCurrency(dealType === 'خرید' ? totalMillion : proposed, params.referenceCurrency ?? getStoredIntlCurrency()),
  };
}
export interface ListingFieldValidationResult {
  valid: boolean;
  fieldErrors: Partial<Record<'hoodId' | 'type' | 'sqm' | 'proposedPrice' | 'street' | 'title' | 'media', string>>;
  completeness: {
    scorePercent: number;
    requiredComplete: boolean;
    missingRequiredFa: string[];
    recommendedSuggestionsFa: string[];
  };
}
export function validateBargainListingSubmissionInputs(params: {
  hoodId: number;
  validHoodIds?: readonly number[];
  type: 'خرید' | 'اجاره';
  sqm: number;
  proposedPrice: number;
  street: string;
  title: string;
  uploadedMediaCount: number;
  pricingEval: TransparentBargainPricingEvaluation;
}): ListingFieldValidationResult {
  const fieldErrors: ListingFieldValidationResult['fieldErrors'] = {};
  const missingRequiredFa: string[] = [];
  const recommendedSuggestionsFa: string[] = [];
  const hoodId = Number(params.hoodId);
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || (params.validHoodIds && !params.validHoodIds.includes(hoodId))) {
    fieldErrors.hoodId = 'محله انتخابی معتبر نیست.';
    missingRequiredFa.push('انتخاب محله معتبر');
  }
  if (params.type !== 'خرید' && params.type !== 'اجاره') {
    fieldErrors.type = 'نوع معامله باید خرید یا اجاره باشد.';
    missingRequiredFa.push('نوع معامله');
  }
  const sqm = Number(params.sqm);
  if (!Number.isFinite(sqm) || sqm < 20 || sqm > 1000) {
    fieldErrors.sqm = 'متراژ ملک باید عددی بین ۲۰ تا ۱۰۰۰ متر مربع باشد.';
    missingRequiredFa.push('متراژ معتبر (۲۰ تا ۱۰۰۰ متر)');
  }
  const cleanStreet = typeof params.street === 'string' ? params.street.trim() : '';
  if (cleanStreet.length < 2 || cleanStreet.length > 120) {
    fieldErrors.street = 'نام خیابان یا محدوده فرعی باید بین ۲ تا ۱۲۰ کاراکتر باشد.';
    missingRequiredFa.push('نام خیابان اصلی یا فرعی');
  }
  const cleanTitle = typeof params.title === 'string' ? params.title.trim() : '';
  if (cleanTitle.length < 3 || cleanTitle.length > 160) {
    fieldErrors.title = 'عنوان آگهی باید بین ۳ تا ۱۶۰ کاراکتر باشد.';
    missingRequiredFa.push('عنوان و مشخصات کلیدی ملک');
  }
  if (!params.pricingEval.isEligibleBargain) {
    fieldErrors.proposedPrice = params.pricingEval.guidanceMessageFa;
    missingRequiredFa.push('قیمت واجد شرایط شکار (حداقل ۱۰٪ زیر شاخص پایه)');
  }
  if (params.uploadedMediaCount > 6) {
    fieldErrors.media = 'حداکثر ۶ فایل رسانه‌ای (تصویر یا ویدیو) مجاز است.';
  }
  if (params.uploadedMediaCount === 0) {
    recommendedSuggestionsFa.push('افزودن حداقل ۱ تصویر واقعی از ملک (پیشنهادی برای افزایش اعتماد خریداران)');
  }
  if (cleanTitle.length >= 3 && cleanTitle.length < 20) {
    recommendedSuggestionsFa.push('تکمیل عنوان با ذکر تعداد خواب یا وضعیت نورگیری (پیشنهادی)');
  }
  const requiredFieldsCount = 6;
  const satisfiedRequiredCount = Math.max(0, requiredFieldsCount - Object.keys(fieldErrors).filter((k) => k !== 'media').length);
  const requiredComplete = Object.keys(fieldErrors).length === 0;
  const requiredRatio = satisfiedRequiredCount / requiredFieldsCount;
  const mediaBonus = params.uploadedMediaCount >= 1 ? 12 : 0;
  const descriptiveTitleBonus = cleanTitle.length >= 20 ? 8 : cleanTitle.length >= 10 ? 4 : 0;
  const scorePercent = Math.min(100, Math.round(requiredRatio * 80 + (requiredComplete ? mediaBonus + descriptiveTitleBonus : 0)));
  return {
    valid: requiredComplete,
    fieldErrors,
    completeness: {
      scorePercent,
      requiredComplete,
      missingRequiredFa,
      recommendedSuggestionsFa,
    },
  };
}
export interface DealTypeTransitionCheck {
  previousType: 'خرید' | 'اجاره';
  nextType: 'خرید' | 'اجاره';
  previousPriceValue: number;
  requiresUserConfirmation: boolean;
  suggestedDefaultPrice: number;
  unitLabelFa: string;
  helperExampleFa: string;
  promptMessageFa: string;
}
export function evaluateDealTypeTransition(params: {
  previousType: 'خرید' | 'اجاره';
  nextType: 'خرید' | 'اجاره';
  currentPriceValue: number;
  wasPriceManuallyEdited: boolean;
  hoodBuyPerSqm: number;
  hoodRahn80m: number;
  sqm: number;
}): DealTypeTransitionCheck {
  const safeSqm = Math.max(20, Number(params.sqm) || 80);
  const nextSuggested =
    params.nextType === 'خرید'
      ? Math.max(15, Math.floor((Number(params.hoodBuyPerSqm) || 120) * 0.85))
      : Math.max(80, Math.floor((Number(params.hoodRahn80m) || 1200) * (safeSqm / 80) * 0.85));
  const unitLabelFa =
    params.nextType === 'خرید'
      ? 'قیمت پیشنهادی هر متر مربع (میلیون تومان)'
      : `مبلغ رهن کامل پیشنهادی برای ${safeSqm} متر (میلیون تومان)`;
  const helperExampleFa =
    params.nextType === 'خرید'
      ? `مثال: متری ${nextSuggested} میلیون تومان (معادل کل ${((nextSuggested * safeSqm) / 1000).toFixed(1)} میلیارد تومان)`
      : `مثال: ${nextSuggested.toLocaleString('fa-IR')} میلیون تومان رهن کامل`;
  const requiresUserConfirmation =
    params.previousType !== params.nextType &&
    params.wasPriceManuallyEdited &&
    Number(params.currentPriceValue) > 0;
  return {
    previousType: params.previousType, nextType: params.nextType, previousPriceValue: params.currentPriceValue, requiresUserConfirmation, suggestedDefaultPrice: nextSuggested, unitLabelFa, helperExampleFa, promptMessageFa: 'نوع معامله تغییر کرد. مبلغ قبلی مربوط به حالت دیگری است. آیا می‌خواهید مقدار جدید را وارد کنید؟', }; } export * from './listingCopywriterAndVisitConversion';