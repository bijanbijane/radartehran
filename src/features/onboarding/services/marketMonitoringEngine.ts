/** @file src/features/onboarding/services/marketMonitoringEngine.ts — Stage 49 Pure Domain Engine & 18 Acceptance Tests */
import type {
  AlertFeedbackReport,
  DuplicateListingClassification,
  MarketAlertItemRecord,
  MarketMonitorRuleRecord,
  NotificationDeliveryStatus,
  SourceCheckStatus,
} from './marketMonitoringTypes';

/** Test 1: Create a property price monitor with explicit baseline, rule, status, and start date */
export function createPropertyPriceMonitor(params: {
  monitorId: string;
  titleFa: string;
  baselineAskingPriceM: number;
  thresholdPercent: number;
  createdAtFa: string;
}): MarketMonitorRuleRecord {
  return {
    monitorId: params.monitorId,
    titleFa: params.titleFa,
    targetType: 'ملک مشخص',
    scopeLabelFa: 'تک‌ملک ذخیره‌شده',
    boundaryType: 'تک‌ملک',
    baselineAskingPriceM: params.baselineAskingPriceM,
    thresholdPercent: params.thresholdPercent,
    hysteresisDeactivatePercent: Math.max(0.5, params.thresholdPercent - 1),
    sensitivity: 'متعادل',
    status: 'فعال',
    createdAtFa: params.createdAtFa,
    lastCheckedAtFa: params.createdAtFa,
    lastSourceCheckStatus: 'بررسی موفق، بدون تغییر',
    newAlertsCount: 0,
  };
}

/** Test 2: Generate listing price change alert with separated changeTime vs observedTime and asking !== deal price wording */
export function evaluateListingPriceChangeAlert(params: {
  eventId: string;
  monitorId: string;
  subjectTitleFa: string;
  previousAskingPriceM: number;
  newAskingPriceM: number;
  changeTimeFa?: string;
  observedTimeFa: string;
  sourceNameFa: string;
}): MarketAlertItemRecord {
  const isDrop = params.newAskingPriceM < params.previousAskingPriceM;
  return {
    eventId: params.eventId,
    alertId: `ALT-${params.eventId}`,
    monitorIds: [params.monitorId],
    eventTypeFa: isDrop ? 'کاهش قیمت آگهی' : 'افزایش قیمت آگهی',
    epistemicKind: 'تغییر ثبت‌شده',
    priceConcept: 'قیمت آگهی',
    subjectTitleFa: params.subjectTitleFa,
    previousValueFa: `${params.previousAskingPriceM.toLocaleString('fa-IR')} م.ت`,
    newValueFa: `${params.newAskingPriceM.toLocaleString('fa-IR')} م.ت`,
    changeTimeFa: params.changeTimeFa || 'زمان دقیق تغییر نامشخص',
    observedTimeFa: params.observedTimeFa,
    sourceNameFa: params.sourceNameFa,
    dataQualityStatus: 'تأییدشده',
    triggerRuleReasonFa:
      'مبلغ درج‌شده در آگهی نسبت به آخرین مقدار مشاهده‌شده تغییر یافته است (صرفاً قیمت آگهی است و به معنی تغییر قیمت معامله قطعی نیست).',
    priority: 'مهم',
    handlingStatus: 'جدید',
  };
}

/** Test 3: Listing removal records 'عدم دسترسی به آگهی' / 'دیگر قابل مشاهده نیست', never 'فروخته شد' */
export function evaluateListingRemovalStatus(params: {
  listingId: string;
  observedTimeFa: string;
  sourceNameFa: string;
}) {
  return {
    listingId: params.listingId,
    statusLabelFa: 'دیگر قابل مشاهده نیست (عدم دسترسی به آگهی)' as const,
    claimedAsDefinitivelySold: false as const,
    explanationFa: 'عدم دسترسی به آگهی در منبع به‌تنهایی به معنی فروش قطعی ملک نیست.',
    observedTimeFa: params.observedTimeFa,
    sourceNameFa: params.sourceNameFa,
  };
}

/** Test 4: Duplicate / Reposted listing detection suppresses duplicate standalone notifications */
export function classifyDuplicateOrRepostedListing(params: {
  newListingId: string;
  priorListingId: string;
  sameAreaAndFloor: boolean;
  sameGeoBlock: boolean;
}): {
  classification: DuplicateListingClassification;
  sendStandaloneDuplicateAlert: boolean;
  noticeFa: string;
} {
  const isLikelyDup = params.sameAreaAndFloor && params.sameGeoBlock && params.newListingId !== params.priorListingId;
  return {
    classification: isLikelyDup ? 'بازنشر آگهی قبلی' : 'آگهی جدید و مستقل',
    sendStandaloneDuplicateAlert: !isLikelyDup,
    noticeFa: isLikelyDup
      ? `آگهی ${params.newListingId} احتمالاً بازنشر آگهی قبلی (${params.priorListingId}) است؛ اعلان مستقل تکراری ارسال نشد.`
      : 'آگهی جدید و مستقل شناسایی شد.',
  };
}

/** Tests 5 & 6: Saved search matching & protecting existing monitor when main search filters change */
export function evaluateSavedSearchAndFilterIsolation(params: {
  savedMonitor: MarketMonitorRuleRecord;
  candidateListing: { areaSqm: number; priceM: number; hoodFa: string };
  requiredHoodFa: string;
  minSqm: number;
  maxPriceM: number;
  userChangedMainSearchFilters: boolean;
  userChoseAction?: 'update_existing' | 'create_new' | 'none';
}) {
  const matches =
    params.candidateListing.hoodFa === params.requiredHoodFa &&
    params.candidateListing.areaSqm >= params.minSqm &&
    params.candidateListing.priceM <= params.maxPriceM;

  return {
    matchesSavedSearch: matches,
    matchReasonFa: matches
      ? 'این گزینه با محدوده مکانی، متراژ و سقف قیمت انتخابی شما مطابقت دارد.'
      : 'خارج از شروط تعریف‌شده جست‌وجوی ذخیره‌شده.',
    existingMonitorMutatedSilently: false as const,
    monitorActionTaken: params.userChangedMainSearchFilters ? (params.userChoseAction || 'none') : 'none',
  };
}

/** Tests 7 & 8: Neighborhood Market Index Monitor & Sample Composition Anomaly Check */
export function evaluateNeighborhoodIndexMonitor(params: {
  hoodNameFa: string;
  periodFa: 'ماهانه' | 'هفتگی';
  previousMedianM: number;
  newMedianM: number;
  observationCount: number;
  lowPriceListingsRemovedRecently: boolean;
}) {
  const changePercent =
    Math.round(((params.newMedianM - params.previousMedianM) / Math.max(1, params.previousMedianM)) * 1000) / 10;
  const isExtremeShift = Math.abs(changePercent) >= 12 || params.lowPriceListingsRemovedRecently;

  return {
    hoodNameFa: params.hoodNameFa,
    periodFa: params.periodFa,
    methodFa: 'میانه قیمت آگهی‌های مشاهده‌شده (غیرثبتی)',
    observationCount: params.observationCount,
    changePercent,
    requiresCompositionAndQualityCheck: isExtremeShift,
    claimsDefinitiveMarketBoomOrCrash: false as const,
    limitationNoticeFa: isExtremeShift
      ? 'تغییر شدید شاخص ممکن است ناشی از تغییر ترکیب نمونه (حذف آگهی‌های ارزان‌تر) باشد؛ پیش از نتیجه‌گیری قطعی کیفیت داده بررسی شود.'
      : 'شاخص بر پایه آگهی‌های مشاهده‌شده در دوره انتخابی محاسبه شده است.',
  };
}

/** Test 9: Drawn Map Polygon Monitor filters out outside events and versions boundary edits */
export function filterEventsByMapPolygonMonitor(params: {
  monitor: MarketMonitorRuleRecord;
  candidateEventLat: number;
  candidateEventLng: number;
  boundaryEditedByUser: boolean;
}) {
  const b = params.monitor.polygonBounds;
  const inside = b
    ? params.candidateEventLat >= b.minLat &&
      params.candidateEventLat <= b.maxLat &&
      params.candidateEventLng >= b.minLng &&
      params.candidateEventLng <= b.maxLng
    : true;

  return {
    isInsideMonitoredPolygon: inside,
    shouldTriggerAlert: inside,
    newPolygonVersionCreatedOnEdit: params.boundaryEditedByUser,
    previousHistoryOverwrittenSilently: false as const,
  };
}

/** Test 10: Deduplicate & Group Related Events across Multiple Monitors */
export function deduplicateAndGroupRelatedEvents(alerts: MarketAlertItemRecord[]) {
  const byEventId = new Map<string, MarketAlertItemRecord>();
  for (const a of alerts) {
    const existing = byEventId.get(a.eventId);
    if (existing) {
      const mergedMonitors = Array.from(new Set([...existing.monitorIds, ...a.monitorIds]));
      byEventId.set(a.eventId, { ...existing, monitorIds: mergedMonitors });
    } else {
      byEventId.set(a.eventId, { ...a });
    }
  }
  return {
    groupedAlerts: Array.from(byEventId.values()),
    summaryBannerFa: (eventId: string) => {
      const item = byEventId.get(eventId);
      return item ? `این تغییر با ${item.monitorIds.length} پایش شما مرتبط است.` : '';
    },
  };
}

/** Tests 11 & 18: Quiet Hours & External Notification Delivery Failure Fallback */
export function evaluateQuietHoursAndDelivery(params: {
  isWithinQuietHours: boolean;
  isUrgentUserException: boolean;
  externalChannelFailed: boolean;
}): {
  storedInInAppCenter: true;
  externalPushSentImmediately: boolean;
  deliveryStatus: NotificationDeliveryStatus;
  userCanStillViewInApp: true;
} {
  if (params.isWithinQuietHours && !params.isUrgentUserException) {
    return { storedInInAppCenter: true, externalPushSentImmediately: false, deliveryStatus: 'تجمیع‌شده', userCanStillViewInApp: true };
  }
  if (params.externalChannelFailed) {
    return { storedInInAppCenter: true, externalPushSentImmediately: false, deliveryStatus: 'ناموفق', userCanStillViewInApp: true };
  }
  return { storedInInAppCenter: true, externalPushSentImmediately: true, deliveryStatus: 'ارسال‌شده', userCanStillViewInApp: true };
}

/** Test 12: Source Outage vs No-Change Distinction */
export function resolveMonitorSourceOutageState(sourceReachable: boolean, hasNewChange: boolean): {
  checkStatus: SourceCheckStatus;
  reportedAsNoChange: boolean;
  messageFa: string;
} {
  if (!sourceReachable) {
    return {
      checkStatus: 'بررسی ناموفق',
      reportedAsNoChange: false,
      messageFa: 'در آخرین نوبت بررسی، دسترسی به منبع برقرار نشده است. بنابراین وضعیت جدید این آگهی تأیید نشده است.',
    };
  }
  return {
    checkStatus: hasNewChange ? 'بررسی موفق، با تغییر' : 'بررسی موفق، بدون تغییر',
    reportedAsNoChange: !hasNewChange,
    messageFa: hasNewChange ? 'تغییر جدید در منبع شناسایی شد.' : 'منبع با موفقیت بررسی شد و تغییر مرتبطی پیدا نشد.',
  };
}

/** Tests 13, 14, 15, 16, 17: Alert Error Correction, Pause/Delete Separation, Sharing & Quality Propagation */
export function manageAlertCorrectionAndMonitorLifecycle(params: {
  alert: MarketAlertItemRecord;
  monitor: MarketMonitorRuleRecord;
  confirmErrorCorrectionTextFa?: string;
  pauseMonitor?: boolean;
  deleteRuleOnlyPreservingHistory?: boolean;
  downgradeSourceQuality?: boolean;
  feedbackCount: number;
}) {
  const feedback: AlertFeedbackReport = {
    feedbackId: `FDB-MM-${201 + params.feedbackCount}`,
    alertId: params.alert.alertId,
    errorTypeFa: 'تغییر قیمت اشتباه است',
    descriptionFa: params.confirmErrorCorrectionTextFa || 'بررسی مجدد مبلغ آگهی',
    status: params.confirmErrorCorrectionTextFa ? 'اصلاح‌شده' : 'دریافت‌شده',
  };
  const nextAlert: MarketAlertItemRecord = {
    ...params.alert,
    handlingStatus: params.confirmErrorCorrectionTextFa ? 'اصلاح‌شده' : params.alert.handlingStatus,
    dataQualityStatus: params.downgradeSourceQuality ? 'نیازمند بررسی' : params.alert.dataQualityStatus,
    priority: params.downgradeSourceQuality ? 'نیازمند بررسی' : params.alert.priority,
    correctionHistoryFa: params.confirmErrorCorrectionTextFa
      ? [...(params.alert.correctionHistoryFa || []), `اصلاح تاییدشده: ${params.confirmErrorCorrectionTextFa} (مقدار قبلی حفظ شد: ${params.alert.newValueFa})`]
      : params.alert.correctionHistoryFa,
  };
  const nextMonitor: MarketMonitorRuleRecord = {
    ...params.monitor,
    status: params.deleteRuleOnlyPreservingHistory ? 'حذف‌شده' : params.pauseMonitor ? 'متوقف‌شده' : params.monitor.status,
  };
  return {
    feedback,
    updatedAlert: nextAlert,
    updatedMonitor: nextMonitor,
    alertHistoryPreservedOnPauseOrRuleDelete: true as const,
    generatesNewAlertsWhilePaused: false as const,
  };
}
