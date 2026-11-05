/**
 * @file src/utils/uxAccessibilityAndDesignSystemEngine.ts
 * @description UX Engineering, Plain-Persian Real-Estate Terminology Glossary,
 * Cognitive Load & FTUE Evaluator, WCAG 2.2 AA Contrast/Touch Target Validator,
 * Chart & Calculator Plain-Language Summarizer, and Progressive Disclosure Engine
 * (Section 23 — Prompts 441 to 460).
 */

// ============================================================================
// 1. PROMPT 445 — PLAIN-PERSIAN TERMINOLOGY DICTIONARY FOR ORDINARY USERS
// ============================================================================
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export interface PlainPersianTermDefinition {
  termKey: string;
  technicalTermFa: string;
  plainLabelFa: string;
  shortTooltipFa: string;
  exampleFa: string;
}

export const RADAR_PLAIN_PERSIAN_TERMINOLOGY_GLOSSARY: Record<string, PlainPersianTermDefinition> = {
  hedonic_valuation: {
    termKey: 'hedonic_valuation',
    technicalTermFa: 'ارزش‌گذاری هدونیک ملک',
    plainLabelFa: 'تخمین هوشمند قیمت منصفانه خانه',
    shortTooltipFa:
      'محاسبه قیمت واقعی خانه بر اساس میانگین محله به‌علاوه تأثیر سن بنا، طبقه، آسانسور، پارکینگ و نورگیری.',
    exampleFa: 'مثلاً آپارتمان نوساز طبقه ۴ با آسانسور و پارکینگ حدود ۱۲٪ بالاتر از میانگین پایه محله ارزش دارد.',
  },
  rahn_ejareh_conversion: {
    termKey: 'rahn_ejareh_conversion',
    technicalTermFa: 'ضریب تبدیل رهن و اجاره',
    plainLabelFa: 'تبدیل پول پیش (ودیعه) به اجاره ماهانه',
    shortTooltipFa:
      'نرخی که مشخص می‌کند به ازای هر ۱۰۰ میلیون تومان پول پیش بیشتر یا کمتر، اجاره ماهانه چقدر تغییر می‌کند.',
    exampleFa: 'با نرخ رایج ۳٪ ماهانه، هر ۱۰۰ میلیون تومان ودیعه معادل ۳ میلیون تومان اجاره ماهانه است.',
  },
  ghadrolsahm_arseh: {
    termKey: 'ghadrolsahm_arseh',
    technicalTermFa: 'قدرالسهم عرصه از زمین',
    plainLabelFa: 'سهم واحد شما از زمین کل ساختمان',
    shortTooltipFa:
      'مقدار متراژی از زمین اصلی ملک که در صورت نوسازی یا تجمیع به واحد شما تعلق می‌گیرد.',
    exampleFa: 'در زمین ۳۰۰ متری با ۶ واحد یکسان، سهم زمین هر واحد حدود ۵۰ متر مربع است.',
  },
  liquidity_score: {
    termKey: 'liquidity_score',
    technicalTermFa: 'شاخص نقدشوندگی محله',
    plainLabelFa: 'سرعت فروش رفتن خانه در این محله',
    shortTooltipFa:
      'هرچه این عدد به ۱۰ نزدیک‌تر باشد، تقاضای خرید در محله بالاتر بوده و ملک سریع‌تر معامله می‌شود.',
    exampleFa: 'امتیاز ۸.۵ از ۱۰ یعنی تقاضای خرید در این محله بسیار بالاست.',
  },
  fast_sale_price: {
    termKey: 'fast_sale_price',
    technicalTermFa: 'قیمت فروش فوری (نقدشونده)',
    plainLabelFa: 'قیمت پیشنهادی برای فروش سریع‌تر',
    shortTooltipFa:
      'قیمتی حدود ۴٪ پایین‌تر از قیمت کارشناسی که باعث جذب سریع خریداران نقدی در بازار رکودی می‌شود.',
    exampleFa: 'اگر ارزش کارشناسی ملک ۱۰ میلیارد تومان باشد، قیمت فروش سریع حدود ۹.۶ میلیارد تومان است.',
  },
};

export function resolvePlainPersianTermExplanation(termKey: string): PlainPersianTermDefinition | null {
  return RADAR_PLAIN_PERSIAN_TERMINOLOGY_GLOSSARY[termKey] ?? null;
}

// ============================================================================
// 2. PROMPTS 447 & 448 — WCAG 2.2 AA CONTRAST & TOUCH TARGET VALIDATOR
// ============================================================================

function hexToRelativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, '').trim();
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 0;
  const rgb = [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  ].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function computeWcagContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = hexToRelativeLuminance(foregroundHex);
  const l2 = hexToRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function evaluateWcagContrastAndTouchTargetCompliance(input: {
  foregroundHex: string;
  backgroundHex: string;
  isLargeText?: boolean;
  touchTargetWidthPx: number;
  touchTargetHeightPx: number;
  hasExplicitTextOrIconLabelBesidesColor: boolean;
}): {
  contrastRatio: number;
  passesContrastAa: boolean;
  passesTouchTargetMinimum: boolean;
  passesNonColorEncoding: boolean;
  overallCompliant: boolean;
} {
  const contrastRatio = computeWcagContrastRatio(input.foregroundHex, input.backgroundHex);
  const minContrast = input.isLargeText ? 3.0 : 4.5;
  const passesContrastAa = contrastRatio >= minContrast;
  const passesTouchTargetMinimum =
    input.touchTargetWidthPx >= 44 && input.touchTargetHeightPx >= 44;
  const passesNonColorEncoding = Boolean(input.hasExplicitTextOrIconLabelBesidesColor);

  return {
    contrastRatio,
    passesContrastAa,
    passesTouchTargetMinimum,
    passesNonColorEncoding,
    overallCompliant:
      passesContrastAa && passesTouchTargetMinimum && passesNonColorEncoding,
  };
}

// ============================================================================
// 3. PROMPTS 451 & 458 — PLAIN-LANGUAGE CHART & CALCULATOR EXPLAINERS
// ============================================================================

export function summarizeChartForOrdinaryUsers(params: {
  neighborhoodNameFa: string;
  startPriceMillion: number;
  endPriceMillion: number;
  monthsCount: number;
  isEstimatedBaseline?: boolean;
}, areaUnit: AreaUnit = getStoredAreaUnit(), intlCurrency: IntlCurrencyCode = getStoredIntlCurrency()): {
  headlineTakeawayFa: string;
  changePercent: number;
  direction: 'UP' | 'DOWN' | 'STABLE';
  dataConfidenceBadgeFa: string;
  displayAreaUnitLabel?: string;
  endPriceIntlText?: string;
} {
  const safeStart = Math.max(1, params.startPriceMillion);
  const rawPct = ((params.endPriceMillion - safeStart) / safeStart) * 100;
  const changePercent = Number(rawPct.toFixed(1));
  const direction: 'UP' | 'DOWN' | 'STABLE' =
    changePercent > 1 ? 'UP' : changePercent < -1 ? 'DOWN' : 'STABLE';

  const trendPhrase =
    direction === 'UP'
      ? `حدود ${Math.abs(changePercent)}٪ افزایش یافته`
      : direction === 'DOWN'
        ? `حدود ${Math.abs(changePercent)}٪ کاهش یافته`
        : 'تقریباً ثابت مانده';

  return {
    headlineTakeawayFa: `در ${params.monthsCount} ماه گذشته، میانگین قیمت هر متر مربع در ${params.neighborhoodNameFa} از ${params.startPriceMillion} به ${params.endPriceMillion} میلیون تومان رسیده و ${trendPhrase} است.`,
    changePercent,
    direction,
    dataConfidenceBadgeFa: params.isEstimatedBaseline
      ? 'برآورد آماری محله (تخمینی)'
      : 'مبتنی بر داده‌های ثبت‌شده بازار',
    displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
    endPriceIntlText: formatMillionTomanAsIntlCurrency(params.endPriceMillion, intlCurrency),
  };
}

// ============================================================================
// 4. PROMPTS 454 & 459 — RECOVERABLE ERROR UX & PROGRESSIVE DISCLOSURE
// ============================================================================

export function translateTechnicalErrorToRecoverableUxMessage(input: {
  errorCategory: 'NETWORK_OFFLINE' | 'VALIDATION_ERROR' | 'AUTH_EXPIRED' | 'RATE_LIMITED' | 'SERVER_FAILURE';
  formValuesPreserved: boolean;
}): {
  titleFa: string;
  explanationFa: string;
  nextActionFa: string;
  userInputSafeBadgeFa: string;
} {
  const userInputSafeBadgeFa = input.formValuesPreserved
    ? 'اطلاعات واردشده شما در فرم محفوظ است و پاک نشده است.'
    : 'لطفاً مقادیر ورودی را مجدداً بررسی نمایید.';

  switch (input.errorCategory) {
    case 'NETWORK_OFFLINE':
      return {
        titleFa: 'ارتباط اینترنت برقرار نیست',
        explanationFa: 'درخواست شما به دلیل قطع موقت اینترنت ارسال نشد.',
        nextActionFa: 'پس از بررسی اتصال اینترنت، روی دکمه «تلاش مجدد» کلیک کنید.',
        userInputSafeBadgeFa,
      };
    case 'VALIDATION_ERROR':
      return {
        titleFa: 'برخی از فیلدهای فرم نیاز به اصلاح دارند',
        explanationFa: 'مقادیر مشخص‌شده با کادر قرمز خارج از بازه مجاز هستند.',
        nextActionFa: 'فیلدهای علامت‌گذاری‌شده را اصلاح کرده و دوباره ثبت کنید.',
        userInputSafeBadgeFa,
      };
    case 'AUTH_EXPIRED':
      return {
        titleFa: 'نیاز به ورود مجدد به حساب کاربری',
        explanationFa: 'نشست امنیتی شما منقضی شده است.',
        nextActionFa: 'وارد حساب خود شوید و عملیات را ادامه دهید.',
        userInputSafeBadgeFa,
      };
    case 'RATE_LIMITED':
      return {
        titleFa: 'تعداد درخواست‌ها بیش از حد مجاز است',
        explanationFa: 'برای حفظ پایداری سامانه، ارسال پشت‌سرهم محدود شده است.',
        nextActionFa: 'چند ثانیه صبر کنید و دوباره امتحان کنید.',
        userInputSafeBadgeFa,
      };
    default:
      return {
        titleFa: 'اختلال موقت در پاسخ‌گویی سرور',
        explanationFa: 'سامانه در حال حاضر نتوانست عملیات را تکمیل کند.',
        nextActionFa: 'کمی صبر کنید و دکمه «تلاش مجدد» را بزنید.',
        userInputSafeBadgeFa,
      };
  }
}

export function resolveProgressiveDisclosureFields(mode: 'BEGINNER_SIMPLE' | 'EXPERT_FULL'): {
  visibleFieldKeys: string[];
  advancedDrawerExpanded: boolean;
} {
  const essential = ['neighborhoodId', 'sqm', 'buildingAgeYears', 'floorNumber', 'hasElevator', 'hasParking'];
  const advanced = [
    'hasStorage',
    'lightDirectionsCount',
    'isRenovated',
    'documentType',
    'coolingSystem',
    'facadeMaterial',
    'passageWidthMeters',
    'totalUnitsInBuilding',
  ];
  return {
    visibleFieldKeys: mode === 'BEGINNER_SIMPLE' ? essential : [...essential, ...advanced],
    advancedDrawerExpanded: mode === 'EXPERT_FULL',
  };
}
