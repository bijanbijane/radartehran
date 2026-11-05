/**
 * @file src/data/listingFraudAndAddressEngine.ts
 * @description PROMPT 117, PROMPT 118, PROMPT 124, PROMPT 136 & PROMPT 137: * ۱. تشخیص ناهنجاری، آگهی‌های تکراری و سیگنال‌های اعتماد آگهی ملکی بدون حذف خودکار آگهی‌های زیر قیمت (PROMPT 117)
 * ۲. نرمال‌سازی آدرس فارسی، کد پستی و تطبیق موقعیت مکانی بدون جایگزینی پنهان مختصات مرکز شهر (PROMPT 118)
 * ۳. شفافیت تصمیم‌گیری مالی و ایمنی خروجی‌های ارزش‌گذاری (PROMPT 124)
 * ۴. نسخه‌بندی مقررات و ضوابط حقوقی/مالیاتی املاک ایران بر اساس تاریخ اجرا (PROMPT 136)
 * ۵. واژه‌نامه استاندارد فارسی و ممیزی یکپارچگی اصطلاحات قیمتی (PROMPT 137)
 */

import type { Neighborhood } from './neighborhoods';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from '../utils/areaUnit';

// ============================================================================
// PROMPT 117: PROPERTY LISTING FRAUD, ANOMALY DETECTION & TRUST SIGNALS
// ============================================================================

export type ListingAnomalyClassification = 'CLEAN_LISTING' | 'DATA_VALIDATION_FAILURE' | 'POTENTIAL_DUPLICATE' | 'STATISTICAL_ANOMALY' | 'SUSPICIOUS_BEHAVIOR' | 'HUMAN_VERIFIED_FRAUD';

export interface PropertyListingCandidate { listingId: string; title: string; description: string; neighborhoodId: number; cityKey: string; areaSqm: number; totalPriceMillion: number;
  buildingAgeYears: number; rooms: number; latitude: number; longitude: number; photoHashes: string[]; submitterAccountId: string; submissionsInLastHour: number;
  humanConfirmedFraud?: boolean; }

export interface ListingTrustEvaluation { listingId: string;
  classification: ListingAnomalyClassification; recommendedAction: 'PUBLISH' | 'FLAG_FOR_HUMAN_REVIEW' | 'REJECT_INVALID_SCHEMA' | 'QUARANTINE_CONFIRMED_FRAUD';
  autoDeleteAccountOrListing: false;
  reasons: string[];
  displayAreaUnitLabel?: string;
  totalPriceIntlText?: string;
}

export function evaluatePropertyListingTrust(
  candidate: PropertyListingCandidate,
  referenceHood: Neighborhood,
  existingListings: PropertyListingCandidate[] = [],
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode },
): ListingTrustEvaluation {
  const reasons: string[] = [];
  const activeUnit = options?.areaUnit ?? getStoredAreaUnit();
  const activeCurrency = options?.intlCurrency ?? getStoredIntlCurrency();
  const displayAreaUnitLabel = formatAreaUnitLabel(activeUnit);
  const totalPriceIntlText = formatMillionTomanAsIntlCurrency(Math.max(0, candidate.totalPriceMillion || 0), activeCurrency);

  if (candidate.humanConfirmedFraud) {
    return {
      listingId: candidate.listingId, classification: 'HUMAN_VERIFIED_FRAUD',
      recommendedAction: 'QUARANTINE_CONFIRMED_FRAUD', autoDeleteAccountOrListing: false,
      reasons: ['تاییدشده توسط کارشناس ناظر به عنوان آگهی غیرواقعی'], displayAreaUnitLabel, totalPriceIntlText,
    };
  }

  if (
    !Number.isFinite(candidate.areaSqm) || candidate.areaSqm < 20 || candidate.areaSqm > 2000 ||
    !Number.isFinite(candidate.totalPriceMillion) || candidate.totalPriceMillion <= 0
  ) {
    return {
      listingId: candidate.listingId, classification: 'DATA_VALIDATION_FAILURE',
      recommendedAction: 'REJECT_INVALID_SCHEMA', autoDeleteAccountOrListing: false,
      reasons: ['متراژ یا قیمت کل خارج از دامنه معتبر فیزیکی است'], displayAreaUnitLabel, totalPriceIntlText,
    };
  }

  for (const other of existingListings) {
    if (other.listingId === candidate.listingId) continue;
    if (
      other.neighborhoodId === candidate.neighborhoodId &&
      Math.abs(other.areaSqm - candidate.areaSqm) <= 1 &&
      other.title.trim() === candidate.title.trim()
    ) {
      return {
        listingId: candidate.listingId, classification: 'POTENTIAL_DUPLICATE',
        recommendedAction: 'FLAG_FOR_HUMAN_REVIEW', autoDeleteAccountOrListing: false,
        reasons: [`تشابه کامل عنوان و متراژ با آگهی موجود (${other.listingId})`], displayAreaUnitLabel, totalPriceIntlText,
      };
    }
  }

  if (candidate.submissionsInLastHour > 10) {
    return {
      listingId: candidate.listingId, classification: 'SUSPICIOUS_BEHAVIOR',
      recommendedAction: 'FLAG_FOR_HUMAN_REVIEW', autoDeleteAccountOrListing: false,
      reasons: ['تعداد ارسال آگهی در یک ساعت گذشته بیش از حد مجاز است'], displayAreaUnitLabel, totalPriceIntlText,
    };
  }

  const candidatePerSqm = candidate.totalPriceMillion / candidate.areaSqm;
  const ratioToHood = candidatePerSqm / Math.max(10, referenceHood.buyPerSqm);
  if (ratioToHood < 0.55 || ratioToHood > 2.4) {
    reasons.push(
      `انحراف آماری قیمت متری (${Math.round(candidatePerSqm)} میلیون) نسبت به میانگین محله (${referenceHood.buyPerSqm} میلیون)؛ نیازمند بررسی انسانی و عدم حذف خودکار اکازیون‌های واقعی`,
    );
    return {
      listingId: candidate.listingId, classification: 'STATISTICAL_ANOMALY',
      recommendedAction: 'FLAG_FOR_HUMAN_REVIEW', autoDeleteAccountOrListing: false,
      reasons, displayAreaUnitLabel, totalPriceIntlText,
    };
  }

  return {
    listingId: candidate.listingId, classification: 'CLEAN_LISTING',
    recommendedAction: 'PUBLISH', autoDeleteAccountOrListing: false,
    reasons: [], displayAreaUnitLabel, totalPriceIntlText,
  };
}

// ============================================================================
// PROMPT 118: ADDRESS NORMALIZATION, GEOCODING & LOCATION MATCHING
// ============================================================================

const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizePersianAddressText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
    .replace(/[يیى]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/\u200c+/g, ' ')
    .replace(/(?<=^|[\s،,;؛\-_])خ\.?\s+/g, 'خیابان ')
    .replace(/(?<=^|[\s،,;؛\-_])م\.?\s+/g, 'میدان ')
    .replace(/(?<=^|[\s،,;؛\-_])ک\.?\s+/g, 'کوچه ')
    .replace(/[،,;؛\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateIranianPostalCode(raw: string): {
  valid: boolean;
  normalized: string;
  reason?: string;
} {
  const digits = normalizePersianAddressText(raw).replace(/\s+/g, '');
  if (!/^\d{10}$/.test(digits)) {
    return { valid: false, normalized: digits, reason: 'POSTAL_CODE_MUST_BE_10_DIGITS' };
  }
  if (/^(\d)\1{9}$/.test(digits) || digits === '1234567890' || digits === '0123456789' || digits.startsWith('00000')) {
    return { valid: false, normalized: digits, reason: 'POSTAL_CODE_SYNTHETIC_PATTERN_REJECTED' };
  }
  return { valid: true, normalized: digits };
}

export interface AddressLocationCandidate {
  id: number;
  name: string;
  cityKey: string;
  lat: number;
  lng: number;
}

export function matchAddressToNeighborhoodAndCity(
  rawAddress: string,
  expectedCityKey: string,
  neighborhoods: AddressLocationCandidate[],
): {
  matchedNeighborhoodId: number | null;
  matchedNeighborhoodName: string | null;
  confidence: 'EXACT' | 'AMBIGUOUS' | 'UNMATCHED';
  coordinates: { lat: number; lng: number } | null;
  usedFallbackCoordinates: false;
} {
  const normAddr = normalizePersianAddressText(rawAddress);
  const sameCityHoods = neighborhoods.filter((n) => n.cityKey === expectedCityKey);
  const rawMatches = sameCityHoods
    .map((n) => ({ candidate: n, normHood: normalizePersianAddressText(n.name) }))
    .filter(({ normHood }) => {
      if (!normHood) return false;
      const escaped = normHood.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(normAddr);
    });
  const matches = rawMatches
    .filter(
      (m) =>
        !rawMatches.some(
          (other) => other.candidate.id !== m.candidate.id && other.normHood.length > m.normHood.length && other.normHood.includes(m.normHood),
        ),
    )
    .map((m) => m.candidate);

  if (matches.length === 1) {
    return {
      matchedNeighborhoodId: matches[0].id,
      matchedNeighborhoodName: matches[0].name,
      confidence: 'EXACT',
      coordinates: { lat: matches[0].lat, lng: matches[0].lng },
      usedFallbackCoordinates: false,
    };
  }
  if (matches.length > 1) {
    return {
      matchedNeighborhoodId: matches[0].id,
      matchedNeighborhoodName: matches[0].name,
      confidence: 'AMBIGUOUS',
      coordinates: null,
      usedFallbackCoordinates: false,
    };
  }
  return {
    matchedNeighborhoodId: null,
    matchedNeighborhoodName: null,
    confidence: 'UNMATCHED',
    coordinates: null,
    usedFallbackCoordinates: false,
  };
}

// ============================================================================
// PROMPTS 124, 136 & 137: IRAN REAL ESTATE REGULATORY VERSIONS & PERSIAN GLOSSARY
// ============================================================================

export interface RegulatoryPolicyVersion {
  versionId: string;
  effectiveFromIso: string;
  effectiveToIso: string | null;
  authorityReference: string;
  rahnToRentMonthlyRate: number;
  agencyCommissionEachSideRate: number;
  vatOnCommissionRate: number;
  goodwillTransferTaxRate: number;
  propertyTransferTaxOnRegionalValueRate: number;
  legalDisclaimer: string;
}

export const IRAN_REAL_ESTATE_REGULATORY_VERSIONS: RegulatoryPolicyVersion[] = [
  {
    versionId: 'IR-RE-1402-V1',
    effectiveFromIso: '2023-03-21',
    effectiveToIso: '2025-03-20',
    authorityReference: 'تعرفه اتحادیه مشاوران املاک تهران و ماده ۵۹ قانون مالیات‌های مستقیم (سال ۱۴۰۲–۱۴۰۳)',
    rahnToRentMonthlyRate: 0.03,
    agencyCommissionEachSideRate: 0.005,
    vatOnCommissionRate: 0.09,
    goodwillTransferTaxRate: 0.02,
    propertyTransferTaxOnRegionalValueRate: 0.05,
    legalDisclaimer: 'محاسبه بر اساس ضوابط سال ۱۴۰۲–۱۴۰۳ و ارزش معاملاتی دفترچه‌ای؛ جایگزین مشاوره حقوقی رسمی نیست.',
  },
  {
    versionId: 'IR-RE-1404-V1',
    effectiveFromIso: '2025-03-21',
    effectiveToIso: null,
    authorityReference: 'بخشنامه سازمان امور مالیاتی (مالیات بر ارزش افزوده ۱۰٪) و نرخ عرف بازار اجاره ۱۴۰۴–۱۴۰۵',
    rahnToRentMonthlyRate: 0.03,
    agencyCommissionEachSideRate: 0.005,
    vatOnCommissionRate: 0.10,
    goodwillTransferTaxRate: 0.02,
    propertyTransferTaxOnRegionalValueRate: 0.05,
    legalDisclaimer:
      'محاسبات مالیاتی و کمیسیون تخمینی بوده و مالیات نقل‌وانتقال ۵٪ بر مبنای ارزش معاملاتی منطقه‌ای دارایی (نه قیمت روز بازار) محاسبه می‌شود.',
  },
];

export function resolveRegulatoryRuleVersion(asOfIsoDate = '2026-10-01'): RegulatoryPolicyVersion {
  const target = asOfIsoDate.slice(0, 10);
  for (const v of IRAN_REAL_ESTATE_REGULATORY_VERSIONS) {
    const afterStart = target >= v.effectiveFromIso;
    const beforeEnd = !v.effectiveToIso || target <= v.effectiveToIso;
    if (afterStart && beforeEnd) return v;
  }
  return IRAN_REAL_ESTATE_REGULATORY_VERSIONS[IRAN_REAL_ESTATE_REGULATORY_VERSIONS.length - 1];
}

export const PERSIAN_TERMINOLOGY_GLOSSARY: Record<
  'rahn' | 'ejareh' | 'askingPrice' | 'hedonicValuation' | 'regionalTaxValue',
  { canonicalPersian: string; definition: string }
> = {
  rahn: {
    canonicalPersian: 'رهن کامل (ودیعه قرض‌الحسنه)',
    definition: 'مبلغ سپرده قرض‌الحسنه مستأجر نزد موجر که در پایان قرارداد مسترد می‌شود.',
  },
  ejareh: {
    canonicalPersian: 'اجاره‌بهای ماهانه',
    definition: 'مبلغ پرداختی ماهانه مستأجر به موجر علاوه بر ودیعه.',
  },
  askingPrice: {
    canonicalPersian: 'قیمت پیشنهادی فروشنده (Asking Price)',
    definition: 'قیمت اعلامی در آگهی که لزوماً معامله قطعی ثبت‌شده نیست.',
  },
  hedonicValuation: {
    canonicalPersian: 'ارزش کارشناسی تخمینی (مدل هدونیک)',
    definition: 'برآورد الگوریتمی مبتنی بر میانگین محله و ضرایب سن بنا، طبقه، متراژ و بازسازی.',
  },
  regionalTaxValue: {
    canonicalPersian: 'ارزش معاملاتی منطقه‌ای دارایی',
    definition: 'ارزش دفترچه‌ای سازمان امور مالیاتی که مبنای مالیات ۵٪ نقل‌وانتقال قطعی است.',
  },
};