/** @file src/components/common/RadarSkeleton.tsx — Loading skeleton blocks */
import React from 'react';

export interface RadarSkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg';
}

const RADIUS = { sm: 'rounded-md', md: 'rounded-lg', lg: 'rounded-xl' } as const;

export const RadarSkeleton: React.FC<RadarSkeletonProps> = ({ className = 'h-4 w-full', rounded = 'md' }) => (
  <div
    className={`animate-pulse bg-[var(--color-bg-muted)] ${RADIUS[rounded]} ${className}`}
    aria-hidden="true"
  />
);