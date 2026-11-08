/**
 * Employee 68 — Notification, Alert Orchestration & Communication Preferences Test Suite
 * (`tests/notification-orchestration-module.test.ts`)
 */

import assert from 'node:assert/strict';
import express from 'express';
import { CoreApiError } from '../server/modules/core';
import type {
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  StructuredAuditEvent,
} from '../server/modules/core/types';
import {
  createDefaultEntityAccessAuthAdapter,
  createInMemoryNotificationOrchestrationTxRunner,
  createNotificationOrchestrationRouter,
  createSandboxChannelDeliveryAdapter,
  NotificationOrchestrationService,
} from '../server/modules/notification-orchestration';

function createTestHarness() {
  const txRunner = createInMemoryNotificationOrchestrationTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];
  const inAppAdapter = createSandboxChannelDeliveryAdapter('IN_APP');
  const emailAdapter = createSandboxChannelDeliveryAdapter('EMAIL');
  const smsAdapter = createSandboxChannelDeliveryAdapter('SMS');
  const pushAdapter = createSandboxChannelDeliveryAdapter('PUSH');

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      if (token === 'token_user_a' || token === 'valid_bearer_token_user_a') return { uid: 'user_a', email: 'user_a@example.com', email_verified: true };
      if (token === 'token_user_b' || token === 'valid_bearer_token_user_b') return { uid: 'user_b', email: 'user_b@example.com', email_verified: true };
      if (token === 'token_admin' || token === 'valid_bearer_token_admin') return { uid: 'admin_1', email: 'admin@radar.ir', email_verified: true, admin: true };
      throw new Error('Invalid token');
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid(uid: string) {
      if (uid === 'admin_1') return { uid: 'admin_1', email: 'admin@radar.ir', role: 'admin', active: true };
      return null;
    },
  };

  const service = new NotificationOrchestrationService({
    tokenVerifier,
    adminStore,
    txRunner,
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    primaryAdminEmails: ['admin@radar.ir'],
    channelAdapters: {
      IN_APP: inAppAdapter,
      EMAIL: emailAdapter,
      SMS: smsAdapter,
      PUSH: pushAdapter,
    },
    entityAuthAdapter: createDefaultEntityAccessAuthAdapter(),
  });

  const userA: AuthenticatedPrincipal = {
    uid: 'user_a',
    email: 'user_a@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const userB: AuthenticatedPrincipal = {
    uid: 'user_b',
    email: 'user_b@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const adminPrincipal: AuthenticatedPrincipal = {
    uid: 'admin_1',
    email: 'admin@radar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: { admin: true },
  };

  return {
    service,
    inAppAdapter,
    emailAdapter,
    smsAdapter,
    pushAdapter,
    auditEvents,
    userA,
    userB,
    adminPrincipal,
    tokenVerifier,
    adminStore,
    txRunner,
  };
}

async function runTests(): Promise<void> {
  console.log('--- Running Employee 68 Notification & Alert Orchestration Tests ---');

  // 1. Event-to-notification mapping, deduplication, template variable validation & XSS escaping
  {
    const h = createTestHarness();

    const first = await h.service.orchestrateDomainEvent({
      eventId: 'evt_price_drop_101',
      sourceDomain: 'EMP_58_LISTING_LIFECYCLE',
      eventType: 'listing.price_dropped',
      category: 'PRICE_CHANGES',
      recipientUid: h.userA.uid,
      templateId: 'tpl_price_change_alert',
      variables: {
        propertyTitle: 'آپارتمان ۱۱۰ متری <script>alert(1)</script>',
        neighborhoodName: 'سعادت‌آباد',
        oldPrice: '۱۲.۵ میلیارد',
        newPrice: '۱۱.۲ میلیارد',
      },
      relatedEntities: { propertyId: 'prop_101' },
      deepLinkPath: '/properties/prop_101',
    });

    assert.ok(first.notification);
    assert.equal(first.deduplicatedReplay, false);
    assert.equal(first.notification.status, 'DELIVERED');
    assert.ok(!first.notification.title.includes('<script>'), 'Must escape script tags in template variables');
    assert.ok(first.notification.title.includes('&lt;script&gt;'));

    // Duplicate event replay returns existing notification without re-sending
    const replay = await h.service.orchestrateDomainEvent({
      eventId: 'evt_price_drop_101',
      sourceDomain: 'EMP_58_LISTING_LIFECYCLE',
      eventType: 'listing.price_dropped',
      category: 'PRICE_CHANGES',
      recipientUid: h.userA.uid,
      templateId: 'tpl_price_change_alert',
      variables: {
        propertyTitle: 'آپارتمان ۱۱۰ متری',
        neighborhoodName: 'سعادت‌آباد',
        oldPrice: '۱۲.۵ میلیارد',
        newPrice: '۱۱.۲ میلیارد',
      },
    });
    assert.equal(replay.deduplicatedReplay, true);
    assert.equal(replay.notification?.notificationId, first.notification.notificationId);

    // Missing required template variable must fail validation
    await assert.rejects(
      () =>
        h.service.orchestrateDomainEvent({
          eventId: 'evt_missing_var_1',
          sourceDomain: 'EMP_66_CUSTOMER_SUPPORT',
          eventType: 'support.case_updated',
          category: 'SUPPORT_CASE_UPDATES',
          recipientUid: h.userA.uid,
          templateId: 'tpl_support_case_update',
          variables: {
            caseId: 'CS-100',
            // missing caseSubject and statusLabel
          },
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );
  }

  // 2. Recipient entity authorization, preference enforcement, consent withdrawal & security-critical bypass
  {
    const h = createTestHarness();

    // Restricted entity reference must be blocked before generating notification
    await assert.rejects(
      () =>
        h.service.orchestrateDomainEvent({
          eventId: 'evt_restricted_entity',
          sourceDomain: 'EMP_63_DOCUMENTS',
          eventType: 'document.shared',
          category: 'DOCUMENT_STATUS_UPDATES',
          recipientUid: h.userA.uid,
          templateId: 'tpl_generic_domain_event',
          variables: { headline: 'سند', summary: 'خلاصه', details: 'جزئیات' },
          relatedEntities: { documentId: 'doc_restricted_secret' },
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Promotional message attempting to use URGENT priority must be rejected
    await assert.rejects(
      () =>
        h.service.orchestrateDomainEvent({
          eventId: 'evt_promo_urgent_abuse',
          sourceDomain: 'ADMIN_SYSTEM',
          eventType: 'promo.blast',
          category: 'ADMINISTRATIVE_ANNOUNCEMENTS',
          recipientUid: h.userA.uid,
          priority: 'URGENT',
          isPromotional: true,
          variables: { headline: 'تبلیغ', summary: 'تبلیغ', details: 'متن' },
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    // Withdraw promotional consent -> promotional announcements are suppressed, but SECURITY_CRITICAL still delivers
    await h.service.updateUserPreferences(h.userA, {
      promotionalOptInGranted: false,
    });

    const promoResult = await h.service.orchestrateDomainEvent({
      eventId: 'evt_promo_suppressed',
      sourceDomain: 'ADMIN_SYSTEM',
      eventType: 'promo.offer',
      category: 'ADMINISTRATIVE_ANNOUNCEMENTS',
      recipientUid: h.userA.uid,
      isPromotional: true,
      variables: { headline: 'پیشنهاد', summary: 'پیشنهاد', details: 'توضیحات' },
    });
    assert.equal(promoResult.notification, null);
    assert.equal(promoResult.suppressedReason, 'PROMOTIONAL_CONSENT_WITHDRAWN');

    const secResult = await h.service.orchestrateDomainEvent({
      eventId: 'evt_sec_alert_1',
      sourceDomain: 'EMP_65_TRUST_VERIFICATION',
      eventType: 'security.password_changed',
      category: 'SECURITY_AND_ACCOUNT_NOTIFICATIONS',
      recipientUid: h.userA.uid,
      templateId: 'tpl_security_critical_alert',
      priority: 'SECURITY_CRITICAL',
      variables: {
        securityAction: 'تغییر گذرواژه و نشست امنیتی',
        timestampText: '۱۴۰۵/۰۸/۱۷',
      },
    });
    assert.ok(secResult.notification);
    assert.equal(secResult.notification.status, 'DELIVERED');
  }

  // 3. Provider outage isolation, retry scheduling & permanent failure classification
  {
    const h = createTestHarness();

    // Simulate transient timeout on EMAIL while IN_APP and PUSH remain healthy
    h.emailAdapter.setSimulatedFailure('TRANSIENT_TIMEOUT');

    const res = await h.service.orchestrateDomainEvent({
      eventId: 'evt_partial_provider_outage',
      sourceDomain: 'EMP_67_MARKETPLACE_BILLING',
      eventType: 'billing.invoice_paid',
      category: 'BILLING_AND_SUBSCRIPTION_UPDATES',
      recipientUid: h.userA.uid,
      templateId: 'tpl_billing_invoice_update',
      variables: {
        invoiceNumber: 'INV-202611-001001',
        amountText: '۵۵۰,۰۰۰ تومان',
        paymentStatus: 'پرداخت موفق',
      },
    });

    assert.ok(res.notification);
    assert.equal(res.notification.status, 'DELIVERED', 'Healthy channels (IN_APP/PUSH) must still deliver');
    assert.ok(res.notification.deliveredChannels.includes('IN_APP'));
    assert.ok(res.notification.failedChannels.includes('EMAIL'));

    const emailAttempt = res.deliveryAttempts.find((a) => a.channel === 'EMAIL')!;
    assert.equal(emailAttempt.status, 'RETRY_SCHEDULED');
    assert.ok(emailAttempt.nextRetryAtIso);

    // Recover EMAIL provider and execute scheduled retry job in the future
    h.emailAdapter.setSimulatedFailure('NONE');
    const futureIso = new Date(Date.now() + 10 * 60_000).toISOString();
    const retryRes = await h.service.executeScheduledAndDigestDeliveryJob(futureIso);
    assert.equal(retryRes.retriedAttemptsCount, 1);
  }

  // 4. Digest batching, Saved Search alerts, In-App Notification Center & Data Isolation
  {
    const h = createTestHarness();

    // Configure SAVED_SEARCH_ALERTS to DAILY_DIGEST
    await h.service.updateUserPreferences(h.userA, {
      categoryPreferences: {
        SAVED_SEARCH_ALERTS: {
          enabled: true,
          channels: ['IN_APP', 'EMAIL'],
          frequency: 'DAILY_DIGEST',
        },
      },
    });

    const alertRes = await h.service.dispatchSavedSearchPropertyAlert({
      recipientUid: h.userA.uid,
      savedSearchId: 'ss_tehran_north',
      searchTitle: 'آپارتمان شمال تهران',
      neighborhoodName: 'زعفرانیه',
      matchedProperties: [
        {
          propertyId: 'prop_stale_unpublished',
          title: 'ملک منقضی‌شده',
          priceText: '۲۰ میلیارد',
          isAvailableAndPublished: false,
        },
        {
          propertyId: 'prop_valid_201',
          title: 'آپارتمان ۱۲۵ متری زعفرانیه',
          priceText: '۲۵ میلیارد تومان',
          isAvailableAndPublished: true,
        },
      ],
      executionWindowKey: '2026-11-08-H06',
    });

    assert.equal(alertRes.dispatched, true);
    assert.equal(alertRes.filteredValidCount, 1, 'Stale/unpublished properties must be filtered out');
    assert.equal(alertRes.notification?.status, 'SCHEDULED', 'Daily digest notification starts SCHEDULED');

    // Run digest job -> delivers digest batch
    const digestJob = await h.service.executeScheduledAndDigestDeliveryJob();
    assert.equal(digestJob.deliveredDigestBatchesCount, 1);

    // In-App Center operations & User B isolation
    const listA = await h.service.listUserNotifications(h.userA);
    assert.equal(listA.totalCount, 1);
    assert.equal(listA.unreadCount, 1);

    const notifId = listA.items[0].notificationId;
    await assert.rejects(
      () => h.service.markNotificationReadStatus(h.userB, notifId, 'READ'),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    const marked = await h.service.markNotificationReadStatus(h.userA, notifId, 'READ');
    assert.equal(marked.readStatus, 'READ');

    // Admin Analytics & Announcements
    const ann = await h.service.createAdministrativeAnnouncement(h.adminPrincipal, {
      title: 'به‌روزرسانی سامانه رادار تهران',
      body: 'امکانات جدید ارزش‌گذاری و نقشه حرارتی فعال شد.',
      targetRecipientUids: [h.userA.uid, h.userB.uid],
    });
    assert.equal(ann.dispatchedCount, 2);

    const analytics = await h.service.getOperationalAnalytics(h.adminPrincipal);
    assert.ok(analytics.totalNotificationsGenerated >= 3);

    // Express Router integration check
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/notifications-orchestration',
      createNotificationOrchestrationRouter(
        {
          tokenVerifier: h.tokenVerifier,
          adminStore: h.adminStore,
          txRunner: h.txRunner,
          auditSink: { async writeAuditEvent() {} },
          primaryAdminEmails: ['admin@radar.ir'],
        },
        h.service,
      ),
    );
    const server = app.listen(0);
    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const resCenter = await fetch(
        `http://127.0.0.1:${port}/api/v1/notifications-orchestration/center`,
        { headers: { Authorization: 'Bearer valid_bearer_token_user_a' } },
      );
      assert.equal(resCenter.status, 200);
    } finally {
      server.close();
    }
  }

  console.log('[PASS] All Employee 68 Notification & Alert Orchestration tests passed!');
}

runTests().catch((err) => {
  console.error('[FAIL] Employee 68 tests failed:', err);
  process.exit(1);
});
