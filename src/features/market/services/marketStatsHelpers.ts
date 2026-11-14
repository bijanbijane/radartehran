import type { PriceDistributionStats, PriceScatterPoint, SupplyCompositionSegment } from '../types/indicator.types';

export function computeMean(values: readonly number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length === 0) return null;
  const sum = clean.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / clean.length) * 10) / 10;
}

export function computeQuantile(sortedAsc: readonly number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return Math.round(sortedAsc[0] * 10) / 10;
  const clampedQ = Math.min(1, Math.max(0, q));
  const pos = (sortedAsc.length - 1) * clampedQ;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sortedAsc[base];
  const upper = sortedAsc[base + 1] ?? lower;
  return Math.round((lower + rest * (upper - lower)) * 10) / 10;
}

export function computeMedian(values: readonly number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return computeQuantile(clean, 0.5);
}

export function computeDistributionStats(
  values: readonly number[],
  binCount = 5,
): PriceDistributionStats {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      count: 0,
      min: null,
      p10: null,
      p25: null,
      median: null,
      mean: null,
      p75: null,
      p90: null,
      max: null,
      iqr: null,
      bins: [],
    };
  }
  const min = Math.round(sorted[0] * 10) / 10;
  const max = Math.round(sorted[sorted.length - 1] * 10) / 10;
  const p10 = computeQuantile(sorted, 0.1);
  const p25 = computeQuantile(sorted, 0.25);
  const median = computeQuantile(sorted, 0.5);
  const p75 = computeQuantile(sorted, 0.75);
  const p90 = computeQuantile(sorted, 0.9);
  const mean = computeMean(sorted);
  const iqr = p25 !== null && p75 !== null ? Math.round((p75 - p25) * 10) / 10 : null;

  const safeBins = Math.max(3, Math.min(8, binCount));
  const span = Math.max(10, max - min);
  const step = Math.max(5, Math.ceil(span / safeBins));
  const bins: PriceDistributionStats['bins'] = [];

  for (let i = 0; i < safeBins; i++) {
    const fromSqm = Math.floor(min + i * step);
    const toSqm = i === safeBins - 1 ? Math.ceil(max + 1) : Math.floor(min + (i + 1) * step);
    const count = sorted.filter((v) => (i === safeBins - 1 ? v >= fromSqm && v <= max : v >= fromSqm && v < toSqm)).length;
    bins.push({
      rangeLabelFa: `${fromSqm} تا ${toSqm}`,
      fromSqm,
      toSqm,
      count,
      sharePct: Math.round((count / sorted.length) * 100),
    });
  }

  return { count: sorted.length, min, p10, p25, median, mean, p75, p90, max, iqr, bins };
}

export function buildSupplyCompositionByArea(
  points: readonly Pick<PriceScatterPoint, 'sqm'>[],
): SupplyCompositionSegment[] {
  const total = points.length;
  if (total === 0) return [];
  const small = points.filter((p) => p.sqm < 75).length;
  const mid = points.filter((p) => p.sqm >= 75 && p.sqm <= 120).length;
  const large = points.filter((p) => p.sqm > 120).length;
  return [
    { key: 'under75', labelFa: 'کوچک‌متراژ (زیر ۷۵ متر)', count: small, sharePct: Math.round((small / total) * 100) },
    { key: '75to120', labelFa: 'متوسط (۷۵ تا ۱۲۰ متر)', count: mid, sharePct: Math.round((mid / total) * 100) },
    { key: 'over120', labelFa: 'بزرگ‌متراژ (بالای ۱۲۰ متر)', count: large, sharePct: Math.round((large / total) * 100) },
  ];
}

export function buildSupplyCompositionByAge(
  points: readonly Pick<PriceScatterPoint, 'age'>[],
): SupplyCompositionSegment[] {
  const total = points.length;
  if (total === 0) return [];
  const newBuild = points.filter((p) => p.age <= 5).length;
  const midBuild = points.filter((p) => p.age >= 6 && p.age <= 15).length;
  const olderBuild = points.filter((p) => p.age > 15).length;
  return [
    { key: 'new_0_5', labelFa: 'نوساز تا ۵ سال', count: newBuild, sharePct: Math.round((newBuild / total) * 100) },
    { key: 'mid_6_15', labelFa: 'میان‌عمر (۶ تا ۱۵ سال)', count: midBuild, sharePct: Math.round((midBuild / total) * 100) },
    { key: 'old_16plus', labelFa: 'بالای ۱۵ سال', count: olderBuild, sharePct: Math.round((olderBuild / total) * 100) },
  ];
}
