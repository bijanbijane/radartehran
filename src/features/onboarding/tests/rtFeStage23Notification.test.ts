import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_NOTIFICATION_023_SPEC_ID,
  RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID,
  RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID,
  RT_NOTIF_LAYERS_10,
  RT_NOTIF_ENTITIES_13,
  RT_NOTIF_TYPES_10,
  RT_NOTIF_PRIORITIES_4,
  RT_NOTIF_STATUSES_4,
  RT_NOTIF_ACTION_TYPES_6,
  RT_NOTIF_CHANNELS_4,
  RT_NOTIF_DELIVERY_STATUSES_9,
  RT_NOTIF_ENDPOINTS_13,
  RT_NOTIF_DELIVERABLES_36,
  notificationKeys,
  formatUnreadBadgeCount,
  evaluateDeliveryChannelIsolation,
  evaluateReadStateAndPanelIsolation,
  evaluateSecurityAndPreferencePolicy,
  buildNotificationIdempotencyKeys,
  evaluateNotificationDeepLink,
  sanitizeNotificationTelemetry,
} from '../services/rtFeNotification023Engine';

test('Stage 23 (RT-FE-NOTIFICATION-COMMUNICATION-023): verifies 10 layers, 13 entities, 10 types, 4 statuses, 9 delivery states, 13 APIs, 36 deliverables & Stage 24 bridges', () => {
  assert.equal(RT_FE_NOTIFICATION_023_SPEC_ID, 'RT-FE-NOTIFICATION-COMMUNICATION-023');
  assert.equal(RT_FE_STAGE24_MESSAGING_BRIDGE_SPEC_ID, 'RT-FE-MESSAGING-COMMUNICATION-024');
  assert.equal(RT_FE_STAGE24_ACCOUNT_BRIDGE_SPEC_ID, 'RT-FE-USER-ACCOUNT-024');
  assert.equal(RT_NOTIF_LAYERS_10.length, 10);
  assert.equal(RT_NOTIF_ENTITIES_13.length, 13);
  assert.equal(RT_NOTIF_TYPES_10.length, 10);
  assert.equal(RT_NOTIF_PRIORITIES_4.length, 4);
  assert.equal(RT_NOTIF_STATUSES_4.length, 4);
  assert.equal(RT_NOTIF_ACTION_TYPES_6.length, 6);
  assert.equal(RT_NOTIF_CHANNELS_4.length, 4);
  assert.equal(RT_NOTIF_DELIVERY_STATUSES_9.length, 9);
  assert.equal(RT_NOTIF_ENDPOINTS_13.length, 13);
  assert.equal(RT_NOTIF_DELIVERABLES_36.length, 36);
  assert.equal(RT_NOTIF_DELIVERABLES_36[0].id, 'RT-FE-NOTIFICATION-OUT-001');
  assert.equal(RT_NOTIF_DELIVERABLES_36[35].id, 'RT-FE-NOTIFICATION-OUT-036');
  assert.deepEqual(notificationKeys.unreadCount(), ['notifications', 'unread-count']);
  assert.deepEqual(notificationKeys.announcements(), ['notifications', 'announcements']);
});

test('Stage 23: enforces unread badge, sent != delivered, Inbox survival on email failure, group/read isolation & idempotency key', () => {
  assert.equal(formatUnreadBadgeCount({ unreadCount: 0, fetchFailed: false }).showNumericBadge, false);
  assert.equal(formatUnreadBadgeCount({ unreadCount: 124, fetchFailed: false }).badgeText, '99+');
  assert.equal(formatUnreadBadgeCount({ unreadCount: null, fetchFailed: false }).badgeText, null);
  const stale = formatUnreadBadgeCount({ unreadCount: null, fetchFailed: true, lastKnownCount: 4 });
  assert.equal(stale.badgeText, '4');
  assert.equal(stale.isStale, true);

  const emailFailed = evaluateDeliveryChannelIsolation({
    inboxSaved: true,
    emailDeliveryStatus: 'failed',
    pushDeliveryStatus: 'delivered',
  });
  assert.equal(emailFailed.inboxPreserved, true);
  assert.equal(emailFailed.channelFailureIsolated, true);

  const deliveryMisread = evaluateDeliveryChannelIsolation({
    inboxSaved: true,
    emailDeliveryStatus: 'sent',
    pushDeliveryStatus: 'unknown',
    treatSentAsDelivered: true,
    treatUnknownAsFailed: true,
  });
  assert.equal(deliveryMisread.issues.length, 2);

  const readAndGroupCheck = evaluateReadStateAndPanelIsolation({
    openingGroupAutoMarksAllRead: true,
    type: 'security',
    priority: 'critical',
    requestedAction: 'delete',
    mergingSecurityOrCritical: true,
    clientVersion: 1,
    serverVersion: 2,
  });
  assert.equal(readAndGroupCheck.valid, false);
  assert.equal(readAndGroupCheck.requiresServerSync, true);
  assert.equal(readAndGroupCheck.issues.length, 4);

  const idemp = buildNotificationIdempotencyKeys({
    notificationId: 'notif-77',
    channel: 'email',
    recipientId: 'usr-9',
  });
  assert.equal(idemp.deliveryKey, 'notif-77:email:usr-9');
});

test('Stage 23: protects mandatory security alerts, explicit Web Push & midnight quiet hours, blocks unsafe deep links & strips PII telemetry', () => {
  const secPolicy = evaluateSecurityAndPreferencePolicy({
    type: 'security',
    priority: 'critical',
    requestedDisableMandatorySecurity: true,
    quietHoursTimezone: '',
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    implicitWebPushWithoutUserAction: true,
    consentStatus: 'withdrawn',
    marketingRequested: true,
  });
  assert.equal(secPolicy.allowed, false);
  assert.equal(secPolicy.decision, 'deny');
  assert.equal(secPolicy.crossesMidnight, true);
  assert.equal(secPolicy.issues.length, 4);

  const validPolicy = evaluateSecurityAndPreferencePolicy({
    type: 'market',
    priority: 'normal',
    quietHoursTimezone: 'Asia/Tehran',
    quietHoursStart: '23:00',
    quietHoursEnd: '07:00',
    implicitWebPushWithoutUserAction: false,
    consentStatus: 'granted',
    marketingRequested: true,
  });
  assert.equal(validPolicy.allowed, true);
  assert.equal(validPolicy.crossesMidnight, true);

  const openRedirect = evaluateNotificationDeepLink({
    routeKey: 'property.detail',
    rawExternalUrl: 'https://evil.example.com',
    allowedRouteKeys: ['property.detail'],
    requiresAuthentication: true,
    isAuthenticated: true,
    hasEntityPermission: true,
  });
  assert.equal(openRedirect.safeToNavigate, false);

  const piiInUrl = evaluateNotificationDeepLink({
    routeKey: 'property.detail',
    allowedRouteKeys: ['property.detail'],
    queryHasSensitivePii: true,
    requiresAuthentication: true,
    isAuthenticated: true,
    hasEntityPermission: true,
  });
  assert.equal(piiInUrl.safeToNavigate, false);

  const telemetry = sanitizeNotificationTelemetry({
    eventName: 'notification_opened',
    payload: {
      category: 'security',
      privateMessageText: 'ورود جدید از تهران',
      pushEndpoint: 'https://fcm.googleapis.com/secret-ep',
      emailContent: 'کد تایید',
    },
  });
  assert.deepEqual(telemetry.strippedKeys.sort(), ['emailContent', 'privateMessageText', 'pushEndpoint']);
  assert.equal(telemetry.sanitizedPayload.category, 'security');
});
