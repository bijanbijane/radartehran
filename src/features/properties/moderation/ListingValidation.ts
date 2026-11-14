/** @file src/features/properties/moderation/ListingValidation.ts — Validation, Anomaly Flagging & Optimistic Concurrency */
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { getCurrentJalaliYear } from '../../../data/hedonicPricingEngine';
import { sanitizeInput } from '../../../utils/security';
import { normalizeDigitsToAscii } from '../filters/PropertyFilterDraft';
import type { ListingEntity } from '../types/listing.types';
import type { ListingAnomalyFlag, ListingSubmissionDraft } from '../types/listing-history.types';

export interface StepValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function createEmptySubmissionDraft(defaultHoodId: number, cityId = 'tehran'): ListingSubmissionDraft {
  return {
    draftId: `draft-${Date.now()}`,
    stepIndex: 1,
    lastSavedAtIso: new Date().toISOString(),
    propertyType: 'apartment',
    transactionType: 'sale',
    cityId,
    hoodId: defaultHoodId,
    street: '',
    locationPrecision: 'approximate',
    areaSqm: '85',
    buildYearJalali: '1398',
    roomsCount: '2',
    floorNumber: '3',
    totalFloors: '5',
    documentType: 'single_deed',
    parking: 'has',
    elevator: 'has',
    storage: 'has',
    balcony: 'unknown',
    priceType: 'negotiable',
    saleTotalBillion: '',
    depositMillion: '',
    monthlyRentMillion: '',
    convertibleRent: false,
    title: '',
    description: '',
    publisherRole: 'owner',
    publisherName: '',
    publisherPhone: '',
    agreeToVerification: true,
  };
}

function parseAsciiNum(raw: string): number {
  const n = Number(normalizeDigitsToAscii(raw || '').replace(/[,٬\s]/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function validateSubmissionStep(draft: ListingSubmissionDraft, step: number): StepValidationResult {
  const errors: Record<string, string> = {};
  const maxYear = getCurrentJalaliYear();

  if (step === 2) {
    if (!draft.hoodId || draft.hoodId <= 0) errors.hoodId = 'انتخاب محله الزامی است.';
    if (draft.street.trim().length < 2) errors.street = 'نام خیابان یا محدوده تقریبی را با حداقل ۲ کاراکتر وارد کنید.';
  }

  if (step === 3) {
    const area = parseAsciiNum(draft.areaSqm);
    if (!Number.isFinite(area) || area < 15 || area > 5000) {
      errors.areaSqm = 'متراژ معتبر بین ۱۵ تا ۵٬۰۰۰ متر مربع وارد کنید.';
    }
    if (draft.propertyType !== 'land') {
      const year = parseAsciiNum(draft.buildYearJalali);
      if (!Number.isFinite(year) || year < 1340 || year > maxYear + 1) {
        errors.buildYearJalali = `سال ساخت باید بین ۱۳۴۰ تا ${maxYear} باشد.`;
      }
      const floor = parseAsciiNum(draft.floorNumber);
      const total = parseAsciiNum(draft.totalFloors);
      if (draft.propertyType === 'apartment' || draft.propertyType === 'office') {
        if (!Number.isFinite(floor) || floor < -2 || floor > 60) errors.floorNumber = 'طبقه نامعتبر است.';
        if (!Number.isFinite(total) || total < 1 || (Number.isFinite(floor) && floor > total)) {
          errors.totalFloors = 'تعداد کل طبقات نمی‌تواند کمتر از طبقه واحد باشد.';
        }
      }
    }
  }

  if (step === 5 && draft.priceType !== 'undisclosed') {
    if (draft.transactionType === 'sale' || draft.transactionType === 'presale') {
      const totalB = parseAsciiNum(draft.saleTotalBillion);
      if (!Number.isFinite(totalB) || totalB < 0.3 || totalB > 1500) {
        errors.saleTotalBillion = 'قیمت فروش کل معتبر (به میلیارد تومان) وارد کنید یا حالت «توافقی / نامشخص» را برگزینید.';
      }
    } else {
      const dep = parseAsciiNum(draft.depositMillion);
      if (!Number.isFinite(dep) || dep < 20) {
        errors.depositMillion = 'مبلغ ودیعه معتبر (حداقل ۲۰ میلیون تومان) وارد کنید.';
      }
      if (draft.transactionType === 'rent') {
        const rent = parseAsciiNum(draft.monthlyRentMillion);
        if (!Number.isFinite(rent) || rent < 0) errors.monthlyRentMillion = 'مبلغ اجاره ماهانه نامعتبر است.';
      }
    }
  }

  if (step === 6) {
    if (draft.title.trim().length < 6) errors.title = 'عنوان آگهی باید حداقل ۶ کاراکتر باشد.';
    if (draft.description.trim().length < 12) errors.description = 'توضیحات آگهی باید حداقل ۱۲ کاراکتر شفاف درباره وضعیت ملک باشد.';
  }

  if (step === 7) {
    if (draft.publisherName.trim().length < 2) errors.publisherName = 'نام آگهی‌دهنده الزامی است.';
    const phone = normalizeDigitsToAscii(draft.publisherPhone).replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 11) errors.publisherPhone = 'شماره تماس ۱۰ یا ۱۱ رقمی معتبر وارد کنید.';
    if (!draft.agreeToVerification) errors.agreeToVerification = 'پذیرش شفافیت و راستی‌آزمایی پیش از انتشار الزامی است.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function evaluatePriceAnomalies(
  draft: ListingSubmissionDraft,
  hood: EvaluatedNeighborhood | undefined,
): ListingAnomalyFlag[] {
  if (!hood || draft.priceType === 'undisclosed') return [];
  const area = parseAsciiNum(draft.areaSqm);
  if (!Number.isFinite(area) || area <= 0) return [];
  const flags: ListingAnomalyFlag[] = [];

  if (draft.transactionType === 'sale' || draft.transactionType === 'presale') {
    const totalMillion = parseAsciiNum(draft.saleTotalBillion) * 1000;
    if (Number.isFinite(totalMillion) && totalMillion > 0) {
      const perSqm = totalMillion / area;
      const diffRatio = (perSqm - hood.buyPerSqm) / Math.max(1, hood.buyPerSqm);
      if (diffRatio <= -0.35) {
        flags.push({
          code: 'PRICE_UNUSUALLY_LOW',
          severity: 'warning',
          messageFa: 'قیمت اعلامی بیش از ۳۵٪ پایین‌تر از میانگین محله است؛ احتمال خطای رقم (میلیون/میلیارد) یا نیاز به بررسی دقیق‌تر پیش از انتشار وجود دارد.',
        });
      } else if (diffRatio >= 0.45) {
        flags.push({
          code: 'PRICE_UNUSUALLY_HIGH',
          severity: 'info',
          messageFa: 'قیمت اعلامی بیش از ۴۵٪ بالاتر از میانگین محله است؛ در صورت لوکس‌بودن ویژه یا قدرالسهم، توضیح آن را در متن درج کنید.',
        });
      }
    }
  }
  return flags;
}

export function sanitizeListingText(raw: string, maxLen = 400): string {
  return sanitizeInput(raw || '', maxLen);
}

export function optimisticUpdateListing(
  existing: ListingEntity,
  patch: Partial<Pick<ListingEntity, 'title' | 'description' | 'status' | 'price'>>,
  expectedVersion: number,
): { ok: true; updated: ListingEntity } | { ok: false; errorCode: 'CONFLICT_STALE_VERSION'; messageFa: string } {
  if (existing.version !== expectedVersion) {
    return {
      ok: false,
      errorCode: 'CONFLICT_STALE_VERSION',
      messageFa: 'این فایل توسط عملیات جدیدتری بروزرسانی شده است. لطفاً نسخه تازه را بارگذاری کنید.',
    };
  }
  return {
    ok: true,
    updated: {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAtIso: new Date().toISOString(),
    },
  };
}
