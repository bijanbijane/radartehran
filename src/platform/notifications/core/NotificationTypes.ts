/**
 * @file src/platform/notifications/core/NotificationTypes.ts
 * @description Canonical NotificationRecord, DeliveryChannel, DeliveryStatus, Category, Priority, and Preferences contracts for Stage 9 (RT-FE-REBUILD-NOTIFICATION-CENTER-009).
 */

import type { EntityType } from '../../entity-engagement';

export type NotificationCategory =
  | 'entity_change'
  | 'saved_search'
  | 'collection_activity'
  | 'account_security'
  | 'system_announcement';

export type NotificationPriority =
  | 'critical'
  | 'high'
  | 'normal'
  | 'low';

export type NotificationStatus =
  | 'unread'
  | 'read'
  | 'archived'
  | 'dismissed';

export type DeliveryChannel =
  | 'in_app'
  | 'email'
  | 'sms'
  | 'push';

export type DeliveryStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export interface NotificationDeliveryRecord {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attemptedAt?: string;
  deliveredAt?: string;
  failureReason?: string;
}

export interface NotificationEntityLink {
  id: string;
  entityType: EntityType;
  title: string;
  canonicalPath: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  workspaceId: string;

  category: NotificationCategory;
  priority: NotificationPriority;
  status: NotificationStatus;

  title: string;
  body: string;

  entity?: NotificationEntityLink;

  dedupeKey: string;
  groupKey?: string;

  actionUrl?: string;
  actionLabel?: string;

  deliveries: NotificationDeliveryRecord[];

  createdAt: string;
  readAt?: string;
  archivedAt?: string;
}

export type NotificationFrequencyMode = 'instant' | 'hourly_digest' | 'daily_digest' | 'paused';

export interface QuietHoursConfig {
  enabled: boolean;
  startTimeHHMM: string;
  endTimeHHMM: string;
  bypassForCriticalSecurity: boolean;
}

export interface CategoryChannelPreference {
  category: NotificationCategory;
  channels: Record<DeliveryChannel, boolean>;
  frequency: NotificationFrequencyMode;
  muted: boolean;
}

export interface UserNotificationPreferences {
  userId: string;
  workspaceId: string;
  categories: Record<NotificationCategory, CategoryChannelPreference>;
  quietHours: QuietHoursConfig;
  mutedEntityKeys: string[];
  updatedAt: string;
}
