import type { BargainListing, BuyerAlertLeadItem, CityId, FeatureFlags, Neighborhood } from '../types/models'; import { MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { convertAreaFromSqm, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit'; import { resolveCanonicalCityForHoodId } from './marketDataIntegrity'; import { normalizeMultiScriptDigits, parseMultiScriptNumericInput } from './multiScriptNumericAndUnits'; import { runLocalLegalRuleEngine, type ContractCheckResponse } from './serverLegalRuleEngine'; import { sanitizeInput } from './security'; export interface BuyerInquiryContextPrefill { cityId: CityId; cityNameFa: string; hoodId: number; hoodName: string; dealType: 'خرید' | 'اجاره'; suggestedBudgetTextFa: string; destinationDescriptionFa: string; displayAreaUnitLabel?: string; suggestedBudgetIntlText?: string; }
export function buildContextualBuyerInquiryPrefill(params: { activeCity: CityId; selectedHood?: Pick<Neighborhood, 'id' | 'name' | 'buyPerSqm' | 'rahn80m'> | null; mode: 'rent' | 'buy'; buyTotalBudgetMillion: number; depositMillion: number; monthlyRentMillion: number; targetSqm: number; areaUnit?: AreaUnit; referenceCurrency?: IntlCurrencyCode; }): BuyerInquiryContextPrefill { const cityCfg = MULTI_CITY_CONFIGS[params.activeCity] || MULTI_CITY_CONFIGS.tehran; const fallbackHood = cityCfg.neighborhoods[0] || { id: 1, name: 'زعفرانیه', buyPerSqm: 200, rahn80m: 2500 }; const hood = params.selectedHood || fallbackHood; const dealType: 'خرید' | 'اجاره' = params.mode === 'rent' ? 'اجاره' : 'خرید'; const safeSqm = Math.max(30, Number(params.targetSqm) || 80); const unit = params.areaUnit ?? getStoredAreaUnit(); const curr = params.referenceCurrency ?? getStoredIntlCurrency(); const displayArea = Math.round(convertAreaFromSqm(safeSqm, unit)); const unitLbl = unit === 'sqft' ? 'فوت مربع' : 'متر'; const suggestedBudgetTextFa =
    dealType === 'خرید'
      ? `تا ${(Math.max(500, Number(params.buyTotalBudgetMillion) || 8000) / 1000).toFixed(1).replace(/\.0$/, '')} میلیارد تومان (${displayArea} ${unitLbl})`
      : params.monthlyRentMillion > 0
      ? `${params.depositMillion} میلیون پیش + ماهی ${params.monthlyRentMillion} میلیون (${displayArea} ${unitLbl})`
      : `تا ${params.depositMillion} میلیون تومان رهن کامل (${displayArea} ${unitLbl})`;
  return { cityId: params.activeCity, cityNameFa: cityCfg.nameFa, hoodId: hood.id, hoodName: hood.name, dealType, suggestedBudgetTextFa,
    destinationDescriptionFa: `ثبت در صف اطلاع‌رسانی خریداران رادار ${cityCfg.nameFa} (محله ${hood.name})`, displayAreaUnitLabel: formatAreaUnitLabel(unit), suggestedBudgetIntlText: formatMillionTomanAsIntlCurrency(dealType === 'خرید' ? Math.max(500, Number(params.buyTotalBudgetMillion) || 8000) : Math.max(0, Number(params.depositMillion) || 0), curr) }; } export function normalizeIranianMobileNumber(rawPhone: string): { valid: boolean; normalizedPhone: string; errorMessageFa?: string; } { const ascii = normalizeMultiScriptDigits(rawPhone || '').replace(/[\s\-().]/g, ''); if (!ascii) { return { valid: false, normalizedPhone: '', errorMessageFa: 'وارد کردن شماره موبایل الزامی است.' }; }
  let normalized = ascii; if (normalized.startsWith('+98')) normalized = '0' + normalized.slice(3); else if (normalized.startsWith('0098')) normalized = '0' + normalized.slice(4); else if (normalized.startsWith('98') && normalized.length === 12) normalized = '0' + normalized.slice(2);
  else if (normalized.startsWith('9') && normalized.length === 10) normalized = '0' + normalized; if (!/^09\d{9}$/.test(normalized) || /^09(\d)\1{8}$/.test(normalized)) { return { valid: false, normalizedPhone: normalized, errorMessageFa: 'شماره موبایل باید ۱۱ رقم معتبر با پیش‌شماره ۰۹ باشد (ارقام فارسی و انگلیسی پشتیبانی می‌شوند).', }; }
  return { valid: true, normalizedPhone: normalized }; }
export function computeBuyerLeadIdempotencyKey(params: { cityId: CityId; hoodId: number; dealType: 'خرید' | 'اجاره'; normalizedPhone: string; maxBudgetText: string;
}): string { const normBudget = normalizeMultiScriptDigits(params.maxBudgetText || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return `lead_${params.cityId}_${params.hoodId}_${params.dealType}_${params.normalizedPhone}_${normBudget.slice(0, 32)}`;
}
let inFlightBuyerLeadLockUntilMs = 0; export function acquireBuyerLeadSubmissionLock(nowMs = Date.now()): boolean { if (nowMs < inFlightBuyerLeadLockUntilMs) return false; inFlightBuyerLeadLockUntilMs = nowMs + 60_000;
  return true; }
export function releaseBuyerLeadSubmissionLock(): void { inFlightBuyerLeadLockUntilMs = 0;
}
export function validateBuyerLeadSubmission(params: { cityId: CityId;
  hoodId: number;
  fullName: string;
  rawPhone: string;
  dealType: 'خرید' | 'اجاره';
  maxBudgetText: string;
  consentAccepted?: boolean;
}): {
  valid: boolean;
  normalizedPhone: string;
  cleanFullName: string;
  cleanBudgetText: string;
  idempotencyKey: string;
  fieldErrors: Partial<Record<'fullName' | 'phone' | 'maxBudgetText' | 'hoodId' | 'consent', string>>;
} {
  const fieldErrors: Partial<Record<'fullName' | 'phone' | 'maxBudgetText' | 'hoodId' | 'consent', string>> = {};
  const cleanFullName = sanitizeInput(params.fullName || '', 80).trim();
  if (cleanFullName.length < 2) {
    fieldErrors.fullName = 'لطفاً نام و نام خانوادگی معتبر (حداقل ۲ حرف) وارد کنید.';
  }
  const phoneCheck = normalizeIranianMobileNumber(params.rawPhone);
  if (!phoneCheck.valid) {
    fieldErrors.phone = phoneCheck.errorMessageFa;
  }
  const cleanBudgetText = sanitizeInput(normalizeMultiScriptDigits(params.maxBudgetText || ''), 80).trim();
  const numericInBudget = cleanBudgetText.match(/\d+(?:\.\d+)?/);
  if (!cleanBudgetText || !numericInBudget || Number(numericInBudget[0]) <= 0) {
    fieldErrors.maxBudgetText = 'لطفاً سقف بودجه را همراه با عدد معتبر بزرگ‌تر از صفر وارد کنید.';
  }
  if (!Number.isInteger(params.hoodId) || params.hoodId < 1 || params.hoodId > 999) {
    fieldErrors.hoodId = 'محله انتخابی معتبر نیست.';
  }
  if (params.consentAccepted === false) {
    fieldErrors.consent = 'تأیید رضایت ثبت شماره تماس برای اطلاع‌رسانی الزامی است.';
  }
  const idempotencyKey = computeBuyerLeadIdempotencyKey({
    cityId: params.cityId,
    hoodId: params.hoodId,
    dealType: params.dealType,
    normalizedPhone: phoneCheck.normalizedPhone,
    maxBudgetText: cleanBudgetText,
  });
  return {
    valid: Object.keys(fieldErrors).length === 0,
    normalizedPhone: phoneCheck.normalizedPhone,
    cleanFullName,
    cleanBudgetText,
    idempotencyKey,
    fieldErrors,
  };
}
export type PriceThresholdMatchCategory =
  | 'confirmed_threshold_match' | 'estimated_threshold_match' | 'neighborhood_average_match'
  | 'insufficient_price_data' | 'unavailable_reference_data' | 'above_threshold';
export type PriceAlertSubscriptionLifecycleStatus = 'active' | 'triggered' | 'dismissed' | 'disabled';
export interface CityScopedPriceThresholdSubscription {
  id: string; cityId: CityId; hoodId: number; hoodName: string;
  dealType: 'خرید' | 'اجاره'; maxPriceThreshold: number;
  createdAtIso: string; updatedAtIso?: string;
  status: PriceAlertSubscriptionLifecycleStatus; requiresCityVerification?: boolean;
}
export interface AccurateThresholdListingEvaluation {
  listing: BargainListing; matchCategory: PriceThresholdMatchCategory;
  observedPriceMillion: number | null; isTriggeredMatch: boolean; explanationFa: string;
}
export function extractVerifiedBargainPriceInDealUnit(
  listing: BargainListing,
  dealType: 'خرید' | 'اجاره'
): { price: number | null; isDirectObservation: boolean } {
  const norm = normalizeMultiScriptDigits(listing.priceText || '').replace(/[,٬،\u066C\u060C]/g, '');
  if (!norm) return { price: null, isDirectObservation: false };
  const compoundMatch = norm.match(/(\d+(?:\.\d+)?)\s*میلیارد\s*و\s*(\d+(?:\.\d+)?)\s*میلیون/);
  if (dealType === 'خرید') {
    const perSqmMatch = norm.match(/(?:متری|هر\s*متر)\s*(\d+(?:\.\d+)?)\s*میلیون/);
    if (perSqmMatch && Number(perSqmMatch[1]) > 0) return { price: Number(perSqmMatch[1]), isDirectObservation: true };
    const totalBillionMatch = norm.match(/(\d+(?:\.\d+)?)\s*میلیارد/);
    if ((compoundMatch || totalBillionMatch) && Number(listing.sqm) >= 20) {
      const totalMillion = compoundMatch ? Number(compoundMatch[1]) * 1000 + Number(compoundMatch[2]) : Number(totalBillionMatch![1]) * 1000;
      if (Number.isFinite(totalMillion) && totalMillion > 0) return { price: Math.round((totalMillion / listing.sqm) * 10) / 10, isDirectObservation: true };
    }
    const totalMillionMatch = norm.match(/^(\d+(?:\.\d+)?)\s*میلیون(?:\s*تومان)?$/);
    if (totalMillionMatch && Number(totalMillionMatch[1]) >= 500 && Number(listing.sqm) >= 20) {
      return { price: Math.round((Number(totalMillionMatch[1]) / listing.sqm) * 10) / 10, isDirectObservation: true };
    }
    return { price: null, isDirectObservation: false };
  }
  if (compoundMatch) {
    const val = Math.round(Number(compoundMatch[1]) * 1000 + Number(compoundMatch[2]));
    if (Number.isFinite(val) && val > 0) return { price: val, isDirectObservation: true };
  }
  const rahnBillionMatch = norm.match(/(\d+(?:\.\d+)?)\s*میلیارد/);
  if (rahnBillionMatch && Number(rahnBillionMatch[1]) > 0) return { price: Math.round(Number(rahnBillionMatch[1]) * 1000), isDirectObservation: true };
  const rahnMillionMatch = norm.match(/(\d+(?:\.\d+)?)\s*میلیون/);
  if (rahnMillionMatch && Number(rahnMillionMatch[1]) > 0) return { price: Number(rahnMillionMatch[1]), isDirectObservation: true };
  return { price: null, isDirectObservation: false };
}
export function evaluateSubscriptionAgainstNeighborhood(params: {
  subscription: CityScopedPriceThresholdSubscription;
  activeCity: CityId;
  neighborhood?: Pick<Neighborhood, 'id' | 'name' | 'buyPerSqm' | 'rahn80m' | 'bargains'> | null;
}): {
  matchedEvaluations: AccurateThresholdListingEvaluation[];
  allEvaluations: AccurateThresholdListingEvaluation[];
  neighborhoodAveragePrice: number | null;
  isNeighborhoodAverageBelowThreshold: boolean;
} {
  const { subscription, activeCity, neighborhood } = params;
  if (
    subscription.status === 'disabled' ||
    subscription.status === 'dismissed' ||
    subscription.cityId !== activeCity ||
    !neighborhood ||
    neighborhood.id !== subscription.hoodId
  ) {
    return {
      matchedEvaluations: [],
      allEvaluations: [],
      neighborhoodAveragePrice: null,
      isNeighborhoodAverageBelowThreshold: false,
    };
  }
  const rawRef =
    subscription.dealType === 'خرید'
      ? Number(neighborhood.buyPerSqm)
      : Number(neighborhood.rahn80m);
  const hasValidRef = Number.isFinite(rawRef) && rawRef > 0;
  const neighborhoodAveragePrice = hasValidRef ? rawRef : null;
  const threshold = Number(subscription.maxPriceThreshold);
  const bargains = Array.isArray(neighborhood.bargains) ? neighborhood.bargains : [];
  const allEvaluations: AccurateThresholdListingEvaluation[] = [];
  for (const b of bargains) {
    if (!b || b.type !== subscription.dealType) continue;
    const direct = extractVerifiedBargainPriceInDealUnit(b, subscription.dealType);
    if (direct.price !== null && direct.isDirectObservation) {
      if (direct.price <= threshold) {
        allEvaluations.push({
          listing: b,
          matchCategory: 'confirmed_threshold_match',
          observedPriceMillion: direct.price,
          isTriggeredMatch: true,
          explanationFa: `قیمت صریح آگهی (${direct.price.toLocaleString('fa-IR')} م) پایین‌تر یا مساوی سقف هشدار (${threshold.toLocaleString('fa-IR')} م) است.`,
        });
      } else {
        allEvaluations.push({
          listing: b,
          matchCategory: 'above_threshold',
          observedPriceMillion: direct.price,
          isTriggeredMatch: false,
          explanationFa: `قیمت آگهی (${direct.price.toLocaleString('fa-IR')} م) بالاتر از سقف هشدار است.`,
        });
      }
      continue;
    }
    const disc = Number(b.discountPercent);
    if (hasValidRef && Number.isFinite(disc) && disc > 0 && disc < 90) {
      const estimatedPrice = Math.round(rawRef * (1 - disc / 100));
      if (estimatedPrice <= threshold) {
        allEvaluations.push({
          listing: b,
          matchCategory: 'estimated_threshold_match',
          observedPriceMillion: estimatedPrice,
          isTriggeredMatch: true,
          explanationFa: `برآورد تخمینی از روی درصد تخفیف و میانگین محله (${estimatedPrice.toLocaleString('fa-IR')} م) — نیازمند بررسی متن آگهی.`,
        });
      } else {
        allEvaluations.push({
          listing: b,
          matchCategory: 'above_threshold',
          observedPriceMillion: estimatedPrice,
          isTriggeredMatch: false,
          explanationFa: 'برآورد تخمینی بالاتر از سقف هشدار است.',
        });
      }
      continue;
    }
    allEvaluations.push({
      listing: b,
      matchCategory: hasValidRef ? 'insufficient_price_data' : 'unavailable_reference_data',
      observedPriceMillion: null,
      isTriggeredMatch: false,
      explanationFa: 'اطلاعات عددی قیمت در این آگهی برای مقایسه با سقف هشدار کافی نیست.',
    });
  }
  return {
    matchedEvaluations: allEvaluations.filter((e) => e.isTriggeredMatch),
    allEvaluations,
    neighborhoodAveragePrice,
    isNeighborhoodAverageBelowThreshold:
      neighborhoodAveragePrice !== null && neighborhoodAveragePrice <= threshold,
  };
}
export function migrateLegacyPriceThresholdSubscription(raw: unknown): CityScopedPriceThresholdSubscription | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const hoodId = Number(r.hoodId);
  const maxPriceThreshold = Number(r.maxPriceThreshold);
  const cleanId = typeof r.id === 'string' ? sanitizeInput(r.id, 80).trim() : '';
  if (!cleanId || !Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999 || !Number.isFinite(maxPriceThreshold) || maxPriceThreshold <= 0 || maxPriceThreshold > 10_000_000) {
    return null;
  }
  const explicitCity = typeof r.cityId === 'string' && r.cityId in MULTI_CITY_CONFIGS ? (r.cityId as CityId) : null;
  const inferredCity = resolveCanonicalCityForHoodId(hoodId) || 'tehran';
  const statusRaw = r.status;
  const status: PriceAlertSubscriptionLifecycleStatus = statusRaw === 'triggered' || statusRaw === 'dismissed' || statusRaw === 'disabled' ? statusRaw : 'active';
  const cleanHoodName = typeof r.hoodName === 'string' && r.hoodName.trim() ? sanitizeInput(r.hoodName, 80).trim() : `محله ${hoodId}`;
  return {
    id: cleanId,
    cityId: explicitCity || inferredCity,
    hoodId,
    hoodName: cleanHoodName || `محله ${hoodId}`,
    dealType: r.dealType === 'اجاره' ? 'اجاره' : 'خرید',
    maxPriceThreshold,
    createdAtIso: typeof r.createdAtIso === 'string' ? sanitizeInput(r.createdAtIso, 64) : new Date().toISOString(),
    updatedAtIso: typeof r.updatedAtIso === 'string' ? sanitizeInput(r.updatedAtIso, 64) : undefined,
    status,
    requiresCityVerification: !explicitCity,
  };
}
export type ResidentVotePersistenceKind =
  | 'authenticated_cloud_vote'
  | 'local_guest_preview'
  | 'cooldown_blocked';
export function classifyResidentVoteOutcome(params: {
  isAuthenticated: boolean;
  cloudWriteSucceeded: boolean;
  cooldownRemainingMs?: number;
  locationVerified: boolean;
}): {
  kind: ResidentVotePersistenceKind;
  shouldIncrementOfficialVotesCount: boolean;
  badgeLabelFa: string;
  userMessageFa: string;
} {
  if ((params.cooldownRemainingMs ?? 0) > 0) {
    const hoursLeft = Math.max(1, Math.ceil((params.cooldownRemainingMs || 0) / (60 * 60 * 1000)));
    return {
      kind: 'cooldown_blocked',
      shouldIncrementOfficialVotesCount: false,
      badgeLabelFa: 'محدودیت زمانی ۲۴ ساعته',
      userMessageFa: `شما در ۲۴ ساعت گذشته برای این محله رأی ثبت کرده‌اید. امکان ویرایش یا ثبت مجدد پس از ${hoursLeft} ساعت دیگر فعال می‌شود.`,
    };
  }
  if (!params.isAuthenticated || !params.cloudWriteSucceeded) {
    return {
      kind: 'local_guest_preview',
      shouldIncrementOfficialVotesCount: false,
      badgeLabelFa: 'پیش‌نمایش محلی روی این دستگاه (ثبت‌نشده در آمار رسمی)',
      userMessageFa:
        'امتیاز شما به‌صورت پیش‌نمایش محلی روی همین مرورگر اعمال شد. برای ثبت در آمار رسمی ساکنان، ورود به حساب کاربری الزامی است.', }; } return { kind: 'authenticated_cloud_vote', shouldIncrementOfficialVotesCount: true, badgeLabelFa: params.locationVerified
      ? 'رأی رسمی ابری (همراه با تطابق تقریبی موقعیت مرورگر با محله)'
      : 'رأی رسمی ثبت‌شده در فضای ابری', userMessageFa:
      'امتیاز شما با موفقیت در پایگاه داده ابری ثبت شد و در میانگین رسمی ساکنان محله لحاظ گردید.', }; } export * from './buyerCorrectionAndAdminGovernance';