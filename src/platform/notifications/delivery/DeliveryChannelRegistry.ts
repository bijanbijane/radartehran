/**
 * @file src/platform/notifications/delivery/DeliveryChannelRegistry.ts
 * @description Metadata and capabilities for Notification Delivery Channels (in_app, email, sms, push) (Stage 9).
 */

import type { DeliveryChannel } from '../core/NotificationTypes';

export interface DeliveryChannelDescriptor {
  channel: DeliveryChannel;
  labelFa: string;
  supportsRetry: boolean;
  requiresVerifiedContact: boolean;
}

export const DELIVERY_CHANNEL_REGISTRY: Record<DeliveryChannel, DeliveryChannelDescriptor> = {
  in_app: {
    channel: 'in_app',
    labelFa: 'مرکز اعلان درون‌برنامه‌ای',
    supportsRetry: true,
    requiresVerifiedContact: false,
  },
  email: {
    channel: 'email',
    labelFa: 'پست الکترونیک (ایمیل)',
    supportsRetry: true,
    requiresVerifiedContact: true,
  },
  sms: {
    channel: 'sms',
    labelFa: 'پیامک (SMS)',
    supportsRetry: true,
    requiresVerifiedContact: true,
  },
  push: {
    channel: 'push',
    labelFa: 'اعلان مرورگر / وب‌پوش',
    supportsRetry: true,
    requiresVerifiedContact: false,
  },
};
