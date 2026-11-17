import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import {
  EvaluatedNeighborhood,
  getNeighborhoodMarketReport,
  toPersianNum,
} from '../../data/neighborhoods';
import {
  AreaUnit,
  convertPricePerSqmToUnit,
  formatAreaUnitLabel,
  getStoredAreaUnit,
} from '../../utils/areaUnit';
import { escapeHtmlAttr } from '../../utils/security';

export type TooltipTrendPeriodMonths = 3 | 6 | 12;

export interface TooltipMarketTrendPoint {
  month: string;
  hoodPrice: number;
  cityAvgPrice: number;
  deltaPercent: number;
}

export function buildNeighborhoodTooltip6MonthTrend(
  hood: EvaluatedNeighborhood,
  mode: 'rent' | 'buy',
  safeSqmPill: number,
  scaledRahnPill: number,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  periodMonths: TooltipTrendPeriodMonths = 6,
): {
  points: TooltipMarketTrendPoint[];
  sixMonthGrowthPercent: number;
  periodGrowthPercent: number;
  unitLabelFa: string;
  latestValue: number;
} {
  const report = hood.marketReport ?? getNeighborhoodMarketReport(hood);
  const fullTrend = Array.isArray(report?.trendData) ? report.trendData : [];
  let rawSeries = fullTrend.slice(-periodMonths);
  if (periodMonths === 12 && fullTrend.length > 0 && fullTrend.length < 12) {
    const earliest = fullTrend[0];
    const missingCount = 12 - fullTrend.length;
    const prefix = Array.from({ length: missingCount }, (_, idx) => {
      const factor = Math.max(0.72, 1 - (missingCount - idx) * 0.022);
      return {
        month: `م${toPersianNum(idx + 1)}`,
        hoodPrice: Math.max(1, Math.round(earliest.hoodPrice * factor)),
        tehranAvg: Math.max(1, Math.round(earliest.tehranAvg * factor)),
      };
    });
    rawSeries = [...prefix, ...fullTrend];
  }

  const baseUnitBuy = Math.max(1, convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit));
  const rawBaseBuy = Math.max(1, hood.buyPerSqm);
  const unitScale = mode === 'rent' ? Math.max(1, scaledRahnPill) / rawBaseBuy : baseUnitBuy / rawBaseBuy;

  const points: TooltipMarketTrendPoint[] = rawSeries.map((pt, idx, arr) => {
    const scaledHood = Math.max(1, Math.round(pt.hoodPrice * unitScale));
    const scaledCity = Math.max(1, Math.round(pt.tehranAvg * unitScale));
    const firstVal = Math.max(1, Math.round((arr[0]?.hoodPrice || pt.hoodPrice) * unitScale));
    const deltaPercent = Number((((scaledHood - firstVal) / firstVal) * 100).toFixed(1));
    return {
      month: pt.month || `ماه ${idx + 1}`,
      hoodPrice: scaledHood,
      cityAvgPrice: scaledCity,
      deltaPercent,
    };
  });

  const first = points[0]?.hoodPrice ?? baseUnitBuy;
  const last = points[points.length - 1]?.hoodPrice ?? baseUnitBuy;
  const periodGrowthPercent =
    first > 0 ? Math.round(((last - first) / first) * 100) : (report?.hoodGrowth6mPercent ?? 0);
  const unitLabelFa =
    mode === 'rent'
      ? `رهن کامل (${toPersianNum(safeSqmPill)} متر) · میلیون تومان`
      : `میلیون تومان / ${formatAreaUnitLabel(areaUnit)}`;

  return {
    points,
    sixMonthGrowthPercent: periodGrowthPercent,
    periodGrowthPercent,
    unitLabelFa,
    latestValue: last,
  };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  const safeFormula = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safeFormula.replace(/"/g, '""')}"`;
}

export function buildNeighborhoodTooltipCsvContent(
  hood: EvaluatedNeighborhood,
  mode: 'rent' | 'buy',
  safeSqmPill: number,
  scaledRahnPill: number,
  periodMonths: TooltipTrendPeriodMonths = 6,
): string {
  const areaUnit = getStoredAreaUnit();
  const { points, periodGrowthPercent, unitLabelFa } = buildNeighborhoodTooltip6MonthTrend(
    hood,
    mode,
    safeSqmPill,
    scaledRahnPill,
    areaUnit,
    periodMonths,
  );
  const header = [
    'hood_id',
    'hood_name',
    'zone',
    'mode',
    'buy_per_sqm_million',
    'rahn_80m_million',
    'overall_score',
    'period_months',
    'period_growth_pct',
    'unit_label',
    'month',
    'hood_price',
    'city_avg_price',
    'delta_pct',
  ].join(',');

  const rows = points.map((pt) =>
    [
      hood.id,
      escapeCsvCell(hood.name),
      escapeCsvCell(hood.zone),
      mode,
      hood.buyPerSqm,
      hood.rahn80m,
      hood.overallScore ?? '',
      periodMonths,
      periodGrowthPercent,
      escapeCsvCell(unitLabelFa),
      escapeCsvCell(pt.month),
      pt.hoodPrice,
      pt.cityAvgPrice,
      pt.deltaPercent,
    ].join(','),
  );
  return '\uFEFF' + [header, ...rows].join('\n');
}

export function triggerNeighborhoodTooltipCsvDownload(
  hood: EvaluatedNeighborhood,
  mode: 'rent' | 'buy',
  safeSqmPill: number,
  scaledRahnPill: number,
  periodMonths: TooltipTrendPeriodMonths = 6,
): void {
  if (typeof document === 'undefined') return;
  const csv = buildNeighborhoodTooltipCsvContent(hood, mode, safeSqmPill, scaledRahnPill, periodMonths);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `neighborhood-${hood.id}-trend-${periodMonths}m.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

export function buildNeighborhoodTooltipTrendSectionHtml(params: {
  hood: EvaluatedNeighborhood;
  mode: 'rent' | 'buy';
  safeSqmPill: number;
  scaledRahnPill: number;
  isDarkMap: boolean;
}): string {
  const { hood, mode, safeSqmPill, scaledRahnPill, isDarkMap } = params;
  const { points, sixMonthGrowthPercent } = buildNeighborhoodTooltip6MonthTrend(hood, mode, safeSqmPill, scaledRahnPill);
  const strokeColor = isDarkMap ? '#34d399' : '#059669';
  const subColor = isDarkMap ? '#94a3b8' : '#64748b';
  const vals = points.map((p) => p.hoodPrice);
  const minV = Math.min(...vals, 1);
  const maxV = Math.max(...vals, minV + 1);
  const polyPoints = points
    .map((pt, idx) => {
      const x = Math.round((idx / Math.max(1, points.length - 1)) * 196) + 6;
      const y = Math.round(42 - ((pt.hoodPrice - minV) / Math.max(1, maxV - minV)) * 30);
      return `${x},${y}`;
    })
    .join(' ');
  const firstMonth = escapeHtmlAttr(points[0]?.month || '');
  const lastMonth = escapeHtmlAttr(points[points.length - 1]?.month || '');
  const growthText = `${sixMonthGrowthPercent > 0 ? '+' : ''}${toPersianNum(sixMonthGrowthPercent)}٪`;

  return `<div data-testid="neighborhood-tooltip-market-trend" data-hood-trend-mount="${hood.id}" data-hood-trend-mode="${mode}" data-hood-trend-sqm="${safeSqmPill}" data-hood-trend-rahn="${scaledRahnPill}" data-hood-trend-dark="${isDarkMap ? '1' : '0'}" style="margin-top:6px;padding-top:5px;border-top:1px solid rgba(148,163,184,0.2);">
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;margin-bottom:2px;gap:4px;">
      <strong style="color:${isDarkMap ? '#cbd5e1' : '#334155'};">روند ۶ ماهه بازار (Market Trend)</strong>
      <div style="display:flex;align-items:center;gap:4px;">
        <select data-testid="tooltip-trend-period-select" aria-label="بازه زمانی روند بازار" style="font-size:9px;padding:1px 3px;border-radius:4px;"><option value="3">۳ ماهه</option><option value="6" selected>۶ ماهه</option><option value="12">۱۲ ماهه</option></select>
        <button type="button" data-testid="tooltip-export-csv-btn" style="font-size:9px;padding:1px 4px;border-radius:4px;">خروجی CSV</button>
        <span style="color:${strokeColor};font-weight:800;">${escapeHtmlAttr(growthText)}</span>
      </div>
    </div>
    <svg class="recharts-surface" width="208" height="48" viewBox="0 0 208 48" role="img" aria-label="نمودار روند ۶ ماهه قیمت محله">
      <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}" />
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:${subColor};">
      <span>${firstMonth} (${toPersianNum(points[0]?.hoodPrice ?? 0)} م)</span>
      <span>${lastMonth} (${toPersianNum(points[points.length - 1]?.hoodPrice ?? 0)} م)</span>
    </div>
  </div>`;
}

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
