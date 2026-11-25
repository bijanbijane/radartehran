/** @file src/components/ui/RadarMetricPrimitives.tsx — Shared Domain Metric Primitives (RadarPrice, RadarDeltaBadge, RadarScoreBadge) */
import React from 'react';
import {
  formatPersianDeltaPercent,
  formatPersianPrice,
  formatPersianScore,
} from '../../utils/persianBidiFormat';
import { RadarBadge, type RadarBadgeTone } from './RadarPrimitives';

export interface RadarPriceProps {
  amountMillion: number;
  unit?: 'million' | 'billion' | 'short_m';
  isEn?: boolean;
  className?: string;
}

export const RadarPrice: React.FC<RadarPriceProps> = ({
  amountMillion,
  unit = 'million',
  isEn = false,
  className = '',
}) => (
  <span
    dir={isEn ? 'ltr' : 'rtl'}
    className={`tabular-nums inline-flex items-baseline gap-1 [unicode-bidi:isolate] ${className}`}
  >
    {formatPersianPrice(amountMillion, unit, isEn)}
  </span>
);

export interface RadarDeltaBadgeProps {
  deltaPercent: number;
  isEn?: boolean;
  invertTone?: boolean;
  className?: string;
}

export const RadarDeltaBadge: React.FC<RadarDeltaBadgeProps> = ({
  deltaPercent,
  isEn = false,
  invertTone = false,
  className = '',
}) => {
  let tone: RadarBadgeTone = 'neutral';
  if (deltaPercent > 0.05) tone = invertTone ? 'danger' : 'success';
  else if (deltaPercent < -0.05) tone = invertTone ? 'success' : 'danger';

  return (
    <RadarBadge tone={tone} className={`tabular-nums ${className}`}>
      <span dir="ltr" className="[unicode-bidi:isolate]">
        {formatPersianDeltaPercent(deltaPercent, isEn).replace(/[\u2066\u2069]/g, '')}
      </span>
    </RadarBadge>
  );
};

export interface RadarScoreBadgeProps {
  score: number;
  max?: number;
  isEn?: boolean;
  tone?: RadarBadgeTone;
  className?: string;
}

export const RadarScoreBadge: React.FC<RadarScoreBadgeProps> = ({
  score,
  max = 10,
  isEn = false,
  tone = 'neutral',
  className = '',
}) => (
  <RadarBadge tone={tone} className={`tabular-nums ${className}`}>
    <span className="[unicode-bidi:isolate]">{formatPersianScore(score, max, isEn)}</span>
  </RadarBadge>
);
