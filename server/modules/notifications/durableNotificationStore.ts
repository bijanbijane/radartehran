/**
 * Employee 13 — Durable Outbox, Delivery Job, Preference & Consent Store
 * (`server/modules/notifications/durableNotificationStore.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Guarantees:
 *  - A notification never disappears simply because a server process restarts.
 *  - Outbox entries, in-app notifications, delivery jobs, user preferences, user consent,
 *    and redacted operational logs are persisted atomically (`0o600` disk journal + optional Firestore sync).
 *  - Enforces optimistic concurrency control (`revision` CAS) and serialized mutations.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getFirebaseAdminFirestoreForServer } from '../../../src/utils/serverAdminAndTelegramSecurity';
import {
  DurableNotificationDeliveryJob,
  InAppNotificationRecord,
  NotificationDomainError,
  NotificationOutboxEntry,
  RedactedOperationalLogEntry,
  UserConsentAndOptOutRecord,
  UserNotificationPreferences,
} from './types.ts';

export const NOTIFICATION_OUTBOX_COLLECTION = 'notification_outbox_v2';
export const IN_APP_NOTIFICATIONS_COLLECTION = 'in_app_notifications_v2';
export const NOTIFICATION_DELIVERY_JOBS_COLLECTION = 'notification_delivery_jobs_v2';
export const USER_NOTIFICATION_PREFS_COLLECTION = 'user_notification_preferences_v2';
export const USER_NOTIFICATION_CONSENT_COLLECTION = 'user_notification_consent_v2';

interface DurableNotificationsSnapshot {
  schemaVersion: '2026-05.notifications-journal.v1';
  updatedAtIso: string;
  outboxById: Record<string, NotificationOutboxEntry>;
  outboxIdByDedupKey: Record<string, string>;
  inAppById: Record<string, InAppNotificationRecord>;
  inAppIdByDedupKey: Record<string, string>;
  deliveryJobsById: Record<string, DurableNotificationDeliveryJob>;
  deliveryJobIdByDedupKey: Record<string, string>;
  preferencesByUid: Record<string, UserNotificationPreferences>;
  consentByUid: Record<string, UserConsentAndOptOutRecord>;
  operationalLogs: RedactedOperationalLogEntry[];
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultUserPreferences(
  userUid: string,
  nowIso = new Date().toISOString(),
): UserNotificationPreferences {
  return {
    userUid,
    channelEnabled: {
      IN_APP: true,
      EMAIL: true,
      SMS: false,
      PUSH: true,
    },
    categoryEnabled: {
      CRITICAL_TRANSACTIONAL: true,
      SERVICE_TRANSACTIONAL: true,
      MARKET_ALERT: true,
      PROMOTIONAL_SPONSORSHIP: false,
    },
    sourceMuted: {},
    quietHoursUtc: {
      enabled: false,
      startHourUtc: 20,
      endHourUtc: 4,
    },
    updatedAtIso: nowIso,
    revision: 1,
  };
}

export function createDefaultUserConsent(
  userUid: string,
  nowIso = new Date().toISOString(),
): UserConsentAndOptOutRecord {
  return {
    userUid,
    globalOptOutAllNonCritical: false,
    emailConsentGranted: true,
    smsConsentGranted: false,
    pushConsentGranted: true,
    marketingSponsorshipConsentGranted: false,
    hasConfiguredEmailDestination: true,
    hasConfiguredSmsDestination: true,
    hasConfiguredPushToken: true,
    consentUpdatedAtIso: nowIso,
    revision: 1,
  };
}

export class FirestoreAndJournalNotificationStore {
  private readonly durableJournalPath: string;
  private readonly enableFirestoreSync: boolean;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(options?: {
    durableJournalPath?: string;
    enableFirestoreSync?: boolean;
  }) {
    this.durableJournalPath =
      options?.durableJournalPath ??
      path.resolve(process.cwd(), '.cache', 'notifications-outbox-journal.v1.json');
    this.enableFirestoreSync =
      options?.enableFirestoreSync ??
      Boolean(
        process.env.FIRESTORE_EMULATOR_HOST ||
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      );
  }

  private enqueueExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(fn, fn);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private readSnapshotFromDisk(): DurableNotificationsSnapshot {
    try {
      if (!fs.existsSync(this.durableJournalPath)) {
        return {
          schemaVersion: '2026-05.notifications-journal.v1',
          updatedAtIso: new Date().toISOString(),
          outboxById: {},
          outboxIdByDedupKey: {},
          inAppById: {},
          inAppIdByDedupKey: {},
          deliveryJobsById: {},
          deliveryJobIdByDedupKey: {},
          preferencesByUid: {},
          consentByUid: {},
          operationalLogs: [],
        };
      }
      const raw = fs.readFileSync(this.durableJournalPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DurableNotificationsSnapshot>;
      return {
        schemaVersion: '2026-05.notifications-journal.v1',
        updatedAtIso: parsed.updatedAtIso ?? new Date().toISOString(),
        outboxById: parsed.outboxById ?? {},
        outboxIdByDedupKey: parsed.outboxIdByDedupKey ?? {},
        inAppById: parsed.inAppById ?? {},
        inAppIdByDedupKey: parsed.inAppIdByDedupKey ?? {},
        deliveryJobsById: parsed.deliveryJobsById ?? {},
        deliveryJobIdByDedupKey: parsed.deliveryJobIdByDedupKey ?? {},
        preferencesByUid: parsed.preferencesByUid ?? {},
        consentByUid: parsed.consentByUid ?? {},
        operationalLogs: parsed.operationalLogs ?? [],
      };
    } catch {
      return {
        schemaVersion: '2026-05.notifications-journal.v1',
        updatedAtIso: new Date().toISOString(),
        outboxById: {},
        outboxIdByDedupKey: {},
        inAppById: {},
        inAppIdByDedupKey: {},
        deliveryJobsById: {},
        deliveryJobIdByDedupKey: {},
        preferencesByUid: {},
        consentByUid: {},
        operationalLogs: [],
      };
    }
  }

  private writeSnapshotToDisk(snapshot: DurableNotificationsSnapshot): void {
    const dir = path.dirname(this.durableJournalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const tmpPath = `${this.durableJournalPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tmpPath, this.durableJournalPath);
  }

  private async syncDocToFirestoreBestEffort(
    collectionName: string,
    docId: string,
    docData: unknown,
  ): Promise<void> {
    if (!this.enableFirestoreSync) return;
    try {
      const db = getFirebaseAdminFirestoreForServer(process.env);
      if (!db) return;
      await db.collection(collectionName).doc(docId).set(cloneDeep(docData));
    } catch {
      // Local atomic journal is already committed; Firestore sync is best-effort in non-live environments.
    }
  }

  public async appendOperationalLog(entry: RedactedOperationalLogEntry): Promise<void> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      snap.operationalLogs.push(cloneDeep(entry));
      if (snap.operationalLogs.length > 500) {
        snap.operationalLogs = snap.operationalLogs.slice(-500);
      }
      this.writeSnapshotToDisk(snap);
    });
  }

  public async listOperationalLogs(): Promise<RedactedOperationalLogEntry[]> {
    const snap = this.readSnapshotFromDisk();
    return snap.operationalLogs.map((l) => cloneDeep(l));
  }

  public async getUserPreferences(userUid: string): Promise<UserNotificationPreferences> {
    const snap = this.readSnapshotFromDisk();
    const existing = snap.preferencesByUid[userUid];
    return existing ? cloneDeep(existing) : createDefaultUserPreferences(userUid);
  }

  public async upsertUserPreferences(
    userUid: string,
    updater: (current: UserNotificationPreferences) => UserNotificationPreferences,
  ): Promise<UserNotificationPreferences> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const current = snap.preferencesByUid[userUid] ?? createDefaultUserPreferences(userUid);
      const updated = updater(cloneDeep(current));
      const saved: UserNotificationPreferences = {
        ...cloneDeep(updated),
        userUid,
        // Critical transactional notifications can never be disabled by user preferences
        categoryEnabled: {
          ...updated.categoryEnabled,
          CRITICAL_TRANSACTIONAL: true,
        },
        revision: ( snap.preferencesByUid[userUid]?.revision ?? 0 ) + 1,
      };
      snap.preferencesByUid[userUid] = saved;
      snap.updatedAtIso = saved.updatedAtIso;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(USER_NOTIFICATION_PREFS_COLLECTION, userUid, saved);
      return cloneDeep(saved);
    });
  }

  public async getUserConsent(userUid: string): Promise<UserConsentAndOptOutRecord> {
    const snap = this.readSnapshotFromDisk();
    const existing = snap.consentByUid[userUid];
    return existing ? cloneDeep(existing) : createDefaultUserConsent(userUid);
  }

  public async upsertUserConsent(
    userUid: string,
    updater: (current: UserConsentAndOptOutRecord) => UserConsentAndOptOutRecord,
  ): Promise<UserConsentAndOptOutRecord> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const current = snap.consentByUid[userUid] ?? createDefaultUserConsent(userUid);
      const updated = updater(cloneDeep(current));
      const saved: UserConsentAndOptOutRecord = {
        ...cloneDeep(updated),
        userUid,
        revision: (snap.consentByUid[userUid]?.revision ?? 0) + 1,
      };
      snap.consentByUid[userUid] = saved;
      snap.updatedAtIso = saved.consentUpdatedAtIso;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(USER_NOTIFICATION_CONSENT_COLLECTION, userUid, saved);
      return cloneDeep(saved);
    });
  }

  public async createOrGetOutboxEntry(entry: NotificationOutboxEntry): Promise<{
    entry: NotificationOutboxEntry;
    deduplicatedReplay: boolean;
  }> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const existingId = snap.outboxIdByDedupKey[entry.deduplicationKey];
      if (existingId && snap.outboxById[existingId]) {
        return {
          entry: cloneDeep(snap.outboxById[existingId]),
          deduplicatedReplay: true,
        };
      }
      const saved: NotificationOutboxEntry = { ...cloneDeep(entry), revision: 1 };
      snap.outboxById[saved.outboxId] = saved;
      snap.outboxIdByDedupKey[saved.deduplicationKey] = saved.outboxId;
      snap.updatedAtIso = saved.createdAtIso;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(NOTIFICATION_OUTBOX_COLLECTION, saved.outboxId, saved);
      return { entry: cloneDeep(saved), deduplicatedReplay: false };
    });
  }

  public async listPendingOutboxEntries(limit = 50): Promise<NotificationOutboxEntry[]> {
    const snap = this.readSnapshotFromDisk();
    return Object.values(snap.outboxById)
      .filter((e) => e.status === 'PENDING_GENERATION')
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso))
      .slice(0, limit)
      .map((e) => cloneDeep(e));
  }

  public async updateOutboxEntry(
    outboxId: string,
    expectedRevision: number,
    updater: (current: NotificationOutboxEntry) => NotificationOutboxEntry,
  ): Promise<NotificationOutboxEntry> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const current = snap.outboxById[outboxId];
      if (!current) {
        throw new NotificationDomainError('NOT_FOUND', `Outbox entry "${outboxId}" not found.`, 404);
      }
      if (current.revision !== expectedRevision) {
        throw new NotificationDomainError(
          'CONCURRENT_MODIFICATION_CONFLICT',
          `Revision conflict on outbox entry "${outboxId}".`,
          409,
        );
      }
      const next: NotificationOutboxEntry = {
        ...cloneDeep(updater(cloneDeep(current))),
        revision: current.revision + 1,
      };
      snap.outboxById[outboxId] = next;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(NOTIFICATION_OUTBOX_COLLECTION, outboxId, next);
      return cloneDeep(next);
    });
  }

  public async createOrGetInAppNotification(
    record: InAppNotificationRecord,
  ): Promise<InAppNotificationRecord> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const existingId = snap.inAppIdByDedupKey[record.deduplicationKey];
      if (existingId && snap.inAppById[existingId]) {
        return cloneDeep(snap.inAppById[existingId]);
      }
      const saved: InAppNotificationRecord = { ...cloneDeep(record), revision: 1 };
      snap.inAppById[saved.notificationId] = saved;
      snap.inAppIdByDedupKey[saved.deduplicationKey] = saved.notificationId;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(
        IN_APP_NOTIFICATIONS_COLLECTION,
        saved.notificationId,
        saved,
      );
      return cloneDeep(saved);
    });
  }

  public async listInAppNotificationsForUser(
    recipientUid: string,
    filter?: { readState?: 'UNREAD' | 'READ' | 'ARCHIVED' },
  ): Promise<InAppNotificationRecord[]> {
    const snap = this.readSnapshotFromDisk();
    return Object.values(snap.inAppById)
      .filter(
        (n) =>
          n.recipientUid === recipientUid &&
          (!filter?.readState || n.readState === filter.readState),
      )
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .map((n) => cloneDeep(n));
  }

  public async updateInAppNotification(
    notificationId: string,
    updater: (current: InAppNotificationRecord) => InAppNotificationRecord,
  ): Promise<InAppNotificationRecord> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const current = snap.inAppById[notificationId];
      if (!current) {
        throw new NotificationDomainError(
          'NOT_FOUND',
          `In-app notification "${notificationId}" not found.`,
          404,
        );
      }
      const next: InAppNotificationRecord = {
        ...cloneDeep(updater(cloneDeep(current))),
        revision: current.revision + 1,
      };
      snap.inAppById[notificationId] = next;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(IN_APP_NOTIFICATIONS_COLLECTION, notificationId, next);
      return cloneDeep(next);
    });
  }

  public async createOrGetDeliveryJob(
    job: DurableNotificationDeliveryJob,
  ): Promise<DurableNotificationDeliveryJob> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const existingId = snap.deliveryJobIdByDedupKey[job.deduplicationKey];
      if (existingId && snap.deliveryJobsById[existingId]) {
        return cloneDeep(snap.deliveryJobsById[existingId]);
      }
      const saved: DurableNotificationDeliveryJob = { ...cloneDeep(job), revision: 1 };
      snap.deliveryJobsById[saved.jobId] = saved;
      snap.deliveryJobIdByDedupKey[saved.deduplicationKey] = saved.jobId;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(NOTIFICATION_DELIVERY_JOBS_COLLECTION, saved.jobId, saved);
      return cloneDeep(saved);
    });
  }

  public async getDeliveryJobById(jobId: string): Promise<DurableNotificationDeliveryJob | null> {
    const snap = this.readSnapshotFromDisk();
    const job = snap.deliveryJobsById[jobId];
    return job ? cloneDeep(job) : null;
  }

  public async findDeliveryJobByProviderMessageId(
    providerId: string,
    providerMessageId: string,
  ): Promise<DurableNotificationDeliveryJob | null> {
    const snap = this.readSnapshotFromDisk();
    const found = Object.values(snap.deliveryJobsById).find(
      (j) => j.providerId === providerId && j.providerMessageId === providerMessageId,
    );
    return found ? cloneDeep(found) : null;
  }

  public async listDueDeliveryJobs(nowIso: string, limit = 50): Promise<DurableNotificationDeliveryJob[]> {
    const snap = this.readSnapshotFromDisk();
    return Object.values(snap.deliveryJobsById)
      .filter(
        (j) =>
          (j.status === 'QUEUED_OUTBOX' || j.status === 'RETRY_SCHEDULED') &&
          j.nextAttemptAtIso <= nowIso,
      )
      .sort((a, b) => a.nextAttemptAtIso.localeCompare(b.nextAttemptAtIso))
      .slice(0, limit)
      .map((j) => cloneDeep(j));
  }

  public async listDeliveryJobsForUser(recipientUid: string): Promise<DurableNotificationDeliveryJob[]> {
    const snap = this.readSnapshotFromDisk();
    return Object.values(snap.deliveryJobsById)
      .filter((j) => j.recipientUid === recipientUid)
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso))
      .map((j) => cloneDeep(j));
  }

  public async updateDeliveryJob(
    jobId: string,
    expectedRevision: number,
    updater: (current: DurableNotificationDeliveryJob) => DurableNotificationDeliveryJob,
  ): Promise<DurableNotificationDeliveryJob> {
    return this.enqueueExclusive(async () => {
      const snap = this.readSnapshotFromDisk();
      const current = snap.deliveryJobsById[jobId];
      if (!current) {
        throw new NotificationDomainError('NOT_FOUND', `Delivery job "${jobId}" not found.`, 404);
      }
      if (current.revision !== expectedRevision) {
        throw new NotificationDomainError(
          'CONCURRENT_MODIFICATION_CONFLICT',
          `Revision conflict on delivery job "${jobId}".`,
          409,
        );
      }
      const next: DurableNotificationDeliveryJob = {
        ...cloneDeep(updater(cloneDeep(current))),
        revision: current.revision + 1,
      };
      snap.deliveryJobsById[jobId] = next;
      this.writeSnapshotToDisk(snap);
      await this.syncDocToFirestoreBestEffort(NOTIFICATION_DELIVERY_JOBS_COLLECTION, jobId, next);
      return cloneDeep(next);
    });
  }
}
