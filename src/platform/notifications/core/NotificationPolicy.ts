/**
 * @file src/platform/notifications/core/NotificationPolicy.ts
 * @description Access, workspace isolation, and overnight quiet-hours evaluation policies for Stage 9 Notification Center.
 */

import type {
  DeliveryChannel,
  NotificationRecord,
  QuietHoursConfig,
  UserNotificationPreferences,
} from './NotificationTypes';

export function canUserAccessNotification(
  notification: NotificationRecord,
  activeUserId: string,
  activeWorkspaceId: string
): boolean {
  if (!activeUserId || !activeWorkspaceId) return false;
  return (
    notification.userId === activeUserId &&
    notification.workspaceId === activeWorkspaceId
  );
}

function parseHHMMToMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Evaluates whether a given time (`HH:MM`) falls inside `QuietHoursConfig`,
 * properly handling overnight spans such as `22:00` to `07:00`.
 */
export function isWithinQuietHours(config: QuietHoursConfig, currentTimeHHMM: string): boolean {
  if (!config.enabled) return false;
  const startMin = parseHHMMToMinutes(config.startTimeHHMM);
  const endMin = parseHHMMToMinutes(config.endTimeHHMM);
  const currentMin = parseHHMMToMinutes(currentTimeHHMM);

  if (startMin === null || endMin === null || currentMin === null) {
    return false;
  }

  if (startMin === endMin) {
    return false;
  }

  if (startMin < endMin) {
    // Same-day span e.g. 13:00 -> 16:00
    return currentMin >= startMin && currentMin < endMin;
  }

  // Overnight span across midnight e.g. 22:00 -> 07:00
  return currentMin >= startMin || currentMin < endMin;
}

export function resolveAllowedDeliveryChannels(params: {
  notification: NotificationRecord;
  preferences: UserNotificationPreferences;
  currentTimeHHMM?: string;
}): DeliveryChannel[] {
  const { notification, preferences, currentTimeHHMM = '12:00' } = params;

  // Critical account_security notifications always deliver at least in_app
  if (notification.category === 'account_security' && notification.priority === 'critical') {
    return ['in_app', 'email', 'sms'];
  }

  if (notification.entity) {
    const entityComposite = `${notification.entity.entityType}:${notification.entity.id}`;
    if (preferences.mutedEntityKeys.includes(entityComposite)) {
      return [];
    }
  }

  const catPref = preferences.categories[notification.category];
  if (!catPref || catPref.muted || catPref.frequency === 'paused') {
    return [];
  }

  const quietActive = isWithinQuietHours(preferences.quietHours, currentTimeHHMM);
  const activeChannels = (Object.keys(catPref.channels) as DeliveryChannel[]).filter(
    (ch) => catPref.channels[ch]
  );

  if (quietActive) {
    // During quiet hours, suppress noisy external push/sms unless critical security
    return activeChannels.filter((ch) => ch === 'in_app');
  }

  return activeChannels;
}
