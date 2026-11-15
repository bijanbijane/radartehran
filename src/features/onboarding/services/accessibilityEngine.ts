/** @file src/features/onboarding/services/accessibilityEngine.ts — Stage 34 (RT-UI-ACCESSIBILITY-001) Inclusive Design, WCAG 2.2 AA & Spatial Accessibility Engine */
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';

export const WCAG_22_TARGET_STANDARD = {
  standardId: 'RT-UI-ACCESSIBILITY-001',
  wcagVersion: '2.2',
  targetLevel: 'AA' as const,
  claimsFullAAA: false as const,
  requiresMedicalDisclosureFromUser: false as const,
  sixDomains: [
    'visual_and_color_contrast',
    'typography_zoom_and_reflow',
    'keyboard_and_focus_management',
    'screen_reader_and_semantics',
    'spatial_map_and_chart_alternatives',
    'cognitive_clarity_and_accessible_auth',
  ] as const,
};

export const WCAG_TEXT_SPACING_CONTRACT = {
  lineHeightMultiplierMin: 1.5,
  paragraphSpacingMultiplierMin: 2.0,
  letterSpacingEmMin: 0.12,
  wordSpacingEmMin: 0.16,
  browserZoomLevelsSupported: [100, 200, 400] as const,
  reflowBaseWidthCssPx: 320,
} as const;

export const RADAR_FOCUS_RING_CONTRACT = {
  outlineWidthPx: 2,
  outlineOffsetPx: 2,
  minContrastRatioAgainstAdjacent: 3.0,
  clippedByParentOverflow: false,
  obscuredByStickyHeaderOrSheet: false,
  wcagCriterion: '2.4.11 Focus Not Obscured (Minimum) — Level AA',
} as const;

export const TOUCH_TARGET_ACCESSIBILITY_CONTRACT = {
  wcag22MinimumPx: 24,
  radarInternalMobileTargetPx: 44,
  minAdjacentControlGapPx: 8,
} as const;

export const SKIP_LINK_CONTRACT = {
  elementId: 'radar-skip-to-main-link',
  targetLandmarkId: 'radar-main-content',
  labelFa: 'رفتن به محتوای اصلی',
} as const;

export const MAP_PAGE_LOGICAL_FOCUS_ORDER = [
  'skip_to_main_link',
  'place_and_global_search',
  'essential_map_controls',
  'active_contextual_panel',
  'accessible_results_list',
  'supplementary_sections',
] as const;

/** Section 5: Real WCAG 2.2 Relative Luminance & Contrast Ratio Calculator */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function calculateRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function calculateContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = calculateRelativeLuminance(foregroundHex);
  const l2 = calculateRelativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function evaluateWcagContrast(
  foregroundHex: string,
  backgroundHex: string,
  role: 'normal_text' | 'large_text' | 'ui_control_or_graphic',
): { ratio: number; requiredMin: number; passesAA: boolean; passesInternalEnhanced: boolean } {
  const ratio = calculateContrastRatio(foregroundHex, backgroundHex);
  const requiredMin = role === 'normal_text' ? 4.5 : 3.0;
  const internalTarget = role === 'normal_text' ? 7.0 : 4.5;
  return {
    ratio,
    requiredMin,
    passesAA: ratio >= requiredMin,
    passesInternalEnhanced: ratio >= internalTarget,
  };
}

export const RADAR_AUDITED_COLOR_PAIRS = [
  { id: 'body_on_canvas', labelFa: 'متن اصلی روی پس‌زمینه روشن', fg: '#182522', bg: '#F6F8F6', role: 'normal_text' as const },
  { id: 'secondary_on_card', labelFa: 'متن ثانویه روی کارت سفید', fg: '#34433E', bg: '#FFFFFF', role: 'normal_text' as const },
  { id: 'white_on_brand_teal', labelFa: 'متن سفید روی دکمه اصلی سبز رادار', fg: '#FFFFFF', bg: '#176B63', role: 'normal_text' as const },
  { id: 'error_on_surface', labelFa: 'متن خطا روی پس‌زمینه هشدار قرمز', fg: '#B42318', bg: '#FEF3F2', role: 'normal_text' as const },
  { id: 'warning_on_surface', labelFa: 'متن هشدار روی پس‌زمینه کهربایی', fg: '#93370D', bg: '#FFFAEB', role: 'normal_text' as const },
] as const;

/** Section 5.3: Non-Hue Status Contract (Color is NEVER the sole indicator of status) */
export interface AccessibleStatusBadgeSpec {
  statusKey: 'active' | 'pending_review' | 'rejected' | 'estimated_data' | 'incomplete_data';
  labelFa: string;
  shapePattern: 'check_circle_solid' | 'clock_dashed' | 'x_octagon_double' | 'tilde_striped' | 'alert_triangle_dotted';
  ariaLabelFa: string;
  reliesOnlyOnColor: false;
}

export function resolveAccessibleStatusBadge(
  statusKey: AccessibleStatusBadgeSpec['statusKey'],
): AccessibleStatusBadgeSpec {
  const map: Record<AccessibleStatusBadgeSpec['statusKey'], Omit<AccessibleStatusBadgeSpec, 'statusKey' | 'reliesOnlyOnColor'>> = {
    active: { labelFa: 'فعال', shapePattern: 'check_circle_solid', ariaLabelFa: 'وضعیت آگهی: فعال (تأییدشده)' },
    pending_review: { labelFa: 'در انتظار بررسی', shapePattern: 'clock_dashed', ariaLabelFa: 'وضعیت آگهی: در انتظار بررسی کارشناس' },
    rejected: { labelFa: 'رد شده', shapePattern: 'x_octagon_double', ariaLabelFa: 'وضعیت آگهی: رد شده نیازمند اصلاح' },
    estimated_data: { labelFa: 'کیفیت داده: متوسط (برآوردی)', shapePattern: 'tilde_striped', ariaLabelFa: 'کیفیت داده: متوسط بر پایه مدل آماری' },
    incomplete_data: { labelFa: 'داده ناقص', shapePattern: 'alert_triangle_dotted', ariaLabelFa: 'هشدار داده ناقص در بازه انتخابی' },
  };
  return { statusKey, ...map[statusKey], reliesOnlyOnColor: false };
}

/** Section 11.1: Stateful Accessible Control Naming (e.g., Save / Remove Bookmark) */
export function resolveBookmarkAccessibleName(isSaved: boolean, entityLabelFa = 'این ملک'): {
  accessibleNameFa: string;
  role: 'button';
  ariaPressed: boolean;
  statusAnnouncementFa: string;
} {
  return isSaved
    ? {
        accessibleNameFa: `حذف ${entityLabelFa} از ذخیره‌ها`,
        role: 'button',
        ariaPressed: true,
        statusAnnouncementFa: 'ملک به ذخیره‌های شما اضافه شد.',
      }
    : {
        accessibleNameFa: `ذخیره ${entityLabelFa}`,
        role: 'button',
        ariaPressed: false,
        statusAnnouncementFa: 'ملک از ذخیره‌های شما حذف شد.',
      };
}

/** Section 12.1 & 26: 3-Part Accessible Error Message Contract (What happened + Where + How to fix) */
export function buildThreePartFieldError(params: {
  fieldLabelFa: string;
  problemFa: string;
  remedyFa: string;
}): { fullMessageFa: string; isSpecificAndActionable: boolean; ariaLivePoliteness: 'polite' | 'assertive' } {
  const fullMessageFa = `${params.fieldLabelFa}: ${params.problemFa} ${params.remedyFa}`.trim();
  const isGenericInvalid = fullMessageFa === 'ورودی نامعتبر است' || fullMessageFa === 'خطا در ثبت اطلاعات.';
  return {
    fullMessageFa,
    isSpecificAndActionable: !isGenericInvalid && params.problemFa.length > 3 && params.remedyFa.length > 3,
    ariaLivePoliteness: 'polite',
  };
}

/** Section 13 & 38: Screen Reader Live Announcement Router (prevents assertive spam & duplicates) */
export function buildLiveRegionAnnouncement(
  eventType: 'search_results_count' | 'bookmark_toggled' | 'valuation_ready' | 'form_validation_error' | 'critical_blocking_error',
  messageFa: string,
  previousMessageFa = '',
): { role: 'status' | 'alert'; ariaLive: 'polite' | 'assertive'; shouldAnnounce: boolean; messageFa: string } {
  const isCritical = eventType === 'critical_blocking_error';
  const trimmed = messageFa.trim();
  return {
    role: isCritical ? 'alert' : 'status',
    ariaLive: isCritical ? 'assertive' : 'polite',
    shouldAnnounce: trimmed.length > 0 && trimmed !== previousMessageFa.trim(),
    messageFa: trimmed,
  };
}

/** Section 14, 15, 16, 17 & 18: Spatial Map Accessibility, List Parity & Non-Drag Alternatives (WCAG 2.2 2.5.7) */
export const NON_DRAG_SPATIAL_SELECTION_METHODS = [
  { id: 'neighborhood_select', labelFa: 'انتخاب محله از فهرست متنی', requiresDragGesture: false },
  { id: 'district_select', labelFa: 'انتخاب منطقه شهرداری (۱ تا ۲۲)', requiresDragGesture: false },
  { id: 'radius_meters_input', labelFa: 'تعیین شعاع متری حول نقطه مرجع', requiresDragGesture: false },
  { id: 'coordinate_bbox_input', labelFa: 'وارد کردن مختصات یا محدوده عددی', requiresDragGesture: false },
  { id: 'preset_corridor_select', labelFa: 'انتخاب محدوده‌های آماده (مانند محور مترو)', requiresDragGesture: false },
] as const;

export interface AccessibleMapListItem {
  hoodId: string;
  placeNameFa: string;
  entityTypeFa: 'محله شهری';
  regionLabelFa: string;
  avgPriceTextFa: string;
  dataCredibilityFa: 'معتبر (Verified)' | 'برآوردی (Estimated)';
  privacySafeLocationSummaryFa: string;
  accessibleMarkerLabelFa: string;
  allMapMarkersInTabOrder: false;
}

export function buildAccessibleMapListItems(neighborhoods: readonly EvaluatedNeighborhood[]): AccessibleMapListItem[] {
  return neighborhoods.slice(0, 12).map((h) => ({
    hoodId: String(h.id),
    placeNameFa: h.name,
    entityTypeFa: 'محله شهری',
    regionLabelFa: h.zone,
    avgPriceTextFa: `${toPersianNum(Math.round(h.buyPerSqm))} میلیون تومان بر مترمربع`,
    dataCredibilityFa: h.buyPerSqm >= 450 ? 'معتبر (Verified)' : 'برآوردی (Estimated)',
    privacySafeLocationSummaryFa: `تهران، ${h.zone}، محدوده عمومی محله ${h.name} (بدون افشای پلاک خصوصی مالک)`,
    accessibleMarkerLabelFa: `محله ${h.name}، ${h.zone}، میانگین هر مترمربع ${toPersianNum(Math.round(h.buyPerSqm))} میلیون تومان — مشاهده پروفایل و بازار`,
    allMapMarkersInTabOrder: false,
  }));
}

/** Section 24: Plain-Language Statistical Glossary & Canonical Vocabulary ('ذخیره' / 'ذخیره‌ها') */
export const CANONICAL_VOCABULARY_CONTRACT = {
  singleSaveActionFa: 'ذخیره',
  savedCollectionNounFa: 'ذخیره‌ها',
  prohibitedSynonymsForSave: ['نشان‌کردن', 'نگهداری پراکنده'] as const,
} as const;

export const PLAIN_LANGUAGE_STAT_GLOSSARY = [
  {
    termFa: 'میانه قیمت',
    plainDefinitionFa: 'مقداری که نیمی از نمونه‌ها پایین‌تر و نیمی بالاتر از آن قرار می‌گیرند (مقاوم در برابر قیمت‌های پرت).',
  },
  {
    termFa: 'برآورد هدونیک (Hedonic Valuation)',
    plainDefinitionFa: 'محاسبه ارزش تخمینی ملک بر اساس ترکیب ویژگی‌های آن (سن بنا، طبقه، آسانسور و موقعیت محله) در مقایسه با نمونه‌های مشابه.',
  },
  {
    termFa: 'دامنه عدم‌قطعیت برآورد',
    plainDefinitionFa: 'بازه کمینه و بیشینه‌ای که قیمت واقعی معامله با توجه به کیفیت و تعداد داده‌های محله در آن قرار می‌گیرد.',
  },
] as const;

/** Section 33: Accessible Authentication Contract (WCAG 2.2 3.3.8 Accessible Authentication Minimum) */
export const ACCESSIBLE_AUTH_CONTRACT = {
  wcagCriterion: '3.3.8 Accessible Authentication (Minimum) — Level AA',
  allowPasteInPasswordAndOtp: true,
  supportsPasswordManagers: true,
  supportsShowPasswordToggle: true,
  requiresVisualPuzzleCaptchaOnly: false,
  preservesFormInputsOnNetworkFailure: true,
} as const;

/** Section 37.1: Deterministic Focus Recovery After Item Deletion */
export function resolveFocusTargetAfterRemoval(
  remainingItemIds: readonly string[],
  removedIndex: number,
  emptyStateHeadingId = 'empty-list-heading',
): { targetType: 'next_item' | 'previous_item' | 'empty_state_heading'; targetId: string } {
  if (remainingItemIds.length === 0) {
    return { targetType: 'empty_state_heading', targetId: emptyStateHeadingId };
  }
  if (removedIndex < remainingItemIds.length) {
    return { targetType: 'next_item', targetId: remainingItemIds[removedIndex] };
  }
  return { targetType: 'previous_item', targetId: remainingItemIds[remainingItemIds.length - 1] };
}
