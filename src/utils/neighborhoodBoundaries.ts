/**
 * @file src/utils/neighborhoodBoundaries.ts
 * @description Dynamic OpenStreetMap (Overpass API & Nominatim) GeoJSON Boundary Engine for Leaflet.
 */
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
import { BoundedGeoJsonLruCache, simplifyPolygonRingForZoomLod } from './geojsonViewportLazyEngine';

export interface BoundaryNeighborhoodInput { id: number; lat: number; lng: number; radius: number; name?: string; }
export interface NeighborhoodGeoJSONFeature {
  type: 'Feature';
  properties: { hoodId: number; name: string; source: 'osm_overpass_geojson' | 'osm_nominatim_geojson' | 'dynamic_voronoi_geojson'; displayAreaUnitLabel?: string; avgPriceIntlText?: string };
  geometry: { type: 'Polygon'; coordinates: [number, number][][]; };
}
export interface AuthoritativeBoundaryRecord {
  hoodId: number; name: string; source: 'osm_nominatim_geojson' | 'osm_overpass_relation' | 'voronoi_urban_tessellation';
  sourceLabelFa: string; coordinates: [number, number][]; geojson?: NeighborhoodGeoJSONFeature; updatedAtIso: string;
}
export interface ZoomAdaptivePolygonStyle {
  color: string; weight: number; opacity: number; dashArray?: string; fillColor: string; fillOpacity: number;
  lineJoin: 'round'; lineCap: 'round'; smoothFactor: number;
}

const DEG_LAT_PER_METER = 1 / 111132;
export const clientGeoJsonLruCache = new BoundedGeoJsonLruCache<string | number, NeighborhoodGeoJSONFeature>(140);

function getDegLngPerMeter(lat: number): number {
  return 1 / (111320 * Math.max(0.45, Math.cos((lat * Math.PI) / 180)));
}

function generateAlgorithmicUrbanBlock(hood: BoundaryNeighborhoodInput): [number, number][] {
  const seed = Math.abs(Math.round(hood.lat * 10000) * 31 + Math.round(hood.lng * 10000) * 17 + (hood.id || 1) * 13);
  const r = Math.max(600, Math.min(1850, Number(hood.radius) || 1150)) * 0.92;
  const aspectX = 0.88 + ((seed % 7) * 0.045);
  const aspectY = 1.14 - ((seed % 7) * 0.04);
  const rotRad = ((((seed % 29) - 14) * Math.PI) / 180);
  const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);
  const verticesCount = 16;
  const pts: [number, number][] = [];
  for (let i = 0; i < verticesCount; i++) {
    const angle = (i * 2 * Math.PI) / verticesCount;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const sqFactor = 1 / Math.pow(Math.pow(Math.abs(cosA), 2.5) + Math.pow(Math.abs(sinA), 2.5), 1 / 2.5);
    const harmonic = 0.94 + (((seed + i * 11) % 9) * 0.013);
    const rawX = cosA * r * aspectX * sqFactor * harmonic * 0.84;
    const rawY = sinA * r * aspectY * sqFactor * harmonic * 0.84;
    pts.push([rawX * cosR - rawY * sinR, rawX * sinR + rawY * cosR]);
  }
  return pts;
}

function clipMetricPolygonAgainstNeighbors(
  hood: BoundaryNeighborhoodInput,
  initialMetricPts: [number, number][],
  allCityHoods: readonly BoundaryNeighborhoodInput[]
): [number, number][] {
  const degLngPerM = getDegLngPerMeter(hood.lat);
  let poly = initialMetricPts;

  for (const other of allCityHoods) {
    if (!other || other.id === hood.id) continue;
    const dx = (other.lng - hood.lng) / degLngPerM;
    const dy = (other.lat - hood.lat) / DEG_LAT_PER_METER;
    const dist = Math.hypot(dx, dy);
    if (dist < 180 || dist > 4200) continue;

    const ux = dx / dist, uy = dy / dist;
    const rSelf = Math.max(550, Number(hood.radius) || 1100);
    const rOther = Math.max(550, Number(other.radius) || 1100);
    const weightRatio = Math.max(0.38, Math.min(0.62, rSelf / (rSelf + rOther)));
    const maxPlaneDist = dist * weightRatio - 24;

    const clipped: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const curr = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      const currDot = curr[0] * ux + curr[1] * uy;
      const prevDot = prev[0] * ux + prev[1] * uy;
      const currInside = currDot <= maxPlaneDist;
      const prevInside = prevDot <= maxPlaneDist;

      if (currInside !== prevInside) {
        const denom = currDot - prevDot;
        const t = Math.abs(denom) > 1e-6 ? (maxPlaneDist - prevDot) / denom : 0.5;
        clipped.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1])]);
      }
      if (currInside) clipped.push(curr);
    }
    if (clipped.length >= 4) poly = clipped;
  }
  return poly;
}

export function latLngRingToGeoJSONFeature(
  hood: BoundaryNeighborhoodInput,
  latLngCoords: readonly (readonly [number, number])[],
  source: NeighborhoodGeoJSONFeature['properties']['source'] = 'dynamic_voronoi_geojson',
  options?: { areaUnit?: AreaUnit; intlCurrency?: IntlCurrencyCode; avgPriceMillionToman?: number }
): NeighborhoodGeoJSONFeature {
  const ring: [number, number][] = latLngCoords.map(([lat, lng]) => [
    Number(Number(lng).toFixed(6)),
    Number(Number(lat).toFixed(6)),
  ]);
  if (ring.length > 0) {
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  }
  return {
    type: 'Feature',
    properties: {
      hoodId: hood.id,
      name: hood.name || '',
      source,
      displayAreaUnitLabel: formatAreaUnitLabel(options?.areaUnit ?? 'sqm'),
      avgPriceIntlText: formatMillionTomanAsIntlCurrency(options?.avgPriceMillionToman ?? 0, options?.intlCurrency ?? 'IRT'),
    },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function extractLatLngRingFromOsmPayload(
  payload: unknown,
  targetLat: number,
  targetLng: number
): [number, number][] | null {
  if (!payload || typeof payload !== 'object' || !Number.isFinite(targetLat) || !Number.isFinite(targetLng) || targetLat < 24 || targetLat > 41 || targetLng < 43 || targetLng > 64) return null;
  const candidateRings: [number, number][][] = [];
  const g = payload as { type?: string; coordinates?: unknown; elements?: unknown[] };

  if (g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0])) {
    candidateRings.push((g.coordinates[0] as number[][]).map((pt) => [Number(pt[1]), Number(pt[0])]));
  } else if (
    g.type === 'MultiPolygon' &&
    Array.isArray(g.coordinates) &&
    Array.isArray(g.coordinates[0]) &&
    Array.isArray((g.coordinates[0] as unknown[])[0])
  ) {
    candidateRings.push(((g.coordinates[0] as unknown[])[0] as number[][]).map((pt) => [Number(pt[1]), Number(pt[0])]));
  }

  if (Array.isArray(g.elements)) {
    for (const el of g.elements as Array<{
      geometry?: Array<{ lat: number; lon: number }>;
      members?: Array<{ role?: string; geometry?: Array<{ lat: number; lon: number }> }>;
    }>) {
      if (Array.isArray(el?.geometry) && el.geometry.length >= 4) {
        candidateRings.push(el.geometry.map((p) => [Number(p.lat), Number(p.lon)]));
      } else if (Array.isArray(el?.members)) {
        const stitched: [number, number][] = [];
        for (const m of el.members) {
          if ((m.role === 'outer' || !m.role) && Array.isArray(m.geometry)) {
            for (const p of m.geometry) stitched.push([Number(p.lat), Number(p.lon)]);
          }
        }
        if (stitched.length >= 4) candidateRings.push(stitched);
      }
    }
  }

  for (const rawPts of candidateRings) {
    const validPts = rawPts.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (validPts.length < 4) continue;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const [lat, lng] of validPts) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    if (latSpan < 0.0015 || latSpan > 0.055 || lngSpan < 0.0015 || lngSpan > 0.065) continue;
    if (Math.abs((minLat + maxLat) / 2 - targetLat) > 0.035 || Math.abs((minLng + maxLng) / 2 - targetLng) > 0.045) continue;
    if (validPts.length > 36) {
      const step = validPts.length / 32;
      return Array.from({ length: 32 }, (_, i) => {
        const [lat, lng] = validPts[Math.floor(i * step)];
        return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
      });
    }
    return validPts.map(([lat, lng]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
  }
  return null;
}

export function getNeighborhoodBoundaryPolygon(
  hood: BoundaryNeighborhoodInput,
  allCityHoods: readonly BoundaryNeighborhoodInput[] = [],
  osmOverrideCoords?: readonly (readonly [number, number])[] | null
): [number, number][] {
  const degLngPerM = getDegLngPerMeter(hood.lat);
  const metricPts: [number, number][] =
    Array.isArray(osmOverrideCoords) && osmOverrideCoords.length >= 4
      ? osmOverrideCoords.map(([lat, lng]) => [
          (Number(lng) - hood.lng) / degLngPerM,
          (Number(lat) - hood.lat) / DEG_LAT_PER_METER,
        ])
      : generateAlgorithmicUrbanBlock(hood);

  const clippedMetric =
    allCityHoods.length > 1 ? clipMetricPolygonAgainstNeighbors(hood, metricPts, allCityHoods) : metricPts;

  return clippedMetric.map(([mx, my]) => [
    Number((hood.lat + my * DEG_LAT_PER_METER).toFixed(5)),
    Number((hood.lng + mx * degLngPerM).toFixed(5)),
  ]);
}
function hashStringFnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeNeighborhoodGeometryFingerprint(
  hood: BoundaryNeighborhoodInput,
  allCityHoods: readonly BoundaryNeighborhoodInput[] = [],
  osmOverrideCoords?: readonly (readonly [number, number])[] | null,
  lodBucket = 'z12',
  cityId = 'tehran',
): string {
  const neighborSig = allCityHoods
    .filter((n) => n && n.id !== hood.id)
    .map((n) => `${n.id}:${Number(n.lat).toFixed(5)}:${Number(n.lng).toFixed(5)}:${Math.round(Number(n.radius) || 0)}`)
    .join('|');
  const osmSig =
    Array.isArray(osmOverrideCoords) && osmOverrideCoords.length > 0
      ? osmOverrideCoords
          .map(([lat, lng]) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`)
          .join(';')
      : 'none';
  const neighborHash = hashStringFnv1a(neighborSig);
  const osmHash = hashStringFnv1a(osmSig);
  return `${cityId}:${hood.id}:${Number(hood.lat).toFixed(5)}:${Number(hood.lng).toFixed(5)}:${Math.round(Number(hood.radius) || 0)}:nb(${allCityHoods.length}:${neighborHash}):osm(${osmOverrideCoords ? osmOverrideCoords.length : 0}:${osmHash}):${lodBucket}`;
}

export function resolveNeighborhoodGeoJsonForLod(
  hood: BoundaryNeighborhoodInput,
  allCityHoods: readonly BoundaryNeighborhoodInput[],
  osmOverrideCoords?: readonly (readonly [number, number])[] | null,
  lodOptions?: { zoom?: number; isSelected?: boolean; lowBandwidthMode?: boolean; cityId?: string }
): { geometryKey: string; geoJsonFeature: NeighborhoodGeoJSONFeature; coords: [number, number][] } {
  const zoom = lodOptions?.zoom ?? 12;
  const isSelected = Boolean(lodOptions?.isSelected);
  const lowBw = Boolean(lodOptions?.lowBandwidthMode);
  const cityId = lodOptions?.cityId || 'tehran';
  const lodBucket = isSelected ? 'sel' : lowBw ? `bw:${zoom <= 11 ? 'lo' : 'md'}` : zoom <= 10 ? 'z10' : zoom <= 12 ? 'z12' : 'zFull';
  const cacheKey = computeNeighborhoodGeometryFingerprint(hood, allCityHoods, osmOverrideCoords, lodBucket, cityId);
  let geoJsonFeature = clientGeoJsonLruCache.get(cacheKey);
  if (!geoJsonFeature) {
    const rawCoords = getNeighborhoodBoundaryPolygon(hood, allCityHoods, osmOverrideCoords);
    const coords = simplifyPolygonRingForZoomLod(rawCoords, zoom, isSelected, lowBw);
    const source = Array.isArray(osmOverrideCoords) && osmOverrideCoords.length >= 4 ? 'osm_overpass_geojson' : 'dynamic_voronoi_geojson';
    geoJsonFeature = latLngRingToGeoJSONFeature(hood, coords, source);
    clientGeoJsonLruCache.set(cacheKey, geoJsonFeature);
    return { geometryKey: cacheKey, geoJsonFeature, coords };
  }
  const ring = geoJsonFeature.geometry.coordinates[0] || [];
  return { geometryKey: cacheKey, geoJsonFeature, coords: ring.map(([lng, lat]) => [lat, lng]) };
}
export function renderNeighborhoodGeoJSONOnLeaflet(
  L: any, map: any, hood: BoundaryNeighborhoodInput, allCityHoods: readonly BoundaryNeighborhoodInput[], style: ZoomAdaptivePolygonStyle,
  osmOverrideCoords?: readonly (readonly [number, number])[] | null, onClick?: () => void,
  lodOptions?: { zoom?: number; isSelected?: boolean; lowBandwidthMode?: boolean; cityId?: string }
): any {
  const zoom = lodOptions?.zoom ?? (typeof map?.getZoom === 'function' ? map.getZoom() : 12);
  const { geoJsonFeature, coords } = resolveNeighborhoodGeoJsonForLod(hood, allCityHoods, osmOverrideCoords, { ...lodOptions, zoom });
  const layer = typeof L.geoJSON === 'function' ? L.geoJSON(geoJsonFeature, { style: () => style }).addTo(map) : L.polygon(coords, style).addTo(map);
  if (onClick && typeof layer.on === 'function') layer.on('click', onClick);
  return layer;
}
export async function fetchAuthoritativeCityBoundaries(
  city: string, cityNameFa: string, neighborhoods: readonly BoundaryNeighborhoodInput[],
): Promise<Record<number, AuthoritativeBoundaryRecord>> {
  try {
    const resp = await fetch('/api/neighborhood-boundaries/resolve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        city, cityNameFa,
        neighborhoods: neighborhoods.slice(0, 120).map((n) => ({ id: n.id, name: (n.name || '').slice(0, 80), lat: n.lat, lng: n.lng, radius: n.radius })),
      }),
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const rawMap = data?.boundaries && typeof data.boundaries === 'object' && !Array.isArray(data.boundaries) ? (data.boundaries as Record<string, unknown>) : {};
    const safeBoundaries: Record<number, AuthoritativeBoundaryRecord> = {};
    for (const [k, v] of Object.entries(rawMap)) {
      const id = Number(k);
      if (Number.isSafeInteger(id) && id >= 1 && id <= 9999 && v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as AuthoritativeBoundaryRecord).coordinates)) {
        safeBoundaries[id] = v as AuthoritativeBoundaryRecord;
      }
    }
    return safeBoundaries;
  } catch { return {}; }
}
export function getZoomAdaptivePolygonStyle(zoom: number, isSelected: boolean, strokeColor: string, fillColor: string): ZoomAdaptivePolygonStyle {
  const z = Number.isFinite(zoom) ? zoom : 12;
  const weight = z <= 11 ? (isSelected ? 2.4 : 0.8) : z === 12 ? (isSelected ? 3.0 : 1.1) : z === 13 ? (isSelected ? 3.6 : 1.5) : z === 14 ? (isSelected ? 4.2 : 2.1) : (isSelected ? 4.8 : 2.6);
  const opacity = z <= 11 ? (isSelected ? 0.92 : 0.28) : z === 12 ? (isSelected ? 0.95 : 0.42) : z === 13 ? (isSelected ? 0.97 : 0.58) : 0.85;
  const fillOpacity = z <= 11 ? (isSelected ? 0.16 : 0.02) : z === 12 ? (isSelected ? 0.18 : 0.04) : z <= 14 ? (isSelected ? 0.16 : 0.06) : (isSelected ? 0.12 : 0.05);
  const dashArray = isSelected ? undefined : z <= 11 ? '2, 4' : z <= 13 ? '4, 4' : '6, 5';
  return {
    color: strokeColor, weight, opacity: isSelected ? 0.98 : opacity, dashArray,
    fillColor, fillOpacity, lineJoin: 'round', lineCap: 'round', smoothFactor: z <= 12 ? 1.0 : 0.75,
  };
}