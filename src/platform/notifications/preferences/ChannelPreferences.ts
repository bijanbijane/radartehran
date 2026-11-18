/**
 * @file src/platform/notifications/preferences/ChannelPreferences.ts
 * @description Default channel matrix and validation for Notification Delivery Channels (Stage 9).
 */

import { isNonMutableSecurityCategory } from '../core/NotificationContract';
import { NOTIFICATION_CATEGORY_REGISTRY } from '../core/NotificationRegistry';
import type {
  CategoryChannelPreference,
  DeliveryChannel,
  NotificationCategory,
  NotificationFrequencyMode,
} from '../core/NotificationTypes';

export function buildDefaultCategoryChannelPreferences(): Record<
  NotificationCategory,
  CategoryChannelPreference
> {
  const result = {} as Record<NotificationCategory, CategoryChannelPreference>;
  const categories = Object.keys(NOTIFICATION_CATEGORY_REGISTRY) as NotificationCategory[];

  for (const cat of categories) {
    const desc = NOTIFICATION_CATEGORY_REGISTRY[cat];
    result[cat] = {
      category: cat,
      channels: {
        in_app: desc.defaultChannels.includes('in_app'),
        email: desc.defaultChannels.includes('email'),
        sms: desc.defaultChannels.includes('sms'),
        push: desc.defaultChannels.includes('push'),
      },
      frequency: 'instant',
      muted: false,
    };
  }
  return result;
}

export function validateCategoryPreferenceUpdate(params: {
  category: NotificationCategory;
  channels: Record<DeliveryChannel, boolean>;
  frequency: NotificationFrequencyMode;
  muted: boolean;
}): {
  valid: boolean;
  preference: CategoryChannelPreference;
  errorFa?: string;
} {
  if (isNonMutableSecurityCategory(params.category)) {
    const anyChannelEnabled = Object.values(params.channels).some(Boolean);
    if (params.muted || params.frequency === 'paused' || !params.channels.in_app || !anyChannelEnabled) {
      return {
        valid: false,
        preference: {
          category: params.category,
          channels: {
            in_app: true,
            email: true,
            sms: params.channels.sms,
            push: params.channels.push,
          },
          frequency: 'instant',
          muted: false,
        },
        errorFa: 'اعلان‌های امنیتی حیاتی حساب کاربری قابل خاموش‌کردن کامل نیستند.',
      };
    }
  }

  return {
    valid: true,
    preference: {
      category: params.category,
      channels: { ...params.channels },
      frequency: params.frequency,
      muted: params.muted,
    },
  };
}
