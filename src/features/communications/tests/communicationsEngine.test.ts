/** @file src/features/communications/tests/communicationsEngine.test.ts — Stage 26 RT-UI-COMMS-001 Comprehensive Unit & Security Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  ALLOWED_DIRECT_CONVERSATION_TYPES,
  CommsCoreStateEngine,
  classifyNotificationDateBucketFa,
  createDefaultUserCommsPreferences,
  isLocalHourInQuietHours,
  MAX_MESSAGES_PER_MINUTE_STANDARD,
  resolveEligibleChannels,
  sanitizeInternalDeepLink,
} from '../services/commsEngine';
import { EVENT_POLICY_REGISTRY, renderSafeTemplateText } from '../registries/eventPolicyAndTemplateRegistry';
import { registerCommunicationsRoutes } from '../../../../server/modules/communications/commsRoutes';
import { resolveRouteFromLocation } from '../../../navigation/url/navigationUrlContract';

test('COMMS-T01/T02: Event ingestion validates transactionCommitted, recipientActive, and enforces idempotency dedupe', () => {
  const engine = new CommsCoreStateEngine();
  const uncommitted = engine.ingestEvent({
    idempotencyKey: 'tx-uncommitted',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED',
    recipientUid: 'u-1',
    transactionCommitted: false,
    payload: { providerName: 'آقای رضایی', offeringTitle: 'کارشناسی', priceFa: '۲ میلیون' },
  });
  assert.equal(uncommitted.accepted, false);
  assert.equal(engine.notifications.length, 0);

  const inactive = engine.ingestEvent({
    idempotencyKey: 'tx-inactive',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED',
    recipientUid: 'u-1',
    recipientActive: false,
    payload: { providerName: 'آقای رضایی', offeringTitle: 'کارشناسی', priceFa: '۲ میلیون' },
  });
  assert.equal(inactive.accepted, false);

  const first = engine.ingestEvent({
    idempotencyKey: 'prop-101',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED',
    recipientUid: 'u-1',
    payload: { providerName: 'آقای رضایی', offeringTitle: 'کارشناسی', priceFa: '۲ میلیون' },
  });
  assert.equal(first.accepted, true);
  assert.equal(first.deduplicated, false);

  const dup = engine.ingestEvent({
    idempotencyKey: 'prop-101',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED',
    recipientUid: 'u-1',
    payload: { providerName: 'آقای رضایی', offeringTitle: 'کارشناسی', priceFa: '۲ میلیون' },
  });
  assert.equal(dup.deduplicated, true);
  assert.equal(engine.notifications.length, 1);
});

test('COMMS-T05/T06/T08: Policy enforces Quiet Hours deferral while CRITICAL SECURITY alerts bypass Quiet Hours & user opt-out', () => {
  const prefs = createDefaultUserCommsPreferences('u-sec');
  prefs.channels = { inApp: false, email: false, sms: false, push: false };
  prefs.quietHours = { enabled: true, timezone: 'Asia/Tehran', startHourLocal: 23, endHourLocal: 8 };

  assert.equal(isLocalHourInQuietHours(23, prefs.quietHours), true);
  assert.equal(isLocalHourInQuietHours(3, prefs.quietHours), true);
  assert.equal(isLocalHourInQuietHours(14, prefs.quietHours), false);

  // Critical security alert still delivers across mandatory channels even when user turned channels off & it is 02:00 AM
  const secChannels = resolveEligibleChannels({
    eventCode: 'SECURITY.NEW_LOGIN',
    prefs,
    localTehranHour: 2,
    activeDeviceCount: 0,
  });
  assert.ok(secChannels.deliverChannels.includes('IN_APP'));
  assert.ok(secChannels.deliverChannels.includes('EMAIL'));
  assert.equal(EVENT_POLICY_REGISTRY['SECURITY.NEW_LOGIN'].mandatoryNonOptOut, true);

  // Security rule stays locked on preference updates
  const engine = new CommsCoreStateEngine();
  const updated = engine.updatePreferences('u-sec', {
    categoryRules: [{ category: 'SECURITY', inApp: false, email: false, sms: false, push: false }],
  });
  const secRule = updated.categoryRules.find((r) => r.category === 'SECURITY');
  assert.equal(secRule?.inApp, true);
  assert.equal(secRule?.email, true);
  assert.equal(secRule?.lockedMandatory, true);
});

test('COMMS-T15/T16/T19: Retryable errors move to DLQ after max attempts; permanent Push failure revokes token; Replay is idempotent', () => {
  const engine = new CommsCoreStateEngine();
  engine.devices.push({
    deviceId: 'dev-bad',
    ownerUid: 'u-push',
    platform: 'WEB_PUSH',
    labelFa: 'موبایل',
    tokenMasked: 'wp_••••_bad',
    active: true,
    registeredAtIso: new Date().toISOString(),
    revokedAtIso: null,
  });
  const ing = engine.ingestEvent({
    idempotencyKey: 'srv-dlq-1',
    eventCode: 'SERVICE.PROPOSAL_RECEIVED',
    recipientUid: 'u-push',
    payload: { providerName: 'مشاور الف', offeringTitle: 'تنظیم قرارداد', priceFa: '۳ میلیون' },
  });
  assert.ok(ing.deliveries.length >= 1);
  const attemptId = ing.deliveries[0].attemptId;

  // Retry 1 -> RETRYABLE
  const r1 = engine.handleDeliveryFailure({ attemptId, errorCode: 'ETIMEDOUT', errorClass: 'TRANSIENT', maxAttempts: 2 });
  assert.equal(r1.status, 'FAILED_RETRYABLE');
  assert.equal(r1.dlqCreated, false);

  // Retry 2 -> DEAD_LETTERED
  const r2 = engine.handleDeliveryFailure({ attemptId, errorCode: 'ETIMEDOUT', errorClass: 'TRANSIENT', maxAttempts: 2 });
  assert.equal(r2.status, 'DEAD_LETTERED');
  assert.equal(r2.dlqCreated, true);
  assert.equal(engine.deadLetters.length, 1);

  const dlqId = engine.deadLetters[0].dlqId;
  const rep1 = engine.replayDeadLetter(dlqId, 'admin-1');
  assert.equal(rep1.ok, true);
  const rep2 = engine.replayDeadLetter(dlqId, 'admin-1');
  assert.equal(rep2.reasonCode, 'ALREADY_REPLAYED_IDEMPOTENT');

  // Permanent invalid push token failure disables the device token automatically
  const perm = engine.handleDeliveryFailure({
    attemptId: engine.deliveries[0].attemptId,
    errorCode: 'INVALID_PUSH_TOKEN',
    errorClass: 'PERMANENT',
    deviceIdToRevoke: 'dev-bad',
  });
  assert.equal(perm.status, 'FAILED_PERMANENT');
  assert.equal(engine.devices[0].active, false);
});

test('COMMS-T10/T23/T26/T31: Notification IDOR, XSS/Open-Redirect guard, scoped conversations, block, rate-limit, and redaction', () => {
  const engine = new CommsCoreStateEngine();
  assert.equal(sanitizeInternalDeepLink('https://evil.example/phish'), '/account/notifications');
  assert.equal(sanitizeInternalDeepLink('//evil.example'), '/account/notifications');
  assert.equal(sanitizeInternalDeepLink('/services/12'), '/services/12');

  const safeRendered = renderSafeTemplateText('آگهی «{{listingTitle}}» در {{hoodName}}', {
    listingTitle: '<script>alert(1)</script>واحد',
    hoodName: 'پونک',
  });
  assert.equal(safeRendered.includes('<script>'), false);

  const ing = engine.ingestEvent({
    idempotencyKey: 'lst-1',
    eventCode: 'LISTING.APPROVED',
    recipientUid: 'owner-u1',
    payload: { listingTitle: 'آپارتمان ۹۰ متری', hoodName: 'پونک' },
  });
  const nId = ing.notification!.id;
  // Attacker cannot read/mutate owner notification (IDOR)
  assert.equal(engine.mutateNotificationStatus(nId, 'attacker-u2', 'READ').statusCode, 403);
  assert.equal(engine.mutateNotificationStatus(nId, 'owner-u1', 'READ').statusCode, 200);

  // Scoped conversation only (no arbitrary open DM without context)
  assert.equal(ALLOWED_DIRECT_CONVERSATION_TYPES.includes('SERVICE_REQUEST'), true);
  const missingContext = engine.createScopedConversation({
    type: 'LISTING_INQUIRY',
    contextEntityType: 'listing',
    contextEntityId: '',
    contextTitleFa: 'بدون پرونده',
    creatorUid: 'u-buyer',
    participants: [],
  });
  assert.equal(missingContext.ok, false);

  const duplicateParticipant = engine.createScopedConversation({
    type: 'LISTING_INQUIRY',
    contextEntityType: 'listing',
    contextEntityId: 'lst-duplicate',
    contextTitleFa: 'طرف تکراری',
    creatorUid: 'u-buyer',
    participants: [
      { uid: 'u-buyer', displayNameFa: 'خریدار', roleLabelFa: 'متقاضی', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
      { uid: 'u-buyer', displayNameFa: 'طرف دوم جعلی', roleLabelFa: 'مالک', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
    ],
  });
  assert.equal(duplicateParticipant.ok, false);
  assert.equal(duplicateParticipant.errorCode, 'INVALID_CONVERSATION_PARTICIPANTS');

  const participantWithoutCreator = engine.createScopedConversation({
    type: 'LISTING_INQUIRY',
    contextEntityType: 'listing',
    contextEntityId: 'lst-no-creator',
    contextTitleFa: 'بدون سازنده',
    creatorUid: 'u-buyer',
    participants: [
      { uid: 'u-seller', displayNameFa: 'مالک', roleLabelFa: 'آگهی‌دهنده', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
      { uid: 'u-other', displayNameFa: 'کاربر دیگر', roleLabelFa: 'عضو', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
    ],
  });
  assert.equal(participantWithoutCreator.ok, false);
  assert.equal(participantWithoutCreator.errorCode, 'INVALID_CONVERSATION_PARTICIPANTS');

  const convRes = engine.createScopedConversation({
    type: 'LISTING_INQUIRY',
    contextEntityType: 'listing',
    contextEntityId: 'lst-99',
    contextTitleFa: 'استعلام واحد ۹۰ متری پونک',
    creatorUid: 'u-buyer',
    participants: [
      { uid: 'u-buyer', displayNameFa: 'خریدار', roleLabelFa: 'متقاضی', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
      { uid: 'u-seller', displayNameFa: 'مالک', roleLabelFa: 'آگهی‌دهنده', senderType: 'USER', muted: false, archived: false, blockedOtherParticipant: false },
    ],
  });
  assert.equal(convRes.ok, true);
  const cid = convRes.conversation!.conversationId;

  // Non-participant IDOR blocked on sendMessage
  assert.equal(engine.sendMessage({ conversationId: cid, senderUid: 'intruder', bodyFa: 'سلام پیام غیرمجاز' }).statusCode, 403);

  // Rate limit blocks flooding beyond MAX_MESSAGES_PER_MINUTE_STANDARD
  for (let i = 0; i < MAX_MESSAGES_PER_MINUTE_STANDARD; i++) {
    const sent = engine.sendMessage({ conversationId: cid, senderUid: 'u-buyer', bodyFa: `پیام تست شماره ${i + 1}` });
    assert.equal(sent.statusCode, 201);
  }
  const flooded = engine.sendMessage({ conversationId: cid, senderUid: 'u-buyer', bodyFa: 'پیام اضافه اسپم' });
  assert.equal(flooded.statusCode, 429);

  // Block prevents incoming reply
  convRes.conversation!.participants[0].blockedOtherParticipant = true;
  const blockedReply = engine.sendMessage({ conversationId: cid, senderUid: 'u-seller', bodyFa: 'پاسخ پس از بلاک' });
  assert.equal(blockedReply.statusCode, 403);

  // Redaction preserves timeline integrity without deleting audit trail
  const msgId = convRes.conversation!.messages[0].messageId;
  assert.equal(engine.redactMessage(cid, msgId, 'admin-mod', 'حاوی شماره تماس شخصی'), true);
  assert.equal(convRes.conversation!.messages[0].status, 'REDACTED');
  assert.equal(classifyNotificationDateBucketFa(new Date().toISOString()), 'امروز');
});

test('COMMS-T38: Routes & Express endpoints enforce auth (fail-closed) and resolve aliases cleanly', async () => {
  assert.deepEqual(resolveRouteFromLocation('/account/settings/notifications', '').subTab, 'notifications');
  assert.deepEqual(resolveRouteFromLocation('/account/inbox', '').subTab, 'notifications');
  assert.equal(resolveRouteFromLocation('/admin/communications', '').viewId, 'admin');
  assert.equal(resolveRouteFromLocation('/admin/communications', '').subTab, 'operations');

  const app = express();
  app.use(express.json());
  registerCommunicationsRoutes(app);

  const srv = http.createServer(app);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as { port: number }).port;
  try {
    const unauthNotif = await fetch(`http://127.0.0.1:${port}/api/v1/notifications`);
    assert.equal(unauthNotif.status, 401);

    const unauthConv = await fetch(`http://127.0.0.1:${port}/api/v1/conversations`);
    assert.equal(unauthConv.status, 401);

    const unauthAdmin = await fetch(`http://127.0.0.1:${port}/api/admin/communications/overview`);
    assert.equal(unauthAdmin.status === 401 || unauthAdmin.status === 503, true);
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});
