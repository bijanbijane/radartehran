/**
 * Stage 39 — Monitoring, Alerts & Notification Experience Engine
 * (RT-UI-ALERTS-001 | مرحله ۳۹: طراحی رابط پایش تغییرات، هشدارها و اعلان‌های هوشمند)
 */

export type MonitoringSubjectKind =
  | 'property'
  | 'neighborhood'
  | 'map_zone'
  | 'market_index'
  | 'saved_search'
  | 'valuation';

export type MonitoringLifecycleStatus =
  | 'active'
  | 'paused'
  | 'needs_review'
  | 'failed'
  | 'ended'
  | 'expired';

export type AlertThresholdKind =
  | 'fixed_value'
  | 'percent_change'
  | 'numeric_range'
  | 'event'
  | 'status_change'
  | 'volume_threshold';

export type AlertDeliveryFrequency =
  | 'immediate_when_supported'
  | 'daily_digest'
  | 'weekly_digest'
  | 'center_only';

export type NotificationCategoryKind =
  | 'market_neighborhood'
  | 'properties'
  | 'saved_search'
  | 'valuation'
  | 'services'
  | 'contribution'
  | 'account_security'
  | 'system_ops';

export type NotificationDeliveryState =
  | 'created'
  | 'queued'
  | 'sent'
  | 'delivered_confirmed'
  | 'failed'
  | 'cancelled';

export interface MonitoringSubjectItem {
  id: string;
  kind: MonitoringSubjectKind;
  titleFa: string;
  status: MonitoringLifecycleStatus;
  activeAlertRuleCount: number;
  startedAtLabelFa: string;
  lastChangeSummaryFa: string;
  targetRoute: string;
}

export interface AlertRuleSpec {
  ruleId: string;
  monitoringId: string;
  subjectKind: MonitoringSubjectKind;
  subjectTitleFa: string;
  thresholdKind: AlertThresholdKind;
  thresholdValue: number | null;
  unitFa: string;
  comparisonBasisFa: string;
  frequency: AlertDeliveryFrequency;
  cooldownHours: number;
  paused: boolean;
  requiresSampleSufficiency: boolean;
}

export interface Stage39NotificationItem {
  id: string;
  ruleId: string | null;
  category: NotificationCategoryKind;
  priority: 'important' | 'notable' | 'informational';
  titleFa: string;
  bodyFa: string;
  eventOccurredAtLabelFa: string;
  retrievedOrProcessedAtLabelFa: string;
  notificationCreatedAtLabelFa: string;
  dataSourceLabelFa: string;
  isStaleSource: boolean;
  isSampleInsufficient: boolean;
  aggregatedEventCount: number;
  deliveryStateByChannel: {
    inApp: NotificationDeliveryState;
    browserPush: NotificationDeliveryState | 'permission_denied';
    email: NotificationDeliveryState | 'consent_not_granted';
  };
  read: boolean;
  archived: boolean;
  targetRoute: string;
}

export interface NotificationChannelSettings {
  inAppEnabled: boolean;
  browserPushConsentGranted: boolean;
  emailConsentGranted: boolean;
  smsConsentGranted: boolean;
  quietHoursStartHour: number;
  quietHoursEndHour: number;
  dailyNonEssentialCap: number;
  securityAlertsMandatoryAlwaysOn: true;
}

export function evaluateAlertTriggerQualification(input: {
  rule: AlertRuleSpec;
  observedChangePctOrValue: number;
  uniqueSampleCount: number;
  minRequiredSamples: number;
  dataAgeDays: number;
  maxAllowedAgeDays: number;
  hoursSinceLastSimilarNotification: number;
}): {
  shouldEmitNotification: boolean;
  suppressionOrQualificationReasonFa: string;
  safeWordingFa: string;
} {
  if (input.rule.paused) {
    return {
      shouldEmitNotification: false,
      suppressionOrQualificationReasonFa: 'پایش یا قاعده هشدار به‌صورت موقت متوقف شده است.',
      safeWordingFa: 'هشدار جدیدی تا زمان فعال‌سازی مجدد صادر نمی‌شود.',
    };
  }
  if (input.hoursSinceLastSimilarNotification < input.rule.cooldownHours) {
    return {
      shouldEmitNotification: false,
      suppressionOrQualificationReasonFa: `در دوره خنک‌سازی (${input.rule.cooldownHours} ساعت) برای جلوگیری از اعلان تکراری قرار دارد.`,
      safeWordingFa: 'رویداد جدید در تاریخچه ثبت می‌شود اما اعلان تکراری ارسال نمی‌گردد.',
    };
  }
  if (input.dataAgeDays > input.maxAllowedAgeDays) {
    return {
      shouldEmitNotification: false,
      suppressionOrQualificationReasonFa: 'داده مرجع قدیمی‌تر از حد مجاز تازگی است.',
      safeWordingFa: 'به دلیل قدیمی‌بودن داده، وضعیت به‌عنوان تغییر تازه بازار اعلام نمی‌شود.',
    };
  }
  if (input.rule.requiresSampleSufficiency && input.uniqueSampleCount < input.minRequiredSamples) {
    return {
      shouldEmitNotification: true,
      suppressionOrQualificationReasonFa: 'حجم نمونه برای نتیجه‌گیری قطعی درباره روند بازار کافی نیست.',
      safeWordingFa: 'در داده‌های جدید این محله تغییر مشاهده شده است، اما حجم نمونه برای نتیجه‌گیری درباره روند بازار کافی نیست.',
    };
  }
  const threshold = input.rule.thresholdValue ?? 0;
  const triggered = Math.abs(input.observedChangePctOrValue) >= Math.abs(threshold);
  if (!triggered) {
    return {
      shouldEmitNotification: false,
      suppressionOrQualificationReasonFa: 'مقدار تغییر کمتر از آستانه تعریف‌شده کاربر است.',
      safeWordingFa: 'آستانه هشدار فعال نشده است.',
    };
  }
  const kindNotice =
    input.rule.subjectKind === 'property'
      ? `قیمت پیشنهادی آگهی در «${input.rule.subjectTitleFa}» به میزان ${Math.abs(input.observedChangePctOrValue)}${input.rule.unitFa} تغییر کرده است (معادل قیمت معامله قطعی نیست).`
      : `تغییر ${Math.abs(input.observedChangePctOrValue)}${input.rule.unitFa} در شاخص «${input.rule.subjectTitleFa}» ثبت شد.`;

  return {
    shouldEmitNotification: true,
    suppressionOrQualificationReasonFa: 'شرط آستانه، تازگی و دوره خنک‌سازی احراز شد.',
    safeWordingFa: kindNotice,
  };
}

export function shouldDeliverNotificationInQuietHours(input: {
  category: NotificationCategoryKind;
  currentHour24: number;
  settings: NotificationChannelSettings;
}): { allowedExternalPush: boolean; reasonFa: string } {
  if (input.category === 'account_security') {
    return { allowedExternalPush: true, reasonFa: 'اعلان‌های ضروری و امنیتی حساب مشمول ساعات سکوت نمی‌شوند.' };
  }
  const { quietHoursStartHour: start, quietHoursEndHour: end } = input.settings;
  const inQuiet =
    start > end
      ? input.currentHour24 >= start || input.currentHour24 < end
      : input.currentHour24 >= start && input.currentHour24 < end;
  if (inQuiet) {
    return { allowedExternalPush: false, reasonFa: 'در بازه ساعات سکوت قرار دارد؛ فقط در مرکز اعلان‌های داخلی نمایش داده می‌شود.' };
  }
  return { allowedExternalPush: true, reasonFa: 'خارج از ساعات سکوت؛ ارسال بر اساس کانال‌های دارای رضایت مجاز است.' };
}

export function transitionMonitoringLifecycle(
  item: MonitoringSubjectItem,
  action: 'pause' | 'resume',
): MonitoringSubjectItem {
  return { ...item, status: action === 'pause' ? 'paused' : 'active' };
}

export function aggregateRepeatedPropertyEvents(
  subjectTitleFa: string,
  repeatCount: number,
): string {
  if (repeatCount <= 1) return `تغییر قیمت پیشنهادی آگهی در «${subjectTitleFa}»`;
  return `قیمت پیشنهادی «${subjectTitleFa}» در ${repeatCount} نوبت تغییر کرده است (تجمیع‌شده)`;
}

export const STAGE39_DESIGN_COMPONENT_IDS = [
  'ALT-01', 'ALT-02', 'ALT-03', 'ALT-04', 'ALT-05', 'ALT-06', 'ALT-07',
  'ALT-08', 'ALT-09', 'ALT-10', 'ALT-11', 'ALT-12', 'ALT-13', 'ALT-14',
  'ALT-15', 'ALT-16', 'ALT-17', 'ALT-18', 'ALT-19', 'ALT-20',
] as const;
