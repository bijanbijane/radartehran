import { CoreApiError } from '../core';
import { simplifyPolygonGeometry, validatePolygonGeometry } from './coordinateAndPolygonEngine';
import { calculateNeighborhoodBoundaryGeometrySha256 } from './neighborhoodProfileBoundaryReadModel';
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
    const activeRecords = history.filter((record) => record.status === 'ACTIVE');
    if (activeRecords.length > 1 && input.autoApprove !== false) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'Boundary history contains multiple ACTIVE versions. Submit a pending version for independent review before restoring a single active boundary.',
        { activeBoundaryIds: activeRecords.map((record) => record.id).sort() },
      );
    }
    const prevActive = activeRecords.length === 1 ? activeRecords[0] : undefined;
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
      geometrySha256: calculateNeighborhoodBoundaryGeometrySha256(input.geometry),
      geometryCrs: 'EPSG:4326',
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

export type ApproveNeighborhoodBoundaryParams = {
  entityId: string;
  versionId: string;
  reviewerUid: string;
};

export async function executeApproveNeighborhoodBoundary(params: {
  input: ApproveNeighborhoodBoundaryParams;
  boundaryHistoryByEntity: Map<string, BoundaryVersionRecord[]>;
  activeBoundaryLocks: Set<string>;
  nowIso: string;
  invalidateGeoCaches: (cityId: string) => void;
  persistRuntime: () => void;
}): Promise<BoundaryVersionRecord> {
  const { input } = params;
  if (!input.entityId.trim() || !input.versionId.trim() || !input.reviewerUid.trim()) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Boundary approval identifiers are required.');
  }
  if (params.activeBoundaryLocks.has(input.entityId)) {
    throw new CoreApiError('CONFLICT', 409, `Concurrent boundary update in progress for '${input.entityId}'.`);
  }

  params.activeBoundaryLocks.add(input.entityId);
  try {
    const history = params.boundaryHistoryByEntity.get(input.entityId);
    if (!history?.length) {
      throw new CoreApiError('NOT_FOUND', 404, 'Boundary history was not found.');
    }
    const targetIndex = history.findIndex((record) => record.id === input.versionId);
    if (targetIndex < 0) {
      throw new CoreApiError('NOT_FOUND', 404, 'Boundary version was not found.');
    }
    if (targetIndex !== history.length - 1) {
      throw new CoreApiError('CONFLICT', 409, 'Only the latest boundary version can be approved.');
    }

    const target = history[targetIndex];
    if (target.status !== 'PENDING_REVIEW') {
      throw new CoreApiError('CONFLICT', 409, 'Only a pending boundary version can be approved.');
    }
    if (!target.createdByUid || target.createdByUid === input.reviewerUid) {
      throw new CoreApiError('FORBIDDEN', 403, 'The boundary submitter cannot approve their own boundary.');
    }
    if (target.geometryCrs !== 'EPSG:4326'
      || !target.geometrySha256
      || calculateNeighborhoodBoundaryGeometrySha256(target.geometry) !== target.geometrySha256.toLowerCase()) {
      throw new CoreApiError('CONFLICT', 409, 'Boundary geometry digest or CRS is missing or invalid.');
    }
    const validation = validatePolygonGeometry(target.geometry);
    if (!validation.valid || !validation.boundingBox) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Boundary geometry is no longer valid.');
    }

    for (const existing of history) {
      if (existing.status === 'ACTIVE' && existing.id !== target.id) {
        existing.status = 'SUPERSEDED';
      }
    }
    target.status = 'ACTIVE';
    target.reviewedByUid = input.reviewerUid;
    target.reviewedAtIso = params.nowIso;
    target.boundingBox = validation.boundingBox;

    params.boundaryHistoryByEntity.set(input.entityId, history);
    params.invalidateGeoCaches(target.cityId);
    params.persistRuntime();
    return structuredClone(target);
  } finally {
    params.activeBoundaryLocks.delete(input.entityId);
  }
}
