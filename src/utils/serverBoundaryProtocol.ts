import type { Express } from 'express'; import { sanitizeInput, validateGeoJsonPolygonRing } from './security'; import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';

export type BoundarySourceId = 'osm_nominatim_polygon' | 'osm_overpass_polygon' | 'computed_hex_fallback';
export interface BoundaryResolveItem { id: number; ring: [number, number][]; source: BoundarySourceId; displayAreaUnitLabel?: string; referenceValuationIntlText?: string; }

export function clampLatLngRing( rawRing: [number, number][], maxPoints = 120, ): [number, number][] | null { if (!Array.isArray(rawRing) || rawRing.length < 4) return null; const safeMax = Number.isFinite(maxPoints) && maxPoints >= 4 ? Math.min(500, Math.floor(maxPoints)) : 120; const step = rawRing.length > safeMax ? Math.ceil(rawRing.length / safeMax) : 1;
  const out: [number, number][] = []; for (let i = 0; i < rawRing.length; i += step) { const pt = rawRing[i];
    if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) { out.push([Number(pt[0].toFixed(5)), Number(pt[1].toFixed(5))]); } }
  if (out.length < 3) return null;
  const first = out[0]; const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out;
}

export { computeApproxHexRing } from './geo/approximateBoundaryGeometry';
import { computeApproxHexRing } from './geo/approximateBoundaryGeometry';

interface ResolveQueryInput { id: number; name: string; cityNameFa: string; lat: number; lng: number; areaSqKm?: number; }
const serverBoundaryMemoryCache = new Map<string, { ring: [number, number][]; source: BoundarySourceId; updatedAtMs: number }>();
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_OSM_RESPONSE_BYTES = 512 * 1024;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractOuterRingFromGeoJson(geojson: any): [number, number][] | null {
  if (!geojson || typeof geojson !== 'object') return null;

  let rawCoords: any[] | null = null;
  if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates?.[0])) {
    rawCoords = geojson.coordinates[0];
  } else if (geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates)) {
    let bestRing: any[] = [];
    for (const poly of geojson.coordinates) {
      if (Array.isArray(poly?.[0]) && poly[0].length > bestRing.length) {
        bestRing = poly[0];
      }
    }
    if (bestRing.length >= 4) rawCoords = bestRing;
  }

  if (!rawCoords || rawCoords.length < 4) return null;

  const latLngPairs: [number, number][] = [];
  for (const pt of rawCoords.slice(0, 4000)) {
    if (Array.isArray(pt) && pt.length >= 2) {
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        latLngPairs.push([lat, lng]);
      }
    }
  }
  const clamped = clampLatLngRing(latLngPairs, 120);
  if (!clamped) return null;
  const check = validateGeoJsonPolygonRing(clamped, 150);
  return check.valid ? clamped : null;
}

async function fetchNominatimPolygon(q: ResolveQueryInput): Promise<[number, number][] | null> {
  const safeName = sanitizeInput(q.name, 60).replace(/[<>]/g, '');
  const safeCity = sanitizeInput(q.cityNameFa, 40).replace(/[<>]/g, '');
  const queryText = encodeURIComponent(`محله ${safeName} ${safeCity}`);
  const delta = 0.08;
  const viewbox = `${(q.lng - delta).toFixed(4)},${(q.lat + delta).toFixed(4)},${(q.lng + delta).toFixed(4)},${(q.lat - delta).toFixed(4)}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${queryText}&format=jsonv2&polygon_geojson=1&countrycodes=ir&viewbox=${viewbox}&bounded=0&limit=5`;

  const res = await fetch(url, {
    redirect: 'error',
    headers: {
      'User-Agent': 'TehranHousingRadar/3.2 (https://radartehran.ir)',
      'Accept-Language': 'fa,en',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok || Number(res.headers.get('content-length') || '0') > MAX_OSM_RESPONSE_BYTES) return null;
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf-8') > MAX_OSM_RESPONSE_BYTES) return null;
  const items = JSON.parse(text);
  if (!Array.isArray(items)) return null;

  for (const item of items.slice(0, 5)) {
    const itemLat = Number(item?.lat);
    const itemLng = Number(item?.lon);
    if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) continue;
    if (haversineKm(q.lat, q.lng, itemLat, itemLng) > 7.5) continue;

    const ring = extractOuterRingFromGeoJson(item?.geojson);
    if (ring && ring.length >= 4 && haversineKm(q.lat, q.lng, ring[0][0], ring[0][1]) <= 15) return ring;
  }
  return null;
}

export function sanitizeOverpassNeighborhoodName(rawName: unknown): string {
  return sanitizeInput(rawName, 50).replace(/[^a-zA-Z0-9\u0600-\u06FF\s-]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchOverpassWayPolygon(q: ResolveQueryInput): Promise<[number, number][] | null> {
  const cleanName = sanitizeOverpassNeighborhoodName(q.name);
  if (!cleanName) return null;
  const overpassQuery = `[out:json][timeout:4];(way["place"~"suburb|neighbourhood|quarter"]["name"~"${cleanName}"](around:3800,${q.lat.toFixed(4)},${q.lng.toFixed(4)}););out geom 1;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: `data=${encodeURIComponent(overpassQuery)}`,
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok || Number(res.headers.get('content-length') || '0') > MAX_OSM_RESPONSE_BYTES) return null;
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf-8') > MAX_OSM_RESPONSE_BYTES) return null;
  const data = JSON.parse(text);
  const el = data?.elements?.[0];
  if (!el || !Array.isArray(el.geometry) || el.geometry.length < 4) return null;

  const rawRing: [number, number][] = el.geometry.slice(0, 4000).map((pt: any) => [
    Number(pt.lat),
    Number(pt.lon),
  ]);
  const clamped = clampLatLngRing(rawRing, 120);
  if (!clamped || haversineKm(q.lat, q.lng, clamped[0][0], clamped[0][1]) > 15) return null;
  const check = validateGeoJsonPolygonRing(clamped, 150);
  return check.valid ? clamped : null;
}

export async function resolveNeighborhoodBoundariesBatch(
  queries: ResolveQueryInput[],
  areaUnit: AreaUnit = 'sqm',
  intlCurrency: IntlCurrencyCode = 'USD',
): Promise<BoundaryResolveItem[]> {
  const results: BoundaryResolveItem[] = [];
  const boundedQueries = queries.slice(0, 12);
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const referenceValuationIntlText = formatMillionTomanAsIntlCurrency(120, intlCurrency, 'en');

  for (const q of boundedQueries) {
    if (!Number.isInteger(q.id) || q.id < 1 || q.id > 999 || !Number.isFinite(q.lat) || !Number.isFinite(q.lng) || q.lat < 24 || q.lat > 41 || q.lng < 43 || q.lng > 64) continue;
    const cacheKey = `${q.cityNameFa}:${q.id}:${q.name}`;
    const cached = serverBoundaryMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.updatedAtMs < CACHE_TTL_MS) {
      results.push({ id: q.id, ring: cached.ring, source: cached.source, displayAreaUnitLabel, referenceValuationIntlText });
      continue;
    }
    let resolvedRing: [number, number][] | null = null;
    let resolvedSource: BoundarySourceId = 'computed_hex_fallback';
    try {
      resolvedRing = await fetchNominatimPolygon(q);
      if (resolvedRing) resolvedSource = 'osm_nominatim_polygon';
    } catch { resolvedRing = null; }
    if (!resolvedRing) {
      try {
        resolvedRing = await fetchOverpassWayPolygon(q);
        if (resolvedRing) resolvedSource = 'osm_overpass_polygon';
      } catch { resolvedRing = null; }
    }
    const finalRing: [number, number][] = resolvedRing ?? computeApproxHexRing(q.lat, q.lng, q.areaSqKm || 2.5, q.id);
    if (serverBoundaryMemoryCache.size >= 600) {
      const nowMs = Date.now();
      for (const [k, v] of serverBoundaryMemoryCache) { if (nowMs - v.updatedAtMs >= CACHE_TTL_MS) serverBoundaryMemoryCache.delete(k); }
      if (serverBoundaryMemoryCache.size >= 600) {
        const firstKey = serverBoundaryMemoryCache.keys().next().value;
        if (firstKey) serverBoundaryMemoryCache.delete(firstKey);
      }
    }
    serverBoundaryMemoryCache.set(cacheKey, { ring: finalRing, source: resolvedSource, updatedAtMs: Date.now() });
    results.push({ id: q.id, ring: finalRing, source: resolvedSource, displayAreaUnitLabel, referenceValuationIntlText });
  }
  return results;
}

const registeredBoundaryApps = new WeakSet<Express>();
export function registerBoundaryProtocolRoutes(app: Express): void {
  if (registeredBoundaryApps.has(app)) return;
  registeredBoundaryApps.add(app);
  app.post('/api/neighborhood-boundaries/resolve', (req, res, next) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=300');
      const rawCityNameFa = sanitizeInput(req.body?.cityNameFa || 'تهران', 40);
      const rawHoods = Array.isArray(req.body?.neighborhoods) ? req.body.neighborhoods.slice(0, 24) : [];
      const boundaries: Record<
        number,
        {
          hoodId: number;
          name: string;
          source: 'osm_nominatim_geojson' | 'osm_overpass_relation' | 'computed_hex_fallback';
          sourceLabelFa: string;
          coordinates: [number, number][];
          updatedAtIso: string;
        }
      > = {};

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      for (const item of rawHoods) {
        const id = Number(item?.id);
        const lat = Number(item?.lat);
        const lng = Number(item?.lng);
        if (!Number.isInteger(id) || id < 1 || id > 999 || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 24 || lat > 41 || lng < 43 || lng > 64) {
          continue;
        }
        const name = sanitizeInput(item?.name || `محله ${id}`, 60);
        const cacheKey = `${rawCityNameFa}:${id}:${name}`;
        const rawCached = serverBoundaryMemoryCache.get(cacheKey);
        const cached = rawCached && nowMs - rawCached.updatedAtMs < CACHE_TTL_MS ? rawCached : undefined;
        const radiusMeters = Math.max(500, Math.min(2500, Number(item?.radius) || 1150));
        const areaSqKm = (Math.PI * (radiusMeters / 1000) ** 2);
        const coordinates = cached ? cached.ring : computeApproxHexRing(lat, lng, areaSqKm, id);

        boundaries[id] = {
          hoodId: id,
          name,
          source:
            cached?.source === 'osm_nominatim_polygon'
              ? 'osm_nominatim_geojson'
              : cached?.source === 'osm_overpass_polygon'
                ? 'osm_overpass_relation'
                : 'computed_hex_fallback',
          sourceLabelFa:
            cached?.source === 'osm_nominatim_polygon'
              ? 'مرز ثبت‌شده OpenStreetMap (Nominatim)'
              : cached?.source === 'osm_overpass_polygon'
                ? 'مرز ثبت‌شده OpenStreetMap (Overpass)'
                : 'هندسهٔ تقریبی شش‌ضلعی (نه مرز رسمی)',
          coordinates,
          updatedAtIso: nowIso,
        };
      }

      res.status(200).json({ status: 'ok', cityNameFa: rawCityNameFa, boundaries });
    } catch (e) { next(e); }
  });
}
