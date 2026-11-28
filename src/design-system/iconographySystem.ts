/** @file src/design-system/iconographySystem.ts — RT-UI-ICON-001 semantic iconography and RTL direction contracts (Pure TS, zero React) */

import { ICON_DIMENSIONS_PX } from './spacingGeometrySystem';

export type IconSizeId = keyof typeof ICON_DIMENSIONS_PX;
export type IconDirection = 'ltr' | 'rtl';
export type DirectionalIconIntent = 'back' | 'forward' | 'previous' | 'next' | 'inline-start' | 'inline-end';

export const ICONOGRAPHY_ROLES = {
  navigation: { defaultSize: 'md', decorativeByDefault: true },
  action: { defaultSize: 'md', decorativeByDefault: true },
  status: { defaultSize: 'sm', decorativeByDefault: true },
  data: { defaultSize: 'sm', decorativeByDefault: true },
  map: { defaultSize: 'sm', decorativeByDefault: true },
  emptyState: { defaultSize: 'xl', decorativeByDefault: true },
} as const satisfies Record<string, { defaultSize: IconSizeId; decorativeByDefault: boolean }>;

export const ICON_SIZE_TOKENS_PX: Readonly<Record<IconSizeId, number>> = ICON_DIMENSIONS_PX;

export const ICONOGRAPHY_RULES = {
  strokeWidth: { default: 1.8, minimum: 1.5, maximum: 2 },
  opticalAlignment: 'center',
  iconToTextGapPx: 8,
  minimumInteractiveTargetPx: 44,
  preferredInteractiveTargetPx: 48,
  neverUseColorAloneForStatus: true,
  decorativeIconsMustBeHiddenFromAccessibilityTree: true,
  informativeIconsRequireAccessibleName: true,
  useLogicalDirectionForNavigation: true,
} as const;

const DIRECTIONAL_ICON_NAMES: Record<DirectionalIconIntent, { ltr: string; rtl: string }> = {
  back: { ltr: 'arrow-left', rtl: 'arrow-right' },
  forward: { ltr: 'arrow-right', rtl: 'arrow-left' },
  previous: { ltr: 'chevron-left', rtl: 'chevron-right' },
  next: { ltr: 'chevron-right', rtl: 'chevron-left' },
  'inline-start': { ltr: 'arrow-left', rtl: 'arrow-right' },
  'inline-end': { ltr: 'arrow-right', rtl: 'arrow-left' },
};

export function resolveDirectionalIconName(intent: DirectionalIconIntent, direction: IconDirection): string {
  return DIRECTIONAL_ICON_NAMES[intent][direction];
}

export type IconAccessibilityContract =
  | { decorative: true; 'aria-hidden': true; role?: never; 'aria-label'?: never }
  | { decorative: false; 'aria-hidden': false; role: 'img'; 'aria-label': string };

export function getIconAccessibilityContract(input: {
  decorative: boolean;
  label?: string;
}): IconAccessibilityContract {
  if (input.decorative) return { decorative: true, 'aria-hidden': true };
  const label = input.label?.trim();
  if (!label) throw new Error('Informative icons require a non-empty accessible label.');
  return { decorative: false, 'aria-hidden': false, role: 'img', 'aria-label': label };
}

export const ICONOGRAPHY_ACCEPTANCE_CRITERIA: readonly { id: string; titleFa: string }[] = [
  { id: 'ICO-01', titleFa: 'اندازه‌های آیکون از توکن‌های هندسی مشترک استخراج می‌شوند' },
  { id: 'ICO-02', titleFa: 'نقش‌های ناوبری، اقدام، وضعیت، داده، نقشه و حالت خالی تعریف شده‌اند' },
  { id: 'ICO-03', titleFa: 'ضخامت Stroke در بازه استاندارد و قابل پیش‌بینی نگه داشته می‌شود' },
  { id: 'ICO-04', titleFa: 'فاصله آیکون و متن با مقیاس ۸ پیکسل هماهنگ است' },
  { id: 'ICO-05', titleFa: 'آیکون‌های جهت‌دار بر اساس جهت نوشتار RTL/LTR حل می‌شوند' },
  { id: 'ICO-06', titleFa: 'بازگشت، ادامه، قبلی و بعدی از معنای منطقی استفاده می‌کنند' },
  { id: 'ICO-07', titleFa: 'آیکون تزئینی از درخت دسترس‌پذیری پنهان می‌شود' },
  { id: 'ICO-08', titleFa: 'آیکون اطلاع‌رسان دارای نام دسترس‌پذیر غیرخالی است' },
  { id: 'ICO-09', titleFa: 'وضعیت فقط با رنگ منتقل نمی‌شود' },
  { id: 'ICO-10', titleFa: 'ناحیه تعاملی آیکون حداقل ۴۴ پیکسل و ترجیحاً ۴۸ پیکسل است' },
  { id: 'ICO-11', titleFa: 'اندازه‌های کاربردی آیکون با نقش و تراکم رابط سازگارند' },
  { id: 'ICO-12', titleFa: 'قواعد آیکون در ورودی عمومی Design System صادر می‌شوند' },
] as const;
