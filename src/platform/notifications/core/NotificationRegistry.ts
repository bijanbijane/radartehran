/**
 * @file src/platform/notifications/core/NotificationRegistry.ts
 * @description Category metadata, Persian labels, priority weights, and muteability rules for Stage 9 Notification Center.
 */

import type {
  DeliveryChannel,
  DeliveryStatus,
  NotificationCategory,
  NotificationPriority,
} from './NotificationTypes';

export interface NotificationCategoryDescriptor {
  category: NotificationCategory;
  labelFa: string;
  descriptionFa: string;
  canUserMuteAll: boolean;
  defaultPriority: NotificationPriority;
  defaultChannels: DeliveryChannel[];
}

export const NOTIFICATION_CATEGORY_REGISTRY: Record<
  NotificationCategory,
  NotificationCategoryDescriptor
> = {
  entity_change: {
    category: 'entity_change',
    labelFa: 'تغییرات موجودیت‌های دنبال‌شده',
    descriptionFa: 'کاهش قیمت، تغییر وضعیت آگهی یا ثبت آگهی جدید در ساختمان و محله',
    canUserMuteAll: true,
    defaultPriority: 'high',
    defaultChannels: ['in_app', 'push'],
  },
  saved_search: {
    category: 'saved_search',
    labelFa: 'جست‌وجوهای ذخیره‌شده',
    descriptionFa: 'موارد جدید منطبق با فیلترها و جست‌وجوهای ذخیره‌شده شما',
    canUserMuteAll: true,
    defaultPriority: 'normal',
    defaultChannels: ['in_app', 'email'],
  },
  collection_activity: {
    category: 'collection_activity',
    labelFa: 'فعالیت مجموعه‌های شخصی و تیمی',
    descriptionFa: 'افزودن مورد جدید، یادداشت یا بروزرسانی در مجموعه‌های مشترک فضای کاری',
    canUserMuteAll: true,
    defaultPriority: 'normal',
    defaultChannels: ['in_app'],
  },
  account_security: {
    category: 'account_security',
    labelFa: 'امنیت حساب و کنترل دسترسی',
    descriptionFa: 'ورود از دستگاه جدید، تغییر نقش، تغییر مجوزها و هشدارهای امنیتی حیاتی',
    canUserMuteAll: false,
    defaultPriority: 'critical',
    defaultChannels: ['in_app', 'email', 'sms'],
  },
  system_announcement: {
    category: 'system_announcement',
    labelFa: 'اطلاعیه‌های سامانه رادار',
    descriptionFa: 'بروزرسانی شاخص‌های کلان بازار، شهرهای جدید و اطلاعیه‌های فنی',
    canUserMuteAll: true,
    defaultPriority: 'low',
    defaultChannels: ['in_app'],
  },
};

export const DELIVERY_STATUS_LABELS_FA: Record<DeliveryStatus, string> = {
  queued: 'در صف ارسال',
  processing: 'در حال پردازش',
  sent: 'ارسال‌شده به درگاه',
  delivered: 'تحویل‌شده',
  failed: 'خطا در ارسال',
  cancelled: 'لغوشده',
  unknown: 'وضعیت نامشخص',
};

export const PRIORITY_WEIGHTS: Record<NotificationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'entity_change',
  'saved_search',
  'collection_activity',
  'account_security',
  'system_announcement',
] as const;

export const NOTIFICATION_PRIORITIES: readonly NotificationPriority[] = [
  'critical',
  'high',
  'normal',
  'low',
] as const;

export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = [
  'in_app',
  'email',
  'sms',
  'push',
] as const;

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'queued',
  'processing',
  'sent',
  'delivered',
  'failed',
  'cancelled',
  'unknown',
] as const;
