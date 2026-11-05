/**
 * @file src/utils/listingCopywriterAndVisitConversion.ts
 * @description Implements Prompts 763, 764, 765, and 768:
 * - Factual Persian listing copywriter without unsupported claims (763)
 * - Street address normalization & privacy plaque/unit redaction (764)
 * - Cross-field consistency validation across title, sqm, and deal type (765)
 * - Safe bargain-to-visit-book conversion & deduplication (768)
 */

import type { BargainListing } from '../types/models';
import { convertAreaFromSqm, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
import { normalizeMultiScriptDigits, parseMultiScriptNumericInput } from './multiScriptNumericAndUnits';
import { sanitizeInput } from './security';

const FORBIDDEN_UNVERIFIED_COPYWRITER_CLAIMS = [
  'سند قطعی',
  'سند تک‌برگ',
  'سند تک برگ',
  'پارکینگ اختصاصی',
  'بازسازی کامل',
  'تخفیف تضمینی',
  'موقعیت ممتاز',
];

export function generateFactualBargainTitleSuggestions(params: {
  hoodName: string;
  dealType: 'خرید' | 'اجاره';
  sqm: number;
  street: string;
  discountPercent: number;
  areaUnit?: AreaUnit;
}): string[] {
  const safeHood = sanitizeInput(params.hoodName || 'محله', 50);
  const safeStreet = sanitizeInput(params.street || '', 55);
  const safeSqm = Math.max(20, Math.min(1000, Math.round(Number(params.sqm) || 85)));
  const unit = params.areaUnit ?? 'sqm';
  const dispArea = Math.round(convertAreaFromSqm(safeSqm, unit));
  const unitPhrase = unit === 'sqft' ? `${dispArea} فوت مربع` : `${safeSqm} متری`;
  const safeDisc = Math.max(10, Math.min(60, Math.round(Number(params.discountPercent) || 12)));
  const locPhrase = safeStreet ? `${safeHood} (${safeStreet})` : safeHood;

  const rawCandidates =
    params.dealType === 'خرید'
      ? [
          `واحد مسکونی ${unitPhrase} در ${locPhrase} — ${safeDisc}٪ پایین‌تر از شاخص محله`,
          `فروش آپارتمان ${unitPhrase} محدوده ${locPhrase}`,
          `آپارتمان ${unitPhrase} مناسب خرید در ${locPhrase}`,
        ]
      : [
          `رهن کامل واحد ${unitPhrase} در ${locPhrase} — ${safeDisc}٪ زیر شاخص رهن محله`,
          `اجاره آپارتمان ${unitPhrase} محدوده ${locPhrase}`,
          `واحد مسکونی ${unitPhrase} جهت رهن در ${locPhrase}`,
        ];

  return rawCandidates.map((title) => {
    let cleaned = title;
    for (const forbidden of FORBIDDEN_UNVERIFIED_COPYWRITER_CLAIMS) {
      cleaned = cleaned.replace(new RegExp(forbidden, 'g'), '');
    }
    return cleaned.replace(/\s+/g, ' ').trim().slice(0, 120);
  });
}

const EXACT_PLAQUE_OR_UNIT_REGEX =
  /(?:(?:پلاک|واحد|بلوک|طبقه|زنگ|کد\s*پستی)\s*[:#\-]?\s*[۰-۹٠-٩0-9]+|(?:\+98|0098|0)?[9۹٩][0-9۰-۹٠-٩]{9})/gi;

export interface StreetPrivacyAnalysis {
  normalizedStreet: string;
  containsExactUnitOrPlaque: boolean;
  detectedPrivateTokens: string[];
  redactedSuggestion: string;
  privacyWarningFa: string | null;
  generalGuidanceFa: string;
}

export function analyzeListingStreetPrivacyAndNormalization(rawStreet: string): StreetPrivacyAnalysis {
  const raw = typeof rawStreet === 'string' ? rawStreet.slice(0, 200) : '';
  const normalizedStreet = raw
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/\u200C+/g, '‌')
    .replace(/\s+/g, ' ')
    .trim();

  const matches = normalizedStreet.match(EXACT_PLAQUE_OR_UNIT_REGEX) || [];
  const containsExactUnitOrPlaque = matches.length > 0;
  const redactedSuggestion = containsExactUnitOrPlaque
    ? normalizedStreet
        .replace(EXACT_PLAQUE_OR_UNIT_REGEX, '')
        .replace(/[،,\-]+\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : normalizedStreet;

  return {
    normalizedStreet,
    containsExactUnitOrPlaque,
    detectedPrivateTokens: matches,
    redactedSuggestion: redactedSuggestion || 'خیابان اصلی محله',
    privacyWarningFa: containsExactUnitOrPlaque
      ? 'در آدرس واردشده شماره پلاک، واحد دقیق یا شماره تماس شناسایی شد. پیشنهاد می‌شود برای حفظ امنیت مالک، فقط نام خیابان یا کوچه فرعی درج شود.'
      : null,
    generalGuidanceFa:
      'برای حفظ حریم خصوصی، شماره پلاک، واحد و جزئیات دقیق ورودی ساختمان را در توضیحات عمومی وارد نکنید.',
  };
}

export type CrossFieldConsistencyClassification =
  | 'confirmed_contradiction'
  | 'likely_inconsistency'
  | 'ambiguous'
  | 'consistent';

export interface ListingCrossFieldConsistencyReport {
  classification: CrossFieldConsistencyClassification;
  issuesFa: string[];
  extractedTitleSqm: number | null;
  hasDealTypeConflict: boolean;
}

export function evaluateListingCrossFieldConsistency(params: {
  title: string;
  sqm: number;
  dealType: 'خرید' | 'اجاره';
  proposedPrice: number;
}): ListingCrossFieldConsistencyReport {
  const normTitle = normalizeMultiScriptDigits(params.title || '');
  const issuesFa: string[] = [];
  let classification: CrossFieldConsistencyClassification = 'consistent';

  let extractedTitleSqm: number | null = null;
  const areaRegex = /(?:^|\s)(\d{2,4})\s*متر(?:ی|مربع)?(?:\s|$|،|,)/g;
  let match: RegExpExecArray | null;
  while ((match = areaRegex.exec(normTitle)) !== null) {
    const num = Number(match[1]);
    const prefixSlice = normTitle.slice(Math.max(0, match.index - 12), match.index);
    if (/خیابان|بلوار|کوچه|گذر/.test(prefixSlice)) continue;
    if (Number.isFinite(num) && num >= 20 && num <= 1000) {
      extractedTitleSqm = num;
      break;
    }
  }

  const formSqm = Number(params.sqm);
  if (extractedTitleSqm !== null && Number.isFinite(formSqm) && Math.abs(extractedTitleSqm - formSqm) >= 3) {
    classification = 'confirmed_contradiction';
    issuesFa.push(
      `متراژ ذکرشده در عنوان آگهی (${extractedTitleSqm} متر) با متراژ ثبت‌شده در فرم (${formSqm} متر) مغایرت دارد.`
    );
  }

  const hasRentOnlyKeywords = /رهن\s*کامل|اجاره\s*ماهانه|ودیعه\s*و\s*اجاره/.test(normTitle);
  const hasBuyOnlyKeywords = /فروش\s*فوری|زیر\s*قیمت\s*خرید|پیش[\s‌]*فروش/.test(normTitle);
  let hasDealTypeConflict = false;

  if (params.dealType === 'خرید' && hasRentOnlyKeywords && !/مستاجر|مستأجر/.test(normTitle)) {
    hasDealTypeConflict = true;
    classification = 'confirmed_contradiction';
    issuesFa.push('نوع معامله «خرید» انتخاب شده اما متن عنوان حاوی عبارات اختصاصی رهن و اجاره است.');
  } else if (params.dealType === 'اجاره' && hasBuyOnlyKeywords) {
    hasDealTypeConflict = true;
    classification = 'confirmed_contradiction';
    issuesFa.push('نوع معامله «اجاره» انتخاب شده اما متن عنوان حاوی عبارات اختصاصی فروش/خرید است.');
  }

  return {
    classification,
    issuesFa,
    extractedTitleSqm,
    hasDealTypeConflict,
  };
}

export interface VisitedHomeRecordWithSource {
  id: string;
  sourceListingId?: string;
  cityId?: string;
  hoodId: number;
  hoodName: string;
  title: string;
  sqm: number;
  askingPriceMillion: number | null;
  priceTextRaw?: string;
  dealType?: 'خرید' | 'اجاره';
  naturalLight: number;
  noiseLevel: number;
  parkingAccess: number;
  buildingMaintenance: number;
  valueForMoney: number;
  notes: string;
  createdAtFa: string;
  displayAreaUnitLabel?: string;
  askingPriceIntlText?: string;
}

export function extractSafeAskingPriceMillionFromListing(
  listing: Pick<BargainListing, 'priceText' | 'type' | 'sqm'>
): number | null {
  const norm = normalizeMultiScriptDigits(listing.priceText || '').replace(/[,٬]/g, '');
  if (!norm) return null;

  const billionMatch = norm.match(/(\d+(?:\.\d+)?)\s*میلیارد(?:\s*و\s*(\d+(?:\.\d+)?)\s*میلیون)?/);
  if (billionMatch) {
    const val = Number(billionMatch[1]);
    const extraM = billionMatch[2] ? Number(billionMatch[2]) : 0;
    if (Number.isFinite(val) && val > 0) return Math.round(val * 1000 + (Number.isFinite(extraM) ? extraM : 0));
  }

  const perSqmMatch = norm.match(/متری\s*(\d+(?:\.\d+)?)\s*میلیون/);
  if (perSqmMatch) {
    const perSqm = Number(perSqmMatch[1]);
    const sqm = Number(listing.sqm) || 0;
    return Number.isFinite(perSqm) && perSqm > 0 && sqm >= 20 ? Math.round(perSqm * sqm) : null;
  }

  const millionMatch = norm.match(/(\d+(?:\.\d+)?)\s*میلیون/);
  if (millionMatch) {
    const val = Number(millionMatch[1]);
    if (Number.isFinite(val) && val > 0) return Math.round(val);
  }

  const parsed = parseMultiScriptNumericInput(norm);
  if (parsed.status === 'valid' && parsed.value !== null && parsed.value > 0) {
    return Math.round(parsed.value);
  }
  return null;
}

export function addBargainListingToVisitBook(params: {
  existingVisits: readonly VisitedHomeRecordWithSource[];
  listing: BargainListing;
  hoodId: number;
  hoodName: string;
  cityId?: string;
  areaUnit?: AreaUnit;
  referenceCurrency?: IntlCurrencyCode;
}): {
  status: 'added' | 'already_exists';
  record: VisitedHomeRecordWithSource;
  updatedList: VisitedHomeRecordWithSource[];
} {
  const sourceId = sanitizeInput(String(params.listing.id || ''), 80).trim();
  const safeTitle = sanitizeInput(params.listing.title || '', 120);
  const safeStreet = sanitizeInput(params.listing.street || '', 80);
  const safePriceText = sanitizeInput(params.listing.priceText || '', 80);
  const combinedTitle = `${safeTitle} (${safeStreet})`.trim();
  const existing = params.existingVisits.find(
    (v) =>
      (sourceId && v.sourceListingId === sourceId) ||
      (v.hoodId === params.hoodId && v.sqm === params.listing.sqm && v.title.trim() === combinedTitle)
  );

  if (existing) {
    return { status: 'already_exists', record: existing, updatedList: [...params.existingVisits] };
  }

  const extractedMillion = extractSafeAskingPriceMillionFromListing(params.listing);
  const unit = params.areaUnit ?? getStoredAreaUnit();
  const curr = params.referenceCurrency ?? getStoredIntlCurrency();
  const newRecord: VisitedHomeRecordWithSource = {
    id: `visit-src-${sourceId || Date.now()}`,
    sourceListingId: sourceId || undefined,
    cityId: params.cityId || 'tehran',
    hoodId: params.hoodId,
    hoodName: sanitizeInput(params.hoodName || '', 60),
    title: combinedTitle,
    sqm: Math.max(20, Math.min(2000, Number(params.listing.sqm) || 85)),
    askingPriceMillion: extractedMillion,
    priceTextRaw: safePriceText,
    dealType: params.listing.type === 'اجاره' ? 'اجاره' : 'خرید',
    naturalLight: 8,
    noiseLevel: 8,
    parkingAccess: 8,
    buildingMaintenance: 8,
    valueForMoney: 9,
    notes: `افزوده‌شده از آگهی شکار (${safePriceText} — ${Math.max(0, Math.min(90, Number(params.listing.discountPercent) || 0))}٪ تخفیف)`,
    createdAtFa: new Date().toLocaleDateString('fa-IR'),
    displayAreaUnitLabel: formatAreaUnitLabel(unit),
    askingPriceIntlText: extractedMillion !== null ? formatMillionTomanAsIntlCurrency(extractedMillion, curr) : undefined,
  };

  return { status: 'added', record: newRecord, updatedList: [newRecord, ...params.existingVisits].slice(0, 100) };
}

