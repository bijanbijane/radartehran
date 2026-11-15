/** @file src/features/onboarding/services/urbanMobilityEngine.ts — Stage 64 Pure Multimodal & Privacy Guards (Zero React) */
import type { MobilityZoneProfile } from './urbanMobilityTypes';

export interface NetworkTransitAndRoutingGuardResult {
  distanceVsAccessTimeFa: string;
  interchangeOperationalGapFa: string;
  scheduleVsObservedFa: string;
  multimodalTotalTimeBreakdownFa: string;
  bestRouteCriterionGuardFa: string;
}

export interface TrafficParkingOdAndValuationGuardResult {
  temporalAndLiveTrafficGuardFa: string;
  parkingAndFreightBoundaryFa: string;
  odPrivacyAndNoRouteHistoryFa: string;
  dayTypeComparisonAndResilienceFa: string;
  propertyValuationBoundaryFa: string;
}

export function evaluateNetworkTransitAndMultimodalGuards(
  profile: MobilityZoneProfile,
  includeWaitAndTransfer: boolean,
): NetworkTransitAndRoutingGuardResult {
  const distanceVsAccessTimeFa = `فاصله مستقیم (${profile.straightLineToStationMeters} متر) ≠ دسترسی واقعی (${profile.realPedestrianWalkMinutes} دقیقه پیاده‌روی واقعی) — مانع مسیر: ${profile.stationAccessBarrierFa}.`;
  const interchangeOperationalGapFa = `اتصال اسمی (${profile.nominalInterchangeNoteFa}) ≠ انتقال عملیاتی (${profile.operationalTransferNoteFa}).`;
  const scheduleVsObservedFa = `سرفاصله برنامه رسمی (${profile.scheduledHeadwayMinutes} دقیقه) ≠ عملکرد مشاهده‌شده (${profile.observedHeadwayMinutes} دقیقه) — وضعیت زمانی: ${profile.temporalState}.`;

  const route = profile.routes[0];
  const fullTotalMinutes =
    route.inVehicleMinutes + route.walkMinutes + route.waitMinutes + route.transferWalkMinutes;

  const multimodalTotalTimeBreakdownFa = includeWaitAndTransfer
    ? `مسیر «${route.labelFa}»: کل زمان واقعی = ${fullTotalMinutes} دقیقه (حرکت وسیله ${route.inVehicleMinutes} + پیاده‌روی ${route.walkMinutes} + انتظار ${route.waitMinutes} + انتقال ${route.transferWalkMinutes} دقیقه؛ ${route.transfersCount} تعویض).`
    : `مسدودشدن نمایش ناقص: زمان حرکت وسیله (${route.inVehicleMinutes} دقیقه) بدون افزودن انتظار (${route.waitMinutes}) و انتقال (${route.transferWalkMinutes}) نمی‌تواند «زمان کل سفر» معرفی شود.`;

  const bestRouteCriterionGuardFa = `رتبه‌بندی صرفاً با معیار صریح «${route.rankingCriterionFa}» انجام می‌شود و یک مسیر به‌طور مطلق «بهترین» معرفی نمی‌شود.`;

  return {
    distanceVsAccessTimeFa,
    interchangeOperationalGapFa,
    scheduleVsObservedFa,
    multimodalTotalTimeBreakdownFa,
    bestRouteCriterionGuardFa,
  };
}

export function evaluateTrafficParkingOdPrivacyAndValuationGuards(
  profile: MobilityZoneProfile,
  attemptWeekdayVsHolidayCompare: boolean,
  attemptAutoMetroValuationBoost: boolean,
): TrafficParkingOdAndValuationGuardResult {
  const temporalAndLiveTrafficGuardFa = profile.hasLiveTrafficSource
    ? 'منبع عملیاتی لحظه‌ای با تاریخچه زمانی معتبر برای ترافیک فعال است.'
    : `نبود منبع عملیاتی لحظه‌ای: وضعیت ترافیک و زمان سفر به‌عنوان «برآورد یا میانگین دوره مرجع (${profile.temporalState})» نمایش داده می‌شود، نه وضعیت زنده.`;

  const parkingPart = profile.hasLiveParkingOccupancy
    ? `ظرفیت کل ${profile.parkingTotalCapacity} با داده اشغال زنده`
    : `ظرفیت اسمی (${profile.parkingTotalCapacity} جایگاه) ≠ تعداد جای پارک آزاد (داده اشغال لحظه‌ای موجود نیست)`;

  const freightPart = profile.freightGeometryOk
    ? `مناسب‌بودن هندسی معبر برای بارگیری ≠ مجوز قانونی تردد (${profile.freightLegalPermitNoteFa})`
    : `محدودیت هندسی و قانونی بار: ${profile.freightLegalPermitNoteFa}`;

  const parkingAndFreightBoundaryFa = `${parkingPart} | ${freightPart}.`;

  const meetsKThreshold = profile.odAggregatedTripsCount >= profile.minOdAnonymityThreshold;
  const odPrivacyAndNoRouteHistoryFa = meetsKThreshold
    ? `جریان مبدأ ـ مقصد تجمیعی (${profile.odAggregatedTripsCount} سفر ≥ آستانه ${profile.minOdAnonymityThreshold}) بدون داده قابل انتساب به خانوار نمایش می‌یابد؛ مبدأ/مقصد مسیریاب در پروفایل دائمی کاربر ذخیره نمی‌شود.`
    : `مسدودشدن انتشار جریان خرد: تعداد سفر (${profile.odAggregatedTripsCount}) کمتر از آستانه ناشناس‌سازی (${profile.minOdAnonymityThreshold}) است.`;

  const dayTypeComparisonAndResilienceFa = attemptWeekdayVsHolidayCompare
    ? `هشدار هم‌سنخی زمانی: مقایسه روز کاری عادی با روز تعطیل/رویداد ویژه بدون برچسب‌گذاری مسدود است | وضعیت شبکه در نقشه: «${profile.networkScenarioStatus}» (متصل به مخاطرات مرحله ۵۸، غیرجایگزین فرماندهی بحران).`
    : `مقایسه هم‌نوع روزهای کاری و اتصال غیرعملیاتی به مرحله ۵۸ با وضعیت «${profile.networkScenarioStatus}».`;

  const propertyValuationBoundaryFa = attemptAutoMetroValuationBoost
    ? 'مسدودشدن قیمت‌گذاری خودکار: نزدیکی به مترو یا بزرگراه بدون داده‌های واقعی بازار، دسترسی پیاده، سروصدا و ترافیک، ارزش ملک را خودکار تغییر نمی‌دهد.'
    : 'تحلیل دسترسی ملک همراه با ارجاع به روش محاسبه و بدون برچسب توصیه خرید.';

  return {
    temporalAndLiveTrafficGuardFa,
    parkingAndFreightBoundaryFa,
    odPrivacyAndNoRouteHistoryFa,
    dayTypeComparisonAndResilienceFa,
    propertyValuationBoundaryFa,
  };
}
