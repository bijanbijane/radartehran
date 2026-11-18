/**
 * @file src/platform/notifications/core/NotificationContract.ts
 * @description Cache keys, workspace isolation, and Stage 8 AlertEligibility -> Stage 9 NotificationRecord bridge (Stage 9).
 */

import type {
  AlertEligibilityDecision,
  EntityChangeEvent,
  WatchRule,
} from '../../entity-engagement';
import type {
  NotificationCategory,
  NotificationPriority,
  NotificationRecord,
} from './NotificationTypes';

export function buildNotificationCacheKey(params: {
  userId: string;
  workspaceId: string;
  permissionVersion: number;
  filterHash?: string;
  page?: number;
}): string {
  const u = String(params.userId || '').trim();
  const w = String(params.workspaceId || '').trim();
  if (!u || !w) {
    throw new Error('NOTIFICATION_CACHE_ISOLATION_ERROR: userId and workspaceId are required.');
  }
  const v = Number.isFinite(params.permissionVersion) ? params.permissionVersion : 1;
  const f = params.filterHash || 'all';
  const p = params.page ?? 1;
  return `notifications:${u}:${w}:${v}:${f}:${p}`;
}

export function createNotificationFromEligibleStage8Alert(params: {
  rule: WatchRule;
  event: EntityChangeEvent;
  decision: AlertEligibilityDecision;
  priority?: NotificationPriority;
}): NotificationRecord | null {
  if (!params.decision.eligible) {
    return null;
  }

  const { rule, event, decision } = params;
  const now = new Date().toISOString();
  const dedupeKey =
    decision.dedupeKey ||
    `notif-dedupe:${rule.userId}:${rule.workspaceId}:${event.entity.entityType}:${event.entity.id}:${event.id}`;

  const groupKey = `grp:${rule.userId}:${rule.workspaceId}:${event.entity.entityType}:${event.entity.id}:entity_change`;

  const pctText =
    typeof event.deltaPercent === 'number'
      ? ` (${Math.abs(event.deltaPercent)}٪)`
      : '';

  return {
    id: `ntf:${rule.userId}:${rule.workspaceId}:${event.id}`,
    userId: rule.userId,
    workspaceId: rule.workspaceId,
    category: 'entity_change',
    priority: params.priority ?? 'high',
    status: 'unread',
    title: `تغییر جدید در «${event.entity.title}»`,
    body: `شرط رصد «${rule.conditionType}» روی «${event.entity.title}» فعال شد${pctText}.`,
    entity: {
      id: event.entity.id,
      entityType: event.entity.entityType,
      title: event.entity.title,
      canonicalPath: event.entity.canonicalPath,
    },
    dedupeKey,
    groupKey,
    actionUrl: event.entity.canonicalPath,
    actionLabel: 'مشاهده جزئیات موجودیت',
    deliveries: [
      {
        channel: 'in_app',
        status: 'delivered',
        attemptedAt: now,
        deliveredAt: now,
      },
    ],
    createdAt: event.observedAt || now,
  };
}

export function isNonMutableSecurityCategory(category: NotificationCategory): boolean {
  return category === 'account_security';
}

export function isValidNotificationRecord(rec: unknown): rec is NotificationRecord {
  if (!rec || typeof rec !== 'object') return false;
  const r = rec as Partial<NotificationRecord>;
  return Boolean(
    typeof r.id === 'string' &&
      r.id.trim() &&
      typeof r.userId === 'string' &&
      r.userId.trim() &&
      typeof r.workspaceId === 'string' &&
      r.workspaceId.trim() &&
      typeof r.category === 'string' &&
      typeof r.priority === 'string' &&
      typeof r.status === 'string' &&
      typeof r.title === 'string' &&
      typeof r.dedupeKey === 'string' &&
      Array.isArray(r.deliveries)
  );
}
