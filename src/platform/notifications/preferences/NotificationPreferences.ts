/**
 * @file src/platform/notifications/preferences/NotificationPreferences.ts
 * @description Workspace-isolated store and manager for UserNotificationPreferences including QuietHours and muted entities (Stage 9).
 */

import type { EntityType } from '../../entity-engagement';
import type {
  DeliveryChannel,
  NotificationCategory,
  NotificationFrequencyMode,
  QuietHoursConfig,
  UserNotificationPreferences,
} from '../core/NotificationTypes';
import {
  buildDefaultCategoryChannelPreferences,
  validateCategoryPreferenceUpdate,
} from './ChannelPreferences';

export class NotificationPreferencesService {
  private prefsByContext = new Map<string, UserNotificationPreferences>();

  private buildKey(userId: string, workspaceId: string): string {
    return `notif-prefs:${userId}:${workspaceId}`;
  }

  public getPreferences(userId: string, workspaceId: string): UserNotificationPreferences {
    const key = this.buildKey(userId, workspaceId);
    let existing = this.prefsByContext.get(key);
    if (!existing) {
      existing = {
        userId,
        workspaceId,
        categories: buildDefaultCategoryChannelPreferences(),
        quietHours: {
          enabled: false,
          startTimeHHMM: '22:00',
          endTimeHHMM: '07:00',
          bypassForCriticalSecurity: true,
        },
        mutedEntityKeys: [],
        updatedAt: new Date().toISOString(),
      };
      this.prefsByContext.set(key, existing);
    }
    return existing;
  }

  public updateCategoryPreference(params: {
    userId: string;
    workspaceId: string;
    category: NotificationCategory;
    channels: Record<DeliveryChannel, boolean>;
    frequency: NotificationFrequencyMode;
    muted: boolean;
  }): { ok: boolean; preferences: UserNotificationPreferences; errorFa?: string } {
    const current = this.getPreferences(params.userId, params.workspaceId);
    const validation = validateCategoryPreferenceUpdate({
      category: params.category,
      channels: params.channels,
      frequency: params.frequency,
      muted: params.muted,
    });

    if (!validation.valid) {
      return {
        ok: false,
        preferences: current,
        errorFa: validation.errorFa,
      };
    }

    const updated: UserNotificationPreferences = {
      ...current,
      categories: {
        ...current.categories,
        [params.category]: validation.preference,
      },
      updatedAt: new Date().toISOString(),
    };
    this.prefsByContext.set(this.buildKey(params.userId, params.workspaceId), updated);
    return { ok: true, preferences: updated };
  }

  public updateQuietHours(
    userId: string,
    workspaceId: string,
    quietHours: QuietHoursConfig
  ): UserNotificationPreferences {
    const current = this.getPreferences(userId, workspaceId);
    const updated: UserNotificationPreferences = {
      ...current,
      quietHours: {
        ...quietHours,
        bypassForCriticalSecurity: true,
      },
      updatedAt: new Date().toISOString(),
    };
    this.prefsByContext.set(this.buildKey(userId, workspaceId), updated);
    return updated;
  }

  public setEntityMuted(
    userId: string,
    workspaceId: string,
    entityType: EntityType,
    entityId: string,
    muted: boolean
  ): UserNotificationPreferences {
    const current = this.getPreferences(userId, workspaceId);
    const composite = `${entityType}:${entityId}`;
    const nextMuted = muted
      ? Array.from(new Set([...current.mutedEntityKeys, composite]))
      : current.mutedEntityKeys.filter((k) => k !== composite);

    const updated: UserNotificationPreferences = {
      ...current,
      mutedEntityKeys: nextMuted,
      updatedAt: new Date().toISOString(),
    };
    this.prefsByContext.set(this.buildKey(userId, workspaceId), updated);
    return updated;
  }

  public clearAllForSecurityTransition(): void {
    this.prefsByContext.clear();
  }
}
