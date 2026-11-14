import type {
  MarketFilterDraft,
  MarketGeoLevel,
  MarketPeriodId,
  MarketTransactionType,
  MarketType,
  PropertySubType,
  SavedMarketAnalysis,
} from '../types/market.types';
import { createDefaultMarketDraft, normalizeDraftForMarketType } from '../filters/MarketFilterDraft';

const SAVED_MARKET_STORAGE_KEY = 'tehran_radar_saved_market_analyses_v1';

const VALID_MARKET_TYPES = new Set<MarketType>(['residential', 'commercial', 'office', 'land']);
const VALID_TX_TYPES = new Set<MarketTransactionType>(['sale', 'rent']);
const VALID_SUB_TYPES = new Set<PropertySubType>([
  'apartment',
  'villa',
  'penthouse',
  'shop',
  'office_unit',
  'land_plot',
]);
const VALID_GEO_LEVELS = new Set<MarketGeoLevel>(['city', 'zone', 'neighborhood']);
const VALID_PERIODS = new Set<MarketPeriodId>(['30d', '90d', '180d', '365d']);

export function serializeMarketContextToQuery(
  draft: MarketFilterDraft,
  compareHoodIds: readonly number[],
): string {
  const p = new URLSearchParams();
  p.set('market', draft.marketType);
  p.set('tx', draft.transactionType);
  p.set('ptype', draft.propertySubType);
  p.set('geo', draft.geoLevel);
  p.set('period', draft.period);
  if (draft.areaRange !== 'all') p.set('area', draft.areaRange);
  if (draft.ageRange !== 'all') p.set('ageBand', draft.ageRange);
  if (draft.rooms !== 'all') p.set('rooms', draft.rooms);
  if (draft.onlyObserved) p.set('obs', '1');
  if (!draft.includeRentEquivalent) p.set('req', '0');
  if (compareHoodIds.length > 0) {
    p.set('cmp', compareHoodIds.slice(0, 4).join(','));
  }
  return p.toString();
}

export function parseMarketContextFromQuery(search: string): {
  draftPatch: Partial<MarketFilterDraft>;
  compareHoodIds: number[];
} {
  const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
  const p = new URLSearchParams(cleanSearch);
  let base = createDefaultMarketDraft();

  const rawMarket = p.get('market') as MarketType | null;
  if (rawMarket && VALID_MARKET_TYPES.has(rawMarket)) {
    base = normalizeDraftForMarketType(base, rawMarket);
  }
  const rawTx = p.get('tx') as MarketTransactionType | null;
  if (rawTx && VALID_TX_TYPES.has(rawTx)) base.transactionType = rawTx;
  const rawSub = p.get('ptype') as PropertySubType | null;
  if (rawSub && VALID_SUB_TYPES.has(rawSub)) base.propertySubType = rawSub;
  const rawGeo = p.get('geo') as MarketGeoLevel | null;
  if (rawGeo && VALID_GEO_LEVELS.has(rawGeo)) base.geoLevel = rawGeo;
  const rawPeriod = p.get('period') as MarketPeriodId | null;
  if (rawPeriod && VALID_PERIODS.has(rawPeriod)) base.period = rawPeriod;

  const area = p.get('area');
  if (area === 'under75' || area === '75to120' || area === 'over120') base.areaRange = area;
  const ageBand = p.get('ageBand');
  if (ageBand === 'new_0_5' || ageBand === 'mid_6_15' || ageBand === 'old_16plus') base.ageRange = ageBand;
  const rooms = p.get('rooms');
  if (rooms === '1' || rooms === '2' || rooms === '3plus') base.rooms = rooms;
  if (p.get('obs') === '1') base.onlyObserved = true;
  if (p.get('req') === '0') base.includeRentEquivalent = false;

  const cmpRaw = p.get('cmp') || '';
  const compareHoodIds = cmpRaw
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 4);

  return { draftPatch: base, compareHoodIds };
}

export function loadSavedMarketAnalyses(): SavedMarketAnalysis[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(SAVED_MARKET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedMarketAnalysis =>
        Boolean(item && typeof item.id === 'string' && typeof item.title === 'string' && item.filters),
    );
  } catch {
    return [];
  }
}

export function persistSavedMarketAnalyses(items: readonly SavedMarketAnalysis[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SAVED_MARKET_STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    /* ignore storage quota failures */
  }
}

export type MarketEventName =
  | 'market_view_opened'
  | 'market_filter_applied'
  | 'market_indicator_selected'
  | 'market_region_compared'
  | 'market_analysis_saved'
  | 'market_export_triggered'
  | 'market_methodology_opened';

export function trackMarketEvent(
  eventName: MarketEventName,
  meta: Record<string, string | number | boolean>,
): void {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('radar:market-analytics', {
        detail: { eventName, timestampIso: new Date().toISOString(), ...meta },
      }),
    );
  } catch {
    /* non-blocking */
  }
}
