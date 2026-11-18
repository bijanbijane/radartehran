/**
 * @file src/shared/engagement-ui/EngagementStatus.tsx
 * @description Displays engagement status badges and lifecycle warnings for expired/deleted saved entities (Stage 8).
 */

import React from 'react';
import type { EngagementEntityRef, FollowStatus } from '../../platform/entity-engagement';

export interface EngagementStatusProps {
  isFavorited: boolean;
  followStatus: FollowStatus;
  collectionCount: number;
  lifecycleStatus?: EngagementEntityRef['lifecycleStatus'];
}

export const EngagementStatus: React.FC<EngagementStatusProps> = ({
  isFavorited,
  followStatus,
  collectionCount,
  lifecycleStatus = 'active',
}) => {
  return (
    <div dir="rtl" data-testid="engagement-status-summary" className="flex flex-wrap items-center gap-2 text-xs">
      {isFavorited && (
        <span className="rounded-md bg-rose-950/50 border border-rose-500/30 px-2 py-0.5 text-rose-300">
          نشان‌شده
        </span>
      )}
      {followStatus === 'active' && (
        <span className="rounded-md bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 text-emerald-300">
          رصد فعال
        </span>
      )}
      {collectionCount > 0 && (
        <span className="rounded-md bg-sky-950/50 border border-sky-500/30 px-2 py-0.5 text-sky-300">
          در {collectionCount} مجموعه
        </span>
      )}
      {lifecycleStatus !== 'active' && (
        <span
          data-testid={`saved-entity-lifecycle-${lifecycleStatus}`}
          className="rounded-md bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 text-amber-300"
        >
          وضعیت موجودیت: {lifecycleStatus === 'expired' ? 'منقضی‌شده' : lifecycleStatus === 'removed' ? 'حذف‌شده از بازار' : 'محدودشده'}
        </span>
      )}
    </div>
  );
};
