/**
 * @file src/utils/divarComparableListings.ts
 * Live Divar comparable listings with explicit epistemic status (no silent seed fallback).
 * OP-DEC-001 parity: formatMillionTomanAsIntlCurrency (see areaUnit).
 */

import type { CityId } from '../types/models';
import { resolveDivarCityId } from '../data/iranProvincesDirectory';
import { buildDivarPostUrl } from './epistemicUiLabels';
import { validateUpstreamDivarWidgetItem } from './freeLiveMarketScraper';
import { sanitizeInput } from './security';

export type DivarComparableSourceId = 'divar_public_search' | 'upstream_unavailable';
export type DivarComparableQualityStatus = 'verified_live' | 'insufficient_sample' | 'upstream_error';

/** Honest Divar search provenance. Seed tables are never substituted for a missing median. */
export interface DivarComparableProvenance {
  sourceId: DivarComparableSourceId;
  fetchedAtIso: string;
  normalizationVersion: '2026.2';
  qualityStatus: DivarComparableQualityStatus;
}

export function buildDivarComparableProvenance(
  qualityStatus: DivarComparableQualityStatus,
  fetchedAtIso: string,
): DivarComparableProvenance {
  return {
    sourceId: qualityStatus === 'upstream_error' ? 'upstream_unavailable' : 'divar_public_search',
    fetchedAtIso,
    normalizationVersion: '2026.2',
    qualityStatus,
  };
}

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

export interface DivarComparableSearchResult {
  hoodName: string;
  city: CityId;
  medianPerSqm: number | null;
  comparables: LiveComparableListing[];
  insufficientSample: boolean;
  rejectedMalformedCount: number;
  provenance: DivarComparableProvenance;
}

const MAX_UPSTREAM_JSON_BYTES = 256 * 1024;

function medianOfSorted(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return Math.round((sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

async function readBoundedResponseText(res: Response, maxBytes: number): Promise<string | null> {
  const contentLen = Number(res.headers.get('content-length') || '0');
  if (Number.isFinite(contentLen) && contentLen > maxBytes) return null;
  const text = await res.text();
  if (new TextEncoder().encode(text).length > maxBytes) return null;
  return text;
}

function emptyResult(hoodName: string, city: CityId): DivarComparableSearchResult {
  const fetchedAtIso = new Date().toISOString();
  return {
    hoodName,
    city,
    medianPerSqm: null,
    comparables: [],
    insufficientSample: true,
    rejectedMalformedCount: 0,
    provenance: buildDivarComparableProvenance('upstream_error', fetchedAtIso),
  };
}

export async function fetchDivarComparableListings(
  city: CityId,
  hoodName: string,
  opts?: { hoodId?: number; seedBuyPerSqm?: number; targetSqm?: number; sqmTolerancePct?: number },
): Promise<DivarComparableSearchResult> {
  const safeHoodName = sanitizeInput(hoodName, 60).replace(/[<>]/g, '');
  if (!safeHoodName) return emptyResult(hoodName, city);

  const seed = opts?.seedBuyPerSqm;
  const targetSqm = opts?.targetSqm;
  const tol = opts?.sqmTolerancePct ?? 0.15;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const proxyRes = await fetch('/api/listing-verdict/comparables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          city,
          hoodName: safeHoodName,
          hoodId: opts?.hoodId,
          seedBuyPerSqm: seed,
          targetSqm,
          sqmTolerancePct: tol,
        }),
        signal: AbortSignal.timeout(9000),
      });
      if (!proxyRes.ok) return emptyResult(safeHoodName, city);
      const payload = (await proxyRes.json()) as DivarComparableSearchResult;
      return payload && Array.isArray(payload.comparables) ? payload : emptyResult(safeHoodName, city);
    } catch {
      return emptyResult(safeHoodName, city);
    }
  }

  try {
    const res = await fetch('https://api.divar.ir/v8/postlist/w/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({
        city_ids: [resolveDivarCityId(city, opts?.hoodId)],
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

    if (!res.ok) return emptyResult(safeHoodName, city);
    const ct = (res.headers.get('content-type') || '').replace(/[<>]/g, '').toLowerCase();
    if (!ct.includes('application/json')) return emptyResult(safeHoodName, city);

    const rawText = await readBoundedResponseText(res, MAX_UPSTREAM_JSON_BYTES);
    if (!rawText) return emptyResult(safeHoodName, city);

    const data = JSON.parse(rawText) as Record<string, unknown>;
    const widgets = Array.isArray(data?.list_widgets) ? data.list_widgets.slice(0, 60) : [];
    const fetchedAtIso = new Date().toISOString();
    let rejectedMalformedCount = 0;

    const strictMatches: LiveComparableListing[] = [];
    const fallbackMatches: LiveComparableListing[] = [];
    for (const w of widgets) {
      const normalized = validateUpstreamDivarWidgetItem(w, seed ?? null);
      if (!normalized) {
        rejectedMalformedCount++;
        continue;
      }
      let seedBandAnomaly = false;
      if (Number.isFinite(seed) && seed! > 0) {
        seedBandAnomaly = normalized.perSqmMillion < seed! * 0.55 || normalized.perSqmMillion > seed! * 1.65;
      }
      const item: LiveComparableListing = {
        token: normalized.token,
        title: normalized.title,
        sqm: normalized.sqm,
        perSqmMillion: normalized.perSqmMillion,
        totalMillionToman: Math.round(normalized.perSqmMillion * normalized.sqm),
        divarUrl: buildDivarPostUrl(normalized.token),
        fetchedAtIso,
        seedBandAnomaly,
      };
      const inStrictBand = !targetSqm || targetSqm <= 0 || (normalized.sqm >= targetSqm * (1 - tol) && normalized.sqm <= targetSqm * (1 + tol));
      if (inStrictBand) strictMatches.push(item);
      else fallbackMatches.push(item);
    }

    if (strictMatches.length < MIN_COMPARABLE_LISTINGS && fallbackMatches.length > 0 && targetSqm && targetSqm > 0) {
      fallbackMatches.sort((a, b) => Math.abs(a.sqm - targetSqm) - Math.abs(b.sqm - targetSqm));
      for (const extra of fallbackMatches) {
        strictMatches.push(extra);
        if (strictMatches.length >= MIN_COMPARABLE_LISTINGS) break;
      }
    }
    const comparables = strictMatches.slice(0, MAX_COMPARABLE_LISTINGS);
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
      provenance: buildDivarComparableProvenance(
        insufficientSample ? 'insufficient_sample' : 'verified_live',
        fetchedAtIso,
      ),
    };
  } catch {
    return emptyResult(safeHoodName, city);
  }
}
