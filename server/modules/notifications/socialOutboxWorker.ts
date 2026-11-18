/**
 * @file server/modules/notifications/socialOutboxWorker.ts
 * @description RT-SOCIAL-IMPL-006 — Fenced Lease Outbox Worker, Backoff/Jitter, DLQ Replay & Suppression Lifecycle.
 */
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';
import {
  NotificationsModuleSocialAdapter,
  buildSocialOutboxRecord,
  computeBackoffWithJitterMs,
  type OutboxWorkerMetrics,
  type SocialEventType,
  type SocialNotificationAdapter,
  type SocialOutboxRecord,
} from './socialOutboxAdapter';

export {
  MAX_SOCIAL_OUTBOX_RECIPIENTS,
  NotificationsModuleSocialAdapter,
  appendSocialOutboxEvent,
  buildSocialOutboxRecord,
  computeBackoffWithJitterMs,
  computeSocialOutboxEventId,
  sanitizeOutboxRecipients,
  scrubOutboxSummaryFa,
  setSimulateOutboxWriteFailureForTests,
  type OutboxDeliveryStatus,
  type OutboxWorkerMetrics,
  type SocialEventType,
  type SocialNotificationAdapter,
  type SocialNotificationDispatchInput,
  type SocialNotificationDispatchResult,
  type SocialOutboxRecord,
} from './socialOutboxAdapter';

export class SocialOutboxWorkerService {
  private readonly storeProvider: () => CommunityDatabaseStore;
  private notificationAdapter: SocialNotificationAdapter | null;
  private simulateTransportFailure = false;

  constructor(
    storeProvider: () => CommunityDatabaseStore = () => communityUnifiedRepository.getStore(),
    notificationAdapter: SocialNotificationAdapter | null = new NotificationsModuleSocialAdapter(),
  ) {
    this.storeProvider = storeProvider;
    this.notificationAdapter = notificationAdapter;
  }

  public setNotificationAdapter(adapter: SocialNotificationAdapter | null): void {
    this.notificationAdapter = adapter;
  }

  public getNotificationAdapter(): SocialNotificationAdapter | null {
    return this.notificationAdapter;
  }

  public setSimulatedTransportFailure(enabled: boolean): void {
    this.simulateTransportFailure = enabled;
  }

  async enqueueSocialEvent(params: {
    eventId?: string;
    eventType: SocialEventType;
    targetId: string;
    actorUid: string;
    recipientUids: string[];
    payloadSummaryFa: string;
    maxAttempts?: number;
  }): Promise<SocialOutboxRecord> {
    const store = this.storeProvider();
    return store.runTransaction(async (tx) => {
      const record = buildSocialOutboxRecord({
        ...params,
        excludeActorFromRecipients: false,
      });
      const existing = await tx.get<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, record.id);
      if (existing) return existing;
      tx.set(SOCIAL_COLLECTIONS.outbox, record.id, record);
      return record;
    });
  }

  public async commitFencedOutboxTransition(params: {
    outboxId: string;
    workerId: string;
    expectedLeaseVersion: number;
    patch: Partial<SocialOutboxRecord>;
  }): Promise<boolean> {
    const store = this.storeProvider();
    return store.runTransaction(async (tx) => {
      const fresh = await tx.get<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, params.outboxId);
      if (!fresh) return false;
      if (
        fresh.status !== 'LEASED' ||
        fresh.leaseOwner !== params.workerId ||
        (fresh.leaseVersion ?? 0) !== params.expectedLeaseVersion
      ) {
        return false;
      }
      tx.set(SOCIAL_COLLECTIONS.outbox, fresh.id, {
        ...fresh,
        ...params.patch,
      });
      return true;
    });
  }

  private async failWithRetryOrDeadLetter(params: {
    leased: SocialOutboxRecord;
    workerId: string;
    expectedLeaseVersion: number;
    nowMs: number;
    nowIso: string;
    errorCode: string;
    deliveredNotificationIds?: string[];
    suppressedUids?: string[];
  }): Promise<'dead_lettered' | 'retried' | 'lost_lease'> {
    const exhausted = params.leased.attemptCount >= params.leased.maxAttempts;
    const backoffMs = computeBackoffWithJitterMs(params.leased.attemptCount);
    const committed = await this.commitFencedOutboxTransition({
      outboxId: params.leased.id,
      workerId: params.workerId,
      expectedLeaseVersion: params.expectedLeaseVersion,
      patch: {
        status: exhausted ? 'DEAD_LETTER' : 'PENDING',
        ...(params.deliveredNotificationIds
          ? { deliveredNotificationIds: params.deliveredNotificationIds }
          : {}),
        ...(params.suppressedUids ? { suppressedUids: params.suppressedUids } : {}),
        leaseOwner: null,
        leaseExpiresAtIso: null,
        nextAttemptAtIso: new Date(params.nowMs + backoffMs).toISOString(),
        lastErrorCode: params.errorCode,
        updatedAtIso: params.nowIso,
      },
    });
    if (!committed) return 'lost_lease';
    return exhausted ? 'dead_lettered' : 'retried';
  }

  async processPendingBatch(options?: {
    workerId?: string;
    batchSize?: number;
    nowMs?: number;
    leaseDurationMs?: number;
  }): Promise<{
    processed: number;
    delivered: number;
    suppressed: number;
    retried: number;
    deadLettered: number;
  }> {
    const workerId = options?.workerId || 'worker-social-outbox-1';
    const nowMs = options?.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const leaseDurationMs = Math.max(5_000, options?.leaseDurationMs ?? 30_000);
    const store = this.storeProvider();

    const page = await store.queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, {
      orderByField: 'createdAtIso',
      orderDirection: 'asc',
      limit: Math.max(1, Math.min(50, options?.batchSize ?? 20)),
    });

    let processed = 0;
    let delivered = 0;
    let suppressed = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const candidate of page.items) {
      if (
        candidate.status === 'DELIVERED' ||
        candidate.status === 'SUPPRESSED' ||
        candidate.status === 'DEAD_LETTER'
      ) {
        continue;
      }
      if (Date.parse(candidate.nextAttemptAtIso) > nowMs) continue;
      if (
        candidate.status === 'LEASED' &&
        candidate.leaseExpiresAtIso &&
        Date.parse(candidate.leaseExpiresAtIso) > nowMs
      ) {
        continue;
      }

      const leased = await store.runTransaction(async (tx) => {
        const fresh = await tx.get<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, candidate.id);
        if (!fresh) return null;
        if (
          fresh.status === 'DELIVERED' ||
          fresh.status === 'SUPPRESSED' ||
          fresh.status === 'DEAD_LETTER'
        ) {
          return null;
        }
        if (Date.parse(fresh.nextAttemptAtIso) > nowMs) return null;
        if (
          fresh.status === 'LEASED' &&
          fresh.leaseExpiresAtIso &&
          Date.parse(fresh.leaseExpiresAtIso) > nowMs
        ) {
          return null;
        }

        const nextLeaseVersion = (fresh.leaseVersion ?? 0) + 1;
        const next: SocialOutboxRecord = {
          ...fresh,
          status: 'LEASED',
          leaseOwner: workerId,
          leaseExpiresAtIso: new Date(nowMs + leaseDurationMs).toISOString(),
          leaseVersion: nextLeaseVersion,
          attemptCount: fresh.attemptCount + 1,
          updatedAtIso: nowIso,
        };
        tx.set(SOCIAL_COLLECTIONS.outbox, fresh.id, next);
        return next;
      });
      if (!leased) continue;
      processed += 1;
      const expectedLeaseVersion = leased.leaseVersion ?? 1;

      const targetPost = await store.getDoc<Record<string, unknown>>(
        SOCIAL_COLLECTIONS.posts,
        leased.targetId,
      );
      const isTargetSuppressed = Boolean(
        targetPost &&
          (targetPost.isDeleted === true ||
            targetPost.status === 'hidden' ||
            targetPost.moderationStatus === 'removed'),
      );

      if (isTargetSuppressed) {
        const committed = await this.commitFencedOutboxTransition({
          outboxId: leased.id,
          workerId,
          expectedLeaseVersion,
          patch: {
            status: 'SUPPRESSED',
            suppressedUids: leased.recipientUids,
            leaseOwner: null,
            leaseExpiresAtIso: null,
            lastErrorCode: 'TARGET_HIDDEN_OR_DELETED',
            updatedAtIso: nowIso,
          },
        });
        if (committed) suppressed += 1;
        continue;
      }

      const deliverableRecipients = leased.recipientUids.filter((u) => u !== leased.actorUid);
      const selfSuppressed = Array.from(
        new Set([
          ...(leased.suppressedUids || []),
          ...leased.recipientUids.filter((u) => u === leased.actorUid),
        ]),
      );

      if (deliverableRecipients.length === 0) {
        const committed = await this.commitFencedOutboxTransition({
          outboxId: leased.id,
          workerId,
          expectedLeaseVersion,
          patch: {
            status: 'SUPPRESSED',
            suppressedUids: selfSuppressed,
            leaseOwner: null,
            leaseExpiresAtIso: null,
            lastErrorCode: 'SELF_NOTIFICATION_SUPPRESSED',
            updatedAtIso: nowIso,
          },
        });
        if (committed) suppressed += 1;
        continue;
      }

      if (!this.notificationAdapter || this.simulateTransportFailure) {
        const outcome = await this.failWithRetryOrDeadLetter({
          leased,
          workerId,
          expectedLeaseVersion,
          nowMs,
          nowIso,
          errorCode: !this.notificationAdapter
            ? 'MISSING_NOTIFICATION_ADAPTER'
            : 'TRANSIENT_DELIVERY_FAILURE',
        });
        if (outcome === 'dead_lettered') deadLettered += 1;
        else if (outcome === 'retried') retried += 1;
        continue;
      }

      let acceptedCount = 0;
      const deliveredNotificationIds: string[] = [...(leased.deliveredNotificationIds || [])];
      const newlySuppressedUids: string[] = [...selfSuppressed];
      let transientErrorCode: string | null = null;
      let permanentErrorCode: string | null = null;

      for (const recipientUid of deliverableRecipients) {
        const idempotencyKey = `soc_obx_${leased.id}_${recipientUid}`;
        const dispatchRes = await this.notificationAdapter.dispatch({
          eventId: leased.id,
          eventType: leased.eventType,
          actorUid: leased.actorUid,
          recipientUid,
          targetId: leased.targetId,
          idempotencyKey,
          payloadSummaryFa: leased.payloadSummaryFa,
        });

        if (dispatchRes.accepted) {
          acceptedCount += 1;
          if (dispatchRes.notificationId && !deliveredNotificationIds.includes(dispatchRes.notificationId)) {
            deliveredNotificationIds.push(dispatchRes.notificationId);
          }
        } else if (dispatchRes.suppressed) {
          if (!newlySuppressedUids.includes(recipientUid)) {
            newlySuppressedUids.push(recipientUid);
          }
        } else if (dispatchRes.retryable !== false) {
          transientErrorCode = dispatchRes.errorCode || 'TRANSIENT_DELIVERY_FAILURE';
        } else {
          permanentErrorCode = dispatchRes.errorCode || 'PERMANENT_DELIVERY_FAILURE';
        }
      }

      if (transientErrorCode) {
        const outcome = await this.failWithRetryOrDeadLetter({
          leased,
          workerId,
          expectedLeaseVersion,
          nowMs,
          nowIso,
          errorCode: transientErrorCode,
          deliveredNotificationIds,
          suppressedUids: newlySuppressedUids,
        });
        if (outcome === 'dead_lettered') deadLettered += 1;
        else if (outcome === 'retried') retried += 1;
        continue;
      }

      if (permanentErrorCode && acceptedCount === 0) {
        const committed = await this.commitFencedOutboxTransition({
          outboxId: leased.id,
          workerId,
          expectedLeaseVersion,
          patch: {
            status: 'DEAD_LETTER',
            deliveredNotificationIds,
            suppressedUids: newlySuppressedUids,
            leaseOwner: null,
            leaseExpiresAtIso: null,
            lastErrorCode: permanentErrorCode,
            updatedAtIso: nowIso,
          },
        });
        if (committed) deadLettered += 1;
        continue;
      }

      if (acceptedCount === 0 && newlySuppressedUids.length > 0) {
        const committed = await this.commitFencedOutboxTransition({
          outboxId: leased.id,
          workerId,
          expectedLeaseVersion,
          patch: {
            status: 'SUPPRESSED',
            deliveredCount: 0,
            deliveredNotificationIds,
            suppressedUids: newlySuppressedUids,
            leaseOwner: null,
            leaseExpiresAtIso: null,
            lastErrorCode: 'RECIPIENT_OPTED_OUT',
            updatedAtIso: nowIso,
          },
        });
        if (committed) suppressed += 1;
        continue;
      }

      const committed = await this.commitFencedOutboxTransition({
        outboxId: leased.id,
        workerId,
        expectedLeaseVersion,
        patch: {
          status: 'DELIVERED',
          deliveredCount: acceptedCount,
          deliveredNotificationIds,
          suppressedUids: newlySuppressedUids,
          leaseOwner: null,
          leaseExpiresAtIso: null,
          lastErrorCode: null,
          updatedAtIso: nowIso,
        },
      });
      if (committed) delivered += 1;
    }

    return { processed, delivered, suppressed, retried, deadLettered };
  }

  async replayDeadLetter(outboxId: string, adminUid: string): Promise<SocialOutboxRecord> {
    if (!adminUid || !adminUid.trim()) {
      throw new CommunityHttpError(403, 'FORBIDDEN', 'بازپخش DLQ نیازمند احراز مدیر است.');
    }
    const store = this.storeProvider();
    return store.runTransaction(async (tx) => {
      const existing = await tx.get<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, outboxId);
      if (!existing) throw new CommunityHttpError(404, 'OUTBOX_NOT_FOUND', 'رکورد Outbox یافت نشد.');
      if (existing.status !== 'DEAD_LETTER') {
        throw new CommunityHttpError(
          409,
          'NOT_IN_DEAD_LETTER',
          'تنها رویدادهای صف DLQ قابل بازپخش هستند.',
        );
      }
      const nowIso = new Date().toISOString();
      const updated: SocialOutboxRecord = {
        ...existing,
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAtIso: nowIso,
        leaseOwner: null,
        leaseExpiresAtIso: null,
        lastErrorCode: `REPLAY_BY_${adminUid.trim().slice(0, 12)}`,
        updatedAtIso: nowIso,
      };
      tx.set(SOCIAL_COLLECTIONS.outbox, outboxId, updated);
      return updated;
    });
  }

  async getZeroPiiMetrics(): Promise<OutboxWorkerMetrics> {
    const page = await this.storeProvider().queryDocs<SocialOutboxRecord>(
      SOCIAL_COLLECTIONS.outbox,
      { limit: 200 },
    );
    return {
      pendingCount: page.items.filter((i) => i.status === 'PENDING').length,
      leasedCount: page.items.filter((i) => i.status === 'LEASED').length,
      deliveredCount: page.items.filter((i) => i.status === 'DELIVERED').length,
      suppressedCount: page.items.filter((i) => i.status === 'SUPPRESSED').length,
      deadLetterCount: page.items.filter((i) => i.status === 'DEAD_LETTER').length,
      piiStored: false,
    };
  }
}

export const defaultSocialOutboxWorker = new SocialOutboxWorkerService();
