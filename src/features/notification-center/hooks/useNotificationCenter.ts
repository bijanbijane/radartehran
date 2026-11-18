/**
 * @file src/features/notification-center/hooks/useNotificationCenter.ts
 * @description React hook orchestrating NotificationInboxService, UnreadCounter, Preferences, and Realtime/Sync (Stage 9).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NotificationInboxService,
  NotificationPreferencesService,
  NotificationRealtimeAdapter,
  NotificationSyncBus,
  type NotificationInboxFilter,
  type NotificationRecord,
  type NotificationStatus,
} from '../../../platform/notifications';

export interface UseNotificationCenterOptions {
  userId: string;
  workspaceId: string;
  permissionVersion?: number;
  initialNotifications?: Array<Partial<NotificationRecord>>;
}

export function useNotificationCenter(options: UseNotificationCenterOptions) {
  const { userId, workspaceId, permissionVersion = 1 } = options;

  const inboxServiceRef = useRef(new NotificationInboxService());
  const prefsServiceRef = useRef(new NotificationPreferencesService());
  const realtimeRef = useRef(new NotificationRealtimeAdapter());
  const syncBusRef = useRef(new NotificationSyncBus());

  const [filter, setFilter] = useState<NotificationInboxFilter>({
    status: 'all',
    category: 'all',
    sortBy: 'newest',
  });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  inboxServiceRef.current.getStateStore().setContext(userId, workspaceId, permissionVersion);

  useEffect(() => {
    if (options.initialNotifications && options.initialNotifications.length > 0) {
      inboxServiceRef.current.ingestNotifications(
        userId,
        workspaceId,
        options.initialNotifications,
        permissionVersion
      );
      bump();
    }
  }, [userId, workspaceId, permissionVersion, options.initialNotifications, bump]);

  useEffect(() => {
    const unsub = realtimeRef.current.onReceive((batch) => {
      inboxServiceRef.current.ingestNotifications(userId, workspaceId, batch, permissionVersion);
      bump();
    });
    return () => {
      unsub();
    };
  }, [userId, workspaceId, permissionVersion, bump]);

  const updateStatus = useCallback(
    async (ids: string[], nextStatus: NotificationStatus) => {
      const res = await inboxServiceRef.current.updateStatus({
        userId,
        workspaceId,
        permissionVersion,
        notificationIds: ids,
        nextStatus,
      });
      syncBusRef.current.publish({
        type: 'STATUS_UPDATED',
        userId,
        workspaceId,
        notificationIds: ids,
        nextStatus,
      });
      bump();
      return res;
    },
    [userId, workspaceId, permissionVersion, bump]
  );

  const markAllAsRead = useCallback(async () => {
    const res = await inboxServiceRef.current.markAllAsRead({
      userId,
      workspaceId,
      permissionVersion,
    });
    syncBusRef.current.publish({
      type: 'MARK_ALL_READ',
      userId,
      workspaceId,
    });
    bump();
    return res;
  }, [userId, workspaceId, permissionVersion, bump]);

  const clearForSecurityTransition = useCallback(() => {
    inboxServiceRef.current.getStateStore().clearAllForSecurityTransition();
    inboxServiceRef.current.getCache().clearAll();
    prefsServiceRef.current.clearAllForSecurityTransition();
    realtimeRef.current.dispose();
    bump();
  }, [bump]);

  const slice = inboxServiceRef.current.queryInbox({
    userId,
    workspaceId,
    permissionVersion,
    filter,
    page,
    pageSize,
  });

  const unreadSummary = inboxServiceRef.current.getStateStore().getUnreadSummary();
  const preferences = prefsServiceRef.current.getPreferences(userId, workspaceId);

  return {
    slice,
    unreadSummary,
    preferences,
    filter,
    setFilter,
    page,
    setPage,
    updateStatus,
    markAllAsRead,
    clearForSecurityTransition,
    services: {
      inboxService: inboxServiceRef.current,
      preferencesService: prefsServiceRef.current,
      realtimeAdapter: realtimeRef.current,
      syncBus: syncBusRef.current,
    },
  };
}
