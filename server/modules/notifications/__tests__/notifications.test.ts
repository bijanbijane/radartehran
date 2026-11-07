import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type DelegatedAdminStoreAdapter,
  type FirebaseTokenVerifierAdapter,
  type TransactionContextLike,
  type TransactionRunnerAdapter,
} from '../../core';
import {
  createNotificationsService,
  type ExternalChannelDeliveryProviderAdapter,
  type StoredNotification,
  type StoredNotificationDeliveryJob,
} from '../index';

function createMockFirestoreAdapter() {
  const docs = new Map<string, Record<string, unknown>>();

  const txRunner: TransactionRunnerAdapter = {
    async runTransaction<T>(fn: (tx: TransactionContextLike) => Promise<T>): Promise<T> {
      const staged = new Map<string, Record<string, unknown> | null>();
      const tx: TransactionContextLike = {
        async get<D = Record<string, unknown>>(docPath: string) {
          const current = staged.has(docPath) ? staged.get(docPath) : docs.get(docPath);
          if (!current) return { exists: false, id: docPath.split('/').pop() ?? '', data: undefined };
          return {
            exists: true,
            id: docPath.split('/').pop() ?? '',
            data: structuredClone(current) as D,
          };
        },
        set(docPath: string, data: Record<string, unknown>, setOpts?: { merge?: boolean }) {
          const existing = (staged.has(docPath) ? staged.get(docPath) : docs.get(docPath)) ?? {};
          staged.set(
            docPath,
            setOpts?.merge ? { ...structuredClone(existing), ...structuredClone(data) } : structuredClone(data),
          );
        },
        update(docPath: string, data: Record<string, unknown>) {
          const existing = (staged.has(docPath) ? staged.get(docPath) : docs.get(docPath)) ?? {};
          staged.set(docPath, { ...structuredClone(existing), ...structuredClone(data) });
        },
        delete(docPath: string) {
          staged.set(docPath, null);
        },
      };
      const result = await fn(tx);
      for (const [k, v] of staged.entries()) {
        if (v === null) docs.delete(k);
        else docs.set(k, v);
      }
      return result;
    },
  };

  return { docs, txRunner };
}

const dummyTokenVerifier: FirebaseTokenVerifierAdapter = {
  async verifyIdToken() {
    throw new Error('Not used in direct service tests');
  },
};

const adminStore: DelegatedAdminStoreAdapter = {
  async getDelegatedAdminByUid(uid: string) {
    if (uid === 'admin_notif_1') {
      return { uid, email: 'admin@radartehran.ir', role: 'delegated_admin', active: true };
    }
    return null;
  },
};

const userA: AuthenticatedPrincipal = {
  uid: 'user_recipient_a',
  email: 'usera@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const userB: AuthenticatedPrincipal = {
  uid: 'user_recipient_b',
  email: 'userb@example.com',
  emailVerified: true,
  role: 'verified_user',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

const adminPrincipal: AuthenticatedPrincipal = {
  uid: 'admin_notif_1',
  email: 'admin@radartehran.ir',
  emailVerified: true,
  role: 'delegated_admin',
  authMode: 'firebase_id_token',
  issuedAtSeconds: 1700000000,
  expiresAtSeconds: 1700003600,
  claims: {},
};

test('1. Event-driven notification creation, template rendering, and idempotent deduplication', async () => {
  const db = createMockFirestoreAdapter();
  const service = createNotificationsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  const eventPayload = {
    eventId: 'evt_bargain_101',
    eventType: 'bargain.approved' as const,
    recipientUid: userA.uid,
    variables: { trackingCode: 'BG-101', hoodName: 'نیاوران' },
  };

  // First dispatch: creates notification + delivery jobs
  const first = await service.dispatchEventNotification({ event: eventPayload });
  assert.equal(first.replayed, false);
  assert.ok(first.notificationId);

  const storedNotif = db.docs.get(`notifications/${first.notificationId}`) as unknown as StoredNotification | undefined;
  assert.ok(storedNotif);
  assert.equal(storedNotif.recipientUid, userA.uid);
  assert.equal(storedNotif.titleFa, 'فرصت سرمایه‌گذاری تایید شد');
  assert.match(storedNotif.bodyFa, /نیاوران/);
  assert.equal(storedNotif.read, false);

  // Idempotent retry with same event: returns replayed: true and same notificationId
  const replay = await service.dispatchEventNotification({ event: eventPayload });
  assert.equal(replay.replayed, true);
  assert.equal(replay.notificationId, first.notificationId);

  // Invalid template variable injection fails with 400 VALIDATION_FAILED
  await assert.rejects(
    async () =>
      service.dispatchEventNotification({
        event: {
          eventId: 'evt_bad_var',
          eventType: 'bargain.approved',
          recipientUid: userA.uid,
          variables: { trackingCode: 'BG-102', unapprovedVar: 'inject' },
        },
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'VALIDATION_FAILED' && err.status === 400,
  );
});

test('2. Recipient privacy, data isolation, and read/unread/archive state changes', async () => {
  const db = createMockFirestoreAdapter();
  const service = createNotificationsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  const res = await service.dispatchEventNotification({
    event: {
      eventId: 'evt_sec_001',
      eventType: 'account.security_alert',
      recipientUid: userA.uid,
      variables: { actionName: 'ورود از دستگاه جدید', ipAddress: '192.168.1.1' },
    },
  });

  // Populate userNotificationsIndex for userA
  const notif = db.docs.get(`notifications/${res.notificationId}`) as unknown as StoredNotification;
  db.docs.set(`userNotificationsIndex/${userA.uid}`, { items: [notif] });

  // User B cannot read, modify, or archive User A's notification (403 FORBIDDEN)
  await assert.rejects(
    async () => service.markNotificationRead({ principal: userB, notificationId: res.notificationId, read: true }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  await assert.rejects(
    async () => service.archiveNotification({ principal: userB, notificationId: res.notificationId }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // User A can mark read, unread, and query unreadCount
  const markedRead = await service.markNotificationRead({ principal: userA, notificationId: res.notificationId, read: true });
  assert.equal(markedRead.read, true);

  const markedUnread = await service.markNotificationRead({ principal: userA, notificationId: res.notificationId, read: false });
  assert.equal(markedUnread.read, false);

  const archived = await service.archiveNotification({ principal: userA, notificationId: res.notificationId });
  assert.equal(archived.archived, true);
});

test('3. Delivery retries, failed external providers, and preservation of stored notification', async () => {
  const db = createMockFirestoreAdapter();
  let externalProviderCalled = 0;
  let shouldFailExternal = true;

  const deliveryAdapter: ExternalChannelDeliveryProviderAdapter = {
    async sendChannelMessage() {
      externalProviderCalled++;
      if (shouldFailExternal) {
        return { delivered: false, failureReason: 'SMS_GATEWAY_TIMEOUT' };
      }
      return { delivered: true, providerReferenceId: 'sms_msg_98765' };
    },
  };

  const service = createNotificationsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
    deliveryAdapter,
  });

  const disp = await service.dispatchEventNotification({
    event: {
      eventId: 'evt_sms_01',
      eventType: 'bargain.submitted',
      recipientUid: userA.uid,
      variables: { trackingCode: 'BG-SMS-1', hoodName: 'سعادت‌آباد' },
    },
  });

  const smsJob = disp.deliveryJobs.find((j) => j.channel === 'sms');
  assert.ok(smsJob);

  // Attempt 1 fails: state becomes attempted, attemptCount becomes 1
  const attempt1 = await service.executeDeliveryJob({ jobId: smsJob.id, correlationId: 'corr_att_1' });
  assert.equal(attempt1.lifecycleState, 'attempted');
  assert.equal(attempt1.attemptCount, 1);
  assert.equal(attempt1.failureReason, 'SMS_GATEWAY_TIMEOUT');

  // Attempt 2 and 3 fail: at maxRetries (3), state transitions to failed
  await service.executeDeliveryJob({ jobId: smsJob.id, correlationId: 'corr_att_2' });
  const attempt3 = await service.executeDeliveryJob({ jobId: smsJob.id, correlationId: 'corr_att_3' });
  assert.equal(attempt3.lifecycleState, 'failed');
  assert.equal(attempt3.attemptCount, 3);

  // Critical reliability invariant: failed delivery job does NOT delete or mutate the stored notification
  const preservedNotif = db.docs.get(`notifications/${disp.notificationId}`) as unknown as StoredNotification | undefined;
  assert.ok(preservedNotif);
  assert.equal(preservedNotif.id, disp.notificationId);

  // Recovery: external provider recovers on a new job
  shouldFailExternal = false;
  const disp2 = await service.dispatchEventNotification({
    event: {
      eventId: 'evt_sms_02',
      eventType: 'bargain.submitted',
      recipientUid: userA.uid,
      variables: { trackingCode: 'BG-SMS-2', hoodName: 'سعادت‌آباد' },
    },
  });
  const smsJob2 = disp2.deliveryJobs.find((j) => j.channel === 'sms');
  assert.ok(smsJob2);
  const successAttempt = await service.executeDeliveryJob({ jobId: smsJob2.id, correlationId: 'corr_att_rec' });
  assert.equal(successAttempt.lifecycleState, 'delivered');
  assert.equal(successAttempt.providerReferenceId, 'sms_msg_98765');
});

test('4. Notification preferences enforcement and admin announcement broadcast authorization', async () => {
  const db = createMockFirestoreAdapter();
  const service = createNotificationsService({
    tokenVerifier: dummyTokenVerifier,
    adminStore,
    txRunner: db.txRunner,
  });

  // Non-admin cannot broadcast announcements (403 FORBIDDEN)
  await assert.rejects(
    async () =>
      service.broadcastAdminAnnouncement({
        principal: userA,
        rawBody: { titleFa: 'تست', bodyFa: 'متن اطلاعیه تست', targetRecipientUids: [userB.uid] },
        correlationId: 'corr_unauth_ann',
      }),
    (err: unknown) => err instanceof CoreApiError && err.code === 'FORBIDDEN' && err.status === 403,
  );

  // Update preferences: disable SMS, enable in-app
  await service.updateNotificationPreferences({
    principal: userA,
    rawBody: { smsEnabled: false, inAppEnabled: true },
  });
  const prefs = await service.getNotificationPreferences({ principal: userA });
  assert.equal(prefs.smsEnabled, false);
  assert.equal(prefs.inAppEnabled, true);
  assert.equal(prefs.securityAlertsEnabled, true); // Security alerts always enforced true

  // Event dispatch respects disabled SMS channel: only in_app job created
  const disp = await service.dispatchEventNotification({
    event: {
      eventId: 'evt_pref_check',
      eventType: 'bargain.submitted',
      recipientUid: userA.uid,
      variables: { trackingCode: 'BG-PREF-1', hoodName: 'ونک' },
    },
  });
  assert.equal(disp.deliveryJobs.some((j) => j.channel === 'sms'), false);
  assert.equal(disp.deliveryJobs.some((j) => j.channel === 'in_app'), true);

  // Admin broadcasts announcement
  const annResult = await service.broadcastAdminAnnouncement({
    principal: adminPrincipal,
    rawBody: {
      titleFa: 'به‌روزرسانی مهم سامانه رادار تهران',
      bodyFa: 'قابلیت‌های جدید تحلیل قیمت منتشر شد.',
      targetRecipientUids: [userA.uid, userB.uid],
    },
    correlationId: 'corr_ann_1',
  });
  assert.equal(annResult.dispatchedCount, 2);
});
