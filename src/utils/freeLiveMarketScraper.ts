/**
 * @file src/utils/freeLiveMarketScraper.ts
 * @description
 * Validated & provenance-preserving external market data scraper (Tasks 566, 567, 568).
 * Enforces strict response size/type contracts, explicit field mapping without object spreading, * numeric range validation, HTML/script neutralization, and provenance tracking.
 */

import type { BargainListing, CityId } from '../types/models'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit'; import { clampNumber, sanitizeInput } from './security';

export type MarketDataSourceId = | 'tgju_public_html'
  | 'divar_public_search'
  | 'open_meteo_current'
  | 'seed_fallback';

export interface MarketDataProvenance { sourceId: MarketDataSourceId; fetchedAtIso: string; normalizationVersion: '2026.2'; qualityStatus: 'verified_live' | 'cached_or_fallback'; }

export interface FreeMacroRates { gold18kToman: number; usdToman: number; updatedAtIso: string; provenance?: MarketDataProvenance; }

export interface FreeScrapedHoodData { medianBuyPerSqm: number | null; bargains: BargainListing[]; provenance: MarketDataProvenance; displayAreaUnitLabel?: string; medianBuyPerSqmIntlText?: string; }

const MAX_UPSTREAM_TEXT_BYTES = 350 * 1024; const MAX_UPSTREAM_JSON_BYTES = 256 * 1024;

const FAKE_OR_PRESALE_REGEX = /پیش[\s]*فروش|اسکلت|قولنامه|وکالتی|قدرالسهم|کلنگی|معاوضه|رهن و اجاره/i;

async function readBoundedResponseText(res: Response, maxBytes: number): Promise<string | null> { const contentLen = Number(res.headers.get('content-length') || '0'); if (Number.isFinite(contentLen) && contentLen > maxBytes) return null; const text = await res.text();
  if (Buffer.byteLength(text, 'utf-8') > maxBytes) return null; return text; }

/**
 * Tasks 566, 567 & 568: Validate and normalize a single upstream Divar widget item.
 */
export function validateUpstreamDivarWidgetItem(
  rawWidget: unknown, seedBuyPerSqm: number,
): { title: string; sqm: number; perSqmMillion: number; token: string } | null {
  if (!rawWidget || typeof rawWidget !== 'object' || Array.isArray(rawWidget)) return null;
  const w = rawWidget as Record<string, unknown>;
  if (!w.data || typeof w.data !== 'object' || Array.isArray(w.data)) return null;
  const d = w.data as Record<string, unknown>;

  const rawTitle = typeof d.title === 'string' ? d.title : '';
  const title = sanitizeInput(rawTitle, 140).replace(/[<>]/g, '');
  const topDesc = typeof d.top_description_text === 'string' ? d.top_description_text.slice(0, 200) : '';
  const midDesc = typeof d.middle_description_text === 'string' ? d.middle_description_text.slice(0, 200) : '';
  const botDesc = typeof d.bottom_description_text === 'string' ? d.bottom_description_text.slice(0, 200) : '';
  const desc = sanitizeInput(`${topDesc} ${midDesc} ${botDesc}`, 400);

  if (!title || FAKE_OR_PRESALE_REGEX.test(title) || FAKE_OR_PRESALE_REGEX.test(desc)) return null;

  const toLatinDigits = (s: string) =>
    s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  const normCombined = toLatinDigits(`${title} ${desc}`);
  const normDesc = toLatinDigits(desc).replace(/[,٬،\u066C\u060C]/g, '');
  const sqmMatch = normCombined.match(/(\d{2,3})\s*متر/);
  const totalMatch = normDesc.match(/(\d{9,15})\s*تومان/);
  if (!sqmMatch || !totalMatch) return null;

  const sqm = Number(sqmMatch[1]);
  const totalToman = Number(totalMatch[1]);
  if (!Number.isFinite(sqm) || !Number.isFinite(totalToman) || sqm < 40 || sqm > 300 || totalToman < 1_500_000_000) {
    return null;
  }

  const perSqmMillion = Math.round((totalToman / 1_000_000 / sqm) * 10) / 10;
  if (!Number.isFinite(perSqmMillion) || perSqmMillion < seedBuyPerSqm * 0.55 || perSqmMillion > seedBuyPerSqm * 1.65) {
    return null;
  }

  const action = d.action && typeof d.action === 'object' ? (d.action as Record<string, unknown>) : undefined;
  const payload = action?.payload && typeof action.payload === 'object' ? (action.payload as Record<string, unknown>) : undefined;
  const rawToken = typeof payload?.token === 'string' ? payload.token : '';
  const safeToken = rawToken.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

  return { title, sqm, perSqmMillion, token: safeToken };
}

export async function fetchFreeLiveGoldAndUsdRates(fallback: FreeMacroRates): Promise<FreeMacroRates> {
  const fallbackWithProvenance: FreeMacroRates = {
    gold18kToman: fallback.gold18kToman,
    usdToman: fallback.usdToman,
    updatedAtIso: fallback.updatedAtIso,
    provenance: {
      sourceId: 'seed_fallback',
      fetchedAtIso: new Date().toISOString(),
      normalizationVersion: '2026.2',
      qualityStatus: 'cached_or_fallback',
    },
  };
  try {
    const res = await fetch('https://www.tgju.org/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return fallbackWithProvenance;
    const html = await readBoundedResponseText(res, MAX_UPSTREAM_TEXT_BYTES);
    if (!html) return fallbackWithProvenance;

    const normHtml = html.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[٬،\u066C\u060C]/g, ',');
    const goldMatch = normHtml.match(/geram18[\s\S]{1,350}?data-col="info\.last_trade\.PDrCotVal"[^>]*>([\d,]+)</i) || normHtml.match(/طلای 18 عیار[\s\S]{1,350}?([\d,]{7,12})/i);
    const usdMatch = normHtml.match(/price_dollar_rl[\s\S]{1,350}?data-col="info\.last_trade\.PDrCotVal"[^>]*>([\d,]+)</i) || normHtml.match(/دلار[\s\S]{1,250}?([\d,]{6,10})/i);

    let gold18kToman = fallback.gold18kToman;
    let usdToman = fallback.usdToman;
    let updatedAny = false;

    if (goldMatch?.[1]) {
      const rawGold = Number(goldMatch[1].replace(/,/g, ''));
      if (Number.isFinite(rawGold) && rawGold > 0) {
        const candidateGold = rawGold > 25_000_000 ? Math.round(rawGold / 10) : rawGold;
        gold18kToman = clampNumber(candidateGold, 2_500_000, 35_000_000, fallback.gold18kToman);
        updatedAny = true;
      }
    }
    if (usdMatch?.[1]) {
      const rawUsd = Number(usdMatch[1].replace(/,/g, ''));
      if (Number.isFinite(rawUsd) && rawUsd > 0) {
        const candidateUsd = rawUsd > 400_000 ? Math.round(rawUsd / 10) : rawUsd;
        usdToman = clampNumber(candidateUsd, 45_000, 300_000, fallback.usdToman);
        updatedAny = true;
      }
    }

    const nowIso = new Date().toISOString();
    return {
      gold18kToman,
      usdToman,
      updatedAtIso: updatedAny ? nowIso : fallback.updatedAtIso,
      provenance: {
        sourceId: updatedAny ? 'tgju_public_html' : 'seed_fallback',
        fetchedAtIso: nowIso,
        normalizationVersion: '2026.2',
        qualityStatus: updatedAny ? 'verified_live' : 'cached_or_fallback',
      },
    };
  } catch {
    return fallbackWithProvenance;
  }
}

export async function fetchFreeDivarNeighborhoodStats(
  city: CityId,
  hoodName: string,
  seedBuyPerSqm: number,
): Promise<FreeScrapedHoodData> {
  const emptyFallback = (): FreeScrapedHoodData => ({
    medianBuyPerSqm: null,
    bargains: [],
    provenance: {
      sourceId: 'seed_fallback',
      fetchedAtIso: new Date().toISOString(),
      normalizationVersion: '2026.2',
      qualityStatus: 'cached_or_fallback',
    },
  });

  const safeHoodName = sanitizeInput(hoodName, 60).replace(/[<>]/g, '');
  if (!safeHoodName || !Number.isFinite(seedBuyPerSqm) || seedBuyPerSqm < 10) return emptyFallback();

  try {
    const res = await fetch('https://api.divar.ir/v8/postlist/w/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({
        city_ids: [city === 'tehran' ? '1' : city === 'karaj' ? '2' : city === 'mashhad' ? '3' : city === 'isfahan' ? '4' : '6'],
        search_data: {
          form_data: { data: { category: { str: { value: 'apartment-sell' } } } },
          server_payload: {
            '@type': 'type.googleapis.com/widgets.SearchData.ServerPayload',
            additional_form_data: { data: { sort: { str: { value: 'sort_date' } } } },
          },
          query: `آپارتمان ${safeHoodName}`,
        },
      }),
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) return emptyFallback();
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return emptyFallback();

    const rawText = await readBoundedResponseText(res, MAX_UPSTREAM_JSON_BYTES);
    if (!rawText) return emptyFallback();

    const data = JSON.parse(rawText) as Record<string, unknown>;
    const widgets = Array.isArray(data?.list_widgets) ? data.list_widgets.slice(0, 60) : [];

    const validSamples: { title: string; sqm: number; perSqmMillion: number; token: string }[] = [];
    for (const w of widgets) {
      const normalized = validateUpstreamDivarWidgetItem(w, seedBuyPerSqm);
      if (normalized) validSamples.push(normalized);
    }

    if (validSamples.length < 3) return emptyFallback();

    const sortedPrices = validSamples.map((s) => s.perSqmMillion).sort((a, b) => a - b);
    const mid = Math.floor(sortedPrices.length / 2);
    const medianBuyPerSqm = Math.round(sortedPrices.length % 2 === 1 ? sortedPrices[mid] : (sortedPrices[mid - 1] + sortedPrices[mid]) / 2);

    const bargains: BargainListing[] = validSamples
      .filter((s) => s.perSqmMillion <= medianBuyPerSqm * 0.89 && s.perSqmMillion >= medianBuyPerSqm * 0.68)
      .slice(0, 2)
      .map((s, idx) => {
        const discountPercent = Math.round(((medianBuyPerSqm - s.perSqmMillion) / medianBuyPerSqm) * 100);
        const profitMillion = Math.round((medianBuyPerSqm - s.perSqmMillion) * s.sqm);
        return {
          id: `live-divar-${s.token || idx}`,
          title: s.title,
          type: 'خرید',
          sqm: s.sqm,
          priceText: `متری ${Math.round(s.perSqmMillion)} میلیون تومان`,
          discountPercent: clampNumber(discountPercent, 10, 35, 12),
          buyerProfitText: `${profitMillion.toLocaleString('fa-IR')} میلیون تومان زیر میانه روز ${safeHoodName}`,
          street: safeHoodName,
          status: 'approved',
        };
      });

    return {
      medianBuyPerSqm,
      bargains,
      displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
      medianBuyPerSqmIntlText: formatMillionTomanAsIntlCurrency(medianBuyPerSqm, getStoredIntlCurrency()),
      provenance: { sourceId: 'divar_public_search', fetchedAtIso: new Date().toISOString(), normalizationVersion: '2026.2', qualityStatus: 'verified_live' },
    };
  } catch { return emptyFallback(); }
}
export interface LiveCityWeather {
  precipitationMm: number;
  snowfallCm: number;
  isRainingOrSnowing: boolean;
  provenance?: MarketDataProvenance;
}
const weatherCache = new Map<string, { data: LiveCityWeather; fetchedAt: number }>();
const MAX_WEATHER_CACHE_KEYS = 128;
export async function fetchFreeCityWeather(lat: number, lng: number): Promise<LiveCityWeather> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 24 || lat > 41 || lng < 43 || lng > 64) {
    return { precipitationMm: 0, snowfallCm: 0, isRainingOrSnowing: false };
  }
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const now = Date.now();
  const cached = weatherCache.get(key);
  if (cached && now - cached.fetchedAt < 15 * 60_000) return cached.data;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain,snowfall`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) throw new Error('weather fetch failed');
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) throw new Error('invalid content-type');
    const rawText = await readBoundedResponseText(res, 32 * 1024);
    if (!rawText) throw new Error('response too large');
    const json = JSON.parse(rawText) as Record<string, unknown>;
    const current = json?.current && typeof json.current === 'object' ? (json.current as Record<string, unknown>) : {};
    const precip = clampNumber(Number(current.precipitation || 0), 0, 500, 0);
    const snow = clampNumber(Number(current.snowfall || 0), 0, 500, 0);
    const data: LiveCityWeather = {
      precipitationMm: precip, snowfallCm: snow, isRainingOrSnowing: precip > 0.2 || snow > 0,
      provenance: { sourceId: 'open_meteo_current', fetchedAtIso: new Date().toISOString(), normalizationVersion: '2026.2', qualityStatus: 'verified_live' },
    };
    if (weatherCache.size >= MAX_WEATHER_CACHE_KEYS) {
      for (const [k, v] of weatherCache) { if (now - v.fetchedAt >= 15 * 60_000) weatherCache.delete(k); }
      if (weatherCache.size >= MAX_WEATHER_CACHE_KEYS) { const oldest = weatherCache.keys().next().value; if (oldest !== undefined) weatherCache.delete(oldest); }
    }
    weatherCache.set(key, { data, fetchedAt: now });
    return data;
  } catch {
    return {
      precipitationMm: 0,
      snowfallCm: 0,
      isRainingOrSnowing: false,
      provenance: {
        sourceId: 'seed_fallback',
        fetchedAtIso: new Date().toISOString(),
        normalizationVersion: '2026.2',
        qualityStatus: 'cached_or_fallback',
      },
    };
  }
}