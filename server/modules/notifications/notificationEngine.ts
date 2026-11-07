/**
 * Employee 13 — Notification & Messaging Lifecycle Engine
 * (`server/modules/notifications/notificationEngine.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Strictly separates the 4 architectural stages:
 *  1. Event creation (`ingestEventToOutbox`) — durable outbox write, never dispatches inline.
 *  2. Notification generation (`generateNotificationsFromOutbox`) — evaluates preferences,
 *     consent, opt-out, and templates to create in-app records and channel delivery jobs.
 *  3. Delivery attempts (`dispatchDueDeliveryJobs`) — invokes channel adapters with idempotency,
 *     recording `PROVIDER_ACCEPTED_AWAITING_RECEIPT` (`isConfirmedDelivered: false`), retries, or failures.
 *  4. Delivery confirmation (`confirmDeliveryReceipt`) — transitions to `DELIVERED_CONFIRMED`
 *     only upon verified delivery receipt.
 */

import crypto from 'node:crypto';
import { FirestoreAndJournalNotificationStore } from './durableNotificationStore.ts';
import {
  assertAuthorizedForRecipient,
  BASE_RETRY_BACKOFF_MS,
  computeRetryBackoffIso,
  DEFAULT_MAX_DELIVERY_ATTEMPTS,
  evaluateChannelEligibility,
} from './preferenceAndConsentService.ts';
import {
  hashRecipientUidForLog,
  NotificationTemplateRegistry,
  redactPrivateContactDetails,
  resolveEventCategoryClass,
  sanitizeEventVariables,
} from './privacyAndTemplates.ts';
import {
  dispatchThroughChannelAdapter,
  NotificationProviderAdapterBundle,
} from './providerAdapters.ts';
import {
  ALL_NOTIFICATION_EVENT_SOURCES,
  DeliveryReceiptConfirmationInput,
  DurableNotificationDeliveryJob,
  ExternalDeliveryChannel,
  InAppNotificationRecord,
  NotificationActorContext,
  NotificationCategoryClass,
  NotificationChannel,
  NotificationDomainError,
  NotificationDomainEventInput,
  NotificationEventSource,
  NotificationOutboxEntry,
  UserConsentAndOptOutRecord,
  UserNotificationPreferences,
} from './types.ts';

export {
  assertAuthorizedForRecipient,
  BASE_RETRY_BACKOFF_MS,
  computeRetryBackoffIso,
  DEFAULT_MAX_DELIVERY_ATTEMPTS,
  evaluateChannelEligibility,
};

export class NotificationLifecycleEngine {
  private readonly store: FirestoreAndJournalNotificationStore;
  private readonly templateRegistry: NotificationTemplateRegistry;
  private readonly providerAdapters: NotificationProviderAdapterBundle;

  constructor(params: {
    store: FirestoreAndJournalNotificationStore;
    templateRegistry: NotificationTemplateRegistry;
    providerAdapters: NotificationProviderAdapterBundle;
  }) {
    this.store = params.store;
    this.templateRegistry = params.templateRegistry;
    this.providerAdapters = params.providerAdapters;
  }

  public async getUserPreferences(actor: NotificationActorContext, targetUid: string): Promise<UserNotificationPreferences> {
    assertAuthorizedForRecipient(actor, targetUid);
    return this.store.getUserPreferences(targetUid);
  }

  public async updateUserPreferences(
    actor: NotificationActorContext,
    targetUid: string,
    patch: {
      channelEnabled?: Partial<Record<NotificationChannel, boolean>>;
      categoryEnabled?: Partial<Record<NotificationCategoryClass, boolean>>;
      sourceMuted?: Partial<Record<NotificationEventSource, boolean>>;
      quietHoursUtc?: UserNotificationPreferences['quietHoursUtc'];
    },
  ): Promise<UserNotificationPreferences> {
    assertAuthorizedForRecipient(actor, targetUid);
    const nowIso = new Date().toISOString();
    const updated = await this.store.upsertUserPreferences(targetUid, (curr) => ({
      ...curr,
      channelEnabled: { ...curr.channelEnabled, ...patch.channelEnabled },
      categoryEnabled: { ...curr.categoryEnabled, ...patch.categoryEnabled, CRITICAL_TRANSACTIONAL: true },
      sourceMuted: { ...curr.sourceMuted, ...patch.sourceMuted },
      quietHoursUtc: patch.quietHoursUtc ?? curr.quietHoursUtc,
      updatedAtIso: nowIso,
    }));
    await this.store.appendOperationalLog({
      logId: `log_${crypto.randomUUID().slice(0, 8)}`,
      timestampIso: nowIso,
      stage: 'PREFERENCE_UPDATE',
      recipientUidHash: hashRecipientUidForLog(targetUid),
      status: 'PREFERENCES_UPDATED',
      redactedMessage: `Notification preferences updated (revision ${updated.revision}).`,
    });
    return updated;
  }

  public async getUserConsent(actor: NotificationActorContext, targetUid: string): Promise<UserConsentAndOptOutRecord> {
    assertAuthorizedForRecipient(actor, targetUid);
    return this.store.getUserConsent(targetUid);
  }

  public async updateUserConsent(
    actor: NotificationActorContext,
    targetUid: string,
    patch: Partial<Omit<UserConsentAndOptOutRecord, 'userUid' | 'consentUpdatedAtIso' | 'revision'>>,
  ): Promise<UserConsentAndOptOutRecord> {
    assertAuthorizedForRecipient(actor, targetUid);
    const nowIso = new Date().toISOString();
    const updated = await this.store.upsertUserConsent(targetUid, (curr) => ({
      ...curr,
      ...patch,
      consentUpdatedAtIso: nowIso,
    }));
    await this.store.appendOperationalLog({
      logId: `log_${crypto.randomUUID().slice(0, 8)}`,
      timestampIso: nowIso,
      stage: 'PREFERENCE_UPDATE',
      recipientUidHash: hashRecipientUidForLog(targetUid),
      status: updated.globalOptOutAllNonCritical ? 'GLOBAL_OPT_OUT_ENABLED' : 'CONSENT_UPDATED',
      redactedMessage: redactPrivateContactDetails(`User consent updated (globalOptOut=${updated.globalOptOutAllNonCritical}).`),
    });
    return updated;
  }

  // STAGE 1: EVENT CREATION / DURABLE OUTBOX INGESTION
  public async ingestEventToOutbox(input: NotificationDomainEventInput): Promise<{
    outboxEntry: NotificationOutboxEntry;
    deduplicatedReplay: boolean;
  }> {
    if (!ALL_NOTIFICATION_EVENT_SOURCES.includes(input.source)) {
      throw new NotificationDomainError(
        'INVALID_EVENT_CONTRACT',
        `Unsupported notification event source "${String(input.source)}".`,
      );
    }
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    const recipientUid = typeof input.recipientUid === 'string' ? input.recipientUid.trim() : '';
    if (idempotencyKey.length < 4 || !recipientUid) {
      throw new NotificationDomainError(
        'INVALID_EVENT_CONTRACT',
        'Valid idempotencyKey (min 4 chars) and recipientUid are required.',
      );
    }

    const template = this.templateRegistry.resolveTemplate({
      source: input.source,
      eventType: input.eventType,
      templateId: input.templateId,
    });
    const sanitizedVariables = sanitizeEventVariables(input.variables);
    this.templateRegistry.renderTemplate(template, sanitizedVariables);

    const nowIso = new Date().toISOString();
    const deduplicationKey = `${input.source}:${input.eventType}:${recipientUid}:${idempotencyKey}`;
    const requestedChannels: NotificationChannel[] =
      input.requestedChannels && input.requestedChannels.length > 0
        ? Array.from(new Set(input.requestedChannels))
        : ['IN_APP', 'EMAIL', 'PUSH'];

    const outboxEntry: NotificationOutboxEntry = {
      outboxId: `outbox_${crypto.randomUUID().slice(0, 12)}`,
      deduplicationKey,
      source: input.source,
      eventType: input.eventType,
      categoryClass: resolveEventCategoryClass(input.source, input.eventType),
      recipientUid,
      templateId: template.templateId,
      requestedChannels,
      sanitizedVariables,
      status: 'PENDING_GENERATION',
      generatedInAppNotificationId: null,
      generatedDeliveryJobIds: [],
      occurredAtIso: input.occurredAtIso ?? nowIso,
      createdAtIso: nowIso,
      processedAtIso: null,
      revision: 1,
    };

    const result = await this.store.createOrGetOutboxEntry(outboxEntry);
    await this.store.appendOperationalLog({
      logId: `log_${crypto.randomUUID().slice(0, 8)}`,
      timestampIso: nowIso,
      stage: 'EVENT_INGESTION',
      recipientUidHash: hashRecipientUidForLog(recipientUid),
      outboxId: result.entry.outboxId,
      status: result.deduplicatedReplay ? 'DEDUPLICATED_OUTBOX_REPLAY' : 'OUTBOX_PERSISTED',
      redactedMessage: `Event ${input.source}:${input.eventType} recorded in durable outbox.`,
    });

    return { outboxEntry: result.entry, deduplicatedReplay: result.deduplicatedReplay };
  }

  // STAGE 2: NOTIFICATION GENERATION FROM DURABLE OUTBOX
  public async generateNotificationsFromOutbox(limit = 50): Promise<{
    processedCount: number;
    generatedInAppIds: string[];
    generatedDeliveryJobIds: string[];
  }> {
    const pendingEntries = await this.store.listPendingOutboxEntries(limit);
    const generatedInAppIds: string[] = [];
    const generatedDeliveryJobIds: string[] = [];

    for (const entry of pendingEntries) {
      const nowIso = new Date().toISOString();
      const template = this.templateRegistry.resolveTemplate({
        source: entry.source,
        eventType: entry.eventType,
        templateId: entry.templateId,
      });
      const rendered = this.templateRegistry.renderTemplate(template, entry.sanitizedVariables);
      const preferences = await this.store.getUserPreferences(entry.recipientUid);
      const consent = await this.store.getUserConsent(entry.recipientUid);

      let inAppId: string | null = null;
      const jobIdsForEntry: string[] = [];

      for (const channel of entry.requestedChannels) {
        const eligibility = evaluateChannelEligibility({
          channel,
          source: entry.source,
          categoryClass: entry.categoryClass,
          preferences,
          consent,
        });

        if (channel === 'IN_APP') {
          if (eligibility.allowed) {
            const inAppRecord = await this.store.createOrGetInAppNotification({
              notificationId: `inapp_${crypto.randomUUID().slice(0, 12)}`,
              outboxId: entry.outboxId,
              deduplicationKey: `${entry.deduplicationKey}:IN_APP`,
              recipientUid: entry.recipientUid,
              source: entry.source,
              eventType: entry.eventType,
              categoryClass: entry.categoryClass,
              titleFa: rendered.subjectFa,
              previewFa: rendered.previewFa,
              bodyFa: rendered.bodyFa,
              actionPath: rendered.actionPath,
              readState: 'UNREAD',
              readAtIso: null,
              archivedAtIso: null,
              createdAtIso: nowIso,
              updatedAtIso: nowIso,
              revision: 1,
            });
            inAppId = inAppRecord.notificationId;
            generatedInAppIds.push(inAppRecord.notificationId);
          }
          continue;
        }

        const extChannel = channel as ExternalDeliveryChannel;
        const job = await this.store.createOrGetDeliveryJob({
          jobId: `njob_${extChannel.toLowerCase()}_${crypto.randomUUID().slice(0, 10)}`,
          outboxId: entry.outboxId,
          deduplicationKey: `${entry.deduplicationKey}:${extChannel}`,
          recipientUid: entry.recipientUid,
          source: entry.source,
          eventType: entry.eventType,
          categoryClass: entry.categoryClass,
          channel: extChannel,
          templateId: rendered.templateId,
          renderedSubjectFa: rendered.subjectFa,
          renderedPreviewFa: rendered.previewFa,
          renderedBodyFa: rendered.bodyFa,
          status: eligibility.allowed ? 'QUEUED_OUTBOX' : 'SUPPRESSED_PREFERENCE_OR_CONSENT',
          isConfirmedDelivered: false,
          suppressionReason: eligibility.suppressionReason,
          providerId: null,
          providerMessageId: null,
          attempts: 0,
          maxAttempts: DEFAULT_MAX_DELIVERY_ATTEMPTS,
          nextAttemptAtIso: nowIso,
          attemptHistory: [],
          lastErrorRedacted: null,
          providerAcceptedAtIso: null,
          confirmedDeliveredAtIso: null,
          failedPermanentlyAtIso: null,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
          revision: 1,
        });
        jobIdsForEntry.push(job.jobId);
        generatedDeliveryJobIds.push(job.jobId);
      }

      await this.store.updateOutboxEntry(entry.outboxId, entry.revision, (curr) => ({
        ...curr,
        status: 'GENERATED',
        generatedInAppNotificationId: inAppId,
        generatedDeliveryJobIds: jobIdsForEntry,
        processedAtIso: nowIso,
      }));
    }

    return { processedCount: pendingEntries.length, generatedInAppIds, generatedDeliveryJobIds };
  }

  // IN-APP NOTIFICATIONS & READ/UNREAD/ARCHIVED STATE
  public async listUserInAppNotifications(
    actor: NotificationActorContext,
    recipientUid: string,
    filter?: { readState?: 'UNREAD' | 'READ' | 'ARCHIVED' },
  ): Promise<InAppNotificationRecord[]> {
    assertAuthorizedForRecipient(actor, recipientUid);
    return this.store.listInAppNotificationsForUser(recipientUid, filter);
  }

  public async updateInAppReadState(
    actor: NotificationActorContext,
    notificationId: string,
    targetState: 'UNREAD' | 'READ' | 'ARCHIVED',
  ): Promise<InAppNotificationRecord> {
    const nowIso = new Date().toISOString();
    return this.store.updateInAppNotification(notificationId, (curr) => {
      assertAuthorizedForRecipient(actor, curr.recipientUid);
      return {
        ...curr,
        readState: targetState,
        readAtIso: targetState === 'READ' ? (curr.readAtIso ?? nowIso) : targetState === 'UNREAD' ? null : curr.readAtIso,
        archivedAtIso: targetState === 'ARCHIVED' ? nowIso : null,
        updatedAtIso: nowIso,
      };
    });
  }

  public async markAllInAppNotificationsRead(
    actor: NotificationActorContext,
    recipientUid: string,
  ): Promise<number> {
    assertAuthorizedForRecipient(actor, recipientUid);
    const unread = await this.store.listInAppNotificationsForUser(recipientUid, { readState: 'UNREAD' });
    for (const item of unread) {
      await this.updateInAppReadState(actor, item.notificationId, 'READ');
    }
    return unread.length;
  }

  // STAGE 3: DELIVERY ATTEMPTS (PROVIDER ACCEPTANCE != CONFIRMED DELIVERY)
  public async dispatchDueDeliveryJobs(options?: { nowIso?: string; limit?: number }): Promise<DurableNotificationDeliveryJob[]> {
    const nowIso = options?.nowIso ?? new Date().toISOString();
    const dueJobs = await this.store.listDueDeliveryJobs(nowIso, options?.limit ?? 50);
    const updatedJobs: DurableNotificationDeliveryJob[] = [];
    for (const job of dueJobs) {
      updatedJobs.push(await this.dispatchSingleDeliveryJob(job.jobId, nowIso));
    }
    return updatedJobs;
  }

  public async dispatchSingleDeliveryJob(jobId: string, nowIso = new Date().toISOString()): Promise<DurableNotificationDeliveryJob> {
    const current = await this.store.getDeliveryJobById(jobId);
    if (!current) throw new NotificationDomainError('NOT_FOUND', `Delivery job "${jobId}" not found.`, 404);
    if (
      current.status === 'DELIVERED_CONFIRMED' ||
      current.status === 'PROVIDER_ACCEPTED_AWAITING_RECEIPT' ||
      current.status === 'SUPPRESSED_PREFERENCE_OR_CONSENT'
    ) {
      return current;
    }

    const attemptNumber = current.attempts + 1;
    const response = await dispatchThroughChannelAdapter(this.providerAdapters, current.channel, {
      jobId: current.jobId,
      deduplicationKey: current.deduplicationKey,
      recipientUid: current.recipientUid,
      channel: current.channel,
      subjectFa: current.renderedSubjectFa,
      previewFa: current.renderedPreviewFa,
      bodyFa: current.renderedBodyFa,
    });
    const redactedDiagnostic = redactPrivateContactDetails(response.diagnosticMessage);

    const updated = await this.store.updateDeliveryJob(current.jobId, current.revision, (curr) => {
      const historyEntry = {
        attemptNumber,
        attemptedAtIso: nowIso,
        outcome:
          response.outcome === 'ACCEPTED_BY_PROVIDER'
            ? ('PROVIDER_ACCEPTED' as const)
            : response.outcome === 'TRANSIENT_FAILURE'
              ? ('TRANSIENT_ERROR' as const)
              : response.outcome === 'PROVIDER_NOT_CONFIGURED'
                ? ('UNCONFIGURED_PROVIDER_BLOCKED' as const)
                : ('PERMANENT_ERROR' as const),
        providerId: response.providerId,
        providerMessageId: response.providerMessageId,
        redactedDiagnostic,
      };
      if (response.outcome === 'ACCEPTED_BY_PROVIDER') {
        return {
          ...curr,
          status: 'PROVIDER_ACCEPTED_AWAITING_RECEIPT',
          isConfirmedDelivered: false,
          providerId: response.providerId,
          providerMessageId: response.providerMessageId ?? null,
          attempts: attemptNumber,
          attemptHistory: [...curr.attemptHistory, historyEntry],
          lastErrorRedacted: null,
          providerAcceptedAtIso: nowIso,
          updatedAtIso: nowIso,
        };
      }
      const isPermanent =
        response.outcome === 'PERMANENT_FAILURE' ||
        response.outcome === 'PROVIDER_NOT_CONFIGURED' ||
        attemptNumber >= curr.maxAttempts;
      return {
        ...curr,
        status: isPermanent ? 'FAILED_PERMANENT' : 'RETRY_SCHEDULED',
        isConfirmedDelivered: false,
        providerId: response.providerId,
        attempts: attemptNumber,
        nextAttemptAtIso: isPermanent ? curr.nextAttemptAtIso : computeRetryBackoffIso(attemptNumber, Date.parse(nowIso)),
        attemptHistory: [...curr.attemptHistory, historyEntry],
        lastErrorRedacted: redactedDiagnostic,
        failedPermanentlyAtIso: isPermanent ? nowIso : null,
        updatedAtIso: nowIso,
      };
    });

    await this.store.appendOperationalLog({
      logId: `log_${crypto.randomUUID().slice(0, 8)}`,
      timestampIso: nowIso,
      stage: 'DELIVERY_ATTEMPT',
      recipientUidHash: hashRecipientUidForLog(updated.recipientUid),
      outboxId: updated.outboxId,
      jobId: updated.jobId,
      channel: updated.channel,
      status: updated.status,
      redactedMessage: redactedDiagnostic,
    });
    return updated;
  }

  // STAGE 4: DELIVERY CONFIRMATION (WEBHOOK / DLR RECEIPT)
  public async confirmDeliveryReceipt(receipt: DeliveryReceiptConfirmationInput): Promise<DurableNotificationDeliveryJob> {
    const job = await this.store.findDeliveryJobByProviderMessageId(receipt.providerId, receipt.providerMessageId);
    if (!job) {
      throw new NotificationDomainError(
        'NOT_FOUND',
        `No delivery job found for provider "${receipt.providerId}" message "${receipt.providerMessageId}".`,
        404,
      );
    }
    if (job.status === 'DELIVERED_CONFIRMED' && receipt.receiptStatus === 'DELIVERED') return job;

    const nowIso = receipt.confirmedAtIso ?? new Date().toISOString();
    const redactedNote = redactPrivateContactDetails(receipt.diagnosticNote ?? `Provider receipt: ${receipt.receiptStatus}`);
    const updated = await this.store.updateDeliveryJob(job.jobId, job.revision, (curr) => {
      if (receipt.receiptStatus === 'DELIVERED') {
        return { ...curr, status: 'DELIVERED_CONFIRMED', isConfirmedDelivered: true, confirmedDeliveredAtIso: nowIso, lastErrorRedacted: null, updatedAtIso: nowIso };
      }
      if (receipt.receiptStatus === 'TEMPORARY_FAILURE' && curr.attempts < curr.maxAttempts) {
        return { ...curr, status: 'RETRY_SCHEDULED', isConfirmedDelivered: false, nextAttemptAtIso: computeRetryBackoffIso(curr.attempts, Date.parse(nowIso)), lastErrorRedacted: redactedNote, updatedAtIso: nowIso };
      }
      return { ...curr, status: 'FAILED_PERMANENT', isConfirmedDelivered: false, failedPermanentlyAtIso: nowIso, lastErrorRedacted: redactedNote, updatedAtIso: nowIso };
    });

    await this.store.appendOperationalLog({
      logId: `log_${crypto.randomUUID().slice(0, 8)}`,
      timestampIso: nowIso,
      stage: 'DELIVERY_CONFIRMATION',
      recipientUidHash: hashRecipientUidForLog(updated.recipientUid),
      outboxId: updated.outboxId,
      jobId: updated.jobId,
      channel: updated.channel,
      status: updated.status,
      redactedMessage: redactedNote,
    });
    return updated;
  }
}
