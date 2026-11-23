/** @file src/components/common/RadarCard.tsx — RT-UI-COMP-001 Card primitive (info, metric, action) */
import React from 'react';
import { cardSurface, focusRing, textPrimary, textMuted } from '../../design-system/classMaps';

export type RadarCardVariant = 'info' | 'metric' | 'action';

export interface RadarCardProps {
  variant?: RadarCardVariant;
  title?: string;
  subtitle?: string;
  padding?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}

const PADDING = { sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-6' } as const;

export const RadarCard: React.FC<RadarCardProps> = ({
  variant = 'info',
  title,
  subtitle,
  padding = 'md',
  interactive = false,
  className = '',
  children,
  onClick,
}) => {
  const density =
    variant === 'metric' ? 'space-y-1' : variant === 'action' ? 'space-y-3' : 'space-y-2';
  const inner = (
    <>
      {(title || subtitle) && (
        <header className="space-y-0.5">
          {title && <h3 className={`text-sm font-bold ${textPrimary}`}>{title}</h3>}
          {subtitle && <p className={`text-xs ${textMuted}`}>{subtitle}</p>}
        </header>
      )}
      <div className={density}>{children}</div>
    </>
  );

  const base = `${cardSurface} ${PADDING[padding]} ${className}`;
  if (interactive && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} w-full text-start cursor-pointer transition-colors hover:bg-[var(--color-bg-muted)] ${focusRing}`}
      >
        {inner}
      </button>
    );
  }
  return <article className={base}>{inner}</article>;
};