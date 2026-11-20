import { CoreApiError } from '../core';
import { simplifyPolygonGeometry, validatePolygonGeometry } from './coordinateAndPolygonEngine';
import type { BoundaryVersionRecord, GeospatialObservabilityMetrics, PolygonGeometry } from './types';

export type UpsertNeighborhoodBoundaryParams = {
  actorUid: string;
  entityId: string;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  subNeighborhoodId?: string;
  level: BoundaryVersionRecord['level'];
  nameFa: string;
  nameEn?: string;
  historicalNames?: string[];
  geometry: PolygonGeometry;
  sourceProvenance: string;
  autoApprove?: boolean;
};

export async function executeUpsertNeighborhoodBoundary(params: {
  input: UpsertNeighborhoodBoundaryParams;
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  activeBoundaryLocks: Set<string>;
  metrics: GeospatialObservabilityMetrics;
  nowIso: string;
  invalidateGeoCaches: (cityId: string) => void;
  persistRuntime: () => void;
}): Promise<BoundaryVersionRecord> {
  const { input } = params;
  if (params.activeBoundaryLocks.has(input.entityId)) {
    throw new CoreApiError('CONFLICT', 409, `Concurrent boundary update in progress for '${input.entityId}'.`);
  }
  params.activeBoundaryLocks.add(input.entityId);
  try {
    const validation = validatePolygonGeometry(input.geometry);
    if (!validation.valid || !validation.boundingBox) {
      params.metrics.invalidGeometryEventsCount += 1;
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid polygon geometry.', {
        issues: validation.issues,
      });
    }

    const history = params.boundaryHistoryByEntity.get(input.entityId) ?? [];
    const prevActive = history.find((b) => b.status === 'ACTIVE');
    if (prevActive && input.autoApprove !== false) {
      prevActive.status = 'SUPERSEDED';
    }

    const nextVersion = history.length + 1;
    const record: BoundaryVersionRecord = {
      id: `bnd_${input.entityId.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${nextVersion}`,
      entityId: input.entityId,
      cityId: input.cityId,
      districtId: input.districtId,
      hoodId: input.hoodId,
      subNeighborhoodId: input.subNeighborhoodId,
      level: input.level,
      nameFa: input.nameFa,
      nameEn: input.nameEn,
      historicalNames: input.historicalNames,
      version: nextVersion,
      status: input.autoApprove === false ? 'PENDING_REVIEW' : 'ACTIVE',
      geometry: structuredClone(input.geometry),
      simplifiedGeometry: simplifyPolygonGeometry(input.geometry, 2),
      boundingBox: validation.boundingBox,
      sourceProvenance: input.sourceProvenance,
      createdByUid: input.actorUid,
      createdAtIso: params.nowIso,
      reviewedByUid: input.autoApprove === false ? undefined : input.actorUid,
      reviewedAtIso: input.autoApprove === false ? undefined : params.nowIso,
      previousVersionId: prevActive?.id,
    };

    history.push(record);
    params.boundaryHistoryByEntity.set(input.entityId, history);
    params.invalidateGeoCaches(input.cityId);
    params.persistRuntime();
    return structuredClone(record);
  } finally {
    params.activeBoundaryLocks.delete(input.entityId);
  }
}