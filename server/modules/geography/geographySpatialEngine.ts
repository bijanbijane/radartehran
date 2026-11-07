/**
 * @file server/modules/geography/geographySpatialEngine.ts
 * @description Geodesic distances, point-in-polygon ray casting, and spatial entity resolution.
 */

import { validateCoordinates } from './geographyNormalizer';
import type { GeographyCatalog } from './geographyCatalog';
import type {
  GeoBoundingBox,
  GeoPoint,
  GeoPolygonGeometry,
  GeographicEntity,
  SpatialLookupResult,
} from './geographyTypes';

const EARTH_RADIUS_METERS = 6_371_008.8;

/**
 * Calculates geodesic distance on the WGS-84 sphere using the Haversine formula.
 */
export function calculateGeodesicDistanceMeters(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));

  return Math.round(EARTH_RADIUS_METERS * c * 10) / 10;
}

/**
 * Point-in-polygon ray-casting algorithm for GeoJSON Polygon outer rings ([lng, lat]).
 */
export function isPointInsideGeoJsonPolygonRing(point: GeoPoint, ring: number[][]): boolean {
  if (!ring || ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; // lng
    const yi = ring[i][1]; // lat
    const xj = ring[j][0]; // lng
    const yj = ring[j][1]; // lat

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Evaluates whether a point lies inside a GeoJSON Polygon or MultiPolygon.
 */
export function isPointInsideGeometry(point: GeoPoint, geometry?: GeoPolygonGeometry): boolean {
  if (!geometry) return false;

  if (geometry.type === 'Polygon') {
    const outerRing = geometry.coordinates[0] as number[][];
    if (!outerRing || !isPointInsideGeoJsonPolygonRing(point, outerRing)) {
      return false;
    }
    // Check holes: if point is inside any hole, it's outside the polygon
    for (let h = 1; h < geometry.coordinates.length; h++) {
      const holeRing = geometry.coordinates[h] as number[][];
      if (holeRing && isPointInsideGeoJsonPolygonRing(point, holeRing)) {
        return false;
      }
    }
    return true;
  }

  if (geometry.type === 'MultiPolygon') {
    for (const polygonCoords of geometry.coordinates as number[][][][]) {
      const outerRing = polygonCoords[0];
      if (outerRing && isPointInsideGeoJsonPolygonRing(point, outerRing)) {
        let insideHole = false;
        for (let h = 1; h < polygonCoords.length; h++) {
          if (polygonCoords[h] && isPointInsideGeoJsonPolygonRing(point, polygonCoords[h])) {
            insideHole = true;
            break;
          }
        }
        if (!insideHole) return true;
      }
    }
    return false;
  }

  return false;
}

export class GeographySpatialEngine {
  constructor(private readonly catalog: GeographyCatalog) {}

  /**
   * Resolves a coordinate to the most specific enclosing or nearest geographic entity.
   */
  public resolveCoordinatesToEntity(point: GeoPoint): SpatialLookupResult | null {
    const check = validateCoordinates(point.lat, point.lng);
    if (!check.valid || !check.sanitizedPoint) {
      return null;
    }

    const cleanPt = check.sanitizedPoint;
    const allHoods = this.catalog.searchEntities('', { level: 'neighborhood', limit: 1000 });

    let bestMatch: SpatialLookupResult | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const hood of allHoods) {
      if (!hood.center) continue;

      const dist = calculateGeodesicDistanceMeters(cleanPt, hood.center);

      // 1. Exact polygon check if available
      if (hood.boundary.geometry && isPointInsideGeometry(cleanPt, hood.boundary.geometry)) {
        return {
          entity: hood,
          distanceMeters: dist,
          isExactInsidePolygon: true,
          isWithinApproximateRadius: true,
        };
      }

      // 2. Approximate radius fallback
      const approxRadius = hood.boundary.approximateRadiusMeters || 1200;
      if (dist <= approxRadius && dist < closestDistance) {
        closestDistance = dist;
        bestMatch = {
          entity: hood,
          distanceMeters: dist,
          isExactInsidePolygon: false,
          isWithinApproximateRadius: true,
        };
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    // 3. Fallback to closest city center if outside all neighborhood radii
    const cities = this.catalog.searchEntities('', { level: 'city', limit: 50 });
    let closestCity: GeographicEntity | null = null;
    let closestCityDist = Number.POSITIVE_INFINITY;

    for (const city of cities) {
      if (!city.center) continue;
      const d = calculateGeodesicDistanceMeters(cleanPt, city.center);
      if (d < closestCityDist) {
        closestCityDist = d;
        closestCity = city;
      }
    }

    if (closestCity) {
      return {
        entity: closestCity,
        distanceMeters: closestCityDist,
        isExactInsidePolygon: false,
        isWithinApproximateRadius: false,
      };
    }

    return null;
  }

  /**
   * Finds nearby geographic entities within a radius in meters.
   */
  public findNearbyEntities(
    point: GeoPoint,
    radiusMeters: number,
    options: { level?: GeographicEntity['level']; limit?: number } = {},
  ): SpatialLookupResult[] {
    const check = validateCoordinates(point.lat, point.lng);
    if (!check.valid || !check.sanitizedPoint) return [];

    const cleanPt = check.sanitizedPoint;
    const limit = options.limit || 20;
    const candidates = this.catalog.searchEntities('', { level: options.level, limit: 1000 });
    const results: SpatialLookupResult[] = [];

    for (const candidate of candidates) {
      if (!candidate.center) continue;
      const dist = calculateGeodesicDistanceMeters(cleanPt, candidate.center);
      if (dist <= radiusMeters) {
        const isInsidePoly = isPointInsideGeometry(cleanPt, candidate.boundary.geometry);
        const approxRad = candidate.boundary.approximateRadiusMeters || 1000;
        results.push({
          entity: candidate,
          distanceMeters: dist,
          isExactInsidePolygon: isInsidePoly,
          isWithinApproximateRadius: dist <= approxRad,
        });
      }
    }

    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return results.slice(0, limit);
  }
}
