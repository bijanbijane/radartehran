/**
 * @file src/shared/engagement-ui/FavoriteButton.tsx
 * @description Reusable Favorite toggle button with accessible aria-pressed state and in-flight lock (Stage 8).
 */

import React from 'react';
import type { EngagementEntityRef } from '../../platform/entity-engagement';

export interface FavoriteButtonProps {
  entity: EngagementEntityRef;
  isFavorited: boolean;
  isInFlight?: boolean;
  onToggle: (entity: EngagementEntityRef) => void;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  entity,
  isFavorited,
  isInFlight = false,
  onToggle,
}) => {
  return (
    <button
      type="button"
      dir="rtl"
      aria-pressed={isFavorited}
      aria-label={isFavorited ? `حذف «${entity.title}» از علاقه‌مندی‌ها` : `افزودن «${entity.title}» به علاقه‌مندی‌ها`}
      disabled={isInFlight}
      data-testid={`favorite-btn-${entity.entityType}-${entity.id}`}
      onClick={() => onToggle(entity)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
        isFavorited
          ? 'border-rose-500/40 bg-rose-950/40 text-rose-300'
          : 'border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-700'
      } ${isInFlight ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
    >
      <span>{isFavorited ? 'در علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}</span>
    </button>
  );
};
