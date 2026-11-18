/**
 * @file src/shared/engagement-ui/FollowButton.tsx
 * @description Reusable Follow/Pause/Stop control independent of FavoriteButton (Stage 8).
 */

import React from 'react';
import type { EngagementEntityRef, FollowStatus } from '../../platform/entity-engagement';

export interface FollowButtonProps {
  entity: EngagementEntityRef;
  status: FollowStatus;
  onChangeStatus: (entity: EngagementEntityRef, nextStatus: FollowStatus) => void;
}

const STATUS_LABELS_FA: Record<FollowStatus, string> = {
  active: 'در حال رصد تغییرات',
  paused: 'رصد در حالت مکث',
  stopped: 'دنبال‌کردن تغییرات',
};

export const FollowButton: React.FC<FollowButtonProps> = ({
  entity,
  status,
  onChangeStatus,
}) => {
  const nextStatus: FollowStatus = status === 'active' ? 'stopped' : 'active';

  return (
    <div dir="rtl" className="inline-flex items-center gap-1.5" data-testid={`follow-controls-${entity.entityType}-${entity.id}`}>
      <button
        type="button"
        aria-pressed={status === 'active'}
        data-testid={`follow-btn-${entity.entityType}-${entity.id}`}
        onClick={() => onChangeStatus(entity, nextStatus)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
          status === 'active'
            ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
            : status === 'paused'
              ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
              : 'border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700'
        }`}
      >
        {STATUS_LABELS_FA[status]}
      </button>
      {status === 'active' && (
        <button
          type="button"
          data-testid={`follow-pause-btn-${entity.entityType}-${entity.id}`}
          onClick={() => onChangeStatus(entity, 'paused')}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700 cursor-pointer"
        >
          مکث موقت
        </button>
      )}
    </div>
  );
};
