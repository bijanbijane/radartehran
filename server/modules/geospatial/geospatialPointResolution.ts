import { CoreApiError } from '../core';
import { classifyPointInPolygon, normalizeAndValidateCoordinate } from './coordinateAndPolygonEngine';
import type { BoundaryVersionRecord, GeospatialObservabilityMetrics, PointResolutionResult } from './types';

export function resolvePointInBoundaryStore(params: {
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  metrics: GeospatialObservabilityMetrics;
  rawLat: unknown;
  rawLng: unknown;
}): PointResolutionResult {
  const norm = normalizeAndValidateCoordinate(params.rawLat, params.rawLng);
  if (!norm.valid || !norm.coordinate) {
    params.metrics.pointResolutionFailuresCount += 1;
    throw new CoreApiError('VALIDATION_FAILED', 400, norm.errorMessage ?? 'Invalid coordinates.');
  }
  const pt = norm.coordinate;

  const insideMatches: Array<{ record: BoundaryVersionRecord; classification: 'INSIDE' | 'ON_EDGE' }> = [];

  for (const history of params.boundaryHistoryByEntity.values()) {
    const active = history.find((b) => b.status === 'ACTIVE');
    if (!active) continue;
    const bb = active.boundingBox;
    if (
      pt.lat < bb.minLat - 0.001 ||
      pt.lat > bb.maxLat + 0.001 ||
      pt.lng < bb.minLng - 0.001 ||
      pt.lng > bb.maxLng + 0.001
    ) {
      continue;
    }
    const cls = classifyPointInPolygon(pt, active.geometry);
    if (cls === 'INSIDE' || cls === 'ON_EDGE') {
      insideMatches.push({ record: active, classification: cls });
    }
  }

  if (insideMatches.length === 0) {
    params.metrics.pointResolutionFailuresCount += 1;
    return {
      resolved: false,
      status: 'OUTSIDE_KNOWN_BOUNDARIES',
      confidence: 'none',
      candidateBoundaryIds: [],
    };
  }

  const hoodMatches = insideMatches.filter((m) => m.record.level === 'neighborhood');
  const subMatches = insideMatches.filter((m) => m.record.level === 'sub_neighborhood');

  hoodMatches.sort((a, b) => (a.record.hoodId ?? 9999) - (b.record.hoodId ?? 9999));
  subMatches.sort((a, b) => a.record.entityId.localeCompare(b.record.entityId));

  const primary = hoodMatches[0] ?? insideMatches[0];
  const sub = subMatches[0]?.record;

  const isEdge = primary.classification === 'ON_EDGE';
  const isAmbiguousOverlap = hoodMatches.filter((m) => m.classification === 'INSIDE').length > 1;

  return {
    resolved: true,
    status: isEdge ? 'RESOLVED_ON_EDGE' : isAmbiguousOverlap ? 'AMBIGUOUS_OVERLAP' : 'RESOLVED_INSIDE',
    confidence: isEdge || isAmbiguousOverlap ? 'medium' : 'high',
    cityId: primary.record.cityId,
    districtId: primary.record.districtId,
    hoodId: primary.record.hoodId,
    hoodNameFa: primary.record.nameFa,
    subNeighborhoodId: sub?.subNeighborhoodId ?? primary.record.subNeighborhoodId,
    boundaryVersionId: primary.record.id,
    boundaryVersion: primary.record.version,
    sourceProvenance: primary.record.sourceProvenance,
    candidateBoundaryIds: insideMatches.map((m) => m.record.id),
  };
}