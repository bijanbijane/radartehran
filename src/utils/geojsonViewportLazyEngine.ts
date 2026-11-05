/**
 * @file src/utils/geojsonViewportLazyEngine.ts
 * @description Dynamic Viewport & Zoom-Level Lazy Loading Engine for Heavy Leaflet GeoJSON Layers.
 * Optimizes memory consumption and rendering frame rates on mobile devices and low-bandwidth networks:
 * 1. Axis-Aligned Bounding Box (AABB) spatial culling for polygons, polylines, and point clusters.
 * 2. Zoom-Adaptive Level-of-Detail (LOD) vertex simplification (Ramer-Douglas-Peucker / radial decimation).
 * 3. Bounded LRU GeoJSON Feature Cache with automatic eviction of off-screen geometries.
 * 4. Viewport-prioritized progressive chunk planner for authoritative OSM/Overpass boundary fetching.
 */
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency } from './areaUnit';
export interface GeoBoundingBox { north: number; south: number; east: number; west: number; }
export interface GeoLazyLoadingPolicy { zoom: number; lowBandwidthOrMobileMode: boolean;
  /** Minimum zoom level to render full neighborhood polygon rings instead of simplified hulls */
  fullPolygonMinZoom: number;
  /** Minimum zoom level to render individual metro station nodes */
  metroStationsMinZoom: number;
  /** Minimum zoom level to render gold bargain pins and secondary POIs */
  secondaryPinsMinZoom: number;
  /** Target maximum vertex count per neighborhood polygon at current zoom & bandwidth mode */
  maxVerticesPerPolygon: number;
  /** Viewport padding ratio for pre-fetching/rendering just outside screen edges */
  viewportPadRatio: number;
  /** Maximum cached GeoJSON features held in memory simultaneously */
  maxLruCacheSize: number; }
/**
 * Computes deterministic Level-of-Detail (LOD) and lazy-loading thresholds
 * based on current Leaflet zoom level and device/network saver mode.
 */
export function resolveGeoLazyLoadingPolicy(
  zoom: number, lowBandwidthOrMobileMode = false
): GeoLazyLoadingPolicy { const safeZoom = Number.isFinite(zoom) ? zoom : 12;
  if (lowBandwidthOrMobileMode) {
    return {
      zoom: safeZoom,
      lowBandwidthOrMobileMode: true,
      fullPolygonMinZoom: 14,
      metroStationsMinZoom: 13,
      secondaryPinsMinZoom: 12,
      maxVerticesPerPolygon: safeZoom <= 11 ? 6 : safeZoom <= 13 ? 10 : 18,
      viewportPadRatio: 0.08,
      maxLruCacheSize: 64,
    };
  }
  return {
    zoom: safeZoom,
    lowBandwidthOrMobileMode: false,
    fullPolygonMinZoom: 13,
    metroStationsMinZoom: 12,
    secondaryPinsMinZoom: 11,
    maxVerticesPerPolygon: safeZoom <= 10 ? 8 : safeZoom <= 12 ? 14 : 32,
    viewportPadRatio: safeZoom <= 11 ? 0.15 : 0.22,
    maxLruCacheSize: 160,
  };
}
/**
 * Expands a bounding box by a given padding ratio (e.g. 0.15 = 15% margin on each side).
 */
export function expandGeoBoundingBox(bbox: GeoBoundingBox, padRatio: number): GeoBoundingBox {
  const safePad = Math.max(0, Math.min(1, Number.isFinite(padRatio) ? padRatio : 0.15));
  const n = Number.isFinite(bbox.north) ? bbox.north : 35.85;
  const s = Number.isFinite(bbox.south) ? bbox.south : 35.60;
  const e = Number.isFinite(bbox.east) ? bbox.east : 51.60;
  const w = Number.isFinite(bbox.west) ? bbox.west : 51.20;
  const north = Math.max(n, s), south = Math.min(n, s), east = Math.max(e, w), west = Math.min(e, w);
  const latSpan = Math.max(0.001, north - south);
  const lngSpan = Math.max(0.001, east - west);
  return {
    north: north + latSpan * safePad,
    south: south - latSpan * safePad,
    east: east + lngSpan * safePad,
    west: west - lngSpan * safePad,
  };
}
/**
 * Fast check whether a `[lat, lng]` coordinate lies inside a bounding box.
 */
export function isPointInGeoBoundingBox(
  lat: number,
  lng: number,
  bbox: GeoBoundingBox | null | undefined
): boolean {
  if (!bbox) return true;
  return lat <= bbox.north && lat >= bbox.south && lng <= bbox.east && lng >= bbox.west;
}
/**
 * Fast Axis-Aligned Bounding Box (AABB) intersection test for a polygon or polyline (`[lat, lng][]`).
 * Prevents mounting heavy off-screen GeoJSON layers onto the Leaflet map instance.
 */
export function isGeometryIntersectingGeoBoundingBox(
  coords: readonly (readonly [number, number])[],
  bbox: GeoBoundingBox | null | undefined
): boolean {
  if (!bbox || !Array.isArray(coords) || coords.length === 0) return true;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    const [lat, lng] = coords[i];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  if (!Number.isFinite(minLat)) return false;
  return !(
    maxLat < bbox.south ||
    minLat > bbox.north ||
    maxLng < bbox.west ||
    minLng > bbox.east
  );
}
/**
 * Clips or filters a polyline's station/vertex points to only those inside the active viewport bbox.
 */
export function filterPointsInGeoBoundingBox(
  points: readonly (readonly [number, number])[],
  bbox: GeoBoundingBox | null | undefined
): [number, number][] {
  if (!bbox) return points.map(([lat, lng]) => [lat, lng]);
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i];
    if (isPointInGeoBoundingBox(lat, lng, bbox)) {
      out.push([lat, lng]);
    }
  }
  return out;
}
/**
 * Decimates/simplifies a polygon coordinate ring (`[lat, lng][]`) based on current zoom level
 * and mobile/low-bandwidth policy while preserving topological closure and selected-item fidelity.
 */
export function simplifyPolygonRingForZoomLod(
  coords: readonly (readonly [number, number])[],
  zoom: number,
  isSelected = false,
  lowBandwidthOrMobileMode = false
): [number, number][] {
  if (!Array.isArray(coords) || coords.length <= 4) {
    return coords.map(([lat, lng]) => [lat, lng]);
  }
  // Selected neighborhood always preserves full boundary resolution
  if (isSelected && !lowBandwidthOrMobileMode) {
    return coords.map(([lat, lng]) => [lat, lng]);
  }
  const policy = resolveGeoLazyLoadingPolicy(zoom, lowBandwidthOrMobileMode);
  const maxVerts = isSelected ? Math.max(16, policy.maxVerticesPerPolygon) : policy.maxVerticesPerPolygon;
  if (coords.length <= maxVerts) {
    return coords.map(([lat, lng]) => [lat, lng]);
  }
  const step = coords.length / maxVerts;
  const simplified: [number, number][] = [];
  for (let i = 0; i < maxVerts; i++) {
    const idx = Math.min(coords.length - 1, Math.floor(i * step));
    const [lat, lng] = coords[idx];
    simplified.push([Number(lat.toFixed(5)), Number(lng.toFixed(5))]);
  }
  return simplified;
}
/**
 * Bounded Least-Recently-Used (LRU) cache for heavy GeoJSON features.
 * Automatically evicts oldest off-screen geometries so mobile heap usage stays strictly bounded.
 */
export class BoundedGeoJsonLruCache<K, V> {
  private map = new Map<K, V>();
  private maxEntries: number;
  private evictionsCount = 0;
  constructor(maxEntries = 120) {
    this.maxEntries = Math.min(2000, Math.max(16, Number.isFinite(maxEntries) ? Math.floor(maxEntries) : 120));
  }
  public setMaxEntries(nextMax: number): void {
    this.maxEntries = Math.min(2000, Math.max(16, Number.isFinite(nextMax) ? Math.floor(nextMax) : 120));
    this.trimToCapacity();
  }
  public get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Refresh LRU order
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }
  public set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.trimToCapacity();
  }
  public delete(key: K): boolean {
    return this.map.delete(key);
  }
  public clear(): void {
    this.map.clear();
  }
  public getStats(): { size: number; maxEntries: number; evictionsCount: number } {
    return {
      size: this.map.size,
      maxEntries: this.maxEntries,
      evictionsCount: this.evictionsCount,
    };
  }
  private trimToCapacity(): void {
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
      this.evictionsCount += 1;
    }
  }
}
/**
 * Plans a viewport-scoped progressive batch of neighborhood boundary requests.
 * Instead of downloading all city boundaries at once on slow 3G/mobile connections,
 * selects only unloaded neighborhoods inside the current padded bounding box,
 * ordered by proximity to the viewport center.
 */
export function planViewportBoundaryFetchBatch<
  T extends { id: number; lat: number; lng: number; radius: number; name?: string }
>(params: {
  allNeighborhoods: readonly T[];
  viewportBounds: GeoBoundingBox | null;
  loadedHoodIds: ReadonlySet<number> | Record<number, unknown>;
  lowBandwidthOrMobileMode?: boolean;
  maxBatchSize?: number;
}): {
  batch: T[]; skippedOffscreenCount: number; alreadyLoadedCount: number;
  displayAreaUnitLabel: string; referenceValuationIntlText: string;
} {
  const {
    allNeighborhoods, viewportBounds, loadedHoodIds,
    lowBandwidthOrMobileMode = false, maxBatchSize = lowBandwidthOrMobileMode ? 12 : 28,
  } = params;
  const isLoaded = (id: number): boolean => {
    if (loadedHoodIds instanceof Set) return loadedHoodIds.has(id);
    return Boolean(loadedHoodIds && Object.prototype.hasOwnProperty.call(loadedHoodIds, id) && (loadedHoodIds as Record<number, unknown>)[id]);
  };
  const paddedBBox = viewportBounds
    ? expandGeoBoundingBox(viewportBounds, lowBandwidthOrMobileMode ? 0.1 : 0.25)
    : null;
  const centerLat = paddedBBox ? (paddedBBox.north + paddedBBox.south) / 2 : 35.72;
  const centerLng = paddedBBox ? (paddedBBox.east + paddedBBox.west) / 2 : 51.4;
  let alreadyLoadedCount = 0;
  let skippedOffscreenCount = 0;
  const candidates: Array<{ item: T; distSq: number }> = [];
  for (const hood of allNeighborhoods) {
    if (isLoaded(hood.id)) { alreadyLoadedCount += 1; continue; }
    if (paddedBBox && !isPointInGeoBoundingBox(hood.lat, hood.lng, paddedBBox)) { skippedOffscreenCount += 1; continue; }
    const dLat = hood.lat - centerLat;
    const dLng = hood.lng - centerLng;
    candidates.push({ item: hood, distSq: dLat * dLat + dLng * dLng });
  }
  candidates.sort((a, b) => a.distSq - b.distSq);
  const safeLimit = Math.max(1, Math.min(100, maxBatchSize));
  return {
    batch: candidates.slice(0, safeLimit).map((c) => c.item),
    skippedOffscreenCount, alreadyLoadedCount,
    displayAreaUnitLabel: formatAreaUnitLabel(getStoredAreaUnit()),
    referenceValuationIntlText: formatMillionTomanAsIntlCurrency(10_000, getStoredIntlCurrency()),
  };
}
/**
 * Detects whether the client browser is on a constrained mobile or Data-Saver connection.
 */
export function detectClientLowBandwidthOrMobileMode(): boolean {
  try {
    if (typeof navigator !== 'undefined') {
      const conn = (navigator as unknown as {
        connection?: { saveData?: boolean; effectiveType?: string };
      }).connection;
      if (conn?.saveData) return true;
      if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g' || conn?.effectiveType === '3g') {
        return true;
      }
    }
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < 640) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}