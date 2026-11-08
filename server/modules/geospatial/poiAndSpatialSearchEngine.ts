import crypto from 'crypto';
import { CoreApiError } from '../core';
import { computeMedian } from '../valuation';
import {
  calculateDistanceToCorridorMeters,
  calculateGeodesicDistanceMeters,
  classifyPointInPolygon,
} from './coordinateAndPolygonEngine';
import type {
  LocationContextIndicators,
  PoiCategory,
  PointOfInterestRecord,
  SpatialClusterItem,
  SpatialPublishableListing,
  SpatialSearchQuery,
  SpatialSearchResult,
  ValuationLocationFeatureVector,
  Wgs84Coordinate,
} from './types';

export const MAX_SEARCH_RADIUS_METERS = 25_000;
export const MAX_BOUNDING_BOX_SPAN_DEG = 1.5;

export function computePoiDedupeKey(params: {
  cityId: string;
  category: PoiCategory;
  nameFa: string;
  coordinates: Wgs84Coordinate;
}): string {
  const normName = params.nameFa.trim().replace(/\s+/g, '');
  const latBucket = params.coordinates.lat.toFixed(3);
  const lngBucket = params.coordinates.lng.toFixed(3);
  return crypto
    .createHash('sha256')
    .update(`${params.cityId}|${params.category}|${normName}|${latBucket}|${lngBucket}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

export function computeLocationContextIndicators(params: {
  coordinates: Wgs84Coordinate;
  cityId: string;
  hoodId?: number;
  pois: PointOfInterestRecord[];
}): LocationContextIndicators {
  const { coordinates, cityId, hoodId, pois } = params;
  const verifiedPois = pois.filter(
    (p) => p.cityId === cityId && p.verificationStatus === 'VERIFIED' && p.publicVisible,
  );

  function nearestForCategories(categories: PoiCategory[]): number | null {
    let minD = Number.POSITIVE_INFINITY;
    for (const p of verifiedPois) {
      if (!categories.includes(p.category)) continue;
      const d = calculateGeodesicDistanceMeters(coordinates, p.coordinates);
      if (d < minD) minD = d;
    }
    return Number.isFinite(minD) ? minD : null;
  }

  let nearbyServiceDensityCount1km = 0;
  for (const p of verifiedPois) {
    if (calculateGeodesicDistanceMeters(coordinates, p.coordinates) <= 1000) {
      nearbyServiceDensityCount1km++;
    }
  }

  const nearestMetroMeters = nearestForCategories(['metro_station']);
  const nearestBusOrTransitMeters = nearestForCategories(['public_transport', 'bus_terminal', 'metro_station']);
  const nearestParkMeters = nearestForCategories(['park']);
  const nearestSchoolMeters = nearestForCategories(['school', 'university']);
  const nearestHospitalOrClinicMeters = nearestForCategories(['hospital', 'clinic', 'pharmacy']);
  const nearestShoppingOrMarketMeters = nearestForCategories(['shopping_center', 'market']);
  const nearestRoadHubMeters = nearestForCategories(['road_hub']);

  const scoreDistance = (dist: number | null, idealMeters: number, maxMeters: number): number => {
    if (dist === null) return 45;
    if (dist <= idealMeters) return 100;
    if (dist >= maxMeters) return 20;
    const ratio = (dist - idealMeters) / Math.max(1, maxMeters - idealMeters);
    return Math.round(100 - ratio * 80);
  };

  const transitScore = scoreDistance(nearestMetroMeters ?? nearestBusOrTransitMeters, 350, 2500);
  const greenSpaceScore = scoreDistance(nearestParkMeters, 300, 2000);
  const shoppingScore = scoreDistance(nearestShoppingOrMarketMeters, 250, 1800);
  const healthScore = scoreDistance(nearestHospitalOrClinicMeters, 500, 3000);
  const dailyServicesScore = Math.round(shoppingScore * 0.55 + healthScore * 0.45);
  const overallAccessibilityIndex = Math.round(
    transitScore * 0.4 + dailyServicesScore * 0.35 + greenSpaceScore * 0.25,
  );

  return {
    coordinates,
    cityId,
    hoodId,
    distanceUnit: 'meters',
    distanceMethod: 'geodesic_straight_line_haversine',
    travelTimeClaimed: false,
    factualDistances: {
      nearestMetroMeters,
      nearestBusOrTransitMeters,
      nearestParkMeters,
      nearestSchoolMeters,
      nearestHospitalOrClinicMeters,
      nearestShoppingOrMarketMeters,
      nearestRoadHubMeters,
    },
    nearbyServiceDensityCount1km,
    derivedAccessibilityScores: {
      transitScore,
      greenSpaceScore,
      dailyServicesScore,
      overallAccessibilityIndex,
      scoringRuleVersion: 'accessibility_linear_decay_v1.0',
    },
  };
}

export function buildValuationLocationFeatureVector(params: {
  coordinates: Wgs84Coordinate;
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  boundaryVersion: number;
  context: LocationContextIndicators;
}): ValuationLocationFeatureVector {
  const { coordinates, cityId, districtId, hoodId, subNeighborhoodId, boundaryVersion, context } = params;
  const metro = context.factualDistances.nearestMetroMeters ?? undefined;
  const road = context.factualDistances.nearestRoadHubMeters ?? undefined;
  const idx = context.derivedAccessibilityScores.overallAccessibilityIndex;

  const locationCategory: ValuationLocationFeatureVector['locationCategory'] =
    metro !== undefined && metro <= 500
      ? 'prime_transit_corridor'
      : idx >= 75
        ? 'high_amenity_urban'
        : idx >= 45
          ? 'standard_residential'
          : 'peripheral';

  const rawPayload = JSON.stringify({
    lat: Number(coordinates.lat.toFixed(5)),
    lng: Number(coordinates.lng.toFixed(5)),
    cityId,
    hoodId,
    subNeighborhoodId: subNeighborhoodId ?? null,
    boundaryVersion,
    metro: metro ?? null,
    road: road ?? null,
    idx,
    locationCategory,
  });

  const reproducibleHash = crypto.createHash('sha256').update(rawPayload, 'utf8').digest('hex').slice(0, 32);

  return {
    coordinates,
    cityId,
    districtId,
    hoodId,
    subNeighborhoodId,
    boundaryVersion,
    distanceToMetroMeters: metro,
    distanceToMainRoadMeters: road,
    overallAccessibilityIndex: idx,
    locationCategory,
    featureVectorVersion: 'gis_val_vec_v1.0',
    reproducibleHash,
  };
}

export function executeBoundedSpatialSearch(params: {
  query: SpatialSearchQuery;
  indexedListingsByCity: SpatialPublishableListing[];
}): SpatialSearchResult {
  const { query, indexedListingsByCity } = params;

  if (query.radiusMeters !== undefined) {
    if (query.radiusMeters <= 0 || query.radiusMeters > MAX_SEARCH_RADIUS_METERS) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `radiusMeters must be between 1 and ${MAX_SEARCH_RADIUS_METERS}.`,
      );
    }
  }

  if (query.boundingBox) {
    const latSpan = query.boundingBox.maxLat - query.boundingBox.minLat;
    const lngSpan = query.boundingBox.maxLng - query.boundingBox.minLng;
    if (latSpan <= 0 || lngSpan <= 0 || latSpan > MAX_BOUNDING_BOX_SPAN_DEG || lngSpan > MAX_BOUNDING_BOX_SPAN_DEG) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Bounding box span must be positive and not exceed ${MAX_BOUNDING_BOX_SPAN_DEG} degrees.`,
      );
    }
  }

  const matched: Array<Omit<SpatialPublishableListing, 'exactPrivateAddress'> & { distanceMeters?: number }> = [];

  for (const lst of indexedListingsByCity) {
    // Public discovery eligibility check
    if (lst.publicationStatus !== 'PUBLISHED' || lst.verificationStatus !== 'VERIFIED' || !lst.available) {
      continue;
    }
    if (lst.cityId !== query.cityId) continue;
    if (query.districtId && lst.districtId !== query.districtId) continue;
    if (query.hoodIds && query.hoodIds.length > 0 && !query.hoodIds.includes(lst.hoodId)) continue;
    if (query.propertyCategory && lst.propertyCategory !== query.propertyCategory) continue;
    if (query.transactionType && lst.transactionType !== query.transactionType) continue;
    if (query.minPriceMillion !== undefined && lst.priceMillion < query.minPriceMillion) continue;
    if (query.maxPriceMillion !== undefined && lst.priceMillion > query.maxPriceMillion) continue;
    if (query.minSqm !== undefined && lst.sqm < query.minSqm) continue;
    if (query.maxSqm !== undefined && lst.sqm > query.maxSqm) continue;
    if (query.minBedrooms !== undefined && (lst.bedrooms ?? 0) < query.minBedrooms) continue;
    if (query.hasParking !== undefined && lst.hasParking !== query.hasParking) continue;

    if (query.boundingBox) {
      const { minLat, maxLat, minLng, maxLng } = query.boundingBox;
      if (
        lst.coordinates.lat < minLat ||
        lst.coordinates.lat > maxLat ||
        lst.coordinates.lng < minLng ||
        lst.coordinates.lng > maxLng
      ) {
        continue;
      }
    }

    if (query.polygon) {
      const pip = classifyPointInPolygon(lst.coordinates, query.polygon);
      if (pip === 'OUTSIDE') continue;
    }

    let distanceMeters: number | undefined;
    if (query.center) {
      distanceMeters = calculateGeodesicDistanceMeters(query.center, lst.coordinates);
      if (query.radiusMeters !== undefined && distanceMeters > query.radiusMeters) {
        continue;
      }
    } else if (query.corridorLine && query.corridorLine.length >= 2) {
      distanceMeters = calculateDistanceToCorridorMeters(lst.coordinates, query.corridorLine);
      const maxBuffer = Math.min(5000, query.corridorBufferMeters ?? 500);
      if (distanceMeters > maxBuffer) continue;
    }

    // Strip exactPrivateAddress for privacy compliance
    const { exactPrivateAddress: _omitted, ...publicListing } = lst;
    matched.push({
      ...publicListing,
      distanceMeters,
    });
  }

  if (query.center) {
    matched.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));

  // Zoom-aware spatial clustering when zoomLevel <= 11 and results are dense
  if (query.zoomLevel !== undefined && query.zoomLevel <= 11 && matched.length > 3) {
    const gridPrecision = query.zoomLevel <= 9 ? 1 : 2;
    const buckets = new Map<string, typeof matched>();
    for (const item of matched) {
      const key = `${item.coordinates.lat.toFixed(gridPrecision)}:${item.coordinates.lng.toFixed(gridPrecision)}`;
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }

    const clusters: SpatialClusterItem[] = [];
    for (const [key, list] of buckets.entries()) {
      const avgLat = list.reduce((acc, i) => acc + i.coordinates.lat, 0) / list.length;
      const avgLng = list.reduce((acc, i) => acc + i.coordinates.lng, 0) / list.length;
      const medPrice = computeMedian(list.map((i) => i.priceMillion));
      clusters.push({
        clusterId: `cls_${key}`,
        center: { lat: Number(avgLat.toFixed(5)), lng: Number(avgLng.toFixed(5)) },
        count: list.length,
        medianPriceMillion: Number(medPrice.toFixed(1)),
        sampleListingIds: list.slice(0, 5).map((i) => i.id),
      });
    }

    return {
      mode: 'CLUSTERED_VIEWPORT',
      totalMatched: matched.length,
      page: 1,
      pageSize: clusters.length,
      items: [],
      clusters,
    };
  }

  const startIdx = (page - 1) * pageSize;
  return {
    mode: 'INDIVIDUAL_LISTINGS',
    totalMatched: matched.length,
    page,
    pageSize,
    items: matched.slice(startIdx, startIdx + pageSize),
  };
}
