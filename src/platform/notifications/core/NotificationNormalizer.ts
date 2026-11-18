/**
 * @file src/platform/notifications/core/NotificationNormalizer.ts
 * @description Sanitizes notification text, validates internal actionUrl against open-redirect/XSS, and normalizes timestamps (Stage 9).
 */

import { sanitizePlainUserText } from '../../entity-engagement';
import type {
  DeliveryStatus,
  NotificationCategory,
  NotificationDeliveryRecord,
  NotificationPriority,
  NotificationRecord,
  NotificationStatus,
} from './NotificationTypes';

const VALID_CATEGORIES = new Set<NotificationCategory>([
  'entity_change',
  'saved_search',
  'collection_activity',
  'account_security',
  'system_announcement',
]);

const VALID_PRIORITIES = new Set<NotificationPriority>(['critical', 'high', 'normal', 'low']);
const VALID_STATUSES = new Set<NotificationStatus>(['unread', 'read', 'archived', 'dismissed']);
const VALID_DELIVERY_STATUSES = new Set<DeliveryStatus>([
  'queued',
  'processing',
  'sent',
  'delivered',
  'failed',
  'cancelled',
  'unknown',
]);

export function sanitizeInternalActionUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return undefined;
  // Only allow safe internal paths starting with single '/' and no dangerous schemes
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || /javascript:|data:|vbscript:/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function normalizeDeliveryRecord(raw: Partial<NotificationDeliveryRecord>): NotificationDeliveryRecord {
  const channel = raw.channel && ['in_app', 'email', 'sms', 'push'].includes(raw.channel)
    ? raw.channel
    : 'in_app';
  const status = raw.status && VALID_DELIVERY_STATUSES.has(raw.status)
    ? raw.status
    : 'unknown';

  return {
    channel,
    status,
    attemptedAt: raw.attemptedAt,
    deliveredAt: status === 'delivered' ? raw.deliveredAt : undefined,
    failureReason: raw.failureReason ? sanitizePlainUserText(raw.failureReason, 240) : undefined,
  };
}

export function normalizeNotificationRecord(raw: Partial<NotificationRecord>): NotificationRecord {
  const id = String(raw.id || '').trim() || `ntf:${Date.now()}`;
  const userId = String(raw.userId || '').trim();
  const workspaceId = String(raw.workspaceId || '').trim();
  const category: NotificationCategory =
    raw.category && VALID_CATEGORIES.has(raw.category) ? raw.category : 'system_announcement';
  const priority: NotificationPriority =
    raw.priority && VALID_PRIORITIES.has(raw.priority) ? raw.priority : 'normal';
  const status: NotificationStatus =
    raw.status && VALID_STATUSES.has(raw.status) ? raw.status : 'unread';

  const title = sanitizePlainUserText(raw.title || 'اعلان جدید رادار تهران', 160);
  const body = sanitizePlainUserText(raw.body || '', 600);
  const createdAt =
    raw.createdAt && !Number.isNaN(Date.parse(raw.createdAt))
      ? raw.createdAt
      : new Date().toISOString();

  const deliveries: NotificationDeliveryRecord[] = Array.isArray(raw.deliveries) && raw.deliveries.length > 0
    ? raw.deliveries.map(normalizeDeliveryRecord)
    : [{ channel: 'in_app', status: 'unknown' }];

  return {
    id,
    userId,
    workspaceId,
    category,
    priority,
    status,
    title,
    body,
    entity: raw.entity
      ? {
          id: String(raw.entity.id || '').trim(),
          entityType: raw.entity.entityType,
          title: sanitizePlainUserText(raw.entity.title || '', 120),
          canonicalPath: sanitizeInternalActionUrl(raw.entity.canonicalPath) || '/search',
        }
      : undefined,
    dedupeKey: String(raw.dedupeKey || `${userId}:${workspaceId}:${id}`).trim(),
    groupKey: raw.groupKey ? String(raw.groupKey).trim() : undefined,
    actionUrl: sanitizeInternalActionUrl(raw.actionUrl),
    actionLabel: raw.actionLabel ? sanitizePlainUserText(raw.actionLabel, 60) : undefined,
    deliveries,
    createdAt,
    readAt: raw.readAt,
    archivedAt: raw.archivedAt,
  };
}
