import React from 'react';

export type RadarSurfaceCardPadding =
  | 'none'
  | 'compact'
  | 'standard'
  | 'large'
  | 'standard-responsive'
  | 'large-responsive';

export interface RadarSurfaceCardProps {
  padding?: RadarSurfaceCardPadding;
  elevated?: boolean;
  className?: string;
  children: React.ReactNode;
}

const PADDING_CLASSES: Record<RadarSurfaceCardPadding, string> = {
  none: '',
  compact: 'p-3',
  standard: 'p-4',
  large: 'p-5',
  'standard-responsive': 'p-4 sm:p-5',
  'large-responsive': 'p-5 sm:p-6',
};

/**
 * Canonical passive surface shared by historical RadarCard wrappers.
 * Semantic article/content cards remain separate because their interaction and
 * heading contracts are different from this neutral surface primitive.
 */
export const RadarSurfaceCard: React.FC<RadarSurfaceCardProps> = ({
  padding = 'standard',
  elevated = false,
  className = '',
  children,
}) => (
  <div
    className={`rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] ${elevated ? 'shadow-xs' : ''} ${PADDING_CLASSES[padding]} ${className}`}
  >
    {children}
  </div>
);
