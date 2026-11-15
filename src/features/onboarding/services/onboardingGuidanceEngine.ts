/** @file src/features/onboarding/services/onboardingGuidanceEngine.ts — Stage 32 (RT-UI-ONBOARDING-001) First-Use Experience, Progressive Onboarding & Contextual Guidance Engine */
import type {
  GettingStartedChecklistItem,
  OnboardingGuideDefinition,
  PendingAuthContinuation,
  UserGuideProgressStatus,
  UserOnboardingSegment,
} from '../types/onboardingAndResponsive.types';

export const MAX_CONCURRENT_FLOATING_GUIDES = 1;

export const VALUATION_DISCLAIMER_FA =
  'نتیجه ارزش‌گذاری، برآورد مبتنی بر اطلاعات و روش محاسبه سامانه است و جایگزین کارشناسی رسمی نیست.';

export const EXECUTABLE_SEARCH_ONBOARDING_EXAMPLES: readonly string[] = [
  'سعادت‌آباد',
  'قیمت مسکن در منطقه ۲',
  'املاک تجاری ونک',
  'خدمات بازسازی ساختمان',
] as const;

export const SERVICES_SEEKER_ONBOARDING_STEPS_FA: readonly string[] = [
  '۱. جست‌وجوی خدمت موردنیاز',
  '۲. مشاهده فهرست ارائه‌دهندگان',
  '۳. بررسی سوابق و وضعیت تأیید',
  '۴. ثبت درخواست خدمت',
  '۵. دریافت پیشنهادها',
  '۶. مقایسه پیشنهادها',
  '۷. ادامه ارتباط و پیگیری',
] as const;

export const SERVICES_PROVIDER_ONBOARDING_STEPS_FA: readonly string[] = [
  '۱. ایجاد پروفایل تخصصی',
  '۲. معرفی خدمات قابل ارائه',
  '۳. تعیین محدوده جغرافیایی فعالیت',
  '۴. ثبت شرایط ارائه خدمت',
  '۵. بررسی و انتشار اطلاعات',
  '۶. مدیریت درخواست‌های دریافتی',
] as const;

export const ONBOARDING_GUIDE_REGISTRY: readonly OnboardingGuideDefinition[] = [
  {
    guideId: 'MAP-WELCOME-V1',
    version: 'v1.0',
    featureArea: 'map_entry',
    guideType: 'welcome',
    titleFa: 'تهران را با داده‌های مکانی بهتر بشناسید',
    summaryFa: 'نقشه، محله‌ها، بازار املاک و اطلاعات شهری را بدون تور اجباری بررسی کنید.',
    targetAudience: ['first_time_guest'],
    triggerCondition: 'first_visit_entry',
    repeatPolicy: 'once',
    lifecycleStatus: 'Published',
    blocksPrimaryInteraction: false,
  },
  {
    guideId: 'MAP-LAYER-INTRO-V2',
    version: 'v2.0',
    featureArea: 'map_layers',
    guideType: 'interactive',
    titleFa: 'راهنمای لایه‌ها و خوانش Legend نقشه',
    summaryFa: 'برای نمایش قیمت‌های محله‌ها، لایه اطلاعات بازار را فعال کنید و راهنمای رنگ‌ها را بخوانید.',
    targetAudience: ['first_time_guest', 'returning_guest', 'registered_user', 'returning_user_new_feature'],
    triggerCondition: 'first_layer_panel_open',
    repeatPolicy: 'version_change',
    lifecycleStatus: 'Published',
    blocksPrimaryInteraction: false,
  },
  {
    guideId: 'NEIGHBORHOOD-EPISTEMIC-V1',
    version: 'v1.0',
    featureArea: 'neighborhood_profile',
    guideType: 'contextual_banner',
    titleFa: 'تفاوت داده مشاهده‌شده، تحلیل و برآورد',
    summaryFa: 'اطلاعات بازار، قیمت‌های ثبت‌شده در آگهی‌ها و برآوردهای تحلیلی روش محاسبه و دقت متفاوتی دارند.',
    targetAudience: ['first_time_guest', 'returning_guest', 'registered_user'],
    triggerCondition: 'first_neighborhood_open',
    repeatPolicy: 'once',
    lifecycleStatus: 'Published',
    blocksPrimaryInteraction: false,
  },
  {
    guideId: 'VALUATION-DISCLAIMER-V1',
    version: 'v1.0',
    featureArea: 'valuation',
    guideType: 'inline',
    titleFa: 'راهنمای ۶ گام ارزش‌گذاری و دامنه عدم‌قطعیت',
    summaryFa: VALUATION_DISCLAIMER_FA,
    targetAudience: ['first_time_guest', 'returning_guest', 'registered_user', 'power_expert_user'],
    triggerCondition: 'first_valuation_open',
    repeatPolicy: 'once',
    lifecycleStatus: 'Published',
    blocksPrimaryInteraction: false,
  },
] as const;

export const DEFAULT_GETTING_STARTED_CHECKLIST: readonly GettingStartedChecklistItem[] = [
  { id: 'view_map', titleFa: 'نقشه را مشاهده کنید', descriptionFa: 'کاوش محله‌های تهران روی نقشه تعاملی', actionRoute: '/map', completed: false },
  { id: 'search_hood', titleFa: 'یک محله را جست‌وجو کنید', descriptionFa: 'جست‌وجوی نام محله، خیابان یا منطقه', actionRoute: '/map', completed: false },
  { id: 'open_profile', titleFa: 'پروفایل یک محله را ببینید', descriptionFa: 'بررسی شناسنامه، بازار و امکانات محله', actionRoute: '/market', completed: false },
  { id: 'enable_layer', titleFa: 'یک لایه نقشه را فعال کنید', descriptionFa: 'مشاهده لایه قیمت، مترو یا کیفیت هوا همراه Legend', actionRoute: '/map', completed: false },
  { id: 'save_first_item', titleFa: 'یک مورد را ذخیره کنید', descriptionFa: 'افزودن ملک یا محله به فهرست ذخیره‌ها', actionRoute: '/properties', completed: false },
] as const;

export function classifyUserOnboardingSegment(params: {
  isAuthenticated: boolean;
  priorSessionCount: number;
  completedActionsCount: number;
  hasUnseenFeatureVersion: boolean;
}): UserOnboardingSegment {
  if (params.hasUnseenFeatureVersion && params.priorSessionCount > 0) {
    return 'returning_user_new_feature';
  }
  if (params.completedActionsCount >= 15) {
    return 'power_expert_user';
  }
  if (params.isAuthenticated) {
    return 'registered_user';
  }
  if (params.priorSessionCount > 0) {
    return 'returning_guest';
  }
  return 'first_time_guest';
}

export function resolveMapNavigationGestureHint(isTouchDevice: boolean): {
  interactionMode: 'touch' | 'mouse_keyboard';
  panHintFa: string;
  zoomHintFa: string;
} {
  if (isTouchDevice) {
    return {
      interactionMode: 'touch',
      panHintFa: 'کشیدن یک انگشت برای جابه‌جایی روی نقشه',
      zoomHintFa: 'دو انگشت برای بزرگ‌نمایی و لمس نشانگر برای مشاهده اطلاعات',
    };
  }
  return {
    interactionMode: 'mouse_keyboard',
    panHintFa: 'کشیدن با ماوس (Drag) برای جابه‌جایی روی نقشه',
    zoomHintFa: 'چرخ ماوس (Scroll) یا دکمه‌های +/− برای بزرگ‌نمایی و کلیک روی عارضه برای جزئیات',
  };
}

export function resolveZoomLockedLayerFeedback(
  layerTitleFa: string,
  currentZoom: number,
  minRequiredZoom: number,
): { isLockedAtCurrentZoom: boolean; messageFa: string } {
  if (currentZoom < minRequiredZoom) {
    return {
      isLockedAtCurrentZoom: true,
      messageFa: `لایه «${layerTitleFa}»: این لایه در مقیاس فعلی نمایش داده نمی‌شود. برای مشاهده آن، روی محدوده موردنظر بزرگ‌نمایی کنید.`,
    };
  }
  return {
    isLockedAtCurrentZoom: false,
    messageFa: `لایه «${layerTitleFa}» در مقیاس فعلی فعال و قابل مشاهده است.`,
  };
}

export function buildContextualAuthPrompt(
  actionType: PendingAuthContinuation['actionType'],
  returnRoute: string,
  payload: Record<string, string>,
): { messageFa: string; pendingContinuation: PendingAuthContinuation } {
  return {
    messageFa: 'برای نگهداری این ملک در حساب شخصی و دسترسی به آن از دستگاه‌های دیگر، وارد حساب شوید یا ثبت‌نام کنید.',
    pendingContinuation: {
      actionType,
      returnRoute,
      payload,
      createdAtIso: '2026-11-14T00:00:00.000Z',
    },
  };
}

export function evaluateOnboardingOutcomeQuality(params: {
  guideCompletedOrSkipped: boolean;
  coreTaskCompletedIndependently: boolean;
}): { tourFinishedOnly: boolean; trueOnboardingMastery: boolean } {
  return {
    tourFinishedOnly: params.guideCompletedOrSkipped && !params.coreTaskCompletedIndependently,
    trueOnboardingMastery: params.coreTaskCompletedIndependently,
  };
}

/** Section 20 & 21: State machine enforcing max 1 floating guide and Skipped !== Completed */
export class OnboardingProgressManager {
  private statuses = new Map<string, UserGuideProgressStatus>();
  private activeFloatingGuideId: string | null = null;
  private pendingAuthAction: PendingAuthContinuation | null = null;

  public getGuideStatus(guideId: string): UserGuideProgressStatus {
    return this.statuses.get(guideId) ?? 'not_started';
  }

  public startGuide(guideId: string): boolean {
    if (this.activeFloatingGuideId !== null && this.activeFloatingGuideId !== guideId) {
      return false;
    }
    this.activeFloatingGuideId = guideId;
    this.statuses.set(guideId, 'in_progress');
    return true;
  }

  public completeGuide(guideId: string): void {
    this.statuses.set(guideId, 'completed');
    if (this.activeFloatingGuideId === guideId) {
      this.activeFloatingGuideId = null;
    }
  }

  public skipGuide(guideId: string): void {
    this.statuses.set(guideId, 'skipped');
    if (this.activeFloatingGuideId === guideId) {
      this.activeFloatingGuideId = null;
    }
  }

  public replayGuideFromHelpCenter(guideId: string): void {
    this.activeFloatingGuideId = guideId;
    this.statuses.set(guideId, 'in_progress');
  }

  public queuePendingAuthAction(action: PendingAuthContinuation): void {
    this.pendingAuthAction = { ...action, payload: { ...action.payload } };
  }

  public consumePendingAuthActionOnLogin(): PendingAuthContinuation | null {
    const act = this.pendingAuthAction;
    this.pendingAuthAction = null;
    return act;
  }
}
