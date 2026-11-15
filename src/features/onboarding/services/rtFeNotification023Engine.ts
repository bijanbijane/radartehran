/**
 * Stage 23 Engine — RT-FE-NOTIFICATION-COMMUNICATION-023 (§23.1–§23.41)
 * Pure TypeScript evaluators for Unread Badge rules, Notification vs Delivery isolation,
 * Grouping & Read-State concurrency, Security & Consent / Quiet Hours policy,
 * Safe Deep Link routing & Telemetry PII sanitization.
 */
import {
  RT_FE_NOTIFICATION_023_SPEC_ID,
  RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID,
  RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID,
  RT_NOTIF_LAYERS_10,
  RT_NOTIF_ENTITIES_13,
  RT_NOTIF_TYPES_10,
  RT_NOTIF_PRIORITIES_4,
  RT_NOTIF_STATUSES_4,
  RT_NOTIF_ACTION_TYPES_6,
  RT_NOTIF_CHANNELS_4,
  RT_NOTIF_DELIVERY_STATUSES_9,
  RT_NOTIF_ENDPOINTS_13,
  RT_NOTIF_DELIVERABLES_36,
  notificationKeys,
  type NotificationChannel,
  type DeliveryStatus,
  type NotificationType,
  type NotificationPriority,
  type ConsentStatus,
  type PolicyDecision,
} from './rtFeNotification023Specs';

export {
  RT_FE_NOTIFICATION_023_SPEC_ID,
  RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID,
  RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID,
  RT_NOTIF_LAYERS_10,
  RT_NOTIF_ENTITIES_13,
  RT_NOTIF_TYPES_10,
  RT_NOTIF_PRIORITIES_4,
  RT_NOTIF_STATUSES_4,
  RT_NOTIF_ACTION_TYPES_6,
  RT_NOTIF_CHANNELS_4,
  RT_NOTIF_DELIVERY_STATUSES_9,
  RT_NOTIF_ENDPOINTS_13,
  RT_NOTIF_DELIVERABLES_36,
  notificationKeys,
};

export function formatUnreadBadgeCount(params: {
  unreadCount: number | null;
  fetchFailed: boolean;
  lastKnownCount?: number | null;
}): { showNumericBadge: boolean; badgeText: string | null; isStale: boolean; noteFa: string } {
  if (params.fetchFailed) {
    const fallback = params.lastKnownCount ?? null;
    if (fallback === null || fallback <= 0) {
      return { showNumericBadge: false, badgeText: null, isStale: true, noteFa: 'خطا در دریافت شمارنده از Backend؛ عدم جعل صفر (§۲۳.۶ & §۲۳.۳۱).' };
    }
    return {
      showNumericBadge: true,
      badgeText: fallback > 99 ? '99+' : String(fallback),
      isStale: true,
      noteFa: 'حالت آفلاین/خطای شبکه؛ آخرین شمارنده معتبر به‌صورت Stale نمایش داده شد.',
    };
  }
  if (params.unreadCount === null || params.unreadCount <= 0) {
    return {
      showNumericBadge: false,
      badgeText: null,
      isStale: false,
      noteFa: params.unreadCount === null ? 'شمارنده هنوز دریافت نشده است.' : 'تعداد خوانده‌نشده صفر است؛ نشانگر پنهان می‌شود.',
    };
  }
  return {
    showNumericBadge: true,
    badgeText: params.unreadCount > 99 ? '99+' : String(params.unreadCount),
    isStale: false,
    noteFa: params.unreadCount > 99 ? 'نمایش 99+ برای خوانده‌نشده‌های بیش از سقف (§۲۳.۹.۱).' : `${params.unreadCount} اعلان خوانده‌نشده.`,
  };
}

export function evaluateDeliveryChannelIsolation(params: {
  inboxSaved: boolean;
  emailDeliveryStatus: DeliveryStatus;
  pushDeliveryStatus: DeliveryStatus;
  treatSentAsDelivered?: boolean;
  treatUnknownAsFailed?: boolean;
}): {
  inboxPreserved: boolean;
  channelFailureIsolated: boolean;
  deliveredConfirmed: boolean;
  issues: string[];
  summaryFa: string;
} {
  const issues: string[] = [];
  if (params.treatSentAsDelivered && params.emailDeliveryStatus === 'sent') {
    issues.push('وضعیت sent به معنی تحویل قطعی (delivered) به کاربر نیست (§۲۳.۲۲ و §۲۳.۴۰).');
  }
  if (params.treatUnknownAsFailed && (params.emailDeliveryStatus === 'unknown' || params.pushDeliveryStatus === 'unknown')) {
    issues.push('وضعیت unknown به معنی شکست قطعی failed نیست (§۲۳.۲۲).');
  }
  const deliveredConfirmed = params.emailDeliveryStatus === 'delivered' || params.pushDeliveryStatus === 'delivered';
  const emailFailed = params.emailDeliveryStatus === 'failed';
  const channelFailureIsolated = params.inboxSaved && (!emailFailed || params.pushDeliveryStatus !== 'failed');

  return {
    inboxPreserved: params.inboxSaved,
    channelFailureIsolated,
    deliveredConfirmed,
    issues,
    summaryFa:
      issues[0] ??
      (emailFailed && params.inboxSaved
        ? 'خطای ارسال ایمیل به آداپتور Email محدود ماند و اعلان در Inbox محفوظ ماند (§۲۳.۳.۲).'
        : 'تفکیک کامل Notification از چرخه Delivery کانال‌های خارجی برقرار است.'),
  };
}

export function evaluateReadStateAndPanelIsolation(params: {
  openingGroupAutoMarksAllRead?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  requestedAction?: 'archive' | 'delete';
  mergingSecurityOrCritical?: boolean;
  clientVersion: number;
  serverVersion: number;
}): {
  valid: boolean;
  requiresServerSync: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (params.openingGroupAutoMarksAllRead) {
    issues.push('باز کردن یک گروه نباید لزوماً تمام اعضای آن را read کند (§۲۳.۱۲).');
  }
  if (params.requestedAction === 'delete' && params.type === 'security') {
    issues.push('پیام‌های امنیتی حساس ممکن است از حذف کاربرمحور مستثنا باشند (§۲۳.۱۱ و §۲۳.۲۱).');
  }
  if (params.mergingSecurityOrCritical && (params.type === 'security' || params.priority === 'critical')) {
    issues.push('اعلان‌های security و critical نباید با پیام‌های عمومی ادغام و تجمیع شوند (§۲۳.۱۲ و §۲۳.۱۹).');
  }
  const requiresServerSync = params.clientVersion !== params.serverVersion;
  if (requiresServerSync) {
    issues.push('تعارض نسخه Multi-Device؛ وضعیت نهایی باید با مرجع Backend همگام شود (§۲۳.۱۱ و §۲۳.۲۴).');
  }
  return { valid: issues.length === 0, requiresServerSync, issues };
}

export function evaluateSecurityAndPreferencePolicy(params: {
  type: NotificationType;
  priority: NotificationPriority;
  requestedDisableMandatorySecurity?: boolean;
  quietHoursTimezone?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  implicitWebPushWithoutUserAction?: boolean;
  consentStatus?: ConsentStatus;
  marketingRequested?: boolean;
}): { allowed: boolean; decision: PolicyDecision; crossesMidnight: boolean; issues: string[] } {
  const issues: string[] = [];
  if (params.type === 'security' && params.requestedDisableMandatorySecurity) {
    issues.push('کاربر نمی‌تواند الزامات امنیتی و قانونی را از تنظیمات فرانت‌اند غیرفعال کند (§۲۳.۳.۶ و §۲۳.۲۱).');
  }
  if (params.quietHoursTimezone !== undefined && !params.quietHoursTimezone.trim()) {
    issues.push('Quiet Hours نیازمند IANA Timezone صریح و اجرا در Backend است (§۲۳.۱۷).');
  }
  const crossesMidnight = Boolean(params.quietHoursStart && params.quietHoursEnd && params.quietHoursStart > params.quietHoursEnd);
  if (params.implicitWebPushWithoutUserAction) {
    issues.push('ثبت Push Subscription بدون تعامل و تأیید صریح کاربر مجاز نیست (§۲۳.۱۵.۳ و §۲۳.۴۰).');
  }
  if (params.marketingRequested && params.consentStatus && params.consentStatus !== 'granted') {
    issues.push('Consent از ترجیح نمایشی جداست و ارسال بدون وضعیت granted مجاز نیست (§۲۳.۱۶).');
  }
  const decision: PolicyDecision = issues.length > 0 ? 'deny' : params.priority === 'low' ? 'suppress_optional' : 'allow';
  return { allowed: issues.length === 0, decision, crossesMidnight, issues };
}

export function buildNotificationIdempotencyKeys(params: {
  notificationId: string;
  channel: NotificationChannel;
  recipientId: string;
}): { deliveryKey: string } {
  return {
    deliveryKey: `${params.notificationId}:${params.channel}:${params.recipientId}`,
  };
}

export function evaluateNotificationDeepLink(params: {
  routeKey: string;
  rawExternalUrl?: string;
  allowedRouteKeys: string[];
  queryHasSensitivePii?: boolean;
  requiresAuthentication: boolean;
  isAuthenticated: boolean;
  hasEntityPermission: boolean;
}): { safeToNavigate: boolean; blockedReasonFa?: string } {
  if (params.rawExternalUrl) {
    return { safeToNavigate: false, blockedReasonFa: 'اجرای URL آزاد از محتوای پیام مسدود شد (مقصد فقط از Route Registry، §۲۳.۸).' };
  }
  if (!params.allowedRouteKeys.includes(params.routeKey)) {
    return { safeToNavigate: false, blockedReasonFa: 'مسیر مقصد در Route Registry معتبر یافت نشد (§۲۳.۸).' };
  }
  if (params.queryHasSensitivePii) {
    return { safeToNavigate: false, blockedReasonFa: 'قرار دادن اطلاعات شخصی در URL یا Query String ممنوع است (§۲۳.۲۸.۲).' };
  }
  if (params.requiresAuthentication && !params.isAuthenticated) {
    return { safeToNavigate: false, blockedReasonFa: 'نشست معتبر نیست؛ هدایت به ورود با حفظ Context مقصد (§۲۳.۸).' };
  }
  if (!params.hasEntityPermission) {
    return { safeToNavigate: false, blockedReasonFa: 'Deep Link مجوز دسترسی ایجاد نمی‌کند؛ دسترسی در Backend رد شد (§۲۳.۸ و §۲۳.۲۸.۱).' };
  }
  return { safeToNavigate: true };
}

export function sanitizeNotificationTelemetry(params: {
  eventName: string;
  payload: Record<string, unknown>;
}): { sanitizedPayload: Record<string, unknown>; strippedKeys: string[] } {
  const blocked = new Set([
    'privateMessageText',
    'emailContent',
    'smsContent',
    'authCredentials',
    'pushEndpoint',
    'password',
    'paymentInfo',
    'exactLocation',
    'keystrokes',
  ]);
  const sanitizedPayload: Record<string, unknown> = {};
  const strippedKeys: string[] = [];
  for (const [k, v] of Object.entries(params.payload)) {
    if (blocked.has(k)) strippedKeys.push(k);
    else sanitizedPayload[k] = v;
  }
  return { sanitizedPayload, strippedKeys };
}
