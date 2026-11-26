import {
  isPointInSingleRing,
  normalizeAndValidatePolygonRing,
  type SpatialPoint,
} from '../../../utils/spatialGeometryEngine';

export type GeoJsonPosition = readonly [number, number]; // [longitude, latitude]
export type GeoJsonRing = readonly GeoJsonPosition[];
export type GeoJsonPolygonGeometry =
  | { readonly type: 'Polygon'; readonly coordinates: readonly GeoJsonRing[] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly GeoJsonRing[])[] };

export type BoundaryAuthority =
  | 'OFFICIAL_PRIMARY'
  | 'OFFICIAL_DERIVED'
  | 'VERIFIED_SECONDARY'
  | 'REVIEWED_COMMUNITY'
  | 'ALGORITHMIC'
  | 'UNKNOWN';

export interface NeighborhoodProfileBoundaryEvidence {
  readonly geographicEntityId: string;
  readonly cityId: string;
  readonly legacyNeighborhoodId: number;
  readonly level: 'neighborhood' | 'district' | 'city';
  readonly versionId: string;
  readonly version: number;
  readonly status: 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED' | 'SUPERSEDED';
  readonly identityStatus: 'CONFIRMED_CANONICAL' | 'DISPUTED' | 'RETIRED' | 'UNVERIFIED';
  readonly verificationStatus:
    | 'VERIFIED_OFFICIAL_PRIMARY'
    | 'VERIFIED_OFFICIAL_DERIVED'
    | 'VERIFIED_INTERNATIONAL_STANDARD'
    | 'VERIFIED_SECONDARY_GAZETTEER'
    | 'PROVISIONAL_UNVERIFIED'
    | 'DISPUTED'
    | 'REQUIRES_REVIEW'
    | 'NOT_VERIFIED';
  readonly authority: BoundaryAuthority;
  readonly crs: 'EPSG:4326' | 'UNKNOWN';
  readonly geometry: GeoJsonPolygonGeometry;
  readonly sourceReference: string;
  readonly reviewedIndependently?: boolean;
  readonly reviewedAtIso?: string;
  readonly geometrySha256?: string;
  /** Set by the trusted server adapter only after recomputing the hash from canonicalized GeoJSON. */
  readonly geometryHashVerified?: boolean;
}

export type BoundaryEligibilityCode =
  | 'ELIGIBLE_OPERATIONAL' | 'ELIGIBLE_OFFICIAL' | 'MISSING_EVIDENCE'
  | 'IDENTITY_MISMATCH' | 'CITY_MISMATCH' | 'LEGACY_ID_MISMATCH'
  | 'WRONG_GEOGRAPHIC_LEVEL' | 'NOT_ACTIVE' | 'IDENTITY_UNVERIFIED'
  | 'NOT_REVIEWED' | 'SOURCE_NOT_ACCEPTABLE' | 'CRS_UNSUPPORTED'
  | 'GEOMETRY_INVALID' | 'GEOMETRY_EXTENT_UNSUPPORTED'
  | 'GEOMETRY_HASH_MISSING' | 'GEOMETRY_HASH_UNVERIFIED'
  | 'SOURCE_REFERENCE_MISSING' | 'BOUNDARY_VERSION_INVALID';

export interface BoundaryEligibilityResult {
  readonly eligible: boolean;
  readonly code: BoundaryEligibilityCode;
  readonly officialBoundary: boolean;
  readonly areaAnalysisAllowed: boolean;
  readonly areaSqKm: number | null;
  readonly areaQuality:
    | 'OFFICIAL_GEOMETRY_DERIVED_APPROXIMATION'
    | 'REVIEWED_GEOMETRY_DERIVED_APPROXIMATION'
    | 'UNAVAILABLE';
  readonly areaMethod: 'SPHERICAL_SPHERE_APPROXIMATION' | 'UNAVAILABLE';
  readonly reasons: readonly string[];
}

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidTimestamp(value: string | undefined): boolean {
  return Boolean(value && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)));
}
function isFiniteWgs84Position(position: GeoJsonPosition): boolean {
  return Array.isArray(position) && position.length === 2
    && Number.isFinite(position[0]) && Number.isFinite(position[1])
    && position[0] >= -180 && position[0] <= 180
    && position[1] >= -90 && position[1] <= 90;
}
function orientation(a: SpatialPoint, b: SpatialPoint, c: SpatialPoint): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}
function onSegment(a: SpatialPoint, b: SpatialPoint, p: SpatialPoint): boolean {
  return p.lng >= Math.min(a.lng, b.lng) - 1e-10
    && p.lng <= Math.max(a.lng, b.lng) + 1e-10
    && p.lat >= Math.min(a.lat, b.lat) - 1e-10
    && p.lat <= Math.max(a.lat, b.lat) + 1e-10;
}
function segmentsIntersect(a: SpatialPoint, b: SpatialPoint, c: SpatialPoint, d: SpatialPoint): boolean {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
    && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return (Math.abs(o1) <= 1e-10 && onSegment(a, b, c))
    || (Math.abs(o2) <= 1e-10 && onSegment(a, b, d))
    || (Math.abs(o3) <= 1e-10 && onSegment(c, d, a))
    || (Math.abs(o4) <= 1e-10 && onSegment(c, d, b));
}
function hasSelfIntersection(ring: readonly SpatialPoint[]): boolean {
  const segmentCount = ring.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    for (let j = i + 1; j < segmentCount; j++) {
      if (j === i + 1 || (i === 0 && j === segmentCount - 1)) continue;
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}
function normalizeRing(raw: GeoJsonRing): SpatialPoint[] | null {
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 10_000 || !raw.every(isFiniteWgs84Position)) return null;
  const first = raw[0], last = raw[raw.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-8 || Math.abs(first[1] - last[1]) > 1e-8) return null;
  const longitudes = raw.map((position) => position[0]);
  const latitudes = raw.map((position) => position[1]);
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
  // The profile engine is for local neighborhood polygons, not country-scale or antimeridian geometries.
  if (longitudeSpan > 5 || latitudeSpan > 5) return null;
  const points = raw.map(([lng, lat]) => ({ lng, lat }));
  const normalized = normalizeAndValidatePolygonRing(points);
  return normalized && normalized.length === points.length && !hasSelfIntersection(normalized) ? normalized : null;
}

function ringsIntersect(left: readonly SpatialPoint[], right: readonly SpatialPoint[]): boolean {
  for (let i = 0; i < left.length - 1; i++) {
    for (let j = 0; j < right.length - 1; j++) {
      if (segmentsIntersect(left[i], left[i + 1], right[j], right[j + 1])) return true;
    }
  }
  return false;
}

function sphericalRingAreaSqMeters(ring: readonly SpatialPoint[]): number {
  const earthRadiusMeters = 6_371_008.8;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const current = ring[i];
    const next = ring[i + 1];
    const deltaLongitude = ((next.lng - current.lng + 540) % 360) - 180;
    const longitudeRadians = deltaLongitude * Math.PI / 180;
    const currentLatitude = current.lat * Math.PI / 180;
    const nextLatitude = next.lat * Math.PI / 180;
    sum += longitudeRadians * (2 + Math.sin(currentLatitude) + Math.sin(nextLatitude));
  }
  return Math.abs(sum * earthRadiusMeters * earthRadiusMeters / 2);
}

function polygonAreaSqKm(rings: readonly GeoJsonRing[]): number | null {
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const normalized = rings.map(normalizeRing);
  if (normalized.some((ring) => ring === null)) return null;
  const outer = normalized[0]!;
  const outerArea = sphericalRingAreaSqMeters(outer);
  if (!(outerArea > 0)) return null;
  const holes = normalized.slice(1).map((ring) => ring!);
  let removedArea = 0;
  for (let index = 0; index < holes.length; index++) {
    const hole = holes[index];
    if (ringsIntersect(outer, hole)) return null;
    if (!hole.every((point) => isPointInSingleRing(point, outer).inside)) return null;
    const holeArea = sphericalRingAreaSqMeters(hole);
    if (!(holeArea > 0) || holeArea >= outerArea) return null;
    for (const otherHole of holes.slice(0, index)) {
      if (ringsIntersect(hole, otherHole)
        || isPointInSingleRing(hole[0], otherHole).inside
        || isPointInSingleRing(otherHole[0], hole).inside) return null;
    }
    removedArea += holeArea;
  }
  if (removedArea >= outerArea) return null;
  return (outerArea - removedArea) / 1_000_000;
}

export function calculateValidatedGeoJsonAreaSqKm(geometry: GeoJsonPolygonGeometry): number | null {
  if (geometry.type === 'Polygon') return polygonAreaSqKm(geometry.coordinates);
  if (geometry.type !== 'MultiPolygon' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return null;
  const polygons = geometry.coordinates.map((rings) => {
    const outer = rings[0] ? normalizeRing(rings[0]) : null;
    return { rings, outer };
  });
  if (polygons.some((polygon) => polygon.outer === null)) return null;
  for (let i = 0; i < polygons.length; i++) {
    for (let j = 0; j < i; j++) {
      const left = polygons[i].outer!;
      const right = polygons[j].outer!;
      if (ringsIntersect(left, right)
        || isPointInSingleRing(left[0], right).inside
        || isPointInSingleRing(right[0], left).inside) return null;
    }
  }
  let total = 0;
  for (const polygon of polygons) {
    const area = polygonAreaSqKm(polygon.rings);
    if (area === null) return null;
    total += area;
  }
  return total > 0 ? total : null;
}

function ineligible(code: BoundaryEligibilityCode, reason: string): BoundaryEligibilityResult {
  return { eligible: false, code, officialBoundary: false, areaAnalysisAllowed: false,
    areaSqKm: null, areaQuality: 'UNAVAILABLE', areaMethod: 'UNAVAILABLE', reasons: [reason] };
}

export function evaluateNeighborhoodProfileBoundary(params: {
  readonly expectedGeographicEntityId: string | null | undefined;
  readonly expectedCityId: string;
  readonly expectedLegacyNeighborhoodId: number;
  readonly evidence: NeighborhoodProfileBoundaryEvidence | null | undefined;
}): BoundaryEligibilityResult {
  const evidence = params.evidence;
  if (!evidence) return ineligible('MISSING_EVIDENCE', 'هیچ نسخه مرز تأییدشده‌ای به پرونده متصل نشده است.');
  if (!params.expectedGeographicEntityId || evidence.geographicEntityId !== params.expectedGeographicEntityId) {
    return ineligible('IDENTITY_MISMATCH', 'شناسه کانونیک مرز با هویت محله یکسان نیست.');
  }
  if (evidence.cityId !== params.expectedCityId) return ineligible('CITY_MISMATCH', 'مرز به شهر دیگری تعلق دارد.');
  if (evidence.legacyNeighborhoodId !== params.expectedLegacyNeighborhoodId) {
    return ineligible('LEGACY_ID_MISMATCH', 'نگاشت شناسه قدیمی محله با مرجع مرز مطابقت ندارد.');
  }
  if (evidence.level !== 'neighborhood') return ineligible('WRONG_GEOGRAPHIC_LEVEL', 'هندسه در سطح محله نیست.');
  if (!evidence.versionId.trim() || !Number.isSafeInteger(evidence.version) || evidence.version < 1) {
    return ineligible('BOUNDARY_VERSION_INVALID', 'شناسه و شماره نسخه مرز معتبر نیست.');
  }
  if (evidence.status !== 'ACTIVE') return ineligible('NOT_ACTIVE', 'فقط نسخه فعال مرز اجازه ورود به پروفایل را دارد.');
  if (evidence.identityStatus !== 'CONFIRMED_CANONICAL'
    || ['DISPUTED', 'PROVISIONAL_UNVERIFIED', 'REQUIRES_REVIEW', 'NOT_VERIFIED'].includes(evidence.verificationStatus)) {
    return ineligible('IDENTITY_UNVERIFIED', 'هویت جغرافیایی یا وضعیت راستی‌آزمایی آن قطعی نیست.');
  }
  if (evidence.reviewedIndependently !== true || !isValidTimestamp(evidence.reviewedAtIso)) {
    return ineligible('NOT_REVIEWED', 'بازبین و زمان بازبینی مرز ثبت نشده‌اند.');
  }
  if (!evidence.sourceReference.trim()) return ineligible('SOURCE_REFERENCE_MISSING', 'مرجع منبع هندسه ثبت نشده است.');
  if (evidence.authority === 'ALGORITHMIC' || evidence.authority === 'UNKNOWN') {
    return ineligible('SOURCE_NOT_ACCEPTABLE', 'هندسه الگوریتمی یا با منشأ نامعلوم برای تحلیل مساحتی پذیرفته نیست.');
  }
  if (evidence.crs !== 'EPSG:4326') return ineligible('CRS_UNSUPPORTED', 'سیستم مختصات هندسه باید صریحاً EPSG:4326 باشد.');
  if (!evidence.geometrySha256 || !SHA256_HEX.test(evidence.geometrySha256)) {
    return ineligible('GEOMETRY_HASH_MISSING', 'هش SHA-256 هندسه برای نسخه‌گذاری و کش معتبر نیست.');
  }
  if (evidence.geometryHashVerified !== true) {
    return ineligible('GEOMETRY_HASH_UNVERIFIED', 'هش باید در سرور از GeoJSON کانونیک محاسبه و با هندسه همین نسخه تطبیق داده شود.');
  }
  const areaSqKm = calculateValidatedGeoJsonAreaSqKm(evidence.geometry);
  if (areaSqKm === null) return ineligible('GEOMETRY_INVALID', 'هندسه بسته، معتبر و غیرخودمتقاطع نیست؛ حلقه‌های داخلی/بیرونی یا اجزای MultiPolygon ممکن است هم‌پوشانی داشته باشند.');
  const officialBoundary = evidence.authority === 'OFFICIAL_PRIMARY' || evidence.authority === 'OFFICIAL_DERIVED';
  return {
    eligible: true,
    code: officialBoundary ? 'ELIGIBLE_OFFICIAL' : 'ELIGIBLE_OPERATIONAL',
    officialBoundary,
    areaAnalysisAllowed: true,
    areaSqKm,
    areaQuality: officialBoundary ? 'OFFICIAL_GEOMETRY_DERIVED_APPROXIMATION' : 'REVIEWED_GEOMETRY_DERIVED_APPROXIMATION',
    areaMethod: 'SPHERICAL_SPHERE_APPROXIMATION',
    reasons: officialBoundary
      ? ['منبع هندسه رسمی است؛ مساحت از هندسه با روش کروی محاسبه شده و مقدار ثبتی/کاداستری محسوب نمی‌شود.']
      : ['هندسه برای تحلیل عملیاتی بازبینی شده است؛ مرز رسمی یا مساحت ثبتی محسوب نمی‌شود.'],
  };
}
