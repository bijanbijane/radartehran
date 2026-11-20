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

  return `<div data-testid="neighborhood-tooltip-market-trend" data-hood-trend-mount="${hood.id}" data-hood-trend-mode="${mode}" data-hood-trend-sqm="${safeSqmPill}" data-hood-trend-rahn="${scaledRahnPill}" data-hood-trend-dark="${isDarkMap ? '1' : '0'}" style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);">
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;margin-bottom:2px;gap:4px;">
      <strong style="color:${isDarkMap ? '#cbd5e1' : '#334155'};">روند ۶ ماهه بازار</strong>
      <div style="display:flex;align-items:center;gap:4px;">
        <select data-testid="tooltip-trend-period-select" aria-label="بازه زمانی روند بازار" style="font-size:9px;padding:1px 3px;border-radius:4px;"><option value="3">۳ ماهه</option><option value="6" selected>۶ ماهه</option><option value="12">۱۲ ماهه</option></select>
        <button type="button" data-testid="tooltip-export-csv-btn" style="font-size:9px;padding:1px 4px;border-radius:4px;">خروجی CSV</button>
        <span style="color:${strokeColor};font-weight:800;">${escapeHtmlAttr(growthText)}</span>
      </div>
    </div>
    <svg class="recharts-surface" width="208" height="38" viewBox="0 0 208 48" role="img" aria-label="نمودار روند ۶ ماهه قیمت محله">
      <polyline fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}" />
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:${subColor};">
      <span>${firstMonth} (${toPersianNum(points[0]?.hoodPrice ?? 0)} م)</span>
      <span>${lastMonth} (${toPersianNum(points[points.length - 1]?.hoodPrice ?? 0)} م)</span>
    </div>
  </div>`;
}
