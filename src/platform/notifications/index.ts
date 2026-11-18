/**
 * @file src/platform/notifications/index.ts
 * @description Public barrel export for Stage 9 Notification Center Platform (RT-FE-REBUILD-NOTIFICATION-CENTER-009).
 */

export * from './core/NotificationTypes';
export * from './core/NotificationContract';
export * from './core/NotificationNormalizer';
export * from './core/NotificationRegistry';
export * from './core/NotificationPolicy';

export * from './inbox/NotificationQuery';
export * from './inbox/NotificationPagination';
export * from './inbox/NotificationInboxService';

export * from './state/UnreadCounter';
export * from './state/NotificationCache';
export * from './state/NotificationState';

export * from './grouping/NotificationDeduplication';
export * from './grouping/NotificationGrouping';

export * from './preferences/ChannelPreferences';
export * from './preferences/NotificationPreferences';

export * from './delivery/DeliveryChannelRegistry';
export * from './delivery/DeliveryStatusAdapter';

export * from './realtime/NotificationRealtimeAdapter';
export * from './realtime/NotificationSync';
