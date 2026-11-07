import type { ValidationIssue, ValidationResult } from '../core';
import type {
  NotificationChannel,
  NotificationEventType,
  SendAdminAnnouncementInput,
  SendDirectNotificationInput,
  StoredNotificationTemplate,
  UpdateNotificationPreferencesInput,
} from './types';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

const TEMPLATE_VAR_REGEX = /^\{\{([a-zA-Z0-9_]+)\}\}$/;
const ALLOWED_CHANNELS: readonly NotificationChannel[] = ['in_app', 'email', 'sms'];

/**
 * Built-in canonical Persian templates for all required system events.
 */
export const CANONICAL_NOTIFICATION_TEMPLATES: Record<string, Omit<StoredNotificationTemplate, 'createdAt' | 'updatedAt'>> = {
  'bargain.submitted': {
    id: 'bargain.submitted',
    templateVersion: '1.0.0',
    category: 'bargains',
    eventType: 'bargain.submitted',
    titlePatternFa: 'فرصت سرمایه‌گذاری جدید ثبت شد',
    bodyPatternFa: 'ملک شما با کد پیگیری {{trackingCode}} با موفقیت ثبت شد و در انتظار بررسی ناظر است.',
    allowedVariables: ['trackingCode', 'hoodName'],
    defaultChannels: ['in_app', 'sms'],
    deepLinkPattern: '/bargains/{{trackingCode}}',
  },
  'bargain.approved': {
    id: 'bargain.approved',
    templateVersion: '1.0.0',
    category: 'bargains',
    eventType: 'bargain.approved',
    titlePatternFa: 'فرصت سرمایه‌گذاری تایید شد',
    bodyPatternFa: 'ملک شما در محله {{hoodName}} با کد {{trackingCode}} تایید و در رادار تهران منتشر شد.',
    allowedVariables: ['trackingCode', 'hoodName'],
    defaultChannels: ['in_app', 'sms'],
    deepLinkPattern: '/bargains/{{trackingCode}}',
  },
  'bargain.rejected': {
    id: 'bargain.rejected',
    templateVersion: '1.0.0',
    category: 'bargains',
    eventType: 'bargain.rejected',
    titlePatternFa: 'عدم تایید فرصت سرمایه‌گذاری',
    bodyPatternFa: 'ملک شما با کد {{trackingCode}} تایید نشد. دلیل: {{reason}}',
    allowedVariables: ['trackingCode', 'reason'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/bargains/{{trackingCode}}',
  },
  'bargain.status_changed': {
    id: 'bargain.status_changed',
    templateVersion: '1.0.0',
    category: 'bargains',
    eventType: 'bargain.status_changed',
    titlePatternFa: 'تغییر وضعیت فرصت سرمایه‌گذاری',
    bodyPatternFa: 'وضعیت آگهی با کد {{trackingCode}} به {{newStatus}} تغییر یافت.',
    allowedVariables: ['trackingCode', 'newStatus'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/bargains/{{trackingCode}}',
  },
  'buyer_alert.created': {
    id: 'buyer_alert.created',
    templateVersion: '1.0.0',
    category: 'buyer_alerts',
    eventType: 'buyer_alert.created',
    titlePatternFa: 'هشدار خرید جدید فعال شد',
    bodyPatternFa: 'هشدار جستجوی شما برای محله {{hoodName}} با موفقیت فعال گردید.',
    allowedVariables: ['alertId', 'hoodName'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/buyer-alerts/{{alertId}}',
  },
  'buyer_alert.updated': {
    id: 'buyer_alert.updated',
    templateVersion: '1.0.0',
    category: 'buyer_alerts',
    eventType: 'buyer_alert.updated',
    titlePatternFa: 'بروزرسانی هشدار خرید',
    bodyPatternFa: 'مشخصات هشدار خرید محله {{hoodName}} با موفقیت به‌روزرسانی شد.',
    allowedVariables: ['alertId', 'hoodName'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/buyer-alerts/{{alertId}}',
  },
  'sponsor.application_submitted': {
    id: 'sponsor.application_submitted',
    templateVersion: '1.0.0',
    category: 'sponsorship',
    eventType: 'sponsor.application_submitted',
    titlePatternFa: 'درخواست اسپانسری ثبت شد',
    bodyPatternFa: 'درخواست جایگاه تبلیغاتی شما با کد پیگیری {{trackingCode}} ثبت و در انتظار بررسی است.',
    allowedVariables: ['trackingCode', 'hoodName'],
    defaultChannels: ['in_app', 'sms'],
    deepLinkPattern: '/sponsors/{{trackingCode}}',
  },
  'sponsor.application_approved': {
    id: 'sponsor.application_approved',
    templateVersion: '1.0.0',
    category: 'sponsorship',
    eventType: 'sponsor.application_approved',
    titlePatternFa: 'درخواست اسپانسری تایید شد',
    bodyPatternFa: 'جایگاه اسپانسری شما برای محله {{hoodName}} تایید شد. لطفا نسبت به نهایی‌سازی پرداخت اقدام فرمایید.',
    allowedVariables: ['trackingCode', 'hoodName'],
    defaultChannels: ['in_app', 'sms'],
    deepLinkPattern: '/sponsors/{{trackingCode}}',
  },
  'sponsor.application_rejected': {
    id: 'sponsor.application_rejected',
    templateVersion: '1.0.0',
    category: 'sponsorship',
    eventType: 'sponsor.application_rejected',
    titlePatternFa: 'عدم تایید درخواست اسپانسری',
    bodyPatternFa: 'درخواست اسپانسری با کد {{trackingCode}} به دلیل {{reason}} تایید نشد.',
    allowedVariables: ['trackingCode', 'reason'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/sponsors/{{trackingCode}}',
  },
  'crowd_claim.accepted': {
    id: 'crowd_claim.accepted',
    templateVersion: '1.0.0',
    category: 'crowd_claims',
    eventType: 'crowd_claim.accepted',
    titlePatternFa: 'گزارش مردمی پذیرفته شد',
    bodyPatternFa: 'گزارش شما در رابطه با ملک {{listingId}} مورد تایید ناظران قرار گرفت.',
    allowedVariables: ['claimId', 'listingId'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/claims/{{claimId}}',
  },
  'crowd_claim.rejected': {
    id: 'crowd_claim.rejected',
    templateVersion: '1.0.0',
    category: 'crowd_claims',
    eventType: 'crowd_claim.rejected',
    titlePatternFa: 'عدم تایید گزارش مردمی',
    bodyPatternFa: 'گزارش مردمی شما بررسی و رد گردید.',
    allowedVariables: ['claimId'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '/claims/{{claimId}}',
  },
  'account.security_alert': {
    id: 'account.security_alert',
    templateVersion: '1.0.0',
    category: 'security',
    eventType: 'account.security_alert',
    titlePatternFa: 'هشدار امنیتی حساب کاربری',
    bodyPatternFa: 'یک رویداد امنیتی حساس ({{actionName}}) در حساب کاربری شما از آدرس {{ipAddress}} ثبت شد.',
    allowedVariables: ['actionName', 'ipAddress'],
    defaultChannels: ['in_app', 'sms'],
  },
  'admin.announcement': {
    id: 'admin.announcement',
    templateVersion: '1.0.0',
    category: 'administrative',
    eventType: 'admin.announcement',
    titlePatternFa: 'اطلاعیه مدیریت رادار تهران',
    bodyPatternFa: '{{messageFa}}',
    allowedVariables: ['messageFa'],
    defaultChannels: ['in_app'],
    deepLinkPattern: '{{deepLink}}',
  },
};

/**
 * Escapes any raw text to prevent executable HTML or script injection.
 */
export function sanitizePlainFaText(input: unknown, maxLen = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>'"&]/g, (ch) => {
      switch (ch) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        case '&': return '&amp;';
        default: return ch;
      }
    })
    .trim()
    .slice(0, maxLen);
}

/**
 * Renders a versioned template safely with strict variable validation.
 */
export function renderTemplateContent(
  template: StoredNotificationTemplate | Omit<StoredNotificationTemplate, 'createdAt' | 'updatedAt'>,
  variables: Record<string, unknown>,
): {
  ok: boolean;
  titleFa: string;
  bodyFa: string;
  deepLink?: string;
  sanitizedVariables: Record<string, string>;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const sanitizedVariables: Record<string, string> = {};

  // Check required variables
  for (const allowedVar of template.allowedVariables) {
    const rawVal = variables[allowedVar];
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
      issues.push({
        field: `variables.${allowedVar}`,
        code: 'REQUIRED_FIELD_MISSING',
        message: `Missing template variable "${allowedVar}".`,
      });
    } else {
      sanitizedVariables[allowedVar] = sanitizePlainFaText(String(rawVal), 200);
    }
  }

  // Check for unauthorized variable injection
  for (const key of Object.keys(variables)) {
    if (!template.allowedVariables.includes(key)) {
      issues.push({
        field: `variables.${key}`,
        code: 'UNKNOWN_FIELD_REJECTED',
        message: `Variable "${key}" is not permitted by template "${template.id}".`,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, titleFa: '', bodyFa: '', sanitizedVariables, issues };
  }

  let titleFa = template.titlePatternFa;
  let bodyFa = template.bodyPatternFa;
  let deepLink = template.deepLinkPattern;

  for (const [k, v] of Object.entries(sanitizedVariables)) {
    titleFa = titleFa.replaceAll(`{{${k}}}`, v);
    bodyFa = bodyFa.replaceAll(`{{${k}}}`, v);
    if (deepLink) {
      deepLink = deepLink.replaceAll(`{{${k}}}`, encodeURIComponent(v));
    }
  }

  return { ok: true, titleFa, bodyFa, deepLink, sanitizedVariables, issues: [] };
}

export function validateSendDirectInput(raw: unknown): ValidationResult<SendDirectNotificationInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const issues: ValidationIssue[] = [];

  const recipientUid = typeof raw.recipientUid === 'string' ? raw.recipientUid.trim() : '';
  if (!recipientUid || recipientUid.length < 3) {
    issues.push({ field: 'recipientUid', code: 'REQUIRED_FIELD_MISSING', message: 'Valid recipientUid is required.' });
  }

  const templateId = typeof raw.templateId === 'string' ? raw.templateId.trim() : '';
  if (!templateId || !CANONICAL_NOTIFICATION_TEMPLATES[templateId]) {
    issues.push({ field: 'templateId', code: 'INVALID_ENUM_VALUE', message: `Unknown templateId "${templateId}".` });
  }

  const variables = isPlainObject(raw.variables) ? (raw.variables as Record<string, string | number>) : {};

  const channels: NotificationChannel[] = [];
  if (Array.isArray(raw.channels)) {
    for (const ch of raw.channels) {
      if (ALLOWED_CHANNELS.includes(ch)) {
        channels.push(ch);
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    value: {
      recipientUid,
      templateId,
      variables,
      ...(channels.length > 0 ? { channels } : {}),
    },
  };
}

export function validateAnnouncementInput(raw: unknown): ValidationResult<SendAdminAnnouncementInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const issues: ValidationIssue[] = [];

  const titleFa = typeof raw.titleFa === 'string' ? raw.titleFa.trim() : '';
  if (titleFa.length < 3 || titleFa.length > 120) {
    issues.push({ field: 'titleFa', code: 'STRING_TOO_SHORT', message: 'titleFa must be 3-120 characters.' });
  }

  const bodyFa = typeof raw.bodyFa === 'string' ? raw.bodyFa.trim() : '';
  if (bodyFa.length < 5 || bodyFa.length > 500) {
    issues.push({ field: 'bodyFa', code: 'STRING_TOO_SHORT', message: 'bodyFa must be 5-500 characters.' });
  }

  const broadcastToAll = raw.broadcastToAll === true;
  const targetRecipientUids: string[] = [];
  if (Array.isArray(raw.targetRecipientUids)) {
    for (const uid of raw.targetRecipientUids) {
      if (typeof uid === 'string' && uid.trim().length >= 3) {
        targetRecipientUids.push(uid.trim());
      }
    }
  }

  if (!broadcastToAll && targetRecipientUids.length === 0) {
    issues.push({
      field: 'targetRecipientUids',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'Must provide targetRecipientUids or set broadcastToAll: true.',
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    value: {
      titleFa,
      bodyFa,
      broadcastToAll,
      ...(targetRecipientUids.length > 0 ? { targetRecipientUids } : {}),
      ...(typeof raw.deepLink === 'string' ? { deepLink: raw.deepLink.trim() } : {}),
    },
  };
}

export function validatePreferencesInput(raw: unknown): ValidationResult<UpdateNotificationPreferencesInput> {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ field: '$body', code: 'INVALID_TYPE', message: 'Body must be an object.' }] };
  }
  const result: UpdateNotificationPreferencesInput = {};
  if (typeof raw.inAppEnabled === 'boolean') result.inAppEnabled = raw.inAppEnabled;
  if (typeof raw.emailEnabled === 'boolean') result.emailEnabled = raw.emailEnabled;
  if (typeof raw.smsEnabled === 'boolean') result.smsEnabled = raw.smsEnabled;
  if (typeof raw.promotionalEnabled === 'boolean') result.promotionalEnabled = raw.promotionalEnabled;

  return { ok: true, issues: [], value: result };
}
