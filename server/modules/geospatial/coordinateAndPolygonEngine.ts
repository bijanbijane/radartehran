import type {
  LinearRingCoords,
  NormalizedCoordinateResult,
  PolygonGeometry,
  PolygonValidationReport,
  Wgs84Coordinate,
} from './types';

export function normalizeAndValidateCoordinate(
  rawLat: unknown,
  rawLng: unknown,
  options?: { precisionDecimals?: number; sourceProvenance?: string },
): NormalizedCoordinateResult {
  const sourceProvenance = options?.sourceProvenance ?? 'user_or_api_input';
  const precision = Math.max(4, Math.min(8, options?.precisionDecimals ?? 6));

  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'NON_FINITE',
      errorMessage: 'Latitude and longitude must be finite numbers.',
    };
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    // Check if lat falls in Iran longitude range (44..64) and lng falls in Iran latitude range (24..40)
    if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
      return {
        valid: false,
        sourceProvenance,
        transformationMethod: 'REJECTED',
        errorCode: 'LAT_LNG_REVERSED',
        errorMessage: 'Latitude and longitude appear to be reversed (lat in 44..64, lng in 24..40).',
      };
    }
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'IMPOSSIBLE_COORDINATE',
      errorMessage: 'Coordinates exceed global WGS84 bounds (|lat|<=90, |lng|<=180).',
    };
  }

  // Also check reversed inside valid global bounds when lat is 44..64 and lng is 24..40
  if (lat >= 44 && lat <= 64 && lng >= 24 && lng <= 40) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'LAT_LNG_REVERSED',
      errorMessage: 'Latitude and longitude appear to be reversed for Iran geography.',
    };
  }

  if (lat < 24.0 || lat > 40.5 || lng < 44.0 || lng > 63.8) {
    return {
      valid: false,
      sourceProvenance,
      transformationMethod: 'REJECTED',
      errorCode: 'OUT_OF_IRAN_BOUNDS',
      errorMessage: 'Coordinate is outside supported Iran geographic boundaries.',
    };
  }

  const roundedLat = Number(lat.toFixed(precision));
  const roundedLng = Number(lng.toFixed(precision));
  const wasRounded = roundedLat !== lat || roundedLng !== lng;

  return {
    valid: true,
    coordinate: { lat: roundedLat, lng: roundedLng },
    precisionDecimals: precision,
    sourceProvenance,
    transformationMethod: wasRounded ? 'PRECISION_ROUNDED' : 'NONE_WGS84',
  };
}

function segmentsIntersectIncludingTouch(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): boolean {
  const epsilon = 1e-10;
  const orientation = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p: [number, number], q: [number, number], r: [number, number]) =>
    q[0] >= Math.min(p[0], r[0]) - epsilon
    && q[0] <= Math.max(p[0], r[0]) + epsilon
    && q[1] >= Math.min(p[1], r[1]) - epsilon
    && q[1] <= Math.max(p[1], r[1]) + epsilon;

  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  const opposite = (left: number, right: number) =>
    (left > epsilon && right < -epsilon) || (left < -epsilon && right > epsilon);

  if (opposite(o1, o2) && opposite(o3, o4)) return true;
  if (Math.abs(o1) <= epsilon && onSegment(a1, b1, a2)) return true;
  if (Math.abs(o2) <= epsilon && onSegment(a1, b2, a2)) return true;
  if (Math.abs(o3) <= epsilon && onSegment(b1, a1, b2)) return true;
  if (Math.abs(o4) <= epsilon && onSegment(b1, a2, b2)) return true;
  return false;
}

function extractPolygonRings(geometry: PolygonGeometry): LinearRingCoords[][] {
  const coordinates = (geometry as { coordinates?: unknown } | null)?.coordinates;
  const normalizePolygon = (value: unknown): LinearRingCoords[] => {
    if (!Array.isArray(value)) return [];
    return value.map((ring) => Array.isArray(ring) ? ring as LinearRingCoords : []);
  };

  if (geometry?.type === 'Polygon') return [normalizePolygon(coordinates)];
  if (geometry?.type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.map(normalizePolygon);
  }
  return [];
}

export function validatePolygonGeometry(geometry: PolygonGeometry): PolygonValidationReport {
  const issues: PolygonValidationReport['issues'] = [];
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
    return {
      valid: false,
      issues: [{ code: 'INVALID_COORDINATE', message: 'Geometry type must be Polygon or MultiPolygon.' }],
    };
  }

  const polygons = extractPolygonRings(geometry);
  const outerRings = polygons.map((polygon) => polygon[0])
    .filter((ring): ring is LinearRingCoords => Array.isArray(ring) && ring.length > 0);
  if (outerRings.length === 0) {
    return {
      valid: false,
      issues: [{ code: 'TOO_FEW_VERTICES', message: 'Geometry has no outer rings.' }],
    };
  }

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      issues.push({
        code: 'TOO_FEW_VERTICES',
        message: 'Each polygon must contain an outer ring.',
      });
      continue;
    }

    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex];
      if (!Array.isArray(ring) || ring.length < 4) {
        issues.push({
          code: 'TOO_FEW_VERTICES',
          message: 'Every polygon ring must contain at least 4 coordinates (3 distinct vertices + closing vertex).',
        });
        continue;
      }

      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!Array.isArray(first) || !Array.isArray(last)
        || Math.abs(first[0] - last[0]) > 1e-7
        || Math.abs(first[1] - last[1]) > 1e-7) {
        issues.push({
          code: 'UNCLOSED_RING',
          message: 'Every polygon ring must be closed (first and last vertex must match).',
        });
      }

      let signedArea2 = 0;
      for (let i = 0; i < ring.length; i++) {
        const position = ring[i];
        if (!Array.isArray(position) || position.length < 2
          || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
          issues.push({
            code: 'INVALID_COORDINATE',
            message: 'Polygon ring contains a malformed coordinate position.',
          });
          continue;
        }
        const [lng, lat] = position;
        const check = normalizeAndValidateCoordinate(lat, lng);
        if (!check.valid) {
          issues.push({
            code: 'INVALID_COORDINATE',
            message: check.errorMessage ?? 'Invalid vertex coordinate in polygon.',
          });
        }
        if (ringIndex === 0) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }

        if (i < ring.length - 1) {
          const next = ring[i + 1];
          if (Array.isArray(next) && next.length >= 2
            && Number.isFinite(next[0]) && Number.isFinite(next[1])) {
            signedArea2 += lng * next[1] - next[0] * lat;
          }
        }
      }

      if (Math.abs(signedArea2) < 1e-10) {
        issues.push({
          code: 'DEGENERATE_ZERO_AREA',
          message: 'Polygon ring has zero or near-zero area.',
        });
      }

      // Check non-adjacent segment self-intersections on both outer and inner rings.
      const segCount = ring.length - 1;
      let foundSelfIntersect = false;
      for (let i = 0; i < segCount && !foundSelfIntersect; i++) {
        for (let j = i + 2; j < segCount; j++) {
          if (i === 0 && j === segCount - 1) continue;
          const a1 = ring[i];
          const a2 = ring[i + 1];
          const b1 = ring[j];
          const b2 = ring[j + 1];
          if (
            Array.isArray(a1) && Array.isArray(a2) && Array.isArray(b1) && Array.isArray(b2)
            && a1.length >= 2 && a2.length >= 2 && b1.length >= 2 && b2.length >= 2
            && segmentsIntersectIncludingTouch(a1, a2, b1, b2)
          ) {
            issues.push({
              code: 'SELF_INTERSECTION',
              message: `Polygon ring self-intersects between segments ${i} and ${j}.`,
            });
            foundSelfIntersect = true;
            break;
          }
        }
      }
    }

    // GeoJSON interior rings must be strictly inside the exterior ring and must not
    // touch or overlap the exterior ring or another interior ring.
    const outer = polygon[0];
    const isUsableRing = (ring: LinearRingCoords | undefined): ring is LinearRingCoords =>
      Array.isArray(ring) && ring.length >= 4 && ring.every(
        (position) => Array.isArray(position) && position.length >= 2
          && Number.isFinite(position[0]) && Number.isFinite(position[1]),
      );
    const ringsIntersect = (left: LinearRingCoords, right: LinearRingCoords): boolean => {
      for (let i = 0; i < left.length - 1; i += 1) {
        for (let j = 0; j < right.length - 1; j += 1) {
          if (segmentsIntersectIncludingTouch(left[i], left[i + 1], right[j], right[j + 1])) return true;
        }
      }
      return false;
    };
    if (isUsableRing(outer)) {
      for (let holeIndex = 1; holeIndex < polygon.length; holeIndex += 1) {
        const hole = polygon[holeIndex];
        if (!isUsableRing(hole)) continue;
        const strictlyContained = hole.slice(0, -1).every(([lng, lat]) =>
          classifyPointInRing({ lat, lng }, outer) === 'INSIDE',
        );
        if (!strictlyContained || ringsIntersect(outer, hole)) {
          issues.push({
            code: 'HOLE_OUTSIDE_OUTER',
            message: `Interior ring ${holeIndex} must be strictly contained by the exterior ring and must not touch it.`,
          });
        }
        for (let otherIndex = 1; otherIndex < holeIndex; otherIndex += 1) {
          const other = polygon[otherIndex];
          if (!isUsableRing(other)) continue;
          const containedByOther = hole.slice(0, -1).some(([lng, lat]) =>
            classifyPointInRing({ lat, lng }, other) !== 'OUTSIDE',
          );
          const containsOther = other.slice(0, -1).some(([lng, lat]) =>
            classifyPointInRing({ lat, lng }, hole) !== 'OUTSIDE',
          );
          if (containedByOther || containsOther || ringsIntersect(other, hole)) {
            issues.push({
              code: 'HOLE_OVERLAP',
              message: `Interior rings ${otherIndex} and ${holeIndex} overlap or touch.`,
            });
          }
        }
      }
    }
  }

  // A MultiPolygon is a set of disjoint polygonal components. Reject component
  // boundary contact/crossing and interior overlap, while allowing a component
  // that is completely contained by another component's valid hole.
  if (geometry.type === 'MultiPolygon') {
    const usableRing = (ring: LinearRingCoords | undefined): ring is LinearRingCoords =>
      Array.isArray(ring) && ring.length >= 4 && ring.every(
        (position) => Array.isArray(position) && position.length >= 2
          && Number.isFinite(position[0]) && Number.isFinite(position[1]),
      );
    const componentContainsPoint = (
      point: Wgs84Coordinate,
      component: LinearRingCoords[],
    ): boolean => {
      const outerRing = component[0];
      if (!usableRing(outerRing) || classifyPointInRing(point, outerRing) !== 'INSIDE') return false;
      return !component.slice(1).some((hole) =>
        usableRing(hole) && classifyPointInRing(point, hole) !== 'OUTSIDE',
      );
    };
    for (let leftIndex = 0; leftIndex < polygons.length; leftIndex += 1) {
      const left = polygons[leftIndex];
      if (!usableRing(left?.[0])) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < polygons.length; rightIndex += 1) {
        const right = polygons[rightIndex];
        if (!usableRing(right?.[0])) continue;
        let componentsIntersect = false;
        for (const leftRing of left) {
          if (!usableRing(leftRing)) continue;
          for (const rightRing of right) {
            if (!usableRing(rightRing)) continue;
            for (let i = 0; i < leftRing.length - 1 && !componentsIntersect; i += 1) {
              for (let j = 0; j < rightRing.length - 1; j += 1) {
                if (segmentsIntersectIncludingTouch(
                  leftRing[i], leftRing[i + 1], rightRing[j], rightRing[j + 1],
                )) {
                  componentsIntersect = true;
                  break;
                }
              }
            }
            if (componentsIntersect) break;
          }
          if (componentsIntersect) break;
        }
        const leftInsideRight = left[0].slice(0, -1).some(([lng, lat]) =>
          componentContainsPoint({ lat, lng }, right),
        );
        const rightInsideLeft = right[0].slice(0, -1).some(([lng, lat]) =>
          componentContainsPoint({ lat, lng }, left),
        );
        if (componentsIntersect || leftInsideRight || rightInsideLeft) {
          issues.push({
            code: 'MULTIPOLYGON_COMPONENT_OVERLAP',
            message: `MultiPolygon components ${leftIndex} and ${rightIndex} intersect, touch, or overlap.`,
          });
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    boundingBox: issues.length === 0 ? { minLat, maxLat, minLng, maxLng } : undefined,
  };
}
export function simplifyPolygonGeometry(geometry: PolygonGeometry, stepStride = 2): PolygonGeometry {
  const simplifyRing = (ring: LinearRingCoords): LinearRingCoords => {
    if (ring.length <= 6) return ring.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
    const simplified: LinearRingCoords = [
      [Number(ring[0][0].toFixed(5)), Number(ring[0][1].toFixed(5))],
    ];
    for (let i = 1; i < ring.length - 1; i += Math.max(1, stepStride)) {
      simplified.push([Number(ring[i][0].toFixed(5)), Number(ring[i][1].toFixed(5))]);
    }
    const last = ring[ring.length - 1];
    if (simplified.length < 3) {
      return ring.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
    }
    simplified.push([Number(last[0].toFixed(5)), Number(last[1].toFixed(5))]);
    return simplified;
  };

  const candidate: PolygonGeometry = geometry.type === 'Polygon'
    ? {
      type: 'Polygon',
      coordinates: (geometry.coordinates as LinearRingCoords[]).map(simplifyRing),
    }
    : {
      type: 'MultiPolygon',
      coordinates: (geometry.coordinates as LinearRingCoords[][]).map((polygon) => polygon.map(simplifyRing)),
    };

  // Simplification is only a display optimization. Never publish a simplified
  // geometry that fails the same topology/coordinate checks as its source.
  // The canonical input geometry remains untouched and is the safe fallback.
  return validatePolygonGeometry(candidate).valid ? candidate : structuredClone(geometry);
}

function isPointOnSegment(
  pt: Wgs84Coordinate,
  v1: [number, number],
  v2: [number, number],
  epsilon = 1e-5,
): boolean {
  const [x1, y1] = v1; // [lng, lat]
  const [x2, y2] = v2;
  const px = pt.lng;
  const py = pt.lat;

  const minX = Math.min(x1, x2) - epsilon;
  const maxX = Math.max(x1, x2) + epsilon;
  const minY = Math.min(y1, y2) - epsilon;
  const maxY = Math.max(y1, y2) + epsilon;
  if (px < minX || px > maxX || py < minY || py > maxY) return false;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    return Math.hypot(px - x1, py - y1) <= epsilon;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY) <= epsilon;
}

function classifyPointInRing(
  point: Wgs84Coordinate,
  ring: LinearRingCoords,
): 'INSIDE' | 'ON_EDGE' | 'OUTSIDE' {
  if (
    !Array.isArray(ring)
    || ring.length < 4
    || !ring.every((position) =>
      Array.isArray(position)
      && position.length >= 2
      && Number.isFinite(position[0])
      && Number.isFinite(position[1]),
    )
  ) return 'OUTSIDE';
  for (let i = 0; i < ring.length - 1; i++) {
    if (isPointOnSegment(point, ring[i], ring[i + 1])) return 'ON_EDGE';
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > point.lat !== yj > point.lat
      && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersects) inside = !inside;
  }
  return inside ? 'INSIDE' : 'OUTSIDE';
}

export function classifyPointInPolygon(
  point: Wgs84Coordinate,
  geometry: PolygonGeometry,
): 'INSIDE' | 'ON_EDGE' | 'OUTSIDE' {
  const polygons = extractPolygonRings(geometry);
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer) continue;
    const outerClassification = classifyPointInRing(point, outer);
    if (outerClassification === 'ON_EDGE') return 'ON_EDGE';
    if (outerClassification !== 'INSIDE') continue;

    let excludedByHole = false;
    for (const hole of polygon.slice(1)) {
      const holeClassification = classifyPointInRing(point, hole);
      if (holeClassification === 'ON_EDGE') return 'ON_EDGE';
      if (holeClassification === 'INSIDE') {
        excludedByHole = true;
        break;
      }
    }
    if (!excludedByHole) return 'INSIDE';
  }
  return 'OUTSIDE';
}
export function boundingBoxesOverlap(
  a: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat || a.maxLng < b.minLng || a.minLng > b.maxLng);
}

export function calculateGeodesicDistanceMeters(a: Wgs84Coordinate, b: Wgs84Coordinate): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Number((2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(1));
}

export function calculateDistanceToCorridorMeters(
  point: Wgs84Coordinate,
  corridorLine: Wgs84Coordinate[],
): number {
  if (corridorLine.length === 0) return Number.POSITIVE_INFINITY;
  if (corridorLine.length === 1) return calculateGeodesicDistanceMeters(point, corridorLine[0]);

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < corridorLine.length - 1; i++) {
    const p1 = corridorLine[i];
    const p2 = corridorLine[i + 1];
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const lenSq = dx * dx + dy * dy;
    let closest: Wgs84Coordinate = p1;
    if (lenSq > 1e-12) {
      const t = Math.max(0, Math.min(1, ((point.lng - p1.lng) * dx + (point.lat - p1.lat) * dy) / lenSq));
      closest = { lat: p1.lat + t * dy, lng: p1.lng + t * dx };
    }
    const d = calculateGeodesicDistanceMeters(point, closest);
    if (d < minDistance) minDistance = d;
  }
  return minDistance;
}
