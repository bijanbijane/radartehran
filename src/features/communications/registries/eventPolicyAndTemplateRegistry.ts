/** @file src/features/communications/registries/eventPolicyAndTemplateRegistry.ts — Policy & Versioned RTL Template Registry */
import { sanitizeInput } from '../../../utils/security';
import type {
  CommsCategoryCode,
  CommsEventCode,
  CommsTemplateVersion,
  EventPolicyDefinition,
} from '../types/comms.types';

export const COMMS_CATEGORY_META: ReadonlyArray<{
  code: CommsCategoryCode;
  labelFa: string;
  groupFa: 'بازار و املاک' | 'خدمات و ارزش‌گذاری' | 'جامعه و دانش' | 'حساب و امنیت' | 'پشتیبانی و عملیات';
}> = [
  { code: 'LISTING', labelFa: 'آگهی و فایل', groupFa: 'بازار و املاک' },
  { code: 'PROPERTY', labelFa: 'ملک و دیده‌بان', groupFa: 'بازار و املاک' },
  { code: 'MARKET', labelFa: 'هشدار بازار', groupFa: 'بازار و املاک' },
  { code: 'VALUATION', labelFa: 'ارزش‌گذاری', groupFa: 'خدمات و ارزش‌گذاری' },
  { code: 'SERVICE', labelFa: 'خدمات متخصصان', groupFa: 'خدمات و ارزش‌گذاری' },
  { code: 'COMMUNITY', labelFa: 'جامعه کاربران', groupFa: 'جامعه و دانش' },
  { code: 'CONTRIBUTION', labelFa: 'اصلاح داده مکانی', groupFa: 'جامعه و دانش' },
  { code: 'KNOWLEDGE', labelFa: 'مرکز دانش', groupFa: 'جامعه و دانش' },
  { code: 'ACCOUNT', labelFa: 'حساب کاربری', groupFa: 'حساب و امنیت' },
  { code: 'SECURITY', labelFa: 'امنیت و ورود', groupFa: 'حساب و امنیت' },
  { code: 'SUPPORT', labelFa: 'پشتیبانی', groupFa: 'پشتیبانی و عملیات' },
  { code: 'SYSTEM', labelFa: 'اعلان سامانه', groupFa: 'پشتیبانی و عملیات' },
  { code: 'ADMIN', labelFa: 'عملیات حاکمیت', groupFa: 'پشتیبانی و عملیات' },
];

export const EVENT_POLICY_REGISTRY: Record<CommsEventCode, EventPolicyDefinition> = {
  'LISTING.APPROVED': {
    eventCode: 'LISTING.APPROVED', category: 'LISTING', severity: 'NOTICE', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 60, expiresInHours: 720, fallbackChannel: 'IN_APP',
    descriptionFa: 'تأیید و انتشار آگهی ثبت‌شده کاربر در فهرست املاک',
  },
  'LISTING.REJECTED': {
    eventCode: 'LISTING.REJECTED', category: 'LISTING', severity: 'WARNING', urgency: 'HIGH',
    defaultPriority: 'HIGH', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: true, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 30, expiresInHours: 720, fallbackChannel: 'IN_APP',
    descriptionFa: 'نیازمندی آگهی به اصلاح مشخصات یا مدارک مالکیت',
  },
  'LISTING.PRICE_DROPPED': {
    eventCode: 'LISTING.PRICE_DROPPED', category: 'PROPERTY', severity: 'INFO', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.standard', defaultChannels: ['IN_APP', 'PUSH'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 240, expiresInHours: 336,
    descriptionFa: 'تغییر قیمت فایل ذخیره‌شده در فهرست علاقه‌مندی کاربر',
  },
  'SERVICE.REQUEST_CREATED': {
    eventCode: 'SERVICE.REQUEST_CREATED', category: 'SERVICE', severity: 'NOTICE', urgency: 'HIGH',
    defaultPriority: 'HIGH', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'SMS', 'EMAIL'],
    requiresUserAction: true, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 15, expiresInHours: 720, fallbackChannel: 'IN_APP',
    descriptionFa: 'ثبت درخواست خدمت جدید مرتبط با ملک برای متخصص',
  },
  'SERVICE.PROPOSAL_RECEIVED': {
    eventCode: 'SERVICE.PROPOSAL_RECEIVED', category: 'SERVICE', severity: 'NOTICE', urgency: 'HIGH',
    defaultPriority: 'HIGH', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'PUSH', 'EMAIL'],
    requiresUserAction: true, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 10, expiresInHours: 720, fallbackChannel: 'IN_APP',
    descriptionFa: 'دریافت پیشنهاد قیمت یا زمان‌بندی جدید از متخصص',
  },
  'PROPERTY.WATCHLIST_MATCH': {
    eventCode: 'PROPERTY.WATCHLIST_MATCH', category: 'PROPERTY', severity: 'INFO', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.digest', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 180, expiresInHours: 336,
    descriptionFa: 'تطبیق فایل جدید با جست‌وجوی ذخیره‌شده کاربر',
  },
  'MARKET.ALERT_TRIGGERED': {
    eventCode: 'MARKET.ALERT_TRIGGERED', category: 'MARKET', severity: 'INFO', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.digest', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 360, expiresInHours: 336,
    descriptionFa: 'تغییر معنادار در شاخص قیمت یا عرضه محله تحت پایش',
  },
  'VALUATION.REPORT_READY': {
    eventCode: 'VALUATION.REPORT_READY', category: 'VALUATION', severity: 'NOTICE', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: true, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 30, expiresInHours: 720,
    descriptionFa: 'آماده‌شدن خروجی گزارش ارزش‌گذاری ملک کاربر',
  },
  'COMMUNITY.REPLY_RECEIVED': {
    eventCode: 'COMMUNITY.REPLY_RECEIVED', category: 'COMMUNITY', severity: 'INFO', urgency: 'NORMAL',
    defaultPriority: 'LOW', queueName: 'comms.standard', defaultChannels: ['IN_APP'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 15, expiresInHours: 336,
    descriptionFa: 'ثبت پاسخ جدید روی پرسش یا گفت‌وگوی کاربر در جامعه',
  },
  'CONTRIBUTION.PROPOSAL_APPROVED': {
    eventCode: 'CONTRIBUTION.PROPOSAL_APPROVED', category: 'CONTRIBUTION', severity: 'NOTICE', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.transactional', defaultChannels: ['IN_APP'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 60, expiresInHours: 720,
    descriptionFa: 'تأیید و اعمال پیشنهاد اصلاح داده محله در نسخه جدید داده پایه',
  },
  'CONTRIBUTION.PROPOSAL_REJECTED': {
    eventCode: 'CONTRIBUTION.PROPOSAL_REJECTED', category: 'CONTRIBUTION', severity: 'WARNING', urgency: 'NORMAL',
    defaultPriority: 'MEDIUM', queueName: 'comms.transactional', defaultChannels: ['IN_APP'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 60, expiresInHours: 720,
    descriptionFa: 'رد پیشنهاد اصلاح داده محله همراه با دلیل ممیز',
  },
  'KNOWLEDGE.PUBLICATION_UPDATED': {
    eventCode: 'KNOWLEDGE.PUBLICATION_UPDATED', category: 'KNOWLEDGE', severity: 'INFO', urgency: 'LOW',
    defaultPriority: 'LOW', queueName: 'comms.digest', defaultChannels: ['IN_APP'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 720, expiresInHours: 720,
    descriptionFa: 'به‌روزرسانی راهنما یا گزارش تخصصی نشان‌شده توسط کاربر',
  },
  'ACCOUNT.PROFILE_EXPORT_READY': {
    eventCode: 'ACCOUNT.PROFILE_EXPORT_READY', category: 'ACCOUNT', severity: 'NOTICE', urgency: 'HIGH',
    defaultPriority: 'HIGH', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: true, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 10, expiresInHours: 168,
    descriptionFa: 'آماده‌شدن بسته برون‌بری اطلاعات حساب کاربری',
  },
  'SECURITY.NEW_LOGIN': {
    eventCode: 'SECURITY.NEW_LOGIN', category: 'SECURITY', severity: 'CRITICAL', urgency: 'IMMEDIATE',
    defaultPriority: 'CRITICAL', queueName: 'comms.critical', defaultChannels: ['IN_APP', 'EMAIL', 'SMS'],
    requiresUserAction: true, mandatoryNonOptOut: true, bypassQuietHours: true,
    dedupeWindowMinutes: 5, expiresInHours: null, fallbackChannel: 'EMAIL',
    descriptionFa: 'هشدار امنیتی ورود جدید یا نشست ناشناس به حساب کاربری',
  },
  'SECURITY.PASSWORD_CHANGED': {
    eventCode: 'SECURITY.PASSWORD_CHANGED', category: 'SECURITY', severity: 'CRITICAL', urgency: 'IMMEDIATE',
    defaultPriority: 'CRITICAL', queueName: 'comms.critical', defaultChannels: ['IN_APP', 'EMAIL'],
    requiresUserAction: true, mandatoryNonOptOut: true, bypassQuietHours: true,
    dedupeWindowMinutes: 5, expiresInHours: null,
    descriptionFa: 'اطلاع‌رسانی اجباری تغییر تنظیمات امنیتی یا نشست حساب',
  },
  'SUPPORT.TICKET_REPLIED': {
    eventCode: 'SUPPORT.TICKET_REPLIED', category: 'SUPPORT', severity: 'NOTICE', urgency: 'HIGH',
    defaultPriority: 'HIGH', queueName: 'comms.transactional', defaultChannels: ['IN_APP', 'EMAIL', 'INTERNAL_INBOX'],
    requiresUserAction: true, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 5, expiresInHours: 720,
    descriptionFa: 'پاسخ تیم پشتیبانی در گفت‌وگوی مرتبط با تیکت',
  },
  'SYSTEM.MAINTENANCE_NOTICE': {
    eventCode: 'SYSTEM.MAINTENANCE_NOTICE', category: 'SYSTEM', severity: 'WARNING', urgency: 'NORMAL',
    defaultPriority: 'HIGH', queueName: 'comms.standard', defaultChannels: ['IN_APP'],
    requiresUserAction: false, mandatoryNonOptOut: false, bypassQuietHours: false,
    dedupeWindowMinutes: 1440, expiresInHours: 168,
    descriptionFa: 'اعلان سراسری به‌روزرسانی یا نگهداری برنامه‌ریزی‌شده سامانه',
  },
  'ADMIN.ESCALATION_FLAGGED': {
    eventCode: 'ADMIN.ESCALATION_FLAGGED', category: 'ADMIN', severity: 'CRITICAL', urgency: 'IMMEDIATE',
    defaultPriority: 'CRITICAL', queueName: 'comms.critical', defaultChannels: ['IN_APP'],
    requiresUserAction: true, mandatoryNonOptOut: true, bypassQuietHours: true,
    dedupeWindowMinutes: 10, expiresInHours: 336,
    descriptionFa: 'هشدار عملیاتی ارجاع‌شده برای بررسی تیم حاکمیت',
  },
};

export const COMMS_TEMPLATE_REGISTRY: Record<CommsEventCode, CommsTemplateVersion> = {
  'LISTING.APPROVED': {
    templateCode: 'TPL_LISTING_APPROVED', eventCode: 'LISTING.APPROVED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'آگهی «{{listingTitle}}» تأیید و منتشر شد',
    bodyTemplateFa: 'فایل شما در محله {{hoodName}} اکنون در جست‌وجوی املاک قابل مشاهده است.',
    shortPreviewFa: 'انتشار آگهی در {{hoodName}}', ctaLabelFa: 'مشاهده آگهی‌های من',
    requiredVariables: ['listingTitle', 'hoodName'], active: true,
  },
  'LISTING.REJECTED': {
    templateCode: 'TPL_LISTING_REJECTED', eventCode: 'LISTING.REJECTED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'آگهی «{{listingTitle}}» نیازمند اصلاح است',
    bodyTemplateFa: 'دلیل بررسی: {{reasonFa}}. پس از اصلاح مشخصات دوباره ارسال کنید.',
    shortPreviewFa: 'نیازمند اصلاح مشخصات', ctaLabelFa: 'ویرایش آگهی',
    requiredVariables: ['listingTitle', 'reasonFa'], active: true,
  },
  'LISTING.PRICE_DROPPED': {
    templateCode: 'TPL_LISTING_PRICE_DROPPED', eventCode: 'LISTING.PRICE_DROPPED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'کاهش قیمت در فایل نشان‌شده «{{listingTitle}}»',
    bodyTemplateFa: 'قیمت پیشنهادی در {{hoodName}} به {{newPriceFa}} تغییر یافت.',
    shortPreviewFa: 'کاهش قیمت به {{newPriceFa}}', ctaLabelFa: 'بررسی فایل',
    requiredVariables: ['listingTitle', 'hoodName', 'newPriceFa'], active: true,
  },
  'SERVICE.REQUEST_CREATED': {
    templateCode: 'TPL_SERVICE_REQ', eventCode: 'SERVICE.REQUEST_CREATED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'درخواست خدمت جدید برای {{serviceTitle}}',
    bodyTemplateFa: 'جزئیات درخواست در محله {{hoodName}} ثبت شد و گفت‌وگوی مرتبط ایجاد گردید.',
    shortPreviewFa: 'ثبت درخواست خدمت در {{hoodName}}', ctaLabelFa: 'باز کردن پرونده درخواست',
    requiredVariables: ['serviceTitle', 'hoodName'], active: true,
  },
  'SERVICE.PROPOSAL_RECEIVED': {
    templateCode: 'TPL_SERVICE_PROPOSAL', eventCode: 'SERVICE.PROPOSAL_RECEIVED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'پیشنهاد جدید از {{providerName}} دریافت شد',
    bodyTemplateFa: 'خدمت: {{offeringTitle}} · برآورد تعرفه: {{priceFa}}. خواندن اعلان به‌معنای پذیرش نیست.',
    shortPreviewFa: 'پیشنهاد جدید با تعرفه {{priceFa}}', ctaLabelFa: 'بررسی پیشنهاد متخصص',
    requiredVariables: ['providerName', 'offeringTitle', 'priceFa'], active: true,
  },
  'PROPERTY.WATCHLIST_MATCH': {
    templateCode: 'TPL_WATCHLIST_MATCH', eventCode: 'PROPERTY.WATCHLIST_MATCH', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'تطبیق جدید با دیده‌بان «{{watchlistTitle}}»',
    bodyTemplateFa: '{{matchCount}} فایل هم‌تراز با بودجه شما در {{hoodName}} شناسایی شد.',
    shortPreviewFa: '{{matchCount}} مورد جدید در {{hoodName}}', ctaLabelFa: 'مشاهده نتایج',
    requiredVariables: ['watchlistTitle', 'matchCount', 'hoodName'], active: true,
  },
  'MARKET.ALERT_TRIGGERED': {
    templateCode: 'TPL_MARKET_ALERT', eventCode: 'MARKET.ALERT_TRIGGERED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'تغییر شاخص بازار در محله {{hoodName}}',
    bodyTemplateFa: 'میانگین برآورد قیمتی {{hoodName}} تغییر {{deltaFa}} را ثبت کرده است.',
    shortPreviewFa: 'تغییر {{deltaFa}} در {{hoodName}}', ctaLabelFa: 'تحلیل بازار محله',
    requiredVariables: ['hoodName', 'deltaFa'], active: true,
  },
  'VALUATION.REPORT_READY': {
    templateCode: 'TPL_VALUATION_READY', eventCode: 'VALUATION.REPORT_READY', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'گزارش ارزش‌گذاری ملک در {{hoodName}} آماده است',
    bodyTemplateFa: 'بازه برآورد {{rangeFa}} با نسخه مدل {{modelVersion}} ذخیره شد.',
    shortPreviewFa: 'خروجی ارزش‌گذاری {{hoodName}}', ctaLabelFa: 'مشاهده گزارش ارزش‌گذاری',
    requiredVariables: ['hoodName', 'rangeFa', 'modelVersion'], active: true,
  },
  'COMMUNITY.REPLY_RECEIVED': {
    templateCode: 'TPL_COMMUNITY_REPLY', eventCode: 'COMMUNITY.REPLY_RECEIVED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'پاسخ جدید در بحث «{{threadTitle}}»',
    bodyTemplateFa: '{{authorName}} پاسخی در بخش جامعه کاربران برای موضوع محله {{hoodName}} ثبت کرد.',
    shortPreviewFa: 'پاسخ جدید از {{authorName}}', ctaLabelFa: 'خواندن پاسخ در جامعه',
    requiredVariables: ['threadTitle', 'authorName', 'hoodName'], active: true,
  },
  'CONTRIBUTION.PROPOSAL_APPROVED': {
    templateCode: 'TPL_CONTRIB_APPROVED', eventCode: 'CONTRIBUTION.PROPOSAL_APPROVED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'اصلاح داده محله {{hoodName}} تأیید و اعمال شد',
    bodyTemplateFa: 'پیشنهاد شما با نسخه داده {{versionId}} در سامانه به‌روزرسانی گردید.',
    shortPreviewFa: 'اعمال در نسخه {{versionId}}', ctaLabelFa: 'مشاهده تاریخچه مشارکت',
    requiredVariables: ['hoodName', 'versionId'], active: true,
  },
  'CONTRIBUTION.PROPOSAL_REJECTED': {
    templateCode: 'TPL_CONTRIB_REJECTED', eventCode: 'CONTRIBUTION.PROPOSAL_REJECTED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'پیشنهاد اصلاح داده برای {{hoodName}} تأیید نشد',
    bodyTemplateFa: 'یادداشت ممیز: {{reasonFa}}',
    shortPreviewFa: 'نیازمند منبع معتبرتر', ctaLabelFa: 'بررسی جزئیات مشارکت',
    requiredVariables: ['hoodName', 'reasonFa'], active: true,
  },
  'KNOWLEDGE.PUBLICATION_UPDATED': {
    templateCode: 'TPL_KNOWLEDGE_UPDATE', eventCode: 'KNOWLEDGE.PUBLICATION_UPDATED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'به‌روزرسانی گزارش «{{publicationTitle}}»',
    bodyTemplateFa: 'نسخه جدید یادداشت روش‌شناسی و داده‌های پشتیبان منتشر شد.',
    shortPreviewFa: 'نسخه جدید گزارش تحلیلی', ctaLabelFa: 'مطالعه گزارش',
    requiredVariables: ['publicationTitle'], active: true,
  },
  'ACCOUNT.PROFILE_EXPORT_READY': {
    templateCode: 'TPL_EXPORT_READY', eventCode: 'ACCOUNT.PROFILE_EXPORT_READY', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'فایل برون‌بری اطلاعات حساب کاربری آماده است',
    bodyTemplateFa: 'بسته داده بدون اطلاعات محرمانه با شناسه {{exportId}} آماده دریافت است.',
    shortPreviewFa: 'خروجی حساب آماده دانلود', ctaLabelFa: 'تنظیمات و داده‌ها',
    requiredVariables: ['exportId'], active: true,
  },
  'SECURITY.NEW_LOGIN': {
    templateCode: 'TPL_SECURITY_LOGIN', eventCode: 'SECURITY.NEW_LOGIN', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'ورود جدید به حساب کاربری در {{deviceSummary}}',
    bodyTemplateFa: 'اگر این ورود توسط شما انجام نشده است، فوراً نشست‌های فعال حساب را بررسی و لغو کنید.',
    shortPreviewFa: 'هشدار امنیتی ورود جدید', ctaLabelFa: 'بررسی نشست‌های امنیتی',
    requiredVariables: ['deviceSummary'], active: true,
  },
  'SECURITY.PASSWORD_CHANGED': {
    templateCode: 'TPL_SECURITY_PASS', eventCode: 'SECURITY.PASSWORD_CHANGED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'تغییر در تنظیمات امنیتی حساب ثبت شد',
    bodyTemplateFa: 'رویداد امنیتی {{changeSummary}} در تاریخچه حساب ثبت گردید.',
    shortPreviewFa: 'تغییر تنظیمات امنیتی', ctaLabelFa: 'تنظیمات امنیت',
    requiredVariables: ['changeSummary'], active: true,
  },
  'SUPPORT.TICKET_REPLIED': {
    templateCode: 'TPL_SUPPORT_REPLY', eventCode: 'SUPPORT.TICKET_REPLIED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'پاسخ پشتیبانی برای پرونده {{ticketCode}}',
    bodyTemplateFa: 'پاسخ جدید تیم پشتیبانی در گفت‌وگوی مرتبط ثبت شد.',
    shortPreviewFa: 'پاسخ جدید پشتیبانی', ctaLabelFa: 'باز کردن گفت‌وگو',
    requiredVariables: ['ticketCode'], active: true,
  },
  'SYSTEM.MAINTENANCE_NOTICE': {
    templateCode: 'TPL_SYSTEM_MAINT', eventCode: 'SYSTEM.MAINTENANCE_NOTICE', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'اعلان نگهداری و به‌روزرسانی داده‌های سامانه',
    bodyTemplateFa: 'به‌روزرسانی دوره‌ای در بازه {{windowFa}} با کمترین اختلال انجام می‌شود.',
    shortPreviewFa: 'بازه نگهداری {{windowFa}}', ctaLabelFa: 'وضعیت حساب',
    requiredVariables: ['windowFa'], active: true,
  },
  'ADMIN.ESCALATION_FLAGGED': {
    templateCode: 'TPL_ADMIN_ESC', eventCode: 'ADMIN.ESCALATION_FLAGGED', version: 1, locale: 'fa-IR',
    titleTemplateFa: 'هشدار ارجاع عملیاتی {{caseId}}',
    bodyTemplateFa: 'نیازمند بررسی کارشناس حاکمیت: {{summaryFa}}',
    shortPreviewFa: 'پرونده ارجاع‌شده {{caseId}}', ctaLabelFa: 'بررسی عملیات',
    requiredVariables: ['caseId', 'summaryFa'], active: true,
  },
};

export function renderSafeTemplateText(templateText: string, payload: Record<string, string | number | boolean>): string {
  return templateText.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, key: string) => {
    const raw = payload[key] !== undefined ? String(payload[key]) : '—';
    return sanitizeInput(raw, 160) || '—';
  });
}
