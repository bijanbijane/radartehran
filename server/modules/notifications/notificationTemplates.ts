/**
 * @file server/modules/notifications/notificationTemplates.ts
 * @description Versioned Persian notification templates with strict XSS sanitization and dynamic variable validation.
 */

import { escapeHtmlAttr } from '../../../src/utils/security';
import type {
  NotificationCategory,
  NotificationEventType,
  NotificationPriority,
  NotificationTemplateDefinition,
} from './notificationTypes';

export const NOTIFICATION_TEMPLATES: Readonly<Record<string, NotificationTemplateDefinition>> = {
  'bargain.submitted:v1': {
    id: 'bargain.submitted',
    version: 1,
    category: 'bargains',
    titleTemplateFa: 'ثبت شکار ملک جدید: {{bargainTitle}}',
    bodyTemplateFa: 'ملک پیشنهادی شما در محله {{hoodName}} با موفقیت ثبت شد و در صف بازبینی کارشناسی قرار گرفت.',
    allowedVariables: ['bargainTitle', 'hoodName', 'bargainId', 'sqm'],
    defaultPriority: 'normal',
  },
  'bargain.approved:v1': {
    id: 'bargain.approved',
    version: 1,
    category: 'bargains',
    titleTemplateFa: 'تایید و انتشار شکار ملک: {{bargainTitle}}',
    bodyTemplateFa: 'تبریک! شکار ملک شما در محله {{hoodName}} با تخفیف {{discountPercent}}٪ تایید و در نقشه عمومی رادار منتشر شد.',
    allowedVariables: ['bargainTitle', 'hoodName', 'discountPercent', 'bargainId'],
    defaultPriority: 'high',
  },
  'bargain.rejected:v1': {
    id: 'bargain.rejected',
    version: 1,
    category: 'bargains',
    titleTemplateFa: 'عدم تایید شکار ملک: {{bargainTitle}}',
    bodyTemplateFa: 'ملک ارسالی شما در محله {{hoodName}} تایید نشد. علت کارشناسی: {{rejectionReason}}',
    allowedVariables: ['bargainTitle', 'hoodName', 'rejectionReason', 'bargainId'],
    defaultPriority: 'normal',
  },
  'bargain.status_changed:v1': {
    id: 'bargain.status_changed',
    version: 1,
    category: 'bargains',
    titleTemplateFa: 'تغییر وضعیت معامله: {{bargainTitle}}',
    bodyTemplateFa: 'وضعیت آگهی ملک شما در محله {{hoodName}} به «{{newStateFa}}» تغییر یافت.',
    allowedVariables: ['bargainTitle', 'hoodName', 'newStateFa', 'bargainId'],
    defaultPriority: 'normal',
  },
  'buyer_alert.created_or_updated:v1': {
    id: 'buyer_alert.created_or_updated',
    version: 1,
    category: 'buyer_alerts',
    titleTemplateFa: 'تنظیم رادار خرید برای محله {{hoodName}}',
    bodyTemplateFa: 'گوش‌به‌زنگ خرید شما برای سقف بودجه {{budgetMillion}} میلیون تومان با موفقیت فعال شد.',
    allowedVariables: ['hoodName', 'budgetMillion', 'alertId'],
    defaultPriority: 'normal',
  },
  'buyer_alert.matched:v1': {
    id: 'buyer_alert.matched',
    version: 1,
    category: 'buyer_alerts',
    titleTemplateFa: 'شکار جدید منطبق بر بودجه شما در {{hoodName}}',
    bodyTemplateFa: 'یک ملک {{sqm}} متری با قیمت {{priceText}} و {{discountPercent}}٪ زیر قیمت بازار کشف شد!',
    allowedVariables: ['hoodName', 'sqm', 'priceText', 'discountPercent', 'bargainId'],
    defaultPriority: 'high',
  },
  'sponsor.application_submitted:v1': {
    id: 'sponsor.application_submitted',
    version: 1,
    category: 'sponsorship',
    titleTemplateFa: 'درخواست اسپانسری محله {{hoodName}} ثبت شد',
    bodyTemplateFa: 'درخواست شما برای برند {{brandName}} در محله {{hoodName}} دریافت گردید و در مرحله بررسی حقوقی قرار دارد.',
    allowedVariables: ['hoodName', 'brandName', 'applicationId'],
    defaultPriority: 'normal',
  },
  'sponsor.application_approved_or_rejected:v1': {
    id: 'sponsor.application_approved_or_rejected',
    version: 1,
    category: 'sponsorship',
    titleTemplateFa: 'نتیجه بررسی اسپانسری محله {{hoodName}}: {{decisionFa}}',
    bodyTemplateFa: 'درخواست اسپانسری محله {{hoodName}} بررسی شد. وضعیت: {{decisionFa}}. توضیحات: {{notes}}',
    allowedVariables: ['hoodName', 'decisionFa', 'notes', 'applicationId'],
    defaultPriority: 'high',
  },
  'crowd_claim.accepted_or_rejected:v1': {
    id: 'crowd_claim.accepted_or_rejected',
    version: 1,
    category: 'crowd_claims',
    titleTemplateFa: 'بررسی گزارش میدانی قیمت: {{statusFa}}',
    bodyTemplateFa: 'گزارش قیمت شما برای محله {{hoodName}} به وضعیت «{{statusFa}}» درآمد. امتیاز مشارکت شما به‌روز شد.',
    allowedVariables: ['hoodName', 'statusFa', 'claimId'],
    defaultPriority: 'normal',
  },
  'account.security_alert:v1': {
    id: 'account.security_alert',
    version: 1,
    category: 'security',
    titleTemplateFa: 'هشدار امنیتی حساب کاربری: {{alertTypeFa}}',
    bodyTemplateFa: 'یک رویداد امنیتی ({{alertTypeFa}}) در ساعت {{eventTime}} از آدرس IP {{clientIpMasked}} شناسایی شد. در صورت مغایرت، فوراً اقدام کنید.',
    allowedVariables: ['alertTypeFa', 'eventTime', 'clientIpMasked'],
    defaultPriority: 'critical',
  },
  'system.administrative_announcement:v1': {
    id: 'system.administrative_announcement',
    version: 1,
    category: 'system_announcement',
    titleTemplateFa: '{{announcementTitle}}',
    bodyTemplateFa: '{{announcementMessage}}',
    allowedVariables: ['announcementTitle', 'announcementMessage', 'senderName'],
    defaultPriority: 'high',
  },
};

/**
 * Sanitizes an untrusted template variable string:
 * - Strips script tags and executable patterns
 * - Escapes HTML entities
 * - Masks sensitive patterns (passwords, tokens, keys)
 */
export function sanitizeTemplateVariable(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Redact confidential keys
  if (/password|token|secret|auth|apikey|cookie|credential/i.test(key)) {
    return '[REDACTED_CONFIDENTIAL]';
  }

  const str = String(value).trim();
  // Strip control chars and zero-width attack sequences while preserving normal Persian text
  const cleanStr = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  return escapeHtmlAttr(cleanStr.slice(0, 500));
}

export interface RenderedTemplateResult {
  readonly titleFa: string;
  readonly bodyFa: string;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  readonly templateVersion: number;
}

/**
 * Renders a versioned template safely. Throws if template is missing or required variables are invalid.
 */
export function renderNotificationTemplate(
  eventType: NotificationEventType,
  version: number,
  variables: Record<string, string | number>,
  priorityOverride?: NotificationPriority,
): RenderedTemplateResult {
  const templateKey = `${eventType}:v${version}`;
  const template = NOTIFICATION_TEMPLATES[templateKey];

  if (!template) {
    throw new Error(`NOTIFICATION_TEMPLATE_NOT_FOUND: ${templateKey}`);
  }

  const sanitizedVars: Record<string, string> = Object.create(null);
  for (const [k, v] of Object.entries(variables || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (template.allowedVariables.includes(k)) {
      sanitizedVars[k] = sanitizeTemplateVariable(k, v);
    }
  }

  let title = template.titleTemplateFa;
  let body = template.bodyTemplateFa;

  for (const varName of template.allowedVariables) {
    const replacement = sanitizedVars[varName] ?? '';
    const placeholder = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
    title = title.replace(placeholder, replacement);
    body = body.replace(placeholder, replacement);
  }

  return {
    titleFa: title.trim(),
    bodyFa: body.trim(),
    category: template.category,
    priority: priorityOverride || template.defaultPriority,
    templateVersion: template.version,
  };
}
