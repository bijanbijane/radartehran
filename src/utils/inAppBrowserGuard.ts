/**
 * [RULE-18] In-App WebView Detector (Telegram, Instagram, Eitaa, Rubika, Bale)
 * Prevents external OAuth redirect silent failures inside restricted WebViews.
 */

import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from './areaUnit';

export interface InAppBrowserDetection {
  isRestrictedWebView: boolean;
  detectedAppNamePersian: string | null;
  recommendedActionPersian: string;
}

export function formatWebViewBudgetBadgeIntl(millionToman: number, currency: IntlCurrencyCode = 'USD'): string {
  return formatMillionTomanAsIntlCurrency(millionToman, currency);
}

const WEBVIEW_PATTERNS: ReadonlyArray<{ pattern: RegExp; nameFa: string }> = [
  { pattern: /Instagram/i, nameFa: 'اینستاگرام (Instagram)' },
  { pattern: /Telegram/i, nameFa: 'تلگرام (Telegram)' },
  { pattern: /Eitaa/i, nameFa: 'ایتا (Eitaa)' },
  { pattern: /Rubika/i, nameFa: 'روبیکا (Rubika)' },
  { pattern: /Bale/i, nameFa: 'بله (Bale)' },
  { pattern: /FBAN|FBAV/i, nameFa: 'فیسبوک' },
  { pattern: /Line\//i, nameFa: 'لاین' },
  { pattern: /\bwv\b|WebView/i, nameFa: 'مرورگر داخلی برنامه' },
];

export function detectBrowserEnvironment(customUserAgent?: string): InAppBrowserDetection {
  const rawUa =
    customUserAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const ua = String(rawUa || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 512);

  for (const item of WEBVIEW_PATTERNS) {
    if (item.pattern.test(ua)) {
      return {
        isRestrictedWebView: true,
        detectedAppNamePersian: item.nameFa,
        recommendedActionPersian: `شما در حال استفاده از مرورگر داخلی ${item.nameFa} هستید. برای ورود با حساب گوگل، لطفاً از منوی سه نقطه بالا گزینه «Open in Chrome / Safari» را انتخاب کنید یا با شماره موبایل ادامه دهید.`,
      };
    }
  }

  return {
    isRestrictedWebView: false,
    detectedAppNamePersian: null,
    recommendedActionPersian: '',
  };
}
