/**
 * @file src/platform/presentation/core/ResultMetadata.ts
 * @description Responsive layout benchmarks, card geometry tokens, and status label mappings for Stage 6.
 */

import type { ResultDataStatusState, ResultMetricStatus } from './ResultTypes';

export const RESULT_CARD_BENCHMARKS = {
  desktopMinWidthPx: 280,
  desktopMaxWidthPx: 360,
  desktopGapPx: 16,
  mobileGapPx: 12,
  aspectRatio: '16:9',
  desktopPaddingPx: 16,
  mobilePaddingPx: 12,
  minTouchTargetPx: 44,
  maxTitleLines: 2,
  maxDescriptionLines: 2,
} as const;

export const RESULT_TABLE_BENCHMARKS = {
  rowHeightMinPx: 48,
  rowHeightMaxPx: 64,
  headerHeightPx: 52,
  virtualizationOptionalThreshold: 100,
  virtualizationMandatoryThreshold: 500,
} as const;

export const RESULT_BREAKPOINTS_PX = {
  mobileMax: 639,
  tabletMin: 640,
  tabletMax: 1023,
  desktopCompactMin: 1024,
  desktopCompactMax: 1279,
  desktopMin: 1280,
  desktopMax: 1535,
  wideDesktopMin: 1536,
} as const;

export function resolveViewportCategory(widthPx: number): 'mobile' | 'tablet' | 'desktop-compact' | 'desktop' | 'wide-desktop' {
  if (widthPx < 640) return 'mobile';
  if (widthPx <= 1023) return 'tablet';
  if (widthPx <= 1279) return 'desktop-compact';
  if (widthPx <= 1535) return 'desktop';
  return 'wide-desktop';
}

export const METRIC_STATUS_LABELS_FA: Record<ResultMetricStatus, string> = {
  verified: 'تأییدشده',
  estimated: 'برآوردی (تخمینی)',
  unknown: 'نامشخص',
  outdated: 'قدیمی (نیازمند به‌روزرسانی)',
};

export const DATA_STATE_LABELS_FA: Record<ResultDataStatusState, string> = {
  Initial: 'آماده جست‌وجو و نمایش نتایج',
  Loading: 'در حال بارگذاری نتایج...',
  Success: 'نتایج با موفقیت دریافت شد',
  Empty: 'نتیجه‌ای یافت نشد',
  Partial: 'نمایش نتایج دریافت‌شده (برخی منابع در دسترس نیستند)',
  Error: 'خطا در دریافت نتایج',
  Stale: 'داده‌های نمایش‌داده‌شده مربوط به آخرین همگام‌سازی قبلی است',
  Restricted: 'دسترسی به این بخش محدود شده است',
  Invalid: 'داده دریافتی نامعتبر است',
};
