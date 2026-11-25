/**
 * @file src/features/home/components/HomeSpatialSvgMapPreview.tsx
 * @description Lightweight interactive SVG spatial map preview for the Home Hero (F-13).
 * Projects live neighborhood coordinates onto an architecturally styled urban silhouette
 * with clickable BiDi-safe Persian pins in Light and Petroleum Dark modes.
 */
import React, { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import type { CityId } from '../../../types/models';
import { formatPersianPrice, formatPersianScore, toPersianDigits } from '../../../utils/persianBidiFormat';

export interface HomeSpatialSvgMapPreviewProps {
  neighborhoods: readonly EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  activeCity: CityId;
  previewLayer: 'price' | 'budget' | 'air';
  isEn: boolean;
  onSelectPin: (hood: EvaluatedNeighborhood) => void;
}

interface ProjectedPin {
  hood: EvaluatedNeighborhood;
  xPct: number;
  yPct: number;
}

function projectNeighborhoodsToCanvas(hoods: readonly EvaluatedNeighborhood[]): ProjectedPin[] {
  if (hoods.length === 0) return [];
  // Sort north-to-south (descending lat), then group into 2-per-band west-to-east (ascending lng)
  // so every pin preserves true relative geography while guaranteeing zero overlap or edge clipping
  // across both 390px mobile and 1440px desktop viewports.
  const byNorth = [...hoods].sort((a, b) => b.lat - a.lat);
  const rows: EvaluatedNeighborhood[][] = [];
  for (let i = 0; i < byNorth.length; i += 2) {
    const pair = byNorth.slice(i, i + 2).sort((a, b) => a.lng - b.lng);
    rows.push(pair);
  }
  const yBands = rows.length === 1 ? [48] : rows.length === 2 ? [30, 68] : [22, 50, 76];
  const placed: ProjectedPin[] = [];
  rows.forEach((row, rowIdx) => {
    const baseY = yBands[Math.min(rowIdx, yBands.length - 1)];
    if (row.length === 1) {
      placed.push({ hood: row[0], xPct: 50, yPct: baseY });
      return;
    }
    const stagger = rowIdx % 2 === 0 ? -3 : 3;
    placed.push({ hood: row[0], xPct: 27 + stagger, yPct: baseY + (rowIdx === 0 ? 4 : -2) });
    placed.push({ hood: row[1], xPct: 73 + stagger, yPct: baseY - (rowIdx === 0 ? 3 : -2) });
  });
  return placed;
}

export const HomeSpatialSvgMapPreview: React.FC<HomeSpatialSvgMapPreviewProps> = ({
  neighborhoods,
  selectedHood,
  activeCity,
  previewLayer,
  isEn,
  onSelectPin,
}) => {
  const pins = useMemo(() => projectNeighborhoodsToCanvas(neighborhoods.slice(0, 6)), [neighborhoods]);

  const formatMetric = (hood: EvaluatedNeighborhood): string => {
    if (previewLayer === 'price') {
      return isEn ? `${hood.buyPerSqm}M` : formatPersianPrice(hood.buyPerSqm, 'م/متر');
    }
    if (previewLayer === 'budget') {
      if (hood.status === 'green') return isEn ? 'Fit' : 'هم‌تراز بودجه';
      if (hood.status === 'yellow') return isEn ? 'Near' : 'نزدیک بودجه';
      return isEn ? `+${hood.diffPercent}%` : `${toPersianDigits(hood.diffPercent)}٪+`;
    }
    return isEn ? `Air ${hood.air}/10` : `هوا ${formatPersianScore(hood.air)}`;
  };

  return (
    <div
      data-testid="home-spatial-svg-map"
      className="relative w-full min-h-[215px] sm:min-h-[245px] rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] overflow-hidden select-none"
    >
      {/* Stylised Urban Topographic & Corridor SVG Backdrop */}
      <svg
        viewBox="0 0 560 280"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <pattern id="radar-home-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke="var(--color-border-subtle)"
              strokeWidth="0.7"
              opacity="0.55"
            />
          </pattern>
        </defs>
        <rect width="560" height="280" fill="url(#radar-home-grid)" />

        {/* Urban district silhouette polygons */}
        <path
          d="M 65 72 L 195 36 L 348 30 L 478 66 L 512 152 L 456 232 L 315 248 L 154 236 L 68 176 Z"
          fill="var(--color-brand-soft)"
          opacity="0.55"
          stroke="var(--color-brand-600)"
          strokeOpacity="0.28"
          strokeWidth="1.5"
        />
        <path
          d="M 145 78 L 280 56 L 415 84 L 440 164 L 352 208 L 210 202 L 128 148 Z"
          fill="var(--color-bg-muted)"
          opacity="0.72"
          stroke="var(--color-border-strong)"
          strokeOpacity="0.45"
          strokeWidth="1"
        />

        {/* Subtle arterial highway corridors */}
        <path
          d="M 30 112 Q 210 92 530 116"
          fill="none"
          stroke="var(--color-brand-600)"
          strokeOpacity="0.22"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <path
          d="M 275 18 Q 290 140 262 266"
          fill="none"
          stroke="var(--color-brand-600)"
          strokeOpacity="0.2"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <path
          d="M 90 218 Q 275 170 485 188"
          fill="none"
          stroke="var(--color-border-strong)"
          strokeOpacity="0.4"
          strokeWidth="1.4"
        />

        {/* Subtle cardinal direction watermark */}
        <text
          x="280"
          y="22"
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-text-muted)"
          opacity="0.75"
        >
          {activeCity === 'tehran' ? (isEn ? 'North · Alborz Foothills' : 'شمال · دامنه البرز') : isEn ? 'North' : 'شمال'}
        </text>
      </svg>

      {/* Interactive coordinate-projected neighborhood pins */}
      {pins.map(({ hood, xPct, yPct }, idx) => {
        const isCurrent = hood.id === selectedHood.id;
        const statusDotClass =
          previewLayer === 'budget'
            ? hood.status === 'green'
              ? 'bg-emerald-500'
              : hood.status === 'yellow'
                ? 'bg-amber-500'
                : 'bg-rose-500'
            : 'bg-[var(--color-brand-600)]';

        return (
          <button
            key={hood.id}
            type="button"
            data-testid={`home-svg-pin-${hood.id}`}
            onClick={() => onSelectPin(hood)}
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
            title={isEn ? `Open ${hood.name} on map` : `مشاهده محله ${hood.name} روی نقشه`}
            className={`${idx >= 4 ? 'hidden sm:inline-flex' : 'inline-flex'} absolute -translate-x-1/2 -translate-y-1/2 min-h-[44px] md:min-h-[34px] px-2.5 py-1 rounded-[9px] border items-center gap-1.5 text-[11px] font-bold transition shadow-sm cursor-pointer tabular-nums whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-600)] ${
              isCurrent
                ? 'z-20 bg-[var(--color-brand-600)] text-white border-[var(--color-brand-700)] shadow-md scale-[1.03]'
                : 'z-10 bg-[var(--color-bg-surface)]/95 text-[var(--color-text-primary)] border-[var(--color-border-strong)] hover:border-[var(--color-brand-600)] hover:z-20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${isCurrent ? 'bg-white' : statusDotClass}`}
              aria-hidden="true"
            />
            <span className="max-w-[92px] truncate">{hood.name}</span>
            <span
              className={`text-[10.5px] font-extrabold ${
                isCurrent ? 'text-white/95' : 'text-[var(--color-brand-fg)]'
              }`}
            >
              {formatMetric(hood)}
            </span>
          </button>
        );
      })}

      {/* Bottom-left subtle legend */}
      <div className="absolute bottom-2 inset-x-2.5 flex items-center justify-between text-[10px] text-[var(--color-text-muted)] pointer-events-none">
        <span className="inline-flex items-center gap-1 bg-[var(--color-bg-surface)]/85 px-2 py-0.5 rounded-[6px] border border-[var(--color-border-subtle)]">
          <MapPin className="w-3 h-3 text-[var(--color-brand-fg)]" aria-hidden="true" />
          <span>{isEn ? 'Click any pin to inspect on map' : 'کلیک روی هر محله ← ورود مستقیم به نقشه'}</span>
        </span>
      </div>
    </div>
  );
};
