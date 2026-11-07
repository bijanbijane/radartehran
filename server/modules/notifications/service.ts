import crypto from 'crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  normalizeFirestoreTimestamp,
  requireSafeFirestoreId,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../core';
import {
  CANONICAL_NOTIFICATION_TEMPLATES,
  renderTemplateContent,
  validateAnnouncementInput,
  validatePreferencesInput,
  validateSendDirectInput,
} from './templatesAndValidation';
import type {
  DeliveryJobLifecycleState,
  NotificationChannel,
  NotificationEventPayload,
  NotificationsModuleDependencies,
  StoredNotification,
  StoredNotificationDeliveryJob,
  StoredNotificationPreferences,
} from './types';

export function createNotificationsService(deps: NotificationsModuleDependencies) {
  const idempotencyStore = deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());

  function requireSafeId(rawId: unknown, name: string): string {
    const res = requireSafeFirestoreId()(rawId, name);
    if (!res.ok || !res.value) throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid ${name}.`, res.issues);
    return res.value;
  }

  return {
    /**
     * B & 6. Event-Driven Notification Ingestion Interface
     * Called by event consumers from Bargains, Buyer Alerts, Sponsors, Crowd Claims, Security, Admin
     */
    async dispatchEventNotification(params: {
      event: NotificationEventPayload;
    }): Promise<{ notificationId: string; replayed: boolean; deliveryJobs: StoredNotificationDeliveryJob[] }> {
      const template = CANONICAL_NOTIFICATION_TEMPLATES[params.event.eventType];
      if (!template) {
        throw new CoreApiError('VALIDATION_FAILED', 400, `No template registered for eventType "${params.event.eventType}".`);
      }

      const render = renderTemplateContent(template, params.event.variables);
      if (!render.ok) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid event notification variables.', render.issues);
      }

      const idempotencyKey = params.event.idempotencyKey ?? `evt_${params.event.eventId}_${params.event.recipientUid}`;
      const correlationId = params.event.correlationId ?? `corr_${params.event.eventId}`;

      try {
        const outcome = await executeIdempotentMutation<{ notification: StoredNotification; jobs: StoredNotificationDeliveryJob[] }>({
          store: idempotencyStore,
          actorUid: params.event.recipientUid,
          operation: 'notifications.dispatch_event',
          idempotencyKey,
          requestPayload: params.event,
          nowEpochMs: nowFn(),
          mutationFn: async () => {
            const nowTs = normalizeFirestoreTimestamp(nowFn())!;
            const notificationId = `notif_${crypto.randomBytes(6).toString('hex')}`;

            const result = await runDurableTransaction(deps.txRunner, { operationName: 'notifications.dispatch_event', maxAttempts: 3 }, async (tx) => {
              // 1. Fetch recipient preferences
              const prefSnap = await tx.get<StoredNotificationPreferences>(`notificationPreferences/${params.event.recipientUid}`);
              const prefs: StoredNotificationPreferences = prefSnap.exists && prefSnap.data
                ? prefSnap.data
                : {
                    recipientUid: params.event.recipientUid,
                    inAppEnabled: true,
                    emailEnabled: true,
                    smsEnabled: true,
                    securityAlertsEnabled: true,
                    promotionalEnabled: false,
                    updatedAt: nowTs,
                  };

              // Determine eligible channels based on user preferences and template defaults
              const eligibleChannels: NotificationChannel[] = [];
              for (const ch of template.defaultChannels) {
                if (ch === 'in_app' && prefs.inAppEnabled) eligibleChannels.push('in_app');
                else if (ch === 'email' && prefs.emailEnabled) eligibleChannels.push('email');
                else if (ch === 'sms' && prefs.smsEnabled) eligibleChannels.push('sms');
              }
              // Security alerts bypass non-in_app disables if configured
              if (template.category === 'security' && !eligibleChannels.includes('in_app')) {
                eligibleChannels.push('in_app');
              }

              const notifDoc: StoredNotification = {
                id: notificationId,
                recipientUid: params.event.recipientUid,
                templateId: template.id,
                category: template.category,
                eventType: params.event.eventType,
                titleFa: render.titleFa,
                bodyFa: render.bodyFa,
                variables: render.sanitizedVariables,
                ...(render.deepLink ? { deepLink: render.deepLink } : {}),
                read: false,
                archived: false,
                lifecycleState: 'pending',
                requestedChannels: eligibleChannels,
                eventId: params.event.eventId,
                correlationId,
                createdAt: nowTs,
                updatedAt: nowTs,
              };

              tx.set(`notifications/${notificationId}`, notifDoc as unknown as Record<string, unknown>);

              // Create isolated delivery jobs for external channels (or in_app)
              const jobs: StoredNotificationDeliveryJob[] = [];
              for (const ch of eligibleChannels) {
                const jobId = `job_${notificationId}_${ch}`;
                const jobDoc: StoredNotificationDeliveryJob = {
                  id: jobId,
                  notificationId,
                  recipientUid: params.event.recipientUid,
                  channel: ch,
                  lifecycleState: ch === 'in_app' ? 'delivered' : 'queued',
                  attemptCount: 0,
                  maxRetries: 3,
                  ...(ch === 'in_app' ? { deliveredAt: nowTs } : {}),
                  createdAt: nowTs,
                  updatedAt: nowTs,
                };
                tx.set(`notificationDeliveryJobs/${jobId}`, jobDoc as unknown as Record<string, unknown>);
                jobs.push(jobDoc);
              }

              return { notification: notifDoc, jobs };
            });

            return { statusCode: 201, body: result };
          },
        });

        return {
          notificationId: outcome.body.notification.id,
          replayed: outcome.replayed,
          deliveryJobs: outcome.body.jobs,
        };
      } catch (err) {
        if (err instanceof CoreApiError) throw err;
        throw new CoreApiError('PERSISTENCE_FAILED', 503, err instanceof Error ? err.message : 'Notification dispatch failed.');
      }
    },

    /**
     * E & 5. Delivery Worker: Execute Delivery Job with Retry Limits & Failure Handling
     */
    async executeDeliveryJob(params: {
      jobId: string;
      correlationId: string;
    }): Promise<StoredNotificationDeliveryJob> {
      const jobId = requireSafeId(params.jobId, 'jobId');

      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.execute_delivery', maxAttempts: 3 }, async (tx) => {
        const jobPath = `notificationDeliveryJobs/${jobId}`;
        const jobSnap = await tx.get<StoredNotificationDeliveryJob>(jobPath);
        if (!jobSnap.exists || !jobSnap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Delivery job "${jobId}" not found.`);
        }
        const job = jobSnap.data;
        if (job.lifecycleState === 'delivered' || job.lifecycleState === 'cancelled') {
          return job;
        }

        const notifSnap = await tx.get<StoredNotification>(`notifications/${job.notificationId}`);
        if (!notifSnap.exists || !notifSnap.data) {
          throw new CoreApiError('NOT_FOUND', 404, `Parent notification "${job.notificationId}" not found.`);
        }
        const notif = notifSnap.data;

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const nextAttemptCount = job.attemptCount + 1;

        if (job.channel === 'in_app') {
          const updated: StoredNotificationDeliveryJob = {
            ...job,
            lifecycleState: 'delivered',
            attemptCount: nextAttemptCount,
            deliveredAt: nowTs,
            updatedAt: nowTs,
          };
          tx.set(jobPath, updated as unknown as Record<string, unknown>);
          return updated;
        }

        if (!deps.deliveryAdapter || typeof deps.deliveryAdapter.sendChannelMessage !== 'function') {
          const updated: StoredNotificationDeliveryJob = {
            ...job,
            lifecycleState: nextAttemptCount >= job.maxRetries ? 'failed' : 'attempted',
            attemptCount: nextAttemptCount,
            lastAttemptAt: nowTs,
            failureReason: 'External delivery provider adapter not configured (fail-safe).',
            updatedAt: nowTs,
          };
          tx.set(jobPath, updated as unknown as Record<string, unknown>);
          return updated;
        }

        const sendResult = await deps.deliveryAdapter.sendChannelMessage({
          jobId: job.id,
          notificationId: notif.id,
          recipientUid: notif.recipientUid,
          channel: job.channel,
          titleFa: notif.titleFa,
          bodyFa: notif.bodyFa,
          deepLink: notif.deepLink,
        });

        const nextState: DeliveryJobLifecycleState = sendResult.delivered
          ? 'delivered'
          : nextAttemptCount >= job.maxRetries
            ? 'failed'
            : 'attempted';

        const updated: StoredNotificationDeliveryJob = {
          ...job,
          lifecycleState: nextState,
          attemptCount: nextAttemptCount,
          lastAttemptAt: nowTs,
          ...(sendResult.delivered ? { deliveredAt: nowTs, providerReferenceId: sendResult.providerReferenceId } : {}),
          ...(!sendResult.delivered ? { failureReason: sendResult.failureReason ?? 'External gateway failed.' } : {}),
          updatedAt: nowTs,
        };

        tx.set(jobPath, updated as unknown as Record<string, unknown>);
        return updated;
      });
    },

    /**
     * A. User In-App Notifications: Query, Read, Unread, Delete, Mark All Read & Unread Count
     */
    async getUserNotifications(params: {
      principal: AuthenticatedPrincipal;
      unreadOnly?: boolean;
      limit?: number;
      cursorCreatedAtIso?: string;
    }): Promise<{ notifications: StoredNotification[]; unreadCount: number }> {
      const authz = await authorizePrincipal(params.principal, { minimumRole: 'verified_user' }, deps.adminStore, deps.primaryAdminEmails);
      if (!authz.allowed) throw new CoreApiError('FORBIDDEN', authz.status, authz.reason ?? 'Forbidden.');

      const pageSize = Math.min(Math.max(params.limit ?? 20, 1), 50);

      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.get_user', maxAttempts: 2 }, async (tx) => {
        // Query user notifications index/docs
        const snap = await tx.get<{ items?: StoredNotification[] }>(`userNotificationsIndex/${params.principal.uid}`);
        const allItems: StoredNotification[] = snap.exists && snap.data?.items ? snap.data.items : [];

        // Strict recipient isolation: filter only matching recipientUid and non-archived
        const userNotifs = allItems.filter((n) => n.recipientUid === params.principal.uid && !n.archived);
        const unreadCount = userNotifs.filter((n) => !n.read).length;

        let filtered = params.unreadOnly ? userNotifs.filter((n) => !n.read) : userNotifs;
        if (params.cursorCreatedAtIso) {
          filtered = filtered.filter((n) => n.createdAt.iso < params.cursorCreatedAtIso!);
        }
        const paged = filtered.slice(0, pageSize);
        return { notifications: paged, unreadCount };
      });
    },

    async markNotificationRead(params: {
      principal: AuthenticatedPrincipal;
      notificationId: string;
      read: boolean;
    }): Promise<StoredNotification> {
      const notificationId = requireSafeId(params.notificationId, 'notificationId');
      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.mark_read', maxAttempts: 3 }, async (tx) => {
        const notifPath = `notifications/${notificationId}`;
        const snap = await tx.get<StoredNotification>(notifPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Notification not found.');
        const notif = snap.data;

        // Strict recipient isolation
        if (notif.recipientUid !== params.principal.uid) {
          throw new CoreApiError('FORBIDDEN', 403, 'Cannot modify another user’s notification.');
        }

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const updated: StoredNotification = {
          ...notif,
          read: params.read,
          ...(params.read ? { readAt: nowTs } : { readAt: undefined }),
          updatedAt: nowTs,
        };

        tx.set(notifPath, updated as unknown as Record<string, unknown>);
        return updated;
      });
    },

    async markAllNotificationsRead(params: {
      principal: AuthenticatedPrincipal;
    }): Promise<{ updatedCount: number }> {
      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.mark_all_read', maxAttempts: 3 }, async (tx) => {
        const indexPath = `userNotificationsIndex/${params.principal.uid}`;
        const snap = await tx.get<{ items?: StoredNotification[] }>(indexPath);
        const allItems = snap.exists && snap.data?.items ? snap.data.items : [];
        let updatedCount = 0;
        const nowTs = normalizeFirestoreTimestamp(nowFn())!;

        const updatedItems = allItems.map((n) => {
          if (n.recipientUid === params.principal.uid && !n.read && !n.archived) {
            updatedCount++;
            tx.update(`notifications/${n.id}`, { read: true, readAt: nowTs, updatedAt: nowTs });
            return { ...n, read: true, readAt: nowTs, updatedAt: nowTs };
          }
          return n;
        });

        tx.set(indexPath, { items: updatedItems });
        return { updatedCount };
      });
    },

    async archiveNotification(params: {
      principal: AuthenticatedPrincipal;
      notificationId: string;
    }): Promise<StoredNotification> {
      const notificationId = requireSafeId(params.notificationId, 'notificationId');
      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.archive', maxAttempts: 3 }, async (tx) => {
        const notifPath = `notifications/${notificationId}`;
        const snap = await tx.get<StoredNotification>(notifPath);
        if (!snap.exists || !snap.data) throw new CoreApiError('NOT_FOUND', 404, 'Notification not found.');
        const notif = snap.data;

        if (notif.recipientUid !== params.principal.uid) {
          throw new CoreApiError('FORBIDDEN', 403, 'Cannot archive another user’s notification.');
        }

        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        const updated: StoredNotification = {
          ...notif,
          archived: true,
          archivedAt: nowTs,
          updatedAt: nowTs,
        };
        tx.set(notifPath, updated as unknown as Record<string, unknown>);
        return updated;
      });
    },

    /**
     * C. Notification Preferences: Get and Update
     */
    async getNotificationPreferences(params: {
      principal: AuthenticatedPrincipal;
    }): Promise<StoredNotificationPreferences> {
      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.get_prefs', maxAttempts: 2 }, async (tx) => {
        const snap = await tx.get<StoredNotificationPreferences>(`notificationPreferences/${params.principal.uid}`);
        if (snap.exists && snap.data) return snap.data;
        const nowTs = normalizeFirestoreTimestamp(nowFn())!;
        return {
          recipientUid: params.principal.uid,
          inAppEnabled: true,
          emailEnabled: true,
          smsEnabled: true,
          securityAlertsEnabled: true,
          promotionalEnabled: false,
          updatedAt: nowTs,
        };
      });
    },

    async updateNotificationPreferences(params: {
      principal: AuthenticatedPrincipal;
      rawBody: unknown;
    }): Promise<StoredNotificationPreferences> {
      const validation = validatePreferencesInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid preferences payload.', validation.issues);
      }
      const input = validation.value;

      return runDurableTransaction(deps.txRunner, { operationName: 'notifications.update_prefs', maxAttempts: 3 }, async (tx) => {
        const path = `notificationPreferences/${params.principal.uid}`;
        const snap = await tx.get<StoredNotificationPreferences>(path);
        const current = snap.exists && snap.data ? snap.data : null;
        const nowTs = normalizeFirestoreTimestamp(nowFn())!;

        const updated: StoredNotificationPreferences = {
          recipientUid: params.principal.uid,
          inAppEnabled: input.inAppEnabled ?? current?.inAppEnabled ?? true,
          emailEnabled: input.emailEnabled ?? current?.emailEnabled ?? true,
          smsEnabled: input.smsEnabled ?? current?.smsEnabled ?? true,
          securityAlertsEnabled: true, // Always true (server-enforced security invariant)
          promotionalEnabled: input.promotionalEnabled ?? current?.promotionalEnabled ?? false,
          updatedAt: nowTs,
        };

        tx.set(path, updated as unknown as Record<string, unknown>);
        return updated;
      });
    },

    /**
     * B. Admin Announcement Broadcast Interface
     */
    async broadcastAdminAnnouncement(params: {
      principal: AuthenticatedPrincipal;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ dispatchedCount: number; announcementId: string }> {
      const adminDecision = await verifyAdminOrDelegatedPrincipal(params.principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
        disallowStaticToken: true,
      });
      if (!adminDecision.allowed) {
        throw new CoreApiError('FORBIDDEN', adminDecision.status, adminDecision.reason ?? 'Admin authorization required.');
      }

      const validation = validateAnnouncementInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid announcement payload.', validation.issues);
      }
      const input = validation.value;
      const announcementId = `ann_${crypto.randomBytes(4).toString('hex')}`;
      const targets = input.targetRecipientUids ?? [];

      for (const targetUid of targets) {
        await this.dispatchEventNotification({
          event: {
            eventId: `${announcementId}_${targetUid}`,
            eventType: 'admin.announcement',
            recipientUid: targetUid,
            variables: { messageFa: input.bodyFa },
            ...(input.deepLink ? { deepLinkParams: { deepLink: input.deepLink } } : {}),
            correlationId: params.correlationId,
          },
        });
      }

      if (deps.auditSink) {
        await deps.auditSink.writeAuditEvent(
          createStructuredAuditEvent({
            principal: params.principal,
            correlationId: params.correlationId,
            action: 'notifications.broadcast_announcement',
            targetCollection: 'notifications',
            targetResourceId: announcementId,
            outcome: 'SUCCESS',
            metadata: { count: targets.length, broadcastToAll: input.broadcastToAll },
            nowIso: new Date(nowFn()).toISOString(),
          }),
        );
      }

      return { dispatchedCount: targets.length, announcementId };
    },
  };
}
