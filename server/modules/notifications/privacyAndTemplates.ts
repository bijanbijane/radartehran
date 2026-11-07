/**
 * Employee 13 — Template Management & Privacy Redaction Engine
 * (`server/modules/notifications/privacyAndTemplates.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Enforces privacy & template rules:
 *  - Never include unnecessary personal information in messages.
 *  - Do not expose private contact details (emails, phone numbers, national IDs, secrets)
 *    in notification previews.
 *  - Validate template variables and reject unregistered/malformed templates.
 *  - Provide safe redaction in operational logs (`hashRecipientUidForLog`, `redactSensitiveText`).
 */

import crypto from 'node:crypto';
import {
  NotificationCategoryClass,
  NotificationDomainError,
  NotificationEventSource,
  NotificationEventType,
  NotificationTemplateDefinition,
  RenderedNotificationContent,
} from './types.ts';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IRAN_PHONE_PATTERN = /(?:\+98|0098|0)?9\d{9}\b/g;
const INTL_PHONE_PATTERN = /\+\d{7,15}\b/g;
const BEARER_OR_SECRET_PATTERN = /(?:Bearer\s+[A-Za-z0-9._~+/-]+=*|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{16,})/gi;
const NATIONAL_ID_KEY_PATTERN = /(?:nationalId|kodeMelli|کدملی|شماره\s*تماس|ایمیل)\s*[:=]\s*\S+/gi;

const FORBIDDEN_VARIABLE_KEYS = new Set([
  'password',
  'secret',
  'privatekey',
  'accesstoken',
  'refreshtoken',
  'nationalid',
  'kodemelli',
  'rawphone',
  'rawemail',
  'creditcard',
]);

/**
 * Redacts private contact details (email addresses, phone numbers, bearer tokens, national IDs)
 * from any string used in notification previews or operational logs.
 */
export function redactPrivateContactDetails(input: string): string {
  if (!input) return '';
  return input
    .replace(BEARER_OR_SECRET_PATTERN, '[REDACTED_SECRET]')
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(IRAN_PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(INTL_PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(NATIONAL_ID_KEY_PATTERN, '[REDACTED_PII]');
}

/**
 * Produces a non-reversible pseudonymous hash of a user UID for operational logs.
 */
export function hashRecipientUidForLog(recipientUid: string): string {
  return `uid_${crypto.createHash('sha256').update(recipientUid, 'utf8').digest('hex').slice(0, 12)}`;
}

/**
 * Sanitizes event variables before storing in the durable outbox, stripping forbidden PII keys
 * and redacting accidental raw contact details.
 */
export function sanitizeEventVariables(
  variables: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(variables ?? {})) {
    const normalizedKey = key.trim().toLowerCase().replace(/[_-]/g, '');
    if (FORBIDDEN_VARIABLE_KEYS.has(normalizedKey)) {
      continue;
    }
    if (typeof value === 'string') {
      clean[key] = redactPrivateContactDetails(value.trim()).slice(0, 280);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return clean;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: readonly NotificationTemplateDefinition[] = [
  {
    templateId: 'tpl_bargain_published_v1',
    source: 'BARGAINS',
    eventType: 'BARGAIN_PUBLISHED',
    categoryClass: 'MARKET_ALERT',
    requiredVariables: ['hoodNameFa', 'discountPercent'],
    subjectTemplateFa: 'فرصت شکار جدید در محله {{hoodNameFa}}',
    previewTemplateFa: 'آگهی زیر قیمت بازار در {{hoodNameFa}} ثبت شد.',
    bodyTemplateFa: 'یک ملک شکار در محله {{hoodNameFa}} با {{discountPercent}}٪ اختلاف نسبت به شاخص محله منتشر شد.',
    defaultActionPath: '/bargains',
    version: 1,
  },
  {
    templateId: 'tpl_bargain_price_drop_v1',
    source: 'BARGAINS',
    eventType: 'BARGAIN_PRICE_DROP',
    categoryClass: 'MARKET_ALERT',
    requiredVariables: ['hoodNameFa', 'dropPercent'],
    subjectTemplateFa: 'کاهش قیمت ملک منتخب در {{hoodNameFa}}',
    previewTemplateFa: 'کاهش قیمت {{dropPercent}}٪ در {{hoodNameFa}} ثبت شد.',
    bodyTemplateFa: 'قیمت ملک نشان‌شده شما در {{hoodNameFa}} به میزان {{dropPercent}}٪ کاهش یافت.',
    defaultActionPath: '/bargains',
    version: 1,
  },
  {
    templateId: 'tpl_buyer_alert_match_v1',
    source: 'BUYER_ALERTS',
    eventType: 'BUYER_ALERT_MATCH_FOUND',
    categoryClass: 'MARKET_ALERT',
    requiredVariables: ['hoodNameFa', 'matchCount'],
    subjectTemplateFa: 'یافتن {{matchCount}} مورد منطبق با هشدار خرید در {{hoodNameFa}}',
    previewTemplateFa: '{{matchCount}} مورد جدید منطبق با فیلتر شما در {{hoodNameFa}}.',
    bodyTemplateFa: 'بر اساس هشدار خرید فعال شما در محله {{hoodNameFa}}، {{matchCount}} مورد جدید شناسایی شد.',
    defaultActionPath: '/alerts',
    version: 1,
  },
  {
    templateId: 'tpl_sponsor_campaign_approved_v1',
    source: 'SPONSORSHIP',
    eventType: 'SPONSOR_CAMPAIGN_APPROVED',
    categoryClass: 'SERVICE_TRANSACTIONAL',
    requiredVariables: ['hoodNameFa', 'campaignTitleFa'],
    subjectTemplateFa: 'تأیید کمپین حامی محله {{hoodNameFa}}',
    previewTemplateFa: 'کمپین حامی شما در {{hoodNameFa}} فعال شد.',
    bodyTemplateFa: 'کمپین «{{campaignTitleFa}}» برای محله {{hoodNameFa}} بررسی و فعال‌سازی شد.',
    defaultActionPath: '/sponsors',
    version: 1,
  },
  {
    templateId: 'tpl_sponsor_campaign_expiring_v1',
    source: 'SPONSORSHIP',
    eventType: 'SPONSOR_CAMPAIGN_EXPIRING',
    categoryClass: 'PROMOTIONAL_SPONSORSHIP',
    requiredVariables: ['hoodNameFa', 'daysRemaining'],
    subjectTemplateFa: 'یادآوری انقضای جایگاه حامی در {{hoodNameFa}}',
    previewTemplateFa: '{{daysRemaining}} روز تا پایان دوره حامی در {{hoodNameFa}}.',
    bodyTemplateFa: 'تنها {{daysRemaining}} روز تا پایان دوره نمایش جایگاه حامی در محله {{hoodNameFa}} باقی مانده است.',
    defaultActionPath: '/sponsors',
    version: 1,
  },
  {
    templateId: 'tpl_service_quote_received_v1',
    source: 'SERVICE_MARKETPLACE',
    eventType: 'SERVICE_QUOTE_RECEIVED',
    categoryClass: 'SERVICE_TRANSACTIONAL',
    requiredVariables: ['serviceTypeFa', 'requestRef'],
    subjectTemplateFa: 'پیشنهاد قیمت جدید برای خدمات {{serviceTypeFa}}',
    previewTemplateFa: 'پیشنهاد جدید برای درخواست {{requestRef}} ثبت شد.',
    bodyTemplateFa: 'متخصص منتخب برای درخواست خدمات «{{serviceTypeFa}}» (کد {{requestRef}}) پیشنهاد قیمت ثبت کرد.',
    defaultActionPath: '/services',
    version: 1,
  },
  {
    templateId: 'tpl_pro_verification_approved_v1',
    source: 'PROFESSIONAL_VERIFICATION',
    eventType: 'PRO_VERIFICATION_APPROVED',
    categoryClass: 'SERVICE_TRANSACTIONAL',
    requiredVariables: ['credentialTierFa'],
    subjectTemplateFa: 'تأیید احراز هویت حرفه‌ای ({{credentialTierFa}})',
    previewTemplateFa: 'نشان احراز هویت حرفه‌ای شما فعال شد.',
    bodyTemplateFa: 'مدارک حرفه‌ای شما بررسی شد و نشان «{{credentialTierFa}}» در پروفایل شما فعال گردید.',
    defaultActionPath: '/profile/verification',
    version: 1,
  },
  {
    templateId: 'tpl_pro_verification_rejected_v1',
    source: 'PROFESSIONAL_VERIFICATION',
    eventType: 'PRO_VERIFICATION_REJECTED',
    categoryClass: 'SERVICE_TRANSACTIONAL',
    requiredVariables: ['reviewReasonFa'],
    subjectTemplateFa: 'نیاز به اصلاح مدارک احراز هویت حرفه‌ای',
    previewTemplateFa: 'مدارک ارسالی نیازمند بازبینی مجدد است.',
    bodyTemplateFa: 'درخواست احراز هویت حرفه‌ای شما به دلیل «{{reviewReasonFa}}» نیازمند تکمیل مدارک است.',
    defaultActionPath: '/profile/verification',
    version: 1,
  },
  {
    templateId: 'tpl_crowd_claim_moderated_v1',
    source: 'CROWD_CLAIMS',
    eventType: 'CROWD_CLAIM_MODERATED',
    categoryClass: 'SERVICE_TRANSACTIONAL',
    requiredVariables: ['hoodNameFa', 'moderationOutcomeFa'],
    subjectTemplateFa: 'نتیجه بررسی گزارش میدانی در {{hoodNameFa}}',
    previewTemplateFa: 'وضعیت گزارش میدانی شما در {{hoodNameFa}}: {{moderationOutcomeFa}}.',
    bodyTemplateFa: 'گزارش میدانی ثبت‌شده شما برای محله {{hoodNameFa}} بررسی شد و به وضعیت «{{moderationOutcomeFa}}» تغییر یافت.',
    defaultActionPath: '/crowd-claims',
    version: 1,
  },
  {
    templateId: 'tpl_market_pulse_anomaly_v1',
    source: 'MARKET_ANALYTICS',
    eventType: 'MARKET_PULSE_ANOMALY_DETECTED',
    categoryClass: 'MARKET_ALERT',
    requiredVariables: ['cityNameFa', 'hoodNameFa', 'changePercent'],
    subjectTemplateFa: 'هشدار نوسان شاخص بازار در {{hoodNameFa}} ({{cityNameFa}})',
    previewTemplateFa: 'تغییر {{changePercent}}٪ در شاخص محله {{hoodNameFa}}.',
    bodyTemplateFa: 'تحلیل داده‌های بازار نشان‌دهنده تغییر {{changePercent}}٪ در میانگین قیمت محله {{hoodNameFa}} ({{cityNameFa}}) است.',
    defaultActionPath: '/analytics',
    version: 1,
  },
  {
    templateId: 'tpl_account_export_ready_v1',
    source: 'ACCOUNT_LIFECYCLE',
    eventType: 'ACCOUNT_EXPORT_READY',
    categoryClass: 'CRITICAL_TRANSACTIONAL',
    requiredVariables: ['exportId'],
    subjectTemplateFa: 'فایل خروجی داده‌های حساب کاربری آماده دریافت است',
    previewTemplateFa: 'بسته خروجی داده‌های کاربری آماده شد.',
    bodyTemplateFa: 'پردازش درخواست خروجی داده‌های حساب کاربری (شناسه {{exportId}}) تکمیل شد و از بخش حریم خصوصی قابل دریافت است.',
    defaultActionPath: '/account/privacy',
    version: 1,
  },
  {
    templateId: 'tpl_account_deletion_initiated_v1',
    source: 'ACCOUNT_LIFECYCLE',
    eventType: 'ACCOUNT_DELETION_INITIATED',
    categoryClass: 'CRITICAL_TRANSACTIONAL',
    requiredVariables: ['jobId'],
    subjectTemplateFa: 'هشدار امنیتی: آغاز فرآیند حذف حساب کاربری',
    previewTemplateFa: 'فرآیند حذف حساب کاربری شما آغاز شد.',
    bodyTemplateFa: 'درخواست حذف کامل حساب کاربری (شناسه پیگیری {{jobId}}) ثبت شد و حساب در وضعیت مسدودیت نوشتن قرار گرفت.',
    defaultActionPath: '/account/privacy',
    version: 1,
  },
] as const;

export class NotificationTemplateRegistry {
  private readonly byTemplateId = new Map<string, NotificationTemplateDefinition>();
  private readonly bySourceAndEvent = new Map<string, NotificationTemplateDefinition>();

  constructor(initialTemplates: readonly NotificationTemplateDefinition[] = DEFAULT_NOTIFICATION_TEMPLATES) {
    for (const tpl of initialTemplates) {
      this.registerTemplate(tpl);
    }
  }

  public registerTemplate(template: NotificationTemplateDefinition): void {
    if (!template.templateId || !template.subjectTemplateFa || !template.previewTemplateFa || !template.bodyTemplateFa) {
      throw new NotificationDomainError(
        'INVALID_EVENT_CONTRACT',
        'Template definition must include templateId, subjectTemplateFa, previewTemplateFa, and bodyTemplateFa.',
      );
    }
    // Verify the preview template itself does not hardcode raw contact details
    const redactedPreviewCheck = redactPrivateContactDetails(template.previewTemplateFa);
    if (redactedPreviewCheck !== template.previewTemplateFa) {
      throw new NotificationDomainError(
        'PRIVACY_CONTACT_LEAK_IN_PREVIEW',
        `Template "${template.templateId}" contains raw contact details in previewTemplateFa.`,
      );
    }
    this.byTemplateId.set(template.templateId, template);
    this.bySourceAndEvent.set(`${template.source}:${template.eventType}`, template);
  }

  public resolveTemplate(params: {
    source: NotificationEventSource;
    eventType: NotificationEventType;
    templateId?: string;
  }): NotificationTemplateDefinition {
    if (params.templateId) {
      const explicit = this.byTemplateId.get(params.templateId);
      if (!explicit || explicit.source !== params.source || explicit.eventType !== params.eventType) {
        throw new NotificationDomainError(
          'TEMPLATE_NOT_FOUND',
          `Template "${params.templateId}" is not registered for ${params.source}:${params.eventType}.`,
          404,
        );
      }
      return explicit;
    }
    const found = this.bySourceAndEvent.get(`${params.source}:${params.eventType}`);
    if (!found) {
      throw new NotificationDomainError(
        'TEMPLATE_NOT_FOUND',
        `No template registered for ${params.source}:${params.eventType}.`,
        404,
      );
    }
    return found;
  }

  public renderTemplate(
    template: NotificationTemplateDefinition,
    variables: Record<string, string | number | boolean>,
  ): RenderedNotificationContent {
    for (const reqKey of template.requiredVariables) {
      const val = variables[reqKey];
      if (val === undefined || val === null || String(val).trim() === '') {
        throw new NotificationDomainError(
          'MISSING_TEMPLATE_VARIABLE',
          `Missing required variable "${reqKey}" for template "${template.templateId}".`,
          400,
        );
      }
    }

    const interpolate = (rawTpl: string): string =>
      rawTpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, varName: string) => {
        const rawVal = variables[varName];
        if (rawVal === undefined || rawVal === null) return '';
        return redactPrivateContactDetails(String(rawVal));
      });

    const subjectFa = redactPrivateContactDetails(interpolate(template.subjectTemplateFa));
    const previewFa = redactPrivateContactDetails(interpolate(template.previewTemplateFa));
    const bodyFa = redactPrivateContactDetails(interpolate(template.bodyTemplateFa));

    return {
      templateId: template.templateId,
      subjectFa,
      previewFa,
      bodyFa,
      actionPath: template.defaultActionPath,
    };
  }
}

export function resolveEventCategoryClass(
  source: NotificationEventSource,
  eventType: NotificationEventType,
): NotificationCategoryClass {
  if (source === 'ACCOUNT_LIFECYCLE') return 'CRITICAL_TRANSACTIONAL';
  if (eventType === 'SPONSOR_CAMPAIGN_EXPIRING') return 'PROMOTIONAL_SPONSORSHIP';
  if (source === 'BARGAINS' || source === 'BUYER_ALERTS' || source === 'MARKET_ANALYTICS') {
    return 'MARKET_ALERT';
  }
  return 'SERVICE_TRANSACTIONAL';
}
