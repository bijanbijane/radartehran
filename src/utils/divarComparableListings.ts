/**
 * @file src/utils/divarComparableListings.ts
 * Live Divar comparable listings with explicit epistemic status (no silent seed fallback).
 * OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit).
 */

import type { CityId } from '../types/models';
import { buildDivarPostUrl } from './epistemicUiLabels';
import {
  validateUpstreamDivarWidgetItem,
  type MarketDataProvenance,
} from './freeLiveMarketScraper';
import { sanitizeInput } from './security';

export const MIN_COMPARABLE_LISTINGS = 8;
export const MAX_COMPARABLE_LISTINGS = 30;

export interface LiveComparableListing {
  token: string;
  title: string;
  sqm: number;
  perSqmMillion: number;
  totalMillionToman: number;
  divarUrl: string;
  fetchedAtIso: string;
  seedBandAnomaly: boolean;
}

export type DivarComparableQuality =
  | 'verified_live'
  | 'insufficient_sample'
  | 'upstream_error'
  | 'cached_or_fallback';

export interface DivarComparableSearchResult {
  hoodName: string;
  city: CityId;
  medianPerSqm: number | null;
  comparables: LiveComparableListing[];
  insufficientSample: boolean;
  rejectedMalformedCount: number;
  provenance: MarketDataProvenance;
}

const MAX_UPSTREAM_JSON_BYTES = 256 * 1024;

function cityIdForDivar(city: CityId): string {
  if (city === 'tehran') return '1';
  if (city === 'karaj') return '2';
  if (city === 'mashhad') return '3';
  if (city === 'isfahan') return '4';
  return '6';
}

function medianOfSorted(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return Math.round((sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

async function readBoundedResponseText(res: Response, maxBytes: number): Promise<string | null> {
  const contentLen = Number(res.headers.get('content-length') || '0');
  if (Number.isFinite(contentLen) && contentLen > maxBytes) return null;
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf-8') > maxBytes) return null;
  return text;
}

function emptyResult(
  hoodName: string,
  city: CityId,
  quality: DivarComparableQuality,
  sourceId: MarketDataProvenance['sourceId'],
): DivarComparableSearchResult {
  const fetchedAtIso = new Date().toISOString();
  return {
    hoodName,
    city,
    medianPerSqm: null,
    comparables: [],
    insufficientSample: true,
    rejectedMalformedCount: 0,
    provenance: {
      sourceId,
      fetchedAtIso,
      normalizationVersion: '2026.2',
      qualityStatus: quality === 'verified_live' ? 'verified_live' : 'cached_or_fallback',
    },
  };
}

export async function fetchDivarComparableListings(
  city: CityId,
  hoodName: string,
  opts?: { seedBuyPerSqm?: number; targetSqm?: number; sqmTolerancePct?: number },
): Promise<DivarComparableSearchResult> {
  const safeHoodName = sanitizeInput(hoodName, 60).replace(/[<>]/g, '');
  if (!safeHoodName) return emptyResult(hoodName, city, 'upstream_error', 'seed_fallback');

  const seed = opts?.seedBuyPerSqm;
  const targetSqm = opts?.targetSqm;
  const tol = opts?.sqmTolerancePct ?? 0.15;

  try {
    const res = await fetch('https://api.divar.ir/v8/postlist/w/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({
        city_ids: [cityIdForDivar(city)],
        search_data: {
          form_data: { data: { category: { str: { value: 'apartment-sell' } } } },
          server_payload: {
            '@type': 'type.googleapis.com/widgets.SearchData.ServerPayload',
            additional_form_data: { data: { sort: { str: { value: 'sort_date' } } } },
          },
          query: `آپارتمان ${safeHoodName}`,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return emptyResult(safeHoodName, city, 'upstream_error', 'seed_fallback');
    const ct = (res.headers.get('content-type') || '').replace(/[<>]/g, '').toLowerCase();
    if (!ct.includes('application/json')) return emptyResult(safeHoodName, city, 'upstream_error', 'seed_fallback');

    const rawText = await readBoundedResponseText(res, MAX_UPSTREAM_JSON_BYTES);
    if (!rawText) return emptyResult(safeHoodName, city, 'upstream_error', 'seed_fallback');

    const data = JSON.parse(rawText) as Record<string, unknown>;
    const widgets = Array.isArray(data?.list_widgets) ? data.list_widgets.slice(0, 60) : [];
    const fetchedAtIso = new Date().toISOString();
    let rejectedMalformedCount = 0;

    const comparables: LiveComparableListing[] = [];
    for (const w of widgets) {
      const normalized = validateUpstreamDivarWidgetItem(w, null);
      if (!normalized) {
        rejectedMalformedCount++;
        continue;
      }
      if (targetSqm && targetSqm > 0) {
        const lo = targetSqm * (1 - tol);
        const hi = targetSqm * (1 + tol);
        if (normalized.sqm < lo || normalized.sqm > hi) continue;
      }
      let seedBandAnomaly = false;
      if (Number.isFinite(seed) && seed! > 0) {
        seedBandAnomaly = normalized.perSqmMillion < seed! * 0.55 || normalized.perSqmMillion > seed! * 1.65;
      }
      comparables.push({
        token: normalized.token,
        title: normalized.title,
        sqm: normalized.sqm,
        perSqmMillion: normalized.perSqmMillion,
        totalMillionToman: Math.round(normalized.perSqmMillion * normalized.sqm),
        divarUrl: buildDivarPostUrl(normalized.token),
        fetchedAtIso,
        seedBandAnomaly,
      });
      if (comparables.length >= MAX_COMPARABLE_LISTINGS) break;
    }

    const insufficientSample = comparables.length < MIN_COMPARABLE_LISTINGS;
    const sorted = comparables.map((c) => c.perSqmMillion).sort((a, b) => a - b);
    const medianPerSqm = insufficientSample ? null : medianOfSorted(sorted);

    return {
      hoodName: safeHoodName,
      city,
      medianPerSqm,
      comparables,
      insufficientSample,
      rejectedMalformedCount,
      provenance: {
        sourceId: insufficientSample ? 'seed_fallback' : 'divar_public_search',
        fetchedAtIso,
        normalizationVersion: '2026.2',
        qualityStatus: insufficientSample ? 'cached_or_fallback' : 'verified_live',
      },
    };
  } catch {
    return emptyResult(safeHoodName, city, 'upstream_error', 'seed_fallback');
  }
}
