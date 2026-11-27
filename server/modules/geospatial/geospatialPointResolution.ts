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
  const conflictingActiveBoundaryIds: string[] = [];

  for (const history of params.boundaryHistoryByEntity.values()) {
    const activeRecords = history.filter((record) => record.status === 'ACTIVE');
    if (activeRecords.length === 0) continue;

    if (activeRecords.length > 1) {
      // A duplicate ACTIVE lifecycle is relevant only when one of its geometries
      // could contain this point. Never choose an arbitrary version from that history.
      const hasRelevantDuplicateVersion = activeRecords.some((record) => {
        const bb = record.boundingBox;
        if (
          pt.lat < bb.minLat - 0.001 ||
          pt.lat > bb.maxLat + 0.001 ||
          pt.lng < bb.minLng - 0.001 ||
          pt.lng > bb.maxLng + 0.001
        ) {
          return false;
        }
        return classifyPointInPolygon(pt, record.geometry) !== 'OUTSIDE';
      });
      if (hasRelevantDuplicateVersion) {
        conflictingActiveBoundaryIds.push(...activeRecords.map((record) => record.id));
      }
      continue;
    }

    const active = activeRecords[0];
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

  if (conflictingActiveBoundaryIds.length > 0) {
    params.metrics.pointResolutionFailuresCount += 1;
    return {
      resolved: false,
      status: 'MULTIPLE_ACTIVE_BOUNDARY_VERSIONS',
      confidence: 'none',
      candidateBoundaryIds: [...new Set(conflictingActiveBoundaryIds)].sort(),
    };
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
  // A sub-neighborhood identifier is authoritative only for a strictly interior
  // match. A point on its edge must not inherit that micro-neighborhood ID.
  const sub = subMatches.find((match) => match.classification === 'INSIDE')?.record;

  const isAmbiguousOverlap = hoodMatches.length > 1 || subMatches.length > 1;
  // Any matched active boundary edge makes the spatial result non-interior.
  // In particular, a parent-neighborhood interior must not mask a sub-neighborhood edge.
  const isEdge = !isAmbiguousOverlap && insideMatches.some((match) => match.classification === 'ON_EDGE');

  return {
    resolved: true,
    status: isAmbiguousOverlap ? 'AMBIGUOUS_OVERLAP' : isEdge ? 'RESOLVED_ON_EDGE' : 'RESOLVED_INSIDE',
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