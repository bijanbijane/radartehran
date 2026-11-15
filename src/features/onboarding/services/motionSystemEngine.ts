/** @file src/features/onboarding/services/motionSystemEngine.ts — Stage 35 (RT-UI-MOTION-001) Motion Tokens, State Machines, Map Motion Arbitration & Feedback Engine */

export type MotionCategory = 'micro' | 'transition' | 'feedback' | 'panel' | 'map';
export type MotionPreferenceMode = 'standard' | 'reduced' | 'no_decorative';
export type AsyncOperationPhase = 'idle' | 'requested' | 'pending' | 'success' | 'error';

export interface MotionToken {
  id: string;
  durationMs: number;
  reducedDurationMs: number;
  easing: string;
  distancePx?: number;
  category: MotionCategory;
  cssPropertiesAllowed: readonly ('transform' | 'opacity')[];
  purposeFa: string;
}

export interface MotionPolicy {
  preferenceMode: MotionPreferenceMode;
  osPrefersReducedMotion: boolean;
  enableDecorativeMotion: boolean;
  performanceMode: 'standard' | 'reduced';
  displayPreferenceRoute: '/account/preferences/display';
}

export const RADAR_MOTION_EASING = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  emphasis: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

export const RADAR_MOTION_DISTANCE_PX = {
  subtle: 4,
  short: 8,
  medium: 16,
  panel: 24,
} as const;

export const RADAR_MOTION_TOKENS: readonly MotionToken[] = [
  {
    id: 'button_press_feedback',
    durationMs: 120,
    reducedDurationMs: 0,
    easing: RADAR_MOTION_EASING.standard,
    distancePx: 0,
    category: 'micro',
    cssPropertiesAllowed: ['transform', 'opacity'],
    purposeFa: 'بازخورد فوری فشردن دکمه بدون پرش متن',
  },
  {
    id: 'search_suggestions_open',
    durationMs: 150,
    reducedDurationMs: 0,
    easing: RADAR_MOTION_EASING.enter,
    distancePx: RADAR_MOTION_DISTANCE_PX.subtle,
    category: 'feedback',
    cssPropertiesAllowed: ['transform', 'opacity'],
    purposeFa: 'نمایش بدون پرش فهرست پیشنهادهای جست‌وجو با حفظ فوکوس ورودی',
  },
  {
    id: 'drawer_and_side_panel',
    durationMs: 220,
    reducedDurationMs: 0,
    easing: RADAR_MOTION_EASING.enter,
    distancePx: RADAR_MOTION_DISTANCE_PX.panel,
    category: 'panel',
    cssPropertiesAllowed: ['transform', 'opacity'],
    purposeFa: 'باز و بسته شدن پنل اطلاعات محله و لایه‌ها از جهت منطقی RTL',
  },
  {
    id: 'mobile_bottom_sheet_snap',
    durationMs: 260,
    reducedDurationMs: 0,
    easing: RADAR_MOTION_EASING.standard,
    distancePx: RADAR_MOTION_DISTANCE_PX.panel,
    category: 'panel',
    cssPropertiesAllowed: ['transform', 'opacity'],
    purposeFa: 'انتقال میان سه وضعیت Collapsed، Half و Expanded در شیت موبایل',
  },
  {
    id: 'map_neighborhood_focus_pan',
    durationMs: 320,
    reducedDurationMs: 0,
    easing: RADAR_MOTION_EASING.standard,
    category: 'map',
    cssPropertiesAllowed: ['transform', 'opacity'],
    purposeFa: 'انتقال کنترل‌شده مرکز نقشه به محله انتخاب‌شده با قابلیت لغو حرکت قبلی',
  },
] as const;

/** Section 35 & 36: Resolve effective Motion Policy (OS reduced-motion always respected) */
export function resolveMotionPolicy(
  userSetting: MotionPreferenceMode,
  osPrefersReducedMotion: boolean,
  isLowEndDevice = false,
): MotionPolicy {
  const effectiveReduced = osPrefersReducedMotion || userSetting === 'reduced';
  return {
    preferenceMode: effectiveReduced ? 'reduced' : userSetting,
    osPrefersReducedMotion,
    enableDecorativeMotion: !effectiveReduced && userSetting === 'standard' && !isLowEndDevice,
    performanceMode: effectiveReduced || isLowEndDevice ? 'reduced' : 'standard',
    displayPreferenceRoute: '/account/preferences/display',
  };
}

export function resolveEffectiveTokenDuration(token: MotionToken, policy: MotionPolicy): number {
  if (policy.preferenceMode === 'reduced' || policy.osPrefersReducedMotion) {
    return token.reducedDurationMs;
  }
  return token.durationMs;
}

/** Section 8.3, 9 & 40: Server-Confirmed Save/Action State Machine (Never fakes success before server response) */
export interface SaveButtonFeedbackState {
  phase: AsyncOperationPhase;
  isSavedConfirmed: boolean;
  labelFa: 'ذخیره' | 'در حال ذخیره' | 'ذخیره شد';
  preventDuplicateClick: boolean;
  toastFeedbackFa: string | null;
}

export function transitionSaveButtonState(
  currentConfirmedSaved: boolean,
  event: 'click_request' | 'server_confirm_success' | 'server_fail_error',
): SaveButtonFeedbackState {
  if (event === 'click_request') {
    return {
      phase: 'pending',
      isSavedConfirmed: currentConfirmedSaved,
      labelFa: 'در حال ذخیره',
      preventDuplicateClick: true,
      toastFeedbackFa: null,
    };
  }
  if (event === 'server_confirm_success') {
    const nextSaved = !currentConfirmedSaved;
    return {
      phase: 'success',
      isSavedConfirmed: nextSaved,
      labelFa: nextSaved ? 'ذخیره شد' : 'ذخیره',
      preventDuplicateClick: false,
      toastFeedbackFa: nextSaved ? 'ملک ذخیره شد.' : 'از ذخیره‌ها حذف شد.',
    };
  }
  return {
    phase: 'error',
    isSavedConfirmed: currentConfirmedSaved,
    labelFa: currentConfirmedSaved ? 'ذخیره شد' : 'ذخیره',
    preventDuplicateClick: false,
    toastFeedbackFa: 'عملیات ناموفق بود. وضعیت قبلی حفظ شد؛ دوباره تلاش کنید.',
  };
}

/** Section 13.2, 13.3 & 44: Map Camera Motion Arbitrator with Race Condition Cancellation */
export interface MapMotionFlightRecord {
  requestId: number;
  targetNeighborhoodId: string;
  targetNameFa: string;
  cancelledPreviousRequestId: number | null;
  shouldAnimateCamera: boolean;
  durationMs: number;
  panelTitleSyncedFa: string;
}

export class MapMotionArbitrator {
  private activeRequestId = 0;

  public requestNeighborhoodPan(params: {
    neighborhoodId: string;
    nameFa: string;
    userIsDraggingMap: boolean;
    dataReady: boolean;
    policy: MotionPolicy;
  }): MapMotionFlightRecord {
    const previousId = this.activeRequestId > 0 ? this.activeRequestId : null;
    this.activeRequestId += 1;
    const shouldAnimate =
      !params.userIsDraggingMap &&
      params.dataReady &&
      params.policy.preferenceMode !== 'reduced' &&
      !params.policy.osPrefersReducedMotion;

    return {
      requestId: this.activeRequestId,
      targetNeighborhoodId: params.neighborhoodId,
      targetNameFa: params.nameFa,
      cancelledPreviousRequestId: previousId,
      shouldAnimateCamera: shouldAnimate,
      durationMs: shouldAnimate ? 320 : 0,
      panelTitleSyncedFa: params.nameFa,
    };
  }
}

/** Section 16 & 46: Map Layer Transition & Empty Data Guard (never shows stale layer colors) */
export function resolveMapLayerTransitionFeedback(params: {
  layerId: string;
  layerTitleFa: string;
  phase: 'loading' | 'loaded_with_data' | 'loaded_empty' | 'error';
  updatedAtFa?: string;
}): {
  controlActive: boolean;
  showLoadingIndicator: boolean;
  legendVisible: boolean;
  staleColorsCleared: true;
  statusMessageFa: string;
} {
  if (params.phase === 'loading') {
    return {
      controlActive: true,
      showLoadingIndicator: true,
      legendVisible: false,
      staleColorsCleared: true,
      statusMessageFa: `در حال دریافت داده لایه «${params.layerTitleFa}»...`,
    };
  }
  if (params.phase === 'loaded_empty') {
    return {
      controlActive: true,
      showLoadingIndicator: false,
      legendVisible: false,
      staleColorsCleared: true,
      statusMessageFa: 'داده‌ای برای این محدوده موجود نیست',
    };
  }
  if (params.phase === 'error') {
    return {
      controlActive: false,
      showLoadingIndicator: false,
      legendVisible: false,
      staleColorsCleared: true,
      statusMessageFa: `بارگذاری لایه «${params.layerTitleFa}» ناموفق بود. امکان تلاش مجدد فعال است.`,
    };
  }
  return {
    controlActive: true,
    showLoadingIndicator: false,
    legendVisible: true,
    staleColorsCleared: true,
    statusMessageFa: `لایه «${params.layerTitleFa}» فعال شد · آخرین بروزرسانی: ${params.updatedAtFa ?? 'پاییز ۱۴۰۵'}`,
  };
}

/** Section 17.2, 23, 25, 32, 33 & 34: Honest Domain Feedback & Anti-Deception Contracts */
export const DOMAIN_HONEST_FEEDBACK_CONTRACTS = {
  invalidSpatialPolygonFa: 'محدوده انتخاب‌شده معتبر نیست. نقاط را اصلاح کنید.',
  bookmarkRemovedWithUndoFa: 'از ذخیره‌ها حذف شد.',
  serviceRequestSubmittedFa: 'درخواست ارسال شد.',
  communityCorrectionSubmittedFa: 'پیشنهاد اصلاح داده ثبت شد و در انتظار بررسی است.',
  valuationForbidsFakeCountingTicker: true,
  valuationForbidsFakePercentageProgressBar: true,
  toastNeverSoleErrorChannelForForms: true,
  maxAnimatedMapMarkersAtOnce: 1,
} as const;
