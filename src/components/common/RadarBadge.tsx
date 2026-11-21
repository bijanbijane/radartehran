/** @file src/components/common/RadarBadge.tsx — RT-UI-COMP-001 Badge primitive */
import React from 'react';

export type RadarBadgeTone = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<RadarBadgeTone, string> = {
  brand: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border-[var(--color-brand-200)]',
  neutral: 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]',
  success: 'bg-[#EAF5EE] text-[#176B4C] border-[#B9DEC8]',
  warning: 'bg-[#FFF4E5] text-[#875000] border-[#F2D19B]',
  danger: 'bg-[#FDECEC] text-[#A61B1B] border-[#F2B8B8]',
  info: 'bg-[#EAF3FB] text-[#155E9A] border-[#B9D8F0]',
};

export interface RadarBadgeProps {
  tone?: RadarBadgeTone;
  children: React.ReactNode;
  className?: string;
}

export const RadarBadge: React.FC<RadarBadgeProps> = ({ tone = 'neutral', children, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${TONE_CLASSES[tone]} ${className}`}
  >
    {children}
  </span>
);