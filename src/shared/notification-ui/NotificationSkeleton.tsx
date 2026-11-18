/**
 * @file src/shared/notification-ui/NotificationSkeleton.tsx
 * @description Skeleton loading state for Notification Center Inbox (Stage 9).
 */

import React from 'react';

export const NotificationSkeleton: React.FC = () => {
  return (
    <div
      dir="rtl"
      role="status"
      aria-label="در حال بارگذاری اعلان‌ها"
      data-testid="notification-skeleton"
      className="space-y-2.5"
    >
      <div className="h-20 animate-pulse rounded-xl bg-slate-800/70" />
      <div className="h-20 animate-pulse rounded-xl bg-slate-800/70" />
      <div className="h-20 animate-pulse rounded-xl bg-slate-800/70" />
    </div>
  );
};
