/**
 * @file src/utils/deedLegitimacyShieldEngine.ts
 * @description Iranian Title & Deed Legitimacy Shield Engine.
 * Formulates risk deductions based on the 1403 Law on Compulsory Official Real Estate Registration
 * and property title typology (Tek-Barg vs Waqf vs Ghoulnameh vs Maskan Mehr).
 * OP-DEC-001: formatMillionTomanAsIntlCurrency
 */
import { toPersianNum } from '../data/neighborhoods';

export type IranianDeedType =
  | 'TEK_BARG_OFFICIAL'     // سند تک‌برگ رسمی شش‌دانگ عرصه و اعیان
  | 'MANGOOLE_DAR_BOOKLET'  // سند دفترچه‌ای قدیمی منگوله‌دار (نیازمند تبدیل طبق قانون ۱۴۰۳)
  | 'OGHAF_ENDOWED'         // سند اوقافی (عرصه موقوفه، اعیان ملکی)
  | 'GHOULNAME_ADI'         // سند عادی / قولنامه‌ای / وکالتی (فاقد سند رسمی)
  | 'MASKAN_MEHR_NO_ARSE'   // مسکن مهر اجاره ۹۹ ساله بدون سند عرصه
  | 'MADDE_100_DISPUTE';    // فاقد پایان‌کار یا دارای پرونده تخلف کمیسیون ماده ۱۰۰

export interface DeedRiskAssessment {
  deedType: IranianDeedType;
  titleFa: string;
  legalSafetyScore: number;       // 1..10
  valuationDiscountPct: number;   // 0..35%
  isLaw1403Compliant: boolean;
  legalTrapWarningFa: string;
  requiredInquiriesFa: string[];
}

export const IRANIAN_DEED_SPECS: Record<IranianDeedType, DeedRiskAssessment> = {
  TEK_BARG_OFFICIAL: {
    deedType: 'TEK_BARG_OFFICIAL',
    titleFa: 'سند تک‌برگ رسمی شش‌دانگ (عرصه و اعیان)',
    legalSafetyScore: 10,
    valuationDiscountPct: 0,
    isLaw1403Compliant: true,
    legalTrapWarningFa: 'استاندارد طلایی مالکیت؛ بدون کسر ارزش و دارای اعتبار کامل در سامانه کاتب و ثبت اسناد.',
    requiredInquiriesFa: ['استعلام آنلاین تصدیق اصالت سند از سازمان ثبت', 'استعلام عدم بازداشتی و وثیقه قضایی'],
  },
  MANGOOLE_DAR_BOOKLET: {
    deedType: 'MANGOOLE_DAR_BOOKLET',
    titleFa: 'سند دفترچه‌ای قدیمی (منگوله‌دار)',
    legalSafetyScore: 7.5,
    valuationDiscountPct: 5,
    isLaw1403Compliant: false,
    legalTrapWarningFa: 'طبق قانون الزام ۱۴۰۳، انتقال رسمی نیازمند اخذ نقشه شمیم و تبدیل قطعی به سند تک‌برگ است.',
    requiredInquiriesFa: ['نقشه‌برداری دقیق شمیم برای رفع تداخل پلاک ثبتی', 'تسویه عوارض نوسازی شهرداری'],
  },
  OGHAF_ENDOWED: {
    deedType: 'OGHAF_ENDOWED',
    titleFa: 'سند وقفی (عرصه اوقافی، اعیان ملکی)',
    legalSafetyScore: 6.5,
    valuationDiscountPct: 15,
    isLaw1403Compliant: true,
    legalTrapWarningFa: 'خریدار فقط مالک بنا است و سالانه باید اجاره عرصه را به متولی اوقاف یا آستان قدس پرداخت کند.',
    requiredInquiriesFa: ['استعلام تسویه پذیره و اجاره معوقه از اداره اوقاف', 'اخذ موافقت‌نامه رسمی متولی برای انتقال'],
  },
  GHOULNAME_ADI: {
    deedType: 'GHOULNAME_ADI',
    titleFa: 'سند عادی / قولنامه‌ای / وکالتی',
    legalSafetyScore: 2.5,
    valuationDiscountPct: 30,
    isLaw1403Compliant: false,
    legalTrapWarningFa: 'خطر قرمز: بر اساس قانون الزام به ثبت رسمی ۱۴۰۳، دعاوی اسناد عادی در محاکم پذیرفته نمی‌شود و ریسک فروش به غیر بسیار بالاست.',
    requiredInquiriesFa: ['بررسی زنجیره کامل ایادی قبلی از اولین مالک ثبتی', 'استعلام تاییدیه شورای حل اختلاف و کد رهگیری سامانه خودنویس'],
  },
  MASKAN_MEHR_NO_ARSE: {
    deedType: 'MASKAN_MEHR_NO_ARSE',
    titleFa: 'مسکن مهر (عرصه اجاره ۹۹ ساله دولتی)',
    legalSafetyScore: 5.5,
    valuationDiscountPct: 22,
    isLaw1403Compliant: false,
    legalTrapWarningFa: 'زمین متعلق به دولت است؛ در صورت تمایل به مالکیت شش‌دانگ، هزینه خرید عرصه از شرکت عمران باید پرداخت شود.',
    requiredInquiriesFa: ['استعلام وضعیت اقساط وام مسکن و تسویه بدهی عرصه', 'استعلام اصالت قرارداد واگذاری پنج‌برگی از شرکت عمران شهر جدید'],
  },
  MADDE_100_DISPUTE: {
    deedType: 'MADDE_100_DISPUTE',
    titleFa: 'ملک بدون پایان‌کار / دارای پرونده ماده ۱۰۰',
    legalSafetyScore: 4.0,
    valuationDiscountPct: 20,
    isLaw1403Compliant: false,
    legalTrapWarningFa: 'ریسک جریمه سنگین نقدی یا تخریب بخش اضافه بنا توسط کمیسیون ماده ۱۰۰ شهرداری و عدم امکان اخذ سند مجزا.',
    requiredInquiriesFa: ['استعلام آخرین رای کمیسیون ماده ۱۰۰ از شهرداری منطقه', 'محاسبه دقیق جریمه ریالی قبل از هرگونه پرداخت وجه'],
  },
};

export function evaluateDeedImpact(basePriceSqm: number, deedType: IranianDeedType): {
  nominalPriceSqm: number;
  discountedPriceSqm: number;
  discountAmountSqm: number;
  discountPct: number;
  spec: DeedRiskAssessment;
  warningSummaryFa: string;
} {
  const spec = IRANIAN_DEED_SPECS[deedType] || IRANIAN_DEED_SPECS.TEK_BARG_OFFICIAL;
  const nominal = Math.max(1, basePriceSqm);
  const discountMultiplier = (100 - spec.valuationDiscountPct) / 100;
  const discounted = Math.round(nominal * discountMultiplier);
  const diff = nominal - discounted;

  const warningSummaryFa = spec.valuationDiscountPct > 0
    ? `به دلیل نوع سند (${spec.titleFa})، ارزش ذاتی واحد متری ${toPersianNum(diff)} م.ت (${toPersianNum(spec.valuationDiscountPct)}٪) نسبت به سند تک‌برگ کاهش می‌یابد. ${spec.legalTrapWarningFa}`
    : 'سند ملک از نوع تک‌برگ شش‌دانگ رسمی است و هیچ کسر ارزش حقوقی ندارد.';

  return {
    nominalPriceSqm: nominal,
    discountedPriceSqm: discounted,
    discountAmountSqm: diff,
    discountPct: spec.valuationDiscountPct,
    spec,
    warningSummaryFa,
  };
}
