import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { EvaluatedNeighborhood, toPersianNum } from '../../data/neighborhoods';
import { getStoredAreaUnit } from '../../utils/areaUnit';
import {
  buildNeighborhoodTooltip6MonthTrend,
  buildNeighborhoodTooltipCsvContent,
  buildNeighborhoodTooltipTrendSectionHtml,
  triggerNeighborhoodTooltipCsvDownload,
  type TooltipMarketTrendPoint,
  type TooltipTrendPeriodMonths,
} from './neighborhoodTooltipTrendHelpers';

export {
  buildNeighborhoodTooltip6MonthTrend,
  buildNeighborhoodTooltipCsvContent,
  buildNeighborhoodTooltipTrendSectionHtml,
  triggerNeighborhoodTooltipCsvDownload,
  type TooltipMarketTrendPoint,
  type TooltipTrendPeriodMonths,
};

export const NeighborhoodTooltipMarketTrendChart: React.FC<{
  hood: EvaluatedNeighborhood;
  mode: 'rent' | 'buy';
  safeSqmPill: number;
  scaledRahnPill: number;
  isDarkMap: boolean;
}> = ({ hood, mode, safeSqmPill, scaledRahnPill, isDarkMap }) => {
  const [periodMonths, setPeriodMonths] = useState<TooltipTrendPeriodMonths>(6);
  const areaUnit = getStoredAreaUnit();
  const { points, periodGrowthPercent, unitLabelFa } = buildNeighborhoodTooltip6MonthTrend(
    hood,
    mode,
    safeSqmPill,
    scaledRahnPill,
    areaUnit,
    periodMonths,
  );

  const strokeColor = isDarkMap ? '#34d399' : '#059669';
  const gridTextColor = isDarkMap ? '#94a3b8' : '#64748b';
  const growthPrefix = periodGrowthPercent > 0 ? '+' : '';

  return (
    <div
      dir="rtl"
      data-testid="recharts-tooltip-market-trend"
      style={{ width: '100%', paddingTop: 4, fontFamily: 'Vazirmatn, Tahoma, sans-serif' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          fontSize: 10,
          marginBottom: 4,
          color: isDarkMap ? '#cbd5e1' : '#334155',
        }}
      >
        <span style={{ fontWeight: 800 }}>روند {toPersianNum(periodMonths)} ماهه بازار</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            aria-label="بازه زمانی روند بازار"
            data-testid="tooltip-trend-period-select"
            value={periodMonths}
            onChange={(e) => setPeriodMonths(Number(e.target.value) as TooltipTrendPeriodMonths)}
            style={{
              fontSize: 9.5,
              padding: '1px 4px',
              borderRadius: 4,
              border: '1px solid rgba(148,163,184,0.45)',
              background: isDarkMap ? '#1e293b' : '#f8fafc',
              color: isDarkMap ? '#e2e8f0' : '#0f172a',
              cursor: 'pointer',
            }}
          >
            <option value={3}>۳ ماهه</option>
            <option value={6}>۶ ماهه</option>
            <option value={12}>۱۲ ماهه</option>
          </select>
          <button
            type="button"
            data-testid="tooltip-export-csv-btn"
            onClick={() =>
              triggerNeighborhoodTooltipCsvDownload(hood, mode, safeSqmPill, scaledRahnPill, periodMonths)
            }
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid rgba(16,185,129,0.5)',
              background: isDarkMap ? 'rgba(6,95,70,0.45)' : '#ecfdf5',
              color: isDarkMap ? '#6ee7b7' : '#047857',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            خروجی CSV
          </button>
          <span style={{ fontWeight: 800, color: periodGrowthPercent >= 0 ? strokeColor : '#f59e0b' }}>
            {growthPrefix}
            {toPersianNum(periodGrowthPercent)}٪
          </span>
        </div>
      </div>
      <div style={{ width: 210, height: 68 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 6, left: 6, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 8.5, fill: gridTextColor }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
            <Tooltip
              formatter={(value: any) => [`${toPersianNum(Number(value) || 0)} م`, 'نرخ محله']}
              labelStyle={{ fontSize: 9.5, fontWeight: 700, color: '#0f172a' }}
              contentStyle={{ fontSize: 9.5, padding: '3px 6px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'rgba(255,255,255,0.96)' }}
            />
            <Line type="monotone" dataKey="hoodPrice" stroke={strokeColor} strokeWidth={2} dot={{ r: 2, fill: strokeColor }} activeDot={{ r: 3.5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 9, color: gridTextColor, textAlign: 'left' }}>{unitLabelFa}</div>
    </div>
  );
};

const activeTooltipRoots = new Map<HTMLElement, Root>();

export function mountNeighborhoodTooltipTrendOnOpen(
  tooltipRootEl: HTMLElement | null | undefined,
  resolveHoodById: (hoodId: number) => EvaluatedNeighborhood | undefined
): void {
  if (!tooltipRootEl || typeof document === 'undefined') return;
  const mountNode = tooltipRootEl.querySelector<HTMLElement>('[data-hood-trend-mount]');
  if (!mountNode) return;
  const hoodId = Number(mountNode.getAttribute('data-hood-trend-mount'));
  const hood = resolveHoodById(hoodId);
  if (!hood) return;
  const mode = mountNode.getAttribute('data-hood-trend-mode') === 'rent' ? 'rent' : 'buy';
  const safeSqmPill = Number(mountNode.getAttribute('data-hood-trend-sqm')) || 80;
  const scaledRahnPill = Number(mountNode.getAttribute('data-hood-trend-rahn')) || hood.rahn80m;
  const isDarkMap = mountNode.getAttribute('data-hood-trend-dark') === '1';

  try {
    let root = activeTooltipRoots.get(mountNode);
    if (!root) {
      root = createRoot(mountNode);
      activeTooltipRoots.set(mountNode, root);
    }
    root.render(React.createElement(NeighborhoodTooltipMarketTrendChart, { hood, mode, safeSqmPill, scaledRahnPill, isDarkMap }));
  } catch { /* fallback static SVG */ }
}

export function unmountNeighborhoodTooltipTrendOnClose(tooltipRootEl?: HTMLElement | null): void {
  if (!tooltipRootEl) {
    activeTooltipRoots.forEach((root) => { try { root.unmount(); } catch { /* ignore */ } });
    activeTooltipRoots.clear();
    return;
  }
  const mountNode = tooltipRootEl.querySelector<HTMLElement>('[data-hood-trend-mount]');
  if (!mountNode) return;
  const root = activeTooltipRoots.get(mountNode);
  if (root) {
    activeTooltipRoots.delete(mountNode);
    try { root.unmount(); } catch { /* ignore */ }
  }
}
