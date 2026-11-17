/** @file server/modules/notifications/socialOutboxWorker.ts — Stage 6 Durable Social Event Outbox, Lease Worker, Backoff/Jitter, DLQ & Suppression */
import crypto from 'node:crypto';
import {
  CommunityHttpError,
  SOCIAL_COLLECTIONS,
  type CommunityDatabaseStore,
} from '../community/communityFirestoreAdapter';
import { communityUnifiedRepository } from '../community/communityUnifiedRepository';

export type SocialEventType =
  | 'social.post.created.v1'
  | 'social.comment.created.v1'
  | 'social.question.answered.v1'
  | 'social.moderation.decided.v1';

export type OutboxDeliveryStatus = 'PENDING' | 'LEASED' | 'DELIVERED' | 'SUPPRESSED' | 'DEAD_LETTER';

export interface SocialOutboxRecord extends Record<string, unknown> {
  id: string;
  eventType: SocialEventType;
  schemaVersion: '1.0.0';
  targetId: string;
  actorUid: string;
  recipientUids: string[];
  suppressedUids: string[];
  deliveredCount: number;
  status: OutboxDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAtIso: string;
  leaseOwner: string | null;
  leaseExpiresAtIso: string | null;
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

export function computeBackoffWithJitterMs(attemptCount: number, baseMs = 1000, maxMs = 60_000, jitterSeed?: number): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attemptCount - 1)));
  const unit = typeof jitterSeed === 'number' ? Math.abs(jitterSeed % 1) : crypto.randomInt(0, 1000) / 1000;
  return Math.round(exp * (0.75 + unit * 0.5));
}

export class SocialOutboxWorkerService {
  private readonly storeProvider: () => CommunityDatabaseStore;
  private simulateTransportFailure = false;

  constructor(storeProvider: () => CommunityDatabaseStore = () => communityUnifiedRepository.getStore()) {
    this.storeProvider = storeProvider;
  }

  setSimulatedTransportFailure(enabled: boolean): void {
    this.simulateTransportFailure = enabled;
  }

  async enqueueSocialEvent(params: {
    eventType: SocialEventType;
    targetId: string;
    actorUid: string;
    recipientUids: string[];
    payloadSummaryFa: string;
    maxAttempts?: number;
  }): Promise<SocialOutboxRecord> {
    const nowIso = new Date().toISOString();
    const id = `obx_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const uniqueRecipients = Array.from(new Set(params.recipientUids.filter((u) => typeof u === 'string' && u.trim())));
    const record: SocialOutboxRecord = {
      id,
      eventType: params.eventType,
      schemaVersion: '1.0.0',
      targetId: params.targetId,
      actorUid: params.actorUid,
      recipientUids: uniqueRecipients,
      suppressedUids: [],
      deliveredCount: 0,
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: Math.max(1, Math.min(8, params.maxAttempts ?? 4)),
      nextAttemptAtIso: nowIso,
      leaseOwner: null,
      leaseExpiresAtIso: null,
      lastErrorCode: null,
      payloadSummaryFa: params.payloadSummaryFa.slice(0, 180),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    await this.storeProvider().setDoc(SOCIAL_COLLECTIONS.outbox, id, record);
    return record;
  }

  async processPendingBatch(options?: {
    workerId?: string;
    batchSize?: number;
    nowMs?: number;
    leaseDurationMs?: number;
  }): Promise<{ processed: number; delivered: number; suppressed: number; retried: number; deadLettered: number }> {
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
      if (candidate.status === 'DELIVERED' || candidate.status === 'SUPPRESSED' || candidate.status === 'DEAD_LETTER') {
        continue;
      }
      if (Date.parse(candidate.nextAttemptAtIso) > nowMs) continue;
      if (candidate.status === 'LEASED' && candidate.leaseExpiresAtIso && Date.parse(candidate.leaseExpiresAtIso) > nowMs) {
        continue;
      }

      const leased = await store.runTransaction(async (tx) => {
        const fresh = await tx.get<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, candidate.id);
        if (!fresh) return null;
        if (fresh.status === 'DELIVERED' || fresh.status === 'SUPPRESSED' || fresh.status === 'DEAD_LETTER') return null;
        if (fresh.status === 'LEASED' && fresh.leaseExpiresAtIso && Date.parse(fresh.leaseExpiresAtIso) > nowMs) return null;

        const next: SocialOutboxRecord = {
          ...fresh,
          status: 'LEASED',
          leaseOwner: workerId,
          leaseExpiresAtIso: new Date(nowMs + leaseDurationMs).toISOString(),
          attemptCount: fresh.attemptCount + 1,
          updatedAtIso: nowIso,
        };
        tx.set(SOCIAL_COLLECTIONS.outbox, fresh.id, next);
        return next;
      });
      if (!leased) continue;
      processed += 1;

      const targetPost = await store.getDoc<Record<string, unknown>>(SOCIAL_COLLECTIONS.posts, leased.targetId);
      const isTargetSuppressed = Boolean(
        targetPost && (targetPost.isDeleted === true || targetPost.status === 'hidden' || targetPost.moderationStatus === 'removed'),
      );

      if (isTargetSuppressed) {
        await store.setDoc(SOCIAL_COLLECTIONS.outbox, leased.id, {
          ...leased,
          status: 'SUPPRESSED',
          suppressedUids: leased.recipientUids,
          leaseOwner: null,
          leaseExpiresAtIso: null,
          lastErrorCode: 'TARGET_HIDDEN_OR_DELETED',
          updatedAtIso: nowIso,
        }, true);
        suppressed += 1;
        continue;
      }

      const deliverableRecipients = leased.recipientUids.filter((u) => u !== leased.actorUid);
      const selfSuppressed = leased.recipientUids.filter((u) => u === leased.actorUid);

      if (deliverableRecipients.length === 0) {
        await store.setDoc(SOCIAL_COLLECTIONS.outbox, leased.id, {
          ...leased,
          status: 'SUPPRESSED',
          suppressedUids: selfSuppressed,
          leaseOwner: null,
          leaseExpiresAtIso: null,
          lastErrorCode: 'SELF_NOTIFICATION_SUPPRESSED',
          updatedAtIso: nowIso,
        }, true);
        suppressed += 1;
        continue;
      }

      if (this.simulateTransportFailure) {
        const exhausted = leased.attemptCount >= leased.maxAttempts;
        const backoffMs = computeBackoffWithJitterMs(leased.attemptCount);
        await store.setDoc(SOCIAL_COLLECTIONS.outbox, leased.id, {
          ...leased,
          status: exhausted ? 'DEAD_LETTER' : 'PENDING',
          leaseOwner: null,
          leaseExpiresAtIso: null,
          nextAttemptAtIso: new Date(nowMs + backoffMs).toISOString(),
          lastErrorCode: 'TRANSIENT_DELIVERY_FAILURE',
          updatedAtIso: nowIso,
        }, true);
        if (exhausted) deadLettered += 1;
        else retried += 1;
        continue;
      }

      await store.setDoc(SOCIAL_COLLECTIONS.outbox, leased.id, {
        ...leased,
        status: 'DELIVERED',
        deliveredCount: deliverableRecipients.length,
        suppressedUids: selfSuppressed,
        leaseOwner: null,
        leaseExpiresAtIso: null,
        lastErrorCode: null,
        updatedAtIso: nowIso,
      }, true);
      delivered += 1;
    }

    return { processed, delivered, suppressed, retried, deadLettered };
  }

  async replayDeadLetter(outboxId: string, adminUid: string): Promise<SocialOutboxRecord> {
    if (!adminUid) throw new CommunityHttpError(403, 'FORBIDDEN', 'بازپخش DLQ نیازمند احراز مدیر است.');
    const existing = await this.storeProvider().getDoc<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, outboxId);
    if (!existing) throw new CommunityHttpError(404, 'OUTBOX_NOT_FOUND', 'رکورد Outbox یافت نشد.');
    if (existing.status !== 'DEAD_LETTER') {
      throw new CommunityHttpError(409, 'NOT_IN_DEAD_LETTER', 'تنها رویدادهای صف DLQ قابل بازپخش هستند.');
    }
    const nowIso = new Date().toISOString();
    const updated: SocialOutboxRecord = {
      ...existing,
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAtIso: nowIso,
      leaseOwner: null,
      leaseExpiresAtIso: null,
      lastErrorCode: `REPLAY_BY_${adminUid.slice(0, 12)}`,
      updatedAtIso: nowIso,
    };
    await this.storeProvider().setDoc(SOCIAL_COLLECTIONS.outbox, outboxId, updated);
    return updated;
  }

  async getZeroPiiMetrics(): Promise<OutboxWorkerMetrics> {
    const page = await this.storeProvider().queryDocs<SocialOutboxRecord>(SOCIAL_COLLECTIONS.outbox, { limit: 200 });
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
