import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type GeoJsonLngLat = [number, number]; // [lng, lat]
export type LeafletLatLng = [number, number]; // [lat, lng]
export interface SpatialPoint { lat: number; lng: number } export interface SpatialBoundingBox { minLat: number; maxLat: number; minLng: number; maxLng: number } export interface ValidatedPolygonGeometry { outerRing: SpatialPoint[]; holes: SpatialPoint[][]; bbox: SpatialBoundingBox; isEmpiricalBoundary: boolean; }
const EARTH_RADIUS_METERS = 6_371_008.8; const EDGE_EPSILON_METERS = 1.5; export function isValidLatLngCoordinate(lat: number, lng: number): boolean { return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0); }
export function fromGeoJsonPosition(pos: GeoJsonLngLat): SpatialPoint { return { lng: Number(pos[0]), lat: Number(pos[1]) }; } export function toGeoJsonPosition(pt: SpatialPoint): GeoJsonLngLat { return [pt.lng, pt.lat]; }
export function computeBoundingBoxForPoints(points: SpatialPoint[]): SpatialBoundingBox { if (points.length === 0) return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 }; let minLat = points[0].lat, maxLat = points[0].lat, minLng = points[0].lng, maxLng = points[0].lng; for (let i = 1; i < points.length; i++) { const p = points[i]; if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat; if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng; } return { minLat, maxLat, minLng, maxLng }; } export function isPointInsideBoundingBox(pt: SpatialPoint, bbox: SpatialBoundingBox, paddingDegrees = 0.0005): boolean { return ( pt.lat >= bbox.minLat - paddingDegrees && pt.lat <= bbox.maxLat + paddingDegrees &&
    pt.lng >= bbox.minLng - paddingDegrees && pt.lng <= bbox.maxLng + paddingDegrees
  ); } export function doBoundingBoxesOverlap(a: SpatialBoundingBox, b: SpatialBoundingBox): boolean { return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLng < b.minLng || a.minLng > b.maxLng); } export function normalizeAndValidatePolygonRing(rawRing: SpatialPoint[]): SpatialPoint[] | null { if (!Array.isArray(rawRing)) return null; const validPts = rawRing.slice(0, 2000).filter((p) => p && isValidLatLngCoordinate(p.lat, p.lng));
  if (validPts.length < 3) return null; const deduped: SpatialPoint[] = [validPts[0]]; for (let i = 1; i < validPts.length; i++) { const prev = deduped[deduped.length - 1]; const curr = validPts[i]; if (Math.abs(prev.lat - curr.lat) > 1e-8 || Math.abs(prev.lng - curr.lng) > 1e-8) { deduped.push(curr); } }
  if (deduped.length < 3) return null; const first = deduped[0], last = deduped[deduped.length - 1]; if (Math.abs(first.lat - last.lat) > 1e-8 || Math.abs(first.lng - last.lng) > 1e-8) { deduped.push({ lat: first.lat, lng: first.lng }); }
  return deduped.length >= 4 ? deduped : null; }
export function geodesicDistanceMeters(a: SpatialPoint, b: SpatialPoint): number { if (!isValidLatLngCoordinate(a.lat, a.lng) || !isValidLatLngCoordinate(b.lat, b.lng)) { return Number.POSITIVE_INFINITY; }
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180; const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180; const sinDLat = Math.sin(dLat / 2), sinDLng = Math.sin(dLng / 2); const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))); }
export function pointToSegmentDistanceMeters( p: SpatialPoint, a: SpatialPoint, b: SpatialPoint, ): number { const cosLat = Math.cos(((p.lat + a.lat + b.lat) / 3) * (Math.PI / 180));
  const degToMetersLat = 111_132.92; const degToMetersLng = 111_412.84 * cosLat; const px = (p.lng - a.lng) * degToMetersLng; const py = (p.lat - a.lat) * degToMetersLat;
  const bx = (b.lng - a.lng) * degToMetersLng; const by = (b.lat - a.lat) * degToMetersLat;
  const segLenSq = bx * bx + by * by; if (segLenSq <= 1e-9) {
    return Math.hypot(px, py);
  }
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / segLenSq));
  const projX = t * bx;
  const projY = t * by;
  return Math.hypot(px - projX, py - projY);
}
export function distanceToPolygonRingEdgeMeters(pt: SpatialPoint, ring: SpatialPoint[]): number {
  if (ring.length < 2) return Number.POSITIVE_INFINITY;
  let minMeters = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ring.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(pt, ring[i], ring[i + 1]);
    if (d < minMeters) minMeters = d;
  }
  return minMeters;
}
export function isPointInSingleRing(
  pt: SpatialPoint,
  ring: SpatialPoint[],
): { inside: boolean; onBoundaryEdge: boolean } {
  const normalized = normalizeAndValidatePolygonRing(ring);
  if (!normalized) return { inside: false, onBoundaryEdge: false };
  const edgeDist = distanceToPolygonRingEdgeMeters(pt, normalized);
  if (edgeDist <= EDGE_EPSILON_METERS) {
    return { inside: true, onBoundaryEdge: true };
  }
  let inside = false;
  for (let i = 0, j = normalized.length - 1; i < normalized.length; j = i++) {
    const xi = normalized[i].lng;
    const yi = normalized[i].lat;
    const xj = normalized[j].lng;
    const yj = normalized[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return { inside, onBoundaryEdge: false };
}
export function pointInPolygonWithHoles(
  pt: SpatialPoint,
  outerRing: SpatialPoint[],
  holes: SpatialPoint[][] = [],
): { inside: boolean; onBoundaryEdge: boolean } {
  if (!isValidLatLngCoordinate(pt.lat, pt.lng)) {
    return { inside: false, onBoundaryEdge: false };
  }
  const bbox = computeBoundingBoxForPoints(outerRing);
  if (!isPointInsideBoundingBox(pt, bbox)) {
    return { inside: false, onBoundaryEdge: false };
  }
  const outerCheck = isPointInSingleRing(pt, outerRing);
  if (!outerCheck.inside) {
    return { inside: false, onBoundaryEdge: false };
  }
  if (outerCheck.onBoundaryEdge) {
    return { inside: true, onBoundaryEdge: true };
  }
  for (const hole of holes) {
    const holeCheck = isPointInSingleRing(pt, hole);
    if (holeCheck.onBoundaryEdge) {
      return { inside: true, onBoundaryEdge: true };
    }
    if (holeCheck.inside) {
      return { inside: false, onBoundaryEdge: false };
    }
  }
  return { inside: true, onBoundaryEdge: false };
}
export function polygonAreaSqMeters(
  outerRing: SpatialPoint[],
  holes: SpatialPoint[][] = [],
): number {
  const ringArea = (ring: SpatialPoint[]): number => {
    const norm = normalizeAndValidatePolygonRing(ring);
    if (!norm || norm.length < 4) return 0;
    const refLat = norm[0].lat;
    const cosLat = Math.cos((refLat * Math.PI) / 180);
    const mLat = 111_132.92;
    const mLng = 111_412.84 * cosLat;
    let sum = 0;
    for (let i = 0; i < norm.length - 1; i++) {
      const x1 = (norm[i].lng - norm[0].lng) * mLng;
      const y1 = (norm[i].lat - norm[0].lat) * mLat;
      const x2 = (norm[i + 1].lng - norm[0].lng) * mLng;
      const y2 = (norm[i + 1].lat - norm[0].lat) * mLat;
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) * 0.5;
  };
  let total = ringArea(outerRing);
  for (const hole of holes) {
    total -= ringArea(hole);
  }
  return Math.max(0, Math.round(total));
}
export function polygonsIntersect(polyA: SpatialPoint[], polyB: SpatialPoint[]): boolean {
  const normA = normalizeAndValidatePolygonRing(polyA);
  const normB = normalizeAndValidatePolygonRing(polyB);
  if (!normA || !normB) return false;
  const bboxA = computeBoundingBoxForPoints(normA);
  const bboxB = computeBoundingBoxForPoints(normB);
  if (!doBoundingBoxesOverlap(bboxA, bboxB)) return false;
  for (const pt of normA) { if (isPointInSingleRing(pt, normB).inside) return true; }
  for (const pt of normB) { if (isPointInSingleRing(pt, normA).inside) return true; }
  const ccw = (p1: SpatialPoint, p2: SpatialPoint, p3: SpatialPoint) => (p3.lat - p1.lat) * (p2.lng - p1.lng) > (p2.lat - p1.lat) * (p3.lng - p1.lng);
  for (let i = 0; i < normA.length - 1; i++) {
    const a1 = normA[i], a2 = normA[i + 1];
    for (let j = 0; j < normB.length - 1; j++) {
      const b1 = normB[j], b2 = normB[j + 1];
      if (ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2)) return true;
    }
  }
  return false;
}
export type NeighborhoodContainmentClassification = 'confirmed_single_match' | 'boundary_ambiguity' | 'multiple_possible_matches' | 'probable_nearest_match' | 'outside_coverage';
export interface SpatialNeighborhoodCandidate { id: number; name: string; cityId: string; center: SpatialPoint; polygon?: SpatialPoint[]; isEmpiricalBoundary?: boolean; }
export interface NeighborhoodContainmentResolution {
  classification: NeighborhoodContainmentClassification;
  primaryNeighborhoodId: number | null;
  primaryNeighborhoodName: string | null;
  matchedNeighborhoodIds: number[];
  distanceToBoundaryMeters: number | null;
  isApproximateBoundary: boolean;
  displayAreaUnitLabel?: string;
  boundarySurveyBenchmarkIntlText?: string;
  explanationFa: string;
}
export function resolveNeighborhoodContainment(
  pt: SpatialPoint,
  candidates: SpatialNeighborhoodCandidate[],
  activeCityId: string,
  maxFallbackCentroidDistanceMeters = 3500,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): NeighborhoodContainmentResolution {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const boundarySurveyBenchmarkIntlText = formatMillionTomanAsIntlCurrency(15, intlCurrency);
  if (!isValidLatLngCoordinate(pt.lat, pt.lng)) {
    return {
      classification: 'outside_coverage', primaryNeighborhoodId: null, primaryNeighborhoodName: null,
      matchedNeighborhoodIds: [], distanceToBoundaryMeters: null, isApproximateBoundary: false,
      displayAreaUnitLabel, boundarySurveyBenchmarkIntlText, explanationFa: 'مختصات جغرافیایی واردشده معتبر نیست.',
    };
  }
  const cityCandidates = candidates.filter((c) => c.cityId === activeCityId);
  const matched: Array<{
    candidate: SpatialNeighborhoodCandidate;
    onEdge: boolean;
    edgeDistMeters: number;
  }> = [];
  for (const candidate of cityCandidates) {
    if (Array.isArray(candidate.polygon) && candidate.polygon.length >= 3) {
      const check = pointInPolygonWithHoles(pt, candidate.polygon);
      if (check.inside) {
        const edgeDist = distanceToPolygonRingEdgeMeters(pt, candidate.polygon);
        matched.push({
          candidate,
          onEdge: check.onBoundaryEdge || edgeDist <= 25,
          edgeDistMeters: Math.round(edgeDist),
        });
      }
    }
  }
  if (matched.length === 1) {
    const m = matched[0];
    if (m.onEdge) {
      return {
        classification: 'boundary_ambiguity',
        primaryNeighborhoodId: m.candidate.id,
        primaryNeighborhoodName: m.candidate.name,
        matchedNeighborhoodIds: [m.candidate.id],
        distanceToBoundaryMeters: m.edgeDistMeters,
        isApproximateBoundary: !m.candidate.isEmpiricalBoundary,
        explanationFa: `نقطه انتخاب‌شده در فاصله ${m.edgeDistMeters} متری مرز محله «${m.candidate.name}» قرار دارد (مرز مشترک).`,
      };
    }
    return {
      classification: 'confirmed_single_match',
      primaryNeighborhoodId: m.candidate.id,
      primaryNeighborhoodName: m.candidate.name,
      matchedNeighborhoodIds: [m.candidate.id],
      distanceToBoundaryMeters: m.edgeDistMeters,
      isApproximateBoundary: !m.candidate.isEmpiricalBoundary,
      explanationFa: m.candidate.isEmpiricalBoundary
        ? `تطبیق قطعی درون مرز رسمی محله «${m.candidate.name}».`
        : `تطبیق درون محدوده تخمینی محله «${m.candidate.name}».`,
    };
  }
  if (matched.length > 1) {
    matched.sort(
      (a, b) =>
        geodesicDistanceMeters(pt, a.candidate.center) -
        geodesicDistanceMeters(pt, b.candidate.center),
    );
    const primary = matched[0];
    return {
      classification: 'multiple_possible_matches',
      primaryNeighborhoodId: primary.candidate.id,
      primaryNeighborhoodName: primary.candidate.name,
      matchedNeighborhoodIds: matched.map((m) => m.candidate.id),
      distanceToBoundaryMeters: primary.edgeDistMeters,
      isApproximateBoundary: true,
      explanationFa: `هم‌پوشانی مرزی بین ${matched.map((m) => m.candidate.name).join(' و ')}؛ نزدیک‌ترین مرکز: «${primary.candidate.name}».`,
    };
  }
  let nearest: SpatialNeighborhoodCandidate | null = null;
  let minCentroidDist = Number.POSITIVE_INFINITY;
  for (const candidate of cityCandidates) {
    const d = geodesicDistanceMeters(pt, candidate.center);
    if (d < minCentroidDist) {
      minCentroidDist = d;
      nearest = candidate;
    }
  }
  if (nearest && minCentroidDist <= maxFallbackCentroidDistanceMeters) {
    return {
      classification: 'probable_nearest_match',
      primaryNeighborhoodId: nearest.id,
      primaryNeighborhoodName: nearest.name,
      matchedNeighborhoodIds: [nearest.id],
      distanceToBoundaryMeters: Math.round(minCentroidDist),
      isApproximateBoundary: true,
      explanationFa: `تطبیق احتمالی بر اساس نزدیک‌ترین مرکز محله («${nearest.name}»، فاصله ${Math.round(minCentroidDist)} متر).`,
    };
  }
  return {
    classification: 'outside_coverage',
    primaryNeighborhoodId: null,
    primaryNeighborhoodName: null,
    matchedNeighborhoodIds: [],
    distanceToBoundaryMeters: Number.isFinite(minCentroidDist) ? Math.round(minCentroidDist) : null,
    isApproximateBoundary: false,
    explanationFa: 'مختصات انتخاب‌شده خارج از محدوده پوشش محله‌های شهر فعال است.',
  };
}
/**
 * City-Scoped GIS Cache Key Builder & Radius Query (Prompts 834 & 836).
 */
export function buildCityScopedGisCacheKey(
  cityId: string,
  datasetType: 'boundary' | 'poi' | 'metro' | 'traffic' | 'heatmap',
  entityId: string | number,
  schemaVersion = 'v2',
): string {
  const safeSchema = String(schemaVersion || 'v2').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'v2';
  const safeCity = String(cityId || 'tehran').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'tehran';
  const safeEntity = String(entityId ?? '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64) || '0';
  return `gis:${safeSchema}:${safeCity}:${datasetType}:${safeEntity}`;
}
export function queryPointsWithinRadiusMeters<T extends { lat: number; lng: number }>(
  origin: SpatialPoint,
  items: T[],
  radiusMeters: number,
): Array<{ item: T; distanceMeters: number }> {
  if (!isValidLatLngCoordinate(origin.lat, origin.lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return [];
  const safeRadius = Math.min(100_000, radiusMeters);
  const degLatPad = safeRadius / 110_500;
  const degLngPad = safeRadius / Math.max(20_000, 111_320 * Math.cos((origin.lat * Math.PI) / 180));
  const bbox: SpatialBoundingBox = {
    minLat: origin.lat - degLatPad,
    maxLat: origin.lat + degLatPad,
    minLng: origin.lng - degLngPad,
    maxLng: origin.lng + degLngPad,
  };
  const hits: Array<{ item: T; distanceMeters: number }> = []; for (const item of items) { if (!isPointInsideBoundingBox({ lat: item.lat, lng: item.lng }, bbox, 0)) continue; const dist = geodesicDistanceMeters(origin, { lat: item.lat, lng: item.lng }); if (dist <= safeRadius) { hits.push({ item, distanceMeters: Math.round(dist) }); } } hits.sort((a, b) => a.distanceMeters - b.distanceMeters); return hits; }