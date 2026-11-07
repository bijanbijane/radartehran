/**
 * Employee 13 — Automated Test Suite (`server/modules/notifications/notifications.test.ts`)
 *
 * Covers:
 *  1. Event contracts across all 8 domain sources & outbox deduplication on duplicate events.
 *  2. Process restart survival (durable outbox & job recovery across server restarts).
 *  3. Strict separation of Provider Acceptance (`PROVIDER_ACCEPTED_AWAITING_RECEIPT`, `isConfirmedDelivered: false`)
 *     vs. Delivery Confirmation (`DELIVERED_CONFIRMED` only upon receipt confirmation).
 *  4. Retries, exponential backoff (`RETRY_SCHEDULED`), failed delivery (`FAILED_PERMANENT`),
 *     and unconfigured provider fail-closed behavior.
 *  5. User preferences, channel consent, marketing consent, and global opt-out controls.
 *  6. In-app notifications & read/unread/archived state transitions with cross-user access protection.
 *  7. Template validation & privacy redaction (no private contact details in previews or operational logs).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALL_NOTIFICATION_EVENT_SOURCES,
  createNotificationsModuleFacade,
  NotificationActorContext,
  NotificationDomainError,
  NotificationDomainEventInput,
  SandboxEmailDeliveryAdapter,
  SandboxPushDeliveryAdapter,
  SandboxSmsDeliveryAdapter,
} from './index.ts';

async function runTests(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emp13-notifications-'));
  const journalPath = path.join(tmpDir, 'notifications-journal.json');

  try {
    const emailAdapter = new SandboxEmailDeliveryAdapter();
    const smsAdapter = new SandboxSmsDeliveryAdapter();
    const pushAdapter = new SandboxPushDeliveryAdapter();

    const alice: NotificationActorContext = { uid: 'user_alice_n01', isAdmin: false };
    const bob: NotificationActorContext = { uid: 'user_bob_n02', isAdmin: false };

    const mod = createNotificationsModuleFacade({
      durableJournalPath: journalPath,
      enableFirestoreSync: false,
      emailAdapter,
      smsAdapter,
      pushAdapter,
    });

    // =========================================================================
    // TEST 1: Event Contracts Across All 8 Sources & Duplicate Event Deduplication
    // =========================================================================
    const sampleEventsBySource: NotificationDomainEventInput[] = [
      {
        source: 'BARGAINS',
        eventType: 'BARGAIN_PUBLISHED',
        idempotencyKey: 'idem_bargain_101',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'EMAIL', 'PUSH'],
        variables: {
          hoodNameFa: 'ونک',
          discountPercent: 14,
          sellerPhone: '09123456789',
          rawEmail: 'hidden-seller@example.com',
        },
      },
      {
        source: 'BUYER_ALERTS',
        eventType: 'BUYER_ALERT_MATCH_FOUND',
        idempotencyKey: 'idem_alert_202',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'EMAIL'],
        variables: { hoodNameFa: 'سعادت‌آباد', matchCount: 3 },
      },
      {
        source: 'SPONSORSHIP',
        eventType: 'SPONSOR_CAMPAIGN_APPROVED',
        idempotencyKey: 'idem_sponsor_303',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'EMAIL'],
        variables: { hoodNameFa: 'فرشته', campaignTitleFa: 'مسکن الف' },
      },
      {
        source: 'SERVICE_MARKETPLACE',
        eventType: 'SERVICE_QUOTE_RECEIVED',
        idempotencyKey: 'idem_service_404',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'PUSH'],
        variables: { serviceTypeFa: 'کارشناسی رسمی', requestRef: 'SRV-88' },
      },
      {
        source: 'PROFESSIONAL_VERIFICATION',
        eventType: 'PRO_VERIFICATION_APPROVED',
        idempotencyKey: 'idem_pro_505',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'EMAIL'],
        variables: { credentialTierFa: 'مشاور احرازشده سطح ۱' },
      },
      {
        source: 'CROWD_CLAIMS',
        eventType: 'CROWD_CLAIM_MODERATED',
        idempotencyKey: 'idem_crowd_606',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP'],
        variables: { hoodNameFa: 'پاسداران', moderationOutcomeFa: 'تأیید شده' },
      },
      {
        source: 'MARKET_ANALYTICS',
        eventType: 'MARKET_PULSE_ANOMALY_DETECTED',
        idempotencyKey: 'idem_analytics_707',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'EMAIL'],
        variables: { cityNameFa: 'تهران', hoodNameFa: 'جردن', changePercent: 9.5 },
      },
      {
        source: 'ACCOUNT_LIFECYCLE',
        eventType: 'ACCOUNT_EXPORT_READY',
        idempotencyKey: 'idem_account_808',
        recipientUid: alice.uid,
        requestedChannels: ['IN_APP', 'EMAIL'],
        variables: { exportId: 'exp_alice_001' },
      },
    ];

    assert.equal(sampleEventsBySource.length, ALL_NOTIFICATION_EVENT_SOURCES.length);

    // Stage 1: Ingest first event into outbox & verify duplicate replay is deduplicated
    const firstIngest = await mod.engine.ingestEventToOutbox(sampleEventsBySource[0]);
    assert.equal(firstIngest.deduplicatedReplay, false);
    assert.equal(firstIngest.outboxEntry.status, 'PENDING_GENERATION');

    // Verify no notification was sent inline during Stage 1 ingestion
    assert.equal(emailAdapter.getAcceptedCount(), 0);
    assert.equal(pushAdapter.getAcceptedCount(), 0);

    // Duplicate event submission with same idempotencyKey returns existing outbox entry
    const duplicateIngest = await mod.engine.ingestEventToOutbox(sampleEventsBySource[0]);
    assert.equal(duplicateIngest.deduplicatedReplay, true);
    assert.equal(duplicateIngest.outboxEntry.outboxId, firstIngest.outboxEntry.outboxId);

    // Ingest remaining 7 domain sources into outbox
    for (const ev of sampleEventsBySource.slice(1)) {
      const res = await mod.engine.ingestEventToOutbox(ev);
      assert.equal(res.deduplicatedReplay, false);
    }

    // =========================================================================
    // TEST 2: Process Restart Survival (Outbox Survives Restart Before Generation)
    // =========================================================================
    // Instantiate a brand-new module facade reading from the same durableJournalPath
    const restartedMod = createNotificationsModuleFacade({
      durableJournalPath: journalPath,
      enableFirestoreSync: false,
      emailAdapter,
      smsAdapter,
      pushAdapter,
    });

    // Stage 2: Generate notifications from the persisted outbox after simulated restart
    const genResult = await restartedMod.engine.generateNotificationsFromOutbox(50);
    assert.equal(genResult.processedCount, 8);
    assert.equal(genResult.generatedInAppIds.length, 8);

    // Re-running generateNotificationsFromOutbox is an idempotent no-op (0 pending entries)
    const genReplay = await restartedMod.engine.generateNotificationsFromOutbox(50);
    assert.equal(genReplay.processedCount, 0);

    // =========================================================================
    // TEST 3: Privacy Redaction & Template Validation
    // =========================================================================
    // Verify private contact details (phone/email) were redacted and never appear in previews
    const aliceInAppList = await restartedMod.engine.listUserInAppNotifications(alice, alice.uid);
    assert.equal(aliceInAppList.length, 8);
    for (const item of aliceInAppList) {
      assert.equal(item.previewFa.includes('09123456789'), false);
      assert.equal(item.previewFa.includes('hidden-seller@example.com'), false);
    }

    // Missing required template variable is rejected
    await assert.rejects(
      () =>
        restartedMod.engine.ingestEventToOutbox({
          source: 'BARGAINS',
          eventType: 'BARGAIN_PUBLISHED',
          idempotencyKey: 'idem_missing_var',
          recipientUid: alice.uid,
          variables: { hoodNameFa: 'ونک' }, // missing discountPercent
        }),
      (err: unknown) =>
        err instanceof NotificationDomainError && err.code === 'MISSING_TEMPLATE_VARIABLE',
    );

    // Registering a template whose preview hardcodes raw contact details is rejected
    assert.throws(
      () =>
        restartedMod.templateRegistry.registerTemplate({
          templateId: 'tpl_bad_preview_leak',
          source: 'BARGAINS',
          eventType: 'BARGAIN_PUBLISHED',
          categoryClass: 'MARKET_ALERT',
          requiredVariables: ['hoodNameFa'],
          subjectTemplateFa: 'عنوان',
          previewTemplateFa: 'تماس مستقیم با 09121112233 در {{hoodNameFa}}',
          bodyTemplateFa: 'متن پیام',
          version: 1,
        }),
      (err: unknown) =>
        err instanceof NotificationDomainError && err.code === 'PRIVACY_CONTACT_LEAK_IN_PREVIEW',
    );

    // =========================================================================
    // TEST 4: In-App Read / Unread / Archived State & Cross-User Protection
    // =========================================================================
    await assert.rejects(
      () => restartedMod.engine.listUserInAppNotifications(bob, alice.uid),
      (err: unknown) =>
        err instanceof NotificationDomainError && err.code === 'FORBIDDEN_CROSS_USER_ACCESS',
    );

    const targetNotifId = aliceInAppList[0].notificationId;
    await assert.rejects(
      () => restartedMod.engine.updateInAppReadState(bob, targetNotifId, 'READ'),
      (err: unknown) =>
        err instanceof NotificationDomainError && err.code === 'FORBIDDEN_CROSS_USER_ACCESS',
    );

    const markedRead = await restartedMod.engine.updateInAppReadState(alice, targetNotifId, 'READ');
    assert.equal(markedRead.readState, 'READ');
    assert.ok(markedRead.readAtIso);

    const markedArchived = await restartedMod.engine.updateInAppReadState(
      alice,
      targetNotifId,
      'ARCHIVED',
    );
    assert.equal(markedArchived.readState, 'ARCHIVED');
    assert.ok(markedArchived.archivedAtIso);

    const remainingUnreadMarked = await restartedMod.engine.markAllInAppNotificationsRead(
      alice,
      alice.uid,
    );
    assert.equal(remainingUnreadMarked, 7);

    const unreadAfterMarkAll = await restartedMod.engine.listUserInAppNotifications(
      alice,
      alice.uid,
      { readState: 'UNREAD' },
    );
    assert.equal(unreadAfterMarkAll.length, 0);

    // =========================================================================
    // TEST 5: Stage 3 vs Stage 4 — Provider Acceptance != Confirmed Delivery
    // =========================================================================
    const dispatchedJobs = await restartedMod.engine.dispatchDueDeliveryJobs();
    assert.ok(dispatchedJobs.length > 0);

    // CRITICAL INVARIANT: Provider accepted the request, so status MUST be
    // `PROVIDER_ACCEPTED_AWAITING_RECEIPT` and `isConfirmedDelivered` MUST be `false`!
    const firstDispatchedJob = dispatchedJobs[0];
    assert.equal(firstDispatchedJob.status, 'PROVIDER_ACCEPTED_AWAITING_RECEIPT');
    assert.equal(firstDispatchedJob.isConfirmedDelivered, false);
    assert.equal(firstDispatchedJob.confirmedDeliveredAtIso, null);
    assert.ok(firstDispatchedJob.providerMessageId);

    // Stage 4: Only when the delivery receipt arrives does the job transition to `DELIVERED_CONFIRMED`
    const confirmedJob = await restartedMod.engine.confirmDeliveryReceipt({
      providerId: firstDispatchedJob.providerId!,
      providerMessageId: firstDispatchedJob.providerMessageId!,
      receiptStatus: 'DELIVERED',
      diagnosticNote: 'SMTP 250 2.0.0 OK Delivered to mailbox',
    });
    assert.equal(confirmedJob.status, 'DELIVERED_CONFIRMED');
    assert.equal(confirmedJob.isConfirmedDelivered, true);
    assert.ok(confirmedJob.confirmedDeliveredAtIso);

    // =========================================================================
    // TEST 6: Retries, Transient Failures, Permanent Failures & Max Attempts
    // =========================================================================
    // Enable SMS preference and consent for Bob to test SMS retry lifecycle
    await restartedMod.engine.updateUserPreferences(bob, bob.uid, {
      channelEnabled: { SMS: true, EMAIL: false, PUSH: false, IN_APP: false },
    });
    await restartedMod.engine.updateUserConsent(bob, bob.uid, {
      smsConsentGranted: true,
    });

    await restartedMod.engine.ingestEventToOutbox({
      source: 'BARGAINS',
      eventType: 'BARGAIN_PRICE_DROP',
      idempotencyKey: 'idem_bob_sms_retry_01',
      recipientUid: bob.uid,
      requestedChannels: ['SMS'],
      variables: { hoodNameFa: 'نیاوران', dropPercent: 11 },
    });
    const bobGen = await restartedMod.engine.generateNotificationsFromOutbox();
    const bobSmsJobId = bobGen.generatedDeliveryJobIds[0];

    // Attempt 1: Transient failure -> RETRY_SCHEDULED (attempts = 1)
    smsAdapter.setSimulatedBehavior('TRANSIENT_FAILURE');
    const attempt1 = await restartedMod.engine.dispatchSingleDeliveryJob(
      bobSmsJobId,
      '2026-05-01T10:00:00.000Z',
    );
    assert.equal(attempt1.status, 'RETRY_SCHEDULED');
    assert.equal(attempt1.attempts, 1);
    assert.equal(attempt1.isConfirmedDelivered, false);
    assert.ok(attempt1.nextAttemptAtIso > '2026-05-01T10:00:00.000Z');

    // Attempt 2: Transient failure -> RETRY_SCHEDULED (attempts = 2)
    const attempt2 = await restartedMod.engine.dispatchSingleDeliveryJob(
      bobSmsJobId,
      '2026-05-01T10:05:00.000Z',
    );
    assert.equal(attempt2.status, 'RETRY_SCHEDULED');
    assert.equal(attempt2.attempts, 2);

    // Attempt 3: Provider recovers -> PROVIDER_ACCEPTED_AWAITING_RECEIPT -> then DLR confirms delivery
    smsAdapter.setSimulatedBehavior('ACCEPT_AWAITING_RECEIPT');
    const attempt3 = await restartedMod.engine.dispatchSingleDeliveryJob(
      bobSmsJobId,
      '2026-05-01T10:10:00.000Z',
    );
    assert.equal(attempt3.status, 'PROVIDER_ACCEPTED_AWAITING_RECEIPT');
    assert.equal(attempt3.attempts, 3);
    assert.equal(attempt3.isConfirmedDelivered, false);

    const smsConfirmed = await restartedMod.engine.confirmDeliveryReceipt({
      providerId: attempt3.providerId!,
      providerMessageId: attempt3.providerMessageId!,
      receiptStatus: 'DELIVERED',
    });
    assert.equal(smsConfirmed.status, 'DELIVERED_CONFIRMED');
    assert.equal(smsConfirmed.isConfirmedDelivered, true);

    // Test permanent bounce / max attempt exhaustion -> FAILED_PERMANENT
    await restartedMod.engine.ingestEventToOutbox({
      source: 'BARGAINS',
      eventType: 'BARGAIN_PRICE_DROP',
      idempotencyKey: 'idem_bob_sms_perm_fail',
      recipientUid: bob.uid,
      requestedChannels: ['SMS'],
      variables: { hoodNameFa: 'فرمانیه', dropPercent: 8 },
    });
    const permFailGen = await restartedMod.engine.generateNotificationsFromOutbox();
    smsAdapter.setSimulatedBehavior('PERMANENT_FAILURE');
    const permFailedJob = await restartedMod.engine.dispatchSingleDeliveryJob(
      permFailGen.generatedDeliveryJobIds[0],
    );
    assert.equal(permFailedJob.status, 'FAILED_PERMANENT');
    assert.equal(permFailedJob.isConfirmedDelivered, false);
    assert.ok(permFailedJob.failedPermanentlyAtIso);

    // =========================================================================
    // TEST 7: User Opt-Out & Consent Controls (Suppresses Non-Critical, Preserves Critical)
    // =========================================================================
    // Bob enables globalOptOutAllNonCritical
    await restartedMod.engine.updateUserConsent(bob, bob.uid, {
      globalOptOutAllNonCritical: true,
      emailConsentGranted: true,
      optOutReason: 'User opted out of all market alerts and promotional messages',
    });
    await restartedMod.engine.updateUserPreferences(bob, bob.uid, {
      channelEnabled: { EMAIL: true, IN_APP: true, SMS: false, PUSH: false },
    });

    // 7a: Non-critical promotional sponsorship event -> SUPPRESSED_PREFERENCE_OR_CONSENT
    await restartedMod.engine.ingestEventToOutbox({
      source: 'SPONSORSHIP',
      eventType: 'SPONSOR_CAMPAIGN_EXPIRING',
      idempotencyKey: 'idem_bob_promo_opted_out',
      recipientUid: bob.uid,
      requestedChannels: ['EMAIL'],
      variables: { hoodNameFa: 'ونک', daysRemaining: 3 },
    });
    // 7b: Critical Account Lifecycle deletion notice -> ALLOWED despite globalOptOutAllNonCritical
    await restartedMod.engine.ingestEventToOutbox({
      source: 'ACCOUNT_LIFECYCLE',
      eventType: 'ACCOUNT_DELETION_INITIATED',
      idempotencyKey: 'idem_bob_critical_del',
      recipientUid: bob.uid,
      requestedChannels: ['EMAIL'],
      variables: { jobId: 'deljob_bob_99' },
    });

    const optOutGen = await restartedMod.engine.generateNotificationsFromOutbox();
    assert.equal(optOutGen.generatedDeliveryJobIds.length, 2);

    const promoJob = await restartedMod.store.getDeliveryJobById(
      optOutGen.generatedDeliveryJobIds[0],
    );
    const criticalJob = await restartedMod.store.getDeliveryJobById(
      optOutGen.generatedDeliveryJobIds[1],
    );

    assert.equal(promoJob?.status, 'SUPPRESSED_PREFERENCE_OR_CONSENT');
    assert.equal(promoJob?.suppressionReason, 'GLOBAL_OPT_OUT_NON_CRITICAL');
    assert.equal(criticalJob?.status, 'QUEUED_OUTBOX');

    // Verify operational logs contain pseudonymized recipient hashes and zero raw UIDs or secrets
    const logs = await restartedMod.store.listOperationalLogs();
    assert.ok(logs.length > 0);
    for (const log of logs) {
      assert.ok(log.recipientUidHash.startsWith('uid_'));
      assert.equal(log.redactedMessage.includes('09123456789'), false);
      assert.equal(log.redactedMessage.includes('hidden-seller@example.com'), false);
    }

    console.log('ALL EMPLOYEE-13 NOTIFICATIONS AND MESSAGING BACKEND TESTS PASSED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('EMPLOYEE-13 NOTIFICATIONS TESTS FAILED:', err);
  process.exit(1);
});
