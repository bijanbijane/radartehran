/** @file src/components/common/RadarEmptyState.tsx — RT-UI-COMP-001 Empty state pattern */
import React from 'react';
import { RadarButton } from './RadarButton';
import { textMuted, textPrimary } from '../../design-system/classMaps';

export interface RadarEmptyStateProps {
  titleFa: string;
  descriptionFa?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const RadarEmptyState: React.FC<RadarEmptyStateProps> = ({
  titleFa,
  descriptionFa,
  actionLabel,
  onAction,
  icon,
}) => (
  <div className="flex flex-col items-center justify-center text-center gap-3 py-10 px-4">
    {icon ? <div className="opacity-80" aria-hidden="true">{icon}</div> : null}
    <h3 className={`text-sm font-black ${textPrimary}`}>{titleFa}</h3>
    {descriptionFa ? <p className={`text-xs max-w-md ${textMuted}`}>{descriptionFa}</p> : null}
    {actionLabel && onAction ? (
      <RadarButton variant="secondary" size="sm" onClick={onAction}>
        {actionLabel}
      </RadarButton>
    ) : null}
  </div>
);