/**
 * Employee 13 — User Notification Preferences, Consent & Eligibility Rules
 * (`server/modules/notifications/preferenceAndConsentService.ts`)
 *
 * Exclusive ownership: `server/modules/notifications/`
 *
 * Enforces:
 *  - Actor ownership / admin authorization (`assertAuthorizedForRecipient`).
 *  - Channel-level consent (`EMAIL`, `SMS`, `PUSH`), marketing sponsorship consent,
 *    and global non-critical opt-out (`globalOptOutAllNonCritical`).
 *  - Critical transactional account-lifecycle notices remain deliverable even when
 *    marketing/alerts are opted out.
 */

import {
  NotificationActorContext,
  NotificationCategoryClass,
  NotificationChannel,
  NotificationDomainError,
  NotificationEventSource,
  UserConsentAndOptOutRecord,
  UserNotificationPreferences,
} from './types.ts';

export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;
export const BASE_RETRY_BACKOFF_MS = 30_000;

export function assertAuthorizedForRecipient(
  actor: NotificationActorContext,
  recipientUid: string,
): void {
  if (!actor || typeof actor.uid !== 'string' || actor.uid.trim().length === 0) {
    throw new NotificationDomainError(
      'UNAUTHORIZED_ACTOR',
      'Authenticated actor is required for notification operations.',
      401,
    );
  }
  if (actor.uid !== recipientUid && !actor.isAdmin) {
    throw new NotificationDomainError(
      'FORBIDDEN_CROSS_USER_ACCESS',
      `Actor "${actor.uid}" is forbidden from accessing notifications or preferences of "${recipientUid}".`,
      403,
    );
  }
}

export function computeRetryBackoffIso(attemptNumber: number, baseNowMs = Date.now()): string {
  const cappedExp = Math.min(6, Math.max(0, attemptNumber - 1));
  const delayMs = BASE_RETRY_BACKOFF_MS * Math.pow(2, cappedExp);
  return new Date(baseNowMs + delayMs).toISOString();
}

export function evaluateChannelEligibility(params: {
  channel: NotificationChannel;
  source: NotificationEventSource;
  categoryClass: NotificationCategoryClass;
  preferences: UserNotificationPreferences;
  consent: UserConsentAndOptOutRecord;
}): { allowed: boolean; suppressionReason?: string } {
  const { channel, source, categoryClass, preferences, consent } = params;
  const isCritical = categoryClass === 'CRITICAL_TRANSACTIONAL';

  if (!isCritical && consent.globalOptOutAllNonCritical) {
    return { allowed: false, suppressionReason: 'GLOBAL_OPT_OUT_NON_CRITICAL' };
  }

  if (categoryClass === 'PROMOTIONAL_SPONSORSHIP' && !consent.marketingSponsorshipConsentGranted) {
    return { allowed: false, suppressionReason: 'MARKETING_SPONSORSHIP_CONSENT_NOT_GRANTED' };
  }

  if (!isCritical) {
    if (preferences.sourceMuted[source]) {
      return { allowed: false, suppressionReason: `SOURCE_MUTED_${source}` };
    }
    if (!preferences.categoryEnabled[categoryClass]) {
      return { allowed: false, suppressionReason: `CATEGORY_DISABLED_${categoryClass}` };
    }
    if (!preferences.channelEnabled[channel]) {
      return { allowed: false, suppressionReason: `CHANNEL_DISABLED_BY_PREFERENCE_${channel}` };
    }
  }

  if (channel === 'EMAIL') {
    if (!consent.hasConfiguredEmailDestination) {
      return { allowed: false, suppressionReason: 'EMAIL_DESTINATION_NOT_CONFIGURED' };
    }
    if (!isCritical && !consent.emailConsentGranted) {
      return { allowed: false, suppressionReason: 'EMAIL_CONSENT_NOT_GRANTED' };
    }
  } else if (channel === 'SMS') {
    if (!consent.hasConfiguredSmsDestination) {
      return { allowed: false, suppressionReason: 'SMS_DESTINATION_NOT_CONFIGURED' };
    }
    if (!consent.smsConsentGranted) {
      return { allowed: false, suppressionReason: 'SMS_CONSENT_NOT_GRANTED' };
    }
  } else if (channel === 'PUSH') {
    if (!consent.hasConfiguredPushToken) {
      return { allowed: false, suppressionReason: 'PUSH_TOKEN_NOT_CONFIGURED' };
    }
    if (!consent.pushConsentGranted) {
      return { allowed: false, suppressionReason: 'PUSH_CONSENT_NOT_GRANTED' };
    }
  }

  return { allowed: true };
}
