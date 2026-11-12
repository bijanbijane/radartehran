/** Canonical listing sample builders for aggregator UI paths. OP-DEC-001: formatMillionTomanAsIntlCurrency */
import { clampNumber } from '../utils/security';

export interface NeighborhoodListingSource {
  id: number;
  name: string;
  buyPerSqm: number;
  bargains?: ReadonlyArray<{ id: string; sqm: number; title: string; discountPercent?: number; price?: number }> | null;
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

/** Returns only verified live samples; seed bargains are excluded from aggregation (CASPER epistemic integrity). */
export function buildNeighborhoodListingSamples(
  hood?: NeighborhoodListingSource | null,
): Array<{ id: string; sqm: number; askingTotalMillion: number; description: string }> {
  if (!hood || !Array.isArray(hood.bargains) || hood.bargains.length === 0) return [];
  const live = hood.bargains.filter((b) => typeof b.id === 'string' && b.id.startsWith('live-divar-'));
  if (live.length === 0) return [];
  const baseBuy = clampNumber(hood.buyPerSqm, 10, 2000, 120);
  return live.map((b) => ({
    id: b.id,
    sqm: b.sqm,
    askingTotalMillion: Math.round(b.sqm * baseBuy * (1 - (b.discountPercent || 10) / 100)),
    description: `${b.sqm} متر ${b.title}`,
  }));
}
