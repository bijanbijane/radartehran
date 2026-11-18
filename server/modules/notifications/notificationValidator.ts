/**
 * @file server/modules/notifications/notificationValidator.ts
 * @description Input validation, deep link sanitization, and PII protection for notifications.
 */

import { isValidIranMobilePhone } from '../../../src/utils/security';
import type {
  CategoryPreferences,
  ChannelPreferences,
  NotificationCategory,
  NotificationDeepLink,
  NotificationEventPayload,
  NotificationEventType,
  NotificationPreferencesDocument,
} from './notificationTypes';

const VALID_EVENT_TYPES = new Set<NotificationEventType>([
  'bargain.submitted',
  'bargain.approved',
  'bargain.rejected',
  'bargain.status_changed',
  'buyer_alert.created_or_updated',
  'buyer_alert.matched',
  'sponsor.application_submitted',
  'sponsor.application_approved_or_rejected',
  'crowd_claim.accepted_or_rejected',
  'account.security_alert',
  'system.administrative_announcement',
  'social.post.created.v1',
  'social.comment.created.v1',
  'social.question.answered.v1',
  'social.moderation.decided.v1',
]);

const VALID_CATEGORIES = new Set<NotificationCategory>([
  'bargains',
  'buyer_alerts',
  'sponsorship',
  'crowd_claims',
  'security',
  'system_announcement',
]);

/**
 * Validates and sanitizes a notification deep link to prevent open redirects and script execution.
 */
export function sanitizeDeepLink(link?: NotificationDeepLink): NotificationDeepLink | undefined {
  if (!link || typeof link !== 'object') return undefined;

  const rawUrl = String(link.actionUrl || '').trim();
  // Deep links must be relative paths starting with /
  if (!rawUrl.startsWith('/') || rawUrl.startsWith('//') || /[\r\n\t]/.test(rawUrl)) {
    return undefined;
  }
  if (/javascript:|data:|vbscript:/i.test(rawUrl)) {
    return undefined;
  }

  return {
    actionUrl: rawUrl.slice(0, 250),
    view: link.view ? String(link.view).slice(0, 50) : undefined,
    entityId: link.entityId ? String(link.entityId).slice(0, 100) : undefined,
    cityId: link.cityId ? String(link.cityId).slice(0, 50) : undefined,
    hoodId: typeof link.hoodId === 'number' && Number.isSafeInteger(link.hoodId) ? link.hoodId : undefined,
  };
}

/**
 * Validates event payload structure and guarantees caller does not inject PII.
 */
export function validateNotificationEventPayload(payload: unknown): {
  valid: boolean;
  errors: string[];
  sanitizedPayload?: NotificationEventPayload;
} {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  const p = payload as Record<string, unknown>;

  // Recipient UID check
  const recipientUid = String(p.recipientUid || '').trim();
  if (!recipientUid || recipientUid.length < 3 || recipientUid.length > 128) {
    errors.push('recipientUid must be a string between 3 and 128 characters');
  }

  // Event type check
  const eventType = p.eventType as NotificationEventType;
  if (!VALID_EVENT_TYPES.has(eventType)) {
    errors.push(`Invalid eventType: ${String(eventType)}`);
  }

  // Event ID
  const eventId = String(p.eventId || '').trim();
  if (!eventId) {
    errors.push('eventId is required');
  }

  // Variables check
  const rawVars = (p.variables && typeof p.variables === 'object' && !Array.isArray(p.variables))
    ? (p.variables as Record<string, unknown>)
    : {};

  const cleanVars: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(rawVars)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    // Disallow raw PII keys
    if (/phone|mobile|nationalid|mellicode|buyercontact/i.test(key)) {
      cleanVars[key] = '[PROTECTED_PII]';
      continue;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      cleanVars[key] = val;
    } else if (typeof val === 'string') {
      cleanVars[key] = val.slice(0, 300);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitizedPayload: {
      eventId: eventId.slice(0, 100),
      eventType,
      recipientUid,
      targetEmail: typeof p.targetEmail === 'string' && p.targetEmail.includes('@') ? p.targetEmail.trim().toLowerCase().slice(0, 120) : undefined,
      targetMobilePhone: typeof p.targetMobilePhone === 'string' && isValidIranMobilePhone(p.targetMobilePhone) ? p.targetMobilePhone.trim() : undefined,
      variables: cleanVars,
      deepLink: sanitizeDeepLink(p.deepLink as NotificationDeepLink | undefined),
      priorityOverride: p.priorityOverride as any,
      idempotencyKey: typeof p.idempotencyKey === 'string' ? p.idempotencyKey.trim().slice(0, 128) : undefined,
      timestampIso: typeof p.timestampIso === 'string' && !isNaN(Date.parse(p.timestampIso)) ? p.timestampIso : new Date().toISOString(),
    },
  };
}

/**
 * Validates user preferences payload.
 */
export function validateNotificationPreferencesUpdate(
  current: NotificationPreferencesDocument,
  updates: unknown,
): { valid: boolean; errors: string[]; sanitized?: NotificationPreferencesDocument } {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { valid: false, errors: ['Preferences updates must be an object'] };
  }

  const u = updates as Record<string, unknown>;
  const rawChannels = (u.channels && typeof u.channels === 'object') ? (u.channels as Record<string, unknown>) : {};
  const rawCategories = (u.categories && typeof u.categories === 'object') ? (u.categories as Record<string, unknown>) : {};

  const newChannels: ChannelPreferences = {
    inApp: typeof rawChannels.inApp === 'boolean' ? rawChannels.inApp : current.channels.inApp,
    email: typeof rawChannels.email === 'boolean' ? rawChannels.email : current.channels.email,
    sms: typeof rawChannels.sms === 'boolean' ? rawChannels.sms : current.channels.sms,
    push: typeof rawChannels.push === 'boolean' ? rawChannels.push : current.channels.push,
  };

  const newCategories: CategoryPreferences = {
    bargains: typeof rawCategories.bargains === 'boolean' ? rawCategories.bargains : current.categories.bargains,
    buyer_alerts: typeof rawCategories.buyer_alerts === 'boolean' ? rawCategories.buyer_alerts : current.categories.buyer_alerts,
    sponsorship: typeof rawCategories.sponsorship === 'boolean' ? rawCategories.sponsorship : current.categories.sponsorship,
    crowd_claims: typeof rawCategories.crowd_claims === 'boolean' ? rawCategories.crowd_claims : current.categories.crowd_claims,
    security: true, // Security alerts are mandatory and cannot be disabled
    system_announcement: typeof rawCategories.system_announcement === 'boolean' ? rawCategories.system_announcement : current.categories.system_announcement,
  };

  return {
    valid: true,
    errors: [],
    sanitized: {
      ...current,
      channels: newChannels,
      categories: newCategories,
      emailAddress: typeof u.emailAddress === 'string' && u.emailAddress.includes('@') ? u.emailAddress.trim().toLowerCase().slice(0, 120) : current.emailAddress,
      mobilePhone: typeof u.mobilePhone === 'string' && isValidIranMobilePhone(u.mobilePhone) ? u.mobilePhone.trim() : current.mobilePhone,
      updatedAtIso: new Date().toISOString(),
    },
  };
}
