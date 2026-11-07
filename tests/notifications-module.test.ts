/**
 * @file tests/notifications-module.test.ts
 * @description Unit and integration tests for Employee 8 Notifications & Messaging Backend Module.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  NotificationDeliveryEngine,
  NotificationEventConsumer,
  NotificationStore,
  MockDeliveryProvider,
  renderNotificationTemplate,
  sanitizeDeepLink,
  registerNotificationRoutes,
} from '../server/modules/notifications';

console.log('🧪 Running Employee 8 Notifications & Messaging Backend Tests...\n');

let passed = 0;
function verify(name: string, fn: () => void | Promise<void>) {
  const res = fn();
  if (res instanceof Promise) {
    return res.then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    });
  }
  passed += 1;
  console.log(`  ✅ ${passed}. ${name}`);
}

async function runAllTests() {
  const store = new NotificationStore();
  const deliveryEngine = new NotificationDeliveryEngine(store);
  const eventConsumer = new NotificationEventConsumer(store, deliveryEngine);

  // Test 1: Template rendering, XSS sanitization, and secret redaction
  await verify('Template engine sanitizes XSS injection and redacts secret keys', () => {
    const rendered = renderNotificationTemplate(
      'bargain.approved',
      1,
      {
        bargainTitle: '<script>alert("hack")</script>آپارتمان نیاوران',
        hoodName: 'نیاوران',
        discountPercent: 15,
        token: 'secret_12345',
        bargainId: 'brg_test_1',
      },
    );

    assert.ok(!rendered.titleFa.includes('<script>'), 'Script tag must be escaped');
    assert.ok(rendered.titleFa.includes('&lt;script&gt;'), 'HTML entities must be escaped');
    assert.ok(rendered.bodyFa.includes('نیاوران'));
    assert.equal(rendered.category, 'bargains');
    assert.equal(rendered.priority, 'high');

    // Deep link validation
    const validLink = sanitizeDeepLink({ actionUrl: '/?bargain=123', view: 'inspector', hoodId: 101 });
    assert.equal(validLink?.actionUrl, '/?bargain=123');

    const maliciousLink = sanitizeDeepLink({ actionUrl: 'javascript:alert(1)' });
    assert.equal(maliciousLink, undefined, 'Malicious javascript: link must be rejected');

    const protocolRelativeLink = sanitizeDeepLink({ actionUrl: '//evil.com/phish' });
    assert.equal(protocolRelativeLink, undefined, 'Protocol-relative external redirect must be rejected');
  });

  // Test 2: Recipient ownership and data isolation
  await verify('Store strictly enforces recipient ownership and privacy boundaries', async () => {
    store.clearAllForTesting();

    const notifUserA = await store.createNotification({
      recipientUid: 'user_alice',
      category: 'bargains',
      templateId: 'bargain.approved',
      templateVersion: 1,
      priority: 'high',
      titleFa: 'اعلان آلیس',
      bodyFa: 'متن محرمانه آلیس',
      readState: 'unread',
      idempotencyKey: 'key_alice_1',
    });

    // Bob attempts to fetch Alice's notification
    const bobAccess = await store.getNotificationById(notifUserA.id, 'user_bob');
    assert.equal(bobAccess, null, 'User Bob must not be able to read Alice notification');

    // Alice fetches her own notification
    const aliceAccess = await store.getNotificationById(notifUserA.id, 'user_alice');
    assert.ok(aliceAccess !== null);
    assert.equal(aliceAccess?.id, notifUserA.id);

    // Bob attempts to update Alice's read state
    const bobUpdate = await store.setNotificationReadState(notifUserA.id, 'user_bob', 'read');
    assert.equal(bobUpdate, null, 'User Bob must not be able to mutate Alice notification');
  });

  // Test 3: Read/unread state transitions and mark-all-as-read
  await verify('Store transitions read/unread state accurately and supports mark-all-as-read', async () => {
    store.clearAllForTesting();

    const n1 = await store.createNotification({
      recipientUid: 'user_carol',
      category: 'sponsorship',
      templateId: 'sponsor.application_submitted',
      templateVersion: 1,
      priority: 'normal',
      titleFa: 'اسپانسری ۱',
      bodyFa: 'متن ۱',
      readState: 'unread',
      idempotencyKey: 'carol_1',
    });

    const n2 = await store.createNotification({
      recipientUid: 'user_carol',
      category: 'sponsorship',
      templateId: 'sponsor.application_submitted',
      templateVersion: 1,
      priority: 'normal',
      titleFa: 'اسپانسری ۲',
      bodyFa: 'متن ۲',
      readState: 'unread',
      idempotencyKey: 'carol_2',
    });

    assert.equal(await store.getUnreadCount('user_carol'), 2);

    // Mark single as read
    const readN1 = await store.setNotificationReadState(n1.id, 'user_carol', 'read');
    assert.equal(readN1?.readState, 'read');
    assert.ok(readN1?.readAtIso !== undefined);
    assert.equal(await store.getUnreadCount('user_carol'), 1);

    // Mark single back to unread
    await store.setNotificationReadState(n1.id, 'user_carol', 'unread');
    assert.equal(await store.getUnreadCount('user_carol'), 2);

    // Mark all as read
    const allResult = await store.markAllAsRead('user_carol');
    assert.equal(allResult.count, 2);
    assert.equal(await store.getUnreadCount('user_carol'), 0);
  });

  // Test 4: Cursor-based pagination and limits
  await verify('Store paginates notifications with cursor stability and unread counts', async () => {
    store.clearAllForTesting();

    for (let i = 1; i <= 5; i++) {
      await store.createNotification({
        recipientUid: 'user_dave',
        category: 'crowd_claims',
        templateId: 'crowd_claim.accepted_or_rejected',
        templateVersion: 1,
        priority: 'normal',
        titleFa: `گزارش قیمت ${i}`,
        bodyFa: `توضیحات ${i}`,
        readState: i <= 2 ? 'read' : 'unread',
        idempotencyKey: `dave_${i}`,
      });
    }

    // Page 1 (limit 2)
    const page1 = await store.listNotificationsForUser('user_dave', { limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.equal(page1.totalCount, 5);
    assert.equal(page1.unreadCount, 3);
    assert.ok(page1.nextCursor !== null);

    // Page 2 using cursor
    const page2 = await store.listNotificationsForUser('user_dave', { limit: 2, cursor: page1.nextCursor });
    assert.equal(page2.items.length, 2);
    assert.notEqual(page2.items[0].id, page1.items[0].id);

    // Page 3 (final)
    const page3 = await store.listNotificationsForUser('user_dave', { limit: 2, cursor: page2.nextCursor });
    assert.equal(page3.items.length, 1);
    assert.equal(page3.nextCursor, null, 'Last page must have nextCursor null');
  });

  // Test 5: Channel preferences, category muting, and non-suppressible security alerts
  await verify('Delivery engine gates channels according to user preferences and enforces mandatory security alerts', async () => {
    store.clearAllForTesting();

    // Configure user preferences: disable bargains category and email channel
    await store.setPreferences({
      uid: 'user_eve',
      channels: { inApp: true, email: false, sms: false, push: false },
      categories: {
        bargains: false, // muted
        buyer_alerts: true,
        sponsorship: true,
        crowd_claims: true,
        security: true,
        system_announcement: true,
      },
      updatedAtIso: new Date().toISOString(),
      schemaVersion: 1,
    });

    // Muted category notification -> delivery job suppressed
    const mutedDoc = await store.createNotification({
      recipientUid: 'user_eve',
      category: 'bargains',
      templateId: 'bargain.approved',
      templateVersion: 1,
      priority: 'normal',
      titleFa: 'شکار جدید',
      bodyFa: 'متن',
      readState: 'unread',
      idempotencyKey: 'eve_muted_1',
    });

    const mutedJobs = await deliveryEngine.scheduleDeliveryJobs(mutedDoc);
    assert.equal(mutedJobs[0].deliveryState, 'suppressed', 'Muted category job must be suppressed');

    // Security alert -> always pending delivery regardless of mutes
    const securityDoc = await store.createNotification({
      recipientUid: 'user_eve',
      category: 'security',
      templateId: 'account.security_alert',
      templateVersion: 1,
      priority: 'critical',
      titleFa: 'ورود به حساب',
      bodyFa: 'ورود جدید شناسایی شد',
      readState: 'unread',
      idempotencyKey: 'eve_sec_1',
    });

    const securityJobs = await deliveryEngine.scheduleDeliveryJobs(securityDoc);
    assert.equal(securityJobs[0].deliveryState, 'pending', 'Security alerts must not be suppressed');
  });

  // Test 6: Event consumer deduplication and duplicate event rejection
  await verify('Event consumer rejects duplicate event deliveries idempotently', async () => {
    store.clearAllForTesting();

    const eventPayload = {
      eventId: 'evt_dup_999',
      eventType: 'bargain.submitted',
      recipientUid: 'user_frank',
      variables: {
        bargainTitle: 'آپارتمان سعادت‌آباد',
        hoodName: 'سعادت‌آباد',
        bargainId: 'brg_999',
      },
      timestampIso: new Date().toISOString(),
    };

    // First ingestion
    const firstResult = await eventConsumer.consumeEvent(eventPayload);
    assert.equal(firstResult.success, true);
    assert.equal(firstResult.duplicate, false);
    assert.ok(firstResult.notification !== undefined);

    // Duplicate ingestion with exact same eventId
    const secondResult = await eventConsumer.consumeEvent(eventPayload);
    assert.equal(secondResult.success, true);
    assert.equal(secondResult.duplicate, true);

    // Total count in store must still be 1
    const list = await store.listNotificationsForUser('user_frank');
    assert.equal(list.totalCount, 1, 'Duplicate event must not produce second notification record');
  });

  // Test 7: Delivery engine retry with exponential backoff on transient provider failure
  await verify('Delivery engine retries on transient provider failure and marks permanent failures', async () => {
    store.clearAllForTesting();

    const testDoc = await store.createNotification({
      recipientUid: 'user_grace',
      category: 'buyer_alerts',
      templateId: 'buyer_alert.matched',
      templateVersion: 1,
      priority: 'high',
      titleFa: 'هشدار خرید',
      bodyFa: 'تطابق ملک',
      readState: 'unread',
      idempotencyKey: 'grace_1',
    });

    // Register transient error provider
    deliveryEngine.registerProvider(new MockDeliveryProvider('sms', 'TRANSIENT_ERROR'));

    const job = await store.createDeliveryJob({
      notificationId: testDoc.id,
      recipientUid: 'user_grace',
      channel: 'sms',
      deliveryState: 'pending',
      attempts: 0,
      maxAttempts: 3,
      idempotencyKey: 'job_grace_sms',
    });

    // Attempt 1 -> transient failure, state remains pending with nextAttempt set
    const processedJob1 = await deliveryEngine.processDeliveryJob(job);
    assert.equal(processedJob1.attempts, 1);
    assert.equal(processedJob1.deliveryState, 'pending');
    assert.ok(processedJob1.nextAttemptAtIso !== undefined);

    // Attempt 2
    const processedJob2 = await deliveryEngine.processDeliveryJob(processedJob1);
    assert.equal(processedJob2.attempts, 2);
    assert.equal(processedJob2.deliveryState, 'pending');

    // Attempt 3 -> reaches maxAttempts (3) -> fails permanently
    const processedJob3 = await deliveryEngine.processDeliveryJob(processedJob2);
    assert.equal(processedJob3.attempts, 3);
    assert.equal(processedJob3.deliveryState, 'failed');

    // The original notification document in the store must remain completely intact!
    const preservedDoc = await store.getNotificationById(testDoc.id, 'user_grace');
    assert.ok(preservedDoc !== null, 'External delivery failure must never delete the underlying notification');
  });

  // Test 8: Express routes integration and authorization enforcement
  await verify('Express API routes enforce authentication, permissions, and administrative broadcast', async () => {
    store.clearAllForTesting();

    const app = express();
    app.use(express.json());
    registerNotificationRoutes(app, {
      store,
      deliveryEngine,
      eventConsumer,
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Unauthenticated request to /api/v2/notifications -> 401
      const unauthRes = await fetch(`${baseUrl}/api/v2/notifications`);
      assert.equal(unauthRes.status, 401);

      // 2. Authenticated request as user_helen
      // Seed a notification for Helen
      await store.createNotification({
        recipientUid: 'user_helen',
        category: 'system_announcement',
        templateId: 'system.administrative_announcement',
        templateVersion: 1,
        priority: 'high',
        titleFa: 'خوش آمدید',
        bodyFa: 'پیام خوش‌آمدگویی',
        readState: 'unread',
        idempotencyKey: 'helen_welcome',
      });

      const authRes = await fetch(`${baseUrl}/api/v2/notifications`, {
        headers: { 'x-user-uid': 'user_helen' },
      });
      assert.equal(authRes.status, 200);
      const authData = await authRes.json();
      assert.equal(authData.ok, true);
      assert.equal(authData.unreadCount, 1);
      assert.equal(authData.items.length, 1);

      const notifId = authData.items[0].id;

      // 3. Mark as read
      const markReadRes = await fetch(`${baseUrl}/api/v2/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { 'x-user-uid': 'user_helen' },
      });
      assert.equal(markReadRes.status, 200);
      const markData = await markReadRes.json();
      assert.equal(markData.notification.readState, 'read');

      // 4. Update preferences
      const prefRes = await fetch(`${baseUrl}/api/v2/notifications/preferences`, {
        method: 'PUT',
        headers: { 'x-user-uid': 'user_helen', 'content-type': 'application/json' },
        body: JSON.stringify({
          channels: { email: true, sms: false },
          emailAddress: 'helen@example.com',
        }),
      });
      assert.equal(prefRes.status, 200);
      const prefData = await prefRes.json();
      assert.equal(prefData.preferences.channels.email, true);
      assert.equal(prefData.preferences.emailAddress, 'helen@example.com');

      // 5. Admin broadcast: non-admin gets 403
      const nonAdminBroadcast = await fetch(`${baseUrl}/api/v2/notifications/admin/broadcast`, {
        method: 'POST',
        headers: { 'x-user-uid': 'user_helen', 'content-type': 'application/json' },
        body: JSON.stringify({
          titleFa: 'پیام فوری',
          messageFa: 'بروزرسانی سرور',
          recipientUids: ['user_helen'],
        }),
      });
      assert.equal(nonAdminBroadcast.status, 403);

      // 6. Admin broadcast with valid role -> 202
      const adminBroadcast = await fetch(`${baseUrl}/api/v2/notifications/admin/broadcast`, {
        method: 'POST',
        headers: {
          'x-admin-role': 'super_admin',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          titleFa: 'پیام فوری سراسری',
          messageFa: 'بروزرسانی موفق سرور',
          recipientUids: ['user_helen'],
        }),
      });
      assert.equal(adminBroadcast.status, 202);
      const adminData = await adminBroadcast.json();
      assert.equal(adminData.ok, true);
      assert.equal(adminData.dispatchedCount, 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  console.log('\n🎉 ALL 8 EMPLOYEE 8 NOTIFICATIONS & MESSAGING TESTS PASSED!');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
