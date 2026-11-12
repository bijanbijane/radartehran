/** Canonical listing sample builders for aggregator UI paths. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import { clampNumber } from '../utils/security';

export interface NeighborhoodListingSource {
  id: number;
  name: string;
  buyPerSqm: number;
  bargains?: ReadonlyArray<{
    id: string;
    sqm: number;
    title: string;
    discountPercent?: number;
    price?: number;
    type?: 'خرید' | 'اجاره';
  }> | null;
}

/** Illustrative seed bargains — must not be treated as observed market data. */
export function buildIllustrativeSeedListingSamples(
  hood?: NeighborhoodListingSource | null,
): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  return hood.bargains.map((b) => ({
    id: `illus-${b.id}`,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: `[نمونهٔ نمایشی] ${b.sqm} متر ${b.title}`,
  }));
}

/**
 * Prefer scraped `live-divar-*` rows; otherwise derive samples from the hood seed catalog (not empty `[]`).
 * Catalog rows are labeled in descriptions so UI never implies registered transactions.
 */
export function buildNeighborhoodListingSamples(
  hood?: NeighborhoodListingSource | null,
): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const live = hood.bargains.filter((b) => typeof b.id === 'string' && b.id.startsWith('live-divar-'));
  const catalog = hood.bargains.filter((b) => typeof b.id === 'string' && !b.id.startsWith('live-divar-') && b.type !== 'اجاره');
  const pool = live.length > 0 ? live : catalog;
  if (pool.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  const fromLive = live.length > 0;
  return pool.map((b) => ({
    id: fromLive ? b.id : `catalog-${b.id}`,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: fromLive ? `${b.sqm} متر ${b.title}` : `[آگهی کاتالوگ محله] ${b.sqm} متر ${b.title}`,
  }));
}
