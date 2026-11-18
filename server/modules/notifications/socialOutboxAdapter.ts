/**
 * @file server/modules/notifications/socialOutboxAdapter.ts
 * @description RT-SOCIAL-IMPL-006 — Outbox Record Builder, Recipient Sanitizer, Backoff Helper & Official Notifications Module Adapter.
 */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityTransaction,
} from '../community/communityFirestoreAdapter';
import { NotificationDeliveryEngine } from './notificationDeliveryEngine';
import { NotificationEventConsumer } from './notificationEventConsumer';
import { defaultNotificationStore, type NotificationStore } from './notificationStore';

export type SocialEventType =
  | 'social.post.created.v1'
  | 'social.comment.created.v1'
  | 'social.question.answered.v1'
  | 'social.moderation.decided.v1';

const VALID_SOCIAL_EVENT_TYPES = new Set<SocialEventType>([
  'social.post.created.v1',
  'social.comment.created.v1',
  'social.question.answered.v1',
  'social.moderation.decided.v1',
]);

export type OutboxDeliveryStatus =
  | 'PENDING'
  | 'LEASED'
  | 'DELIVERED'
  | 'SUPPRESSED'
  | 'DEAD_LETTER';

export interface SocialOutboxRecord extends Record<string, unknown> {
  id: string;
  eventType: SocialEventType;
  schemaVersion: '1.0.0';
  targetId: string;
  actorUid: string;
  recipientUids: string[];
  suppressedUids: string[];
  deliveredCount: number;
  deliveredNotificationIds?: string[];
  status: OutboxDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAtIso: string;
  leaseOwner: string | null;
  leaseExpiresAtIso: string | null;
  leaseVersion?: number;
  lastErrorCode: string | null;
  payloadSummaryFa: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface OutboxWorkerMetrics {
  pendingCount: number;
  leasedCount: number;
  deliveredCount: number;
  suppressedCount: number;
  deadLetterCount: number;
  piiStored: false;
}

export interface SocialNotificationDispatchInput {
  eventId: string;
  eventType: SocialEventType;
  actorUid: string;
  recipientUid: string;
  targetId: string;
  idempotencyKey: string;
  payloadSummaryFa?: string;
}

export interface SocialNotificationDispatchResult {
  accepted: boolean;
  notificationId?: string;
  duplicate?: boolean;
  suppressed?: boolean;
  retryable?: boolean;
  errorCode?: string;
}

export interface SocialNotificationAdapter {
  dispatch(input: SocialNotificationDispatchInput): Promise<SocialNotificationDispatchResult>;
}

export const MAX_SOCIAL_OUTBOX_RECIPIENTS = 50;
const PII_SCRUB_REGEX = /(?:09\d{9}|[^\s@]+@[^\s@]+\.[^\s@]+|IR\d{24})/gi;

let simulateOutboxWriteFailure = false;

export function setSimulateOutboxWriteFailureForTests(shouldFail: boolean): void {
  simulateOutboxWriteFailure = shouldFail;
}

export function scrubOutboxSummaryFa(rawSummary: string): string {
  const cleaned = String(rawSummary || '')
    .replace(PII_SCRUB_REGEX, '[REDACTED]')
    .trim();
  return cleaned.slice(0, 120);
}

export function computeSocialOutboxEventId(params: {
  eventType: SocialEventType;
  targetId: string;
  eventId?: string;
}): string {
  const seed = `${params.eventType}:${params.targetId}:${(params.eventId || params.targetId).trim()}`;
  return `obx_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

export function sanitizeOutboxRecipients(
  recipientUids: readonly string[],
  actorUid: string,
  excludeActor = true,
): { recipientUids: string[]; suppressedSelfUids: string[] } {
  const unique = Array.from(
    new Set(
      (recipientUids || [])
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && !PII_SCRUB_REGEX.test(u)),
    ),
  ).slice(0, MAX_SOCIAL_OUTBOX_RECIPIENTS);

  if (!excludeActor) {
    return { recipientUids: unique, suppressedSelfUids: [] };
  }
  const cleanActor = actorUid.trim();
  return {
    recipientUids: unique.filter((u) => u !== cleanActor),
    suppressedSelfUids: unique.filter((u) => u === cleanActor),
  };
}

export function buildSocialOutboxRecord(params: {
  eventId?: string;
  eventType: SocialEventType;
  targetId: string;
  actorUid: string;
  recipientUids: string[];
  payloadSummaryFa: string;
  maxAttempts?: number;
  excludeActorFromRecipients?: boolean;
  nowIso?: string;
}): SocialOutboxRecord {
  if (!VALID_SOCIAL_EVENT_TYPES.has(params.eventType)) {
    throw new CommunityHttpError(
      400,
      'INVALID_OUTBOX_EVENT',
      `نوع رویداد Outbox نامعتبر است: ${String(params.eventType)}`,
    );
  }
  if (simulateOutboxWriteFailure) {
    throw new CommunityHttpError(
      500,
      'OUTBOX_WRITE_FAILED',
      'ثبت رویداد در صف Social Outbox با خطا مواجه شد (Rollback Transaction).',
    );
  }
  const nowIso = params.nowIso || new Date().toISOString();
  const id = params.eventId
    ? computeSocialOutboxEventId({
        eventType: params.eventType,
        targetId: params.targetId,
        eventId: params.eventId,
      })
    : `obx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const { recipientUids, suppressedSelfUids } = sanitizeOutboxRecipients(
    params.recipientUids,
    params.actorUid,
    params.excludeActorFromRecipients ?? false,
  );

  return {
    id,
    eventType: params.eventType,
    schemaVersion: '1.0.0',
    targetId: params.targetId.trim(),
    actorUid: params.actorUid.trim(),
    recipientUids,
    suppressedUids: suppressedSelfUids,
    deliveredCount: 0,
    deliveredNotificationIds: [],
    status: 'PENDING',
    attemptCount: 0,
    maxAttempts: Math.max(1, Math.min(8, params.maxAttempts ?? 4)),
    nextAttemptAtIso: nowIso,
    leaseOwner: null,
    leaseExpiresAtIso: null,
    leaseVersion: 0,
    lastErrorCode: null,
    payloadSummaryFa: scrubOutboxSummaryFa(params.payloadSummaryFa),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
}

/**
 * Stages a SocialOutboxRecord inside the caller's existing Firestore transaction.
 * Does NOT open a new transaction and does NOT call setDoc independently.
 */
export function appendSocialOutboxEvent(
  tx: CommunityTransaction,
  params: {
    eventId: string;
    eventType: SocialEventType;
    targetId: string;
    actorUid: string;
    recipientUids: string[];
    payloadSummaryFa: string;
    maxAttempts?: number;
  },
): SocialOutboxRecord {
  const record = buildSocialOutboxRecord({
    ...params,
    excludeActorFromRecipients: true,
  });
  tx.set(SOCIAL_COLLECTIONS.outbox, record.id, record);
  return record;
}

export class NotificationsModuleSocialAdapter implements SocialNotificationAdapter {
  private readonly deliveryEngine: NotificationDeliveryEngine;
  private readonly consumer: NotificationEventConsumer;

  constructor(private readonly notificationStore: NotificationStore = defaultNotificationStore) {
    this.deliveryEngine = new NotificationDeliveryEngine(this.notificationStore);
    this.consumer = new NotificationEventConsumer(this.notificationStore, this.deliveryEngine);
  }

  public getStore(): NotificationStore {
    return this.notificationStore;
  }

  public async dispatch(
    input: SocialNotificationDispatchInput,
  ): Promise<SocialNotificationDispatchResult> {
    try {
      const prefs = await this.notificationStore.getPreferences(input.recipientUid);
      if (!prefs.channels.inApp || !prefs.categories.crowd_claims) {
        return {
          accepted: false,
          suppressed: true,
          retryable: false,
          errorCode: 'RECIPIENT_OPTED_OUT',
        };
      }

      const existing = this.notificationStore.getNotificationByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return {
          accepted: true,
          duplicate: true,
          notificationId: existing.id,
        };
      }

      const outcome = await this.consumer.consumeEvent({
        eventId: `${input.eventId}_${input.recipientUid}`.slice(0, 96),
        eventType: input.eventType,
        recipientUid: input.recipientUid,
        variables: {
          summaryFa: scrubOutboxSummaryFa(input.payloadSummaryFa || 'فعالیت جدید در انجمن رادار'),
          targetId: input.targetId,
        },
        deepLink: {
          actionUrl: `/community?target=${encodeURIComponent(input.targetId)}`,
          view: 'community',
          entityId: input.targetId,
        },
        idempotencyKey: input.idempotencyKey,
        timestampIso: new Date().toISOString(),
      });

      if (!outcome.success) {
        return {
          accepted: false,
          retryable: false,
          errorCode: 'INVALID_NOTIFICATION_PAYLOAD',
        };
      }

      await this.deliveryEngine.processPendingBatch(20);

      return {
        accepted: true,
        duplicate: outcome.duplicate,
        notificationId: outcome.notification?.id,
      };
    } catch (err) {
      const code = err instanceof Error && err.message ? err.message : 'NOTIFICATION_DISPATCH_ERROR';
      return {
        accepted: false,
        retryable: true,
        errorCode: code,
      };
    }
  }
}

export function computeBackoffWithJitterMs(
  attemptCount: number,
  baseMs = 1000,
  maxMs = 60_000,
  jitterSeed?: number,
): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attemptCount - 1)));
  const unit =
    typeof jitterSeed === 'number'
      ? Math.abs(jitterSeed % 1)
      : crypto.randomInt(0, 1000) / 1000;
  return Math.round(exp * (0.75 + unit * 0.5));
}
