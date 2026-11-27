/**
 * RT-INFRA-009 — Deterministic geospatial snapshot validation, recovery & activation.
 */
import type { PersistedGeospatialState } from './geospatialRepository';
import type { BoundaryVersionRecord, PointOfInterestRecord, PolygonGeometry } from './types';
import { validatePolygonGeometry } from './coordinateAndPolygonEngine';

export const GEOSPATIAL_SNAPSHOT_SCHEMA = 'geospatial_state_v1';

export type GeospatialPersistenceHealth = 'READY' | 'DEGRADED' | 'BLOCKED' | 'RECOVERING';

export interface GeospatialRecordCounts {
  boundaryEntities: number;
  activeBoundaries: number;
  poiRecords: number;
  spatialListingCities: number;
  spatialListings: number;
  overlayLayers: number;
  importBatches: number;
}

export interface GeospatialRecoveryReport {
  health: GeospatialPersistenceHealth;
  schemaVersion: string;
  snapshotRevision?: number;
  recordCounts: GeospatialRecordCounts;
  validationErrors: string[];
  recoveryRequirement?: string;
  activated: boolean;
}

let persistenceHealth: GeospatialPersistenceHealth = 'READY';
let lastRecoveryReport: GeospatialRecoveryReport | null = null;
let recoveryInFlight: Promise<GeospatialRecoveryReport> | null = null;
let stagedSnapshot: PersistedGeospatialState | null = null;

const IRAN_LAT = { min: 24, max: 40.5 };
const IRAN_LNG = { min: 44, max: 64 };

export function getGeospatialPersistenceHealth(): GeospatialPersistenceHealth {
  return persistenceHealth;
}

export function getLastGeospatialRecoveryReport(): GeospatialRecoveryReport | null {
  return lastRecoveryReport;
}

export function resetGeospatialRecoveryStateForTests(): void {
  persistenceHealth = 'READY';
  lastRecoveryReport = null;
  recoveryInFlight = null;
  stagedSnapshot = null;
}

export function getGeospatialRecordCounts(state: PersistedGeospatialState): GeospatialRecordCounts {
  return countRecords(state);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pushValidationError(errors: string[], limit: number, message: string): void {
  if (errors.length < limit) errors.push(message);
}

function countRecords(state: PersistedGeospatialState): GeospatialRecordCounts {
  const boundaryStore = isPlainRecord(state?.boundaryHistoryByEntity) ? state.boundaryHistoryByEntity : {};
  const poiStore = isPlainRecord(state?.poiStore) ? state.poiStore : {};
  const listingsStore = isPlainRecord(state?.spatialListingsByCity) ? state.spatialListingsByCity : {};
  const overlayStore = isPlainRecord(state?.overlayStore) ? state.overlayStore : {};
  const importBatches = isPlainRecord(state?.importBatches) ? state.importBatches : {};

  let activeBoundaries = 0;
  for (const history of Object.values(boundaryStore)) {
    if (!Array.isArray(history)) continue;
    for (const record of history) {
      if (isPlainRecord(record) && record.status === 'ACTIVE') activeBoundaries += 1;
    }
  }

  let spatialListingCities = 0;
  let spatialListings = 0;
  for (const listings of Object.values(listingsStore)) {
    if (!isPlainRecord(listings)) continue;
    spatialListingCities += 1;
    spatialListings += Object.keys(listings).length;
  }

  return {
    boundaryEntities: Object.keys(boundaryStore).length,
    activeBoundaries,
    poiRecords: Object.keys(poiStore).length,
    spatialListingCities,
    spatialListings,
    overlayLayers: Object.keys(overlayStore).length,
    importBatches: Object.keys(importBatches).length,
  };
}

function isFiniteCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= IRAN_LAT.min && lat <= IRAN_LAT.max
    && lng >= IRAN_LNG.min && lng <= IRAN_LNG.max;
}

function validateBoundary(
  value: unknown,
  entityKey: string,
  errors: string[],
  limit: number,
): value is BoundaryVersionRecord {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `BOUNDARY_RECORD_NOT_OBJECT:${entityKey}`);
    return false;
  }

  const record = value;
  if (typeof record.id !== 'string' || !record.id.trim()) {
    pushValidationError(errors, limit, `BOUNDARY_MISSING_ID:${entityKey}`);
  }
  if (typeof record.entityId !== 'string' || !record.entityId.trim()) {
    pushValidationError(errors, limit, `BOUNDARY_MISSING_ENTITY_ID:${entityKey}`);
  } else if (record.entityId !== entityKey) {
    pushValidationError(errors, limit, `BOUNDARY_ENTITY_KEY_MISMATCH:${entityKey}:${record.entityId}`);
  }
  if (
    typeof record.version !== 'number'
    || !Number.isSafeInteger(record.version)
    || record.version < 1
  ) {
    pushValidationError(errors, limit, `BOUNDARY_VERSION_INVALID:${String(record.id ?? entityKey)}`);
  }
  if (!['ACTIVE', 'SUPERSEDED', 'PENDING_REVIEW', 'REJECTED'].includes(String(record.status))) {
    pushValidationError(errors, limit, `BOUNDARY_STATUS_INVALID:${String(record.id ?? entityKey)}`);
  }

  const bbox = isPlainRecord(record.boundingBox) ? record.boundingBox : null;
  const minLat = bbox?.minLat;
  const maxLat = bbox?.maxLat;
  const minLng = bbox?.minLng;
  const maxLng = bbox?.maxLng;
  const numbersValid = [minLat, maxLat, minLng, maxLng].every(
    (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
  );
  if (
    !numbersValid
    || !isFiniteCoord(minLat as number, minLng as number)
    || !isFiniteCoord(maxLat as number, maxLng as number)
    || (minLat as number) > (maxLat as number)
    || (minLng as number) > (maxLng as number)
  ) {
    pushValidationError(errors, limit, `BOUNDARY_BBOX_INVALID:${String(record.id ?? entityKey)}`);
  }

  // Snapshot recovery must not trust persisted geometry or a caller-supplied bbox.
  // A stale but plausible bbox can otherwise hide a real polygon from point lookup.
  const geometryReport = validatePolygonGeometry(record.geometry as PolygonGeometry);
  if (!geometryReport.valid || !geometryReport.boundingBox) {
    const issueCodes = geometryReport.issues.map((issue) => issue.code).join(',');
    pushValidationError(
      errors,
      limit,
      `BOUNDARY_GEOMETRY_INVALID:${String(record.id ?? entityKey)}:${issueCodes || 'NO_BOUNDS'}`,
    );
  } else if (numbersValid) {
    const expected = geometryReport.boundingBox;
    const tolerance = 1e-6;
    const matchesGeometry = Math.abs((minLat as number) - expected.minLat) <= tolerance
      && Math.abs((maxLat as number) - expected.maxLat) <= tolerance
      && Math.abs((minLng as number) - expected.minLng) <= tolerance
      && Math.abs((maxLng as number) - expected.maxLng) <= tolerance;
    if (!matchesGeometry) {
      pushValidationError(errors, limit, `BOUNDARY_BBOX_GEOMETRY_MISMATCH:${String(record.id ?? entityKey)}`);
    }
  }

  const simplifiedReport = validatePolygonGeometry(record.simplifiedGeometry as PolygonGeometry);
  if (!simplifiedReport.valid || !simplifiedReport.boundingBox) {
    const issueCodes = simplifiedReport.issues.map((issue) => issue.code).join(',');
    pushValidationError(
      errors,
      limit,
      `BOUNDARY_SIMPLIFIED_GEOMETRY_INVALID:${String(record.id ?? entityKey)}:${issueCodes || 'NO_BOUNDS'}`,
    );
  }
  return true;
}

function validatePoi(value: unknown, poiKey: string, errors: string[], limit: number): void {
  if (!isPlainRecord(value)) {
    pushValidationError(errors, limit, `POI_RECORD_NOT_OBJECT:${poiKey}`);
    return;
  }
  if (typeof value.id !== 'string' || value.id !== poiKey) {
    pushValidationError(errors, limit, `POI_ID_KEY_MISMATCH:${poiKey}`);
  }
  const coordinates = value.coordinates;
  if (
    !isPlainRecord(coordinates)
    || typeof coordinates.lat !== 'number'
    || typeof coordinates.lng !== 'number'
    || !isFiniteCoord(coordinates.lat, coordinates.lng)
  ) {
    pushValidationError(errors, limit, `POI_COORDINATES_INVALID:${String(value.id ?? poiKey)}`);
  }
  if (typeof value.dedupeKey !== 'string' || !value.dedupeKey.trim()) {
    pushValidationError(errors, limit, `POI_MISSING_DEDUPE_KEY:${String(value.id ?? poiKey)}`);
  }
}

export function validatePersistedGeospatialState(
  state: unknown,
  options?: { maxErrors?: number },
): { valid: boolean; errors: string[]; counts: GeospatialRecordCounts } {
  const requestedMaxErrors = options?.maxErrors ?? 12;
  const maxErrors = Number.isSafeInteger(requestedMaxErrors) && requestedMaxErrors > 0
    ? Math.min(requestedMaxErrors, 1000)
    : 12;
  const errors: string[] = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, errors: ['GEOSPATIAL_STATE_NOT_OBJECT'], counts: countRecords(defaultEmpty()) };
  }
  const s = state as PersistedGeospatialState;
  for (const required of [
    'boundaryHistoryByEntity',
    'poiStore',
    'poiDedupeIndex',
    'spatialListingsByCity',
    'overlayStore',
    'importBatches',
  ] as const) {
    if (!isPlainRecord(s[required])) {
      errors.push(`GEOSPATIAL_MISSING_FIELD_${required}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors, counts: countRecords(defaultEmpty()) };
  }
  const seenBoundaryIds = new Set<string>();
  for (const [entityKey, history] of Object.entries(s.boundaryHistoryByEntity)) {
    if (!Array.isArray(history)) {
      pushValidationError(errors, maxErrors, `BOUNDARY_HISTORY_NOT_ARRAY:${entityKey}`);
      continue;
    }

    const seenVersions = new Set<number>();
    let previousVersion = 0;
    let activeCount = 0;
    for (const value of history) {
      const validRecord = validateBoundary(value, entityKey, errors, maxErrors);
      if (!validRecord) continue;
      const record = value;

      if (typeof record.id === 'string' && record.id.trim()) {
        if (seenBoundaryIds.has(record.id)) {
          pushValidationError(errors, maxErrors, `BOUNDARY_ID_DUPLICATE:${record.id}`);
        }
        seenBoundaryIds.add(record.id);
      }
      if (typeof record.version === 'number' && Number.isSafeInteger(record.version) && record.version > 0) {
        if (seenVersions.has(record.version)) {
          pushValidationError(errors, maxErrors, `BOUNDARY_VERSION_DUPLICATE:${entityKey}:${record.version}`);
        }
        if (record.version <= previousVersion) {
          pushValidationError(errors, maxErrors, `BOUNDARY_VERSION_SEQUENCE_INVALID:${entityKey}`);
        }
        seenVersions.add(record.version);
        previousVersion = record.version;
      }
      if (record.status === 'ACTIVE') activeCount += 1;
    }

    if (activeCount > 1) {
      pushValidationError(errors, maxErrors, `BOUNDARY_MULTIPLE_ACTIVE_VERSIONS:${entityKey}`);
    }
  }

  for (const [poiKey, poi] of Object.entries(s.poiStore)) {
    validatePoi(poi, poiKey, errors, maxErrors);
  }

  const counts = countRecords(s);
  return { valid: errors.length === 0, errors, counts };
}

function defaultEmpty(): PersistedGeospatialState {
  return {
    boundaryHistoryByEntity: {},
    poiStore: {},
    poiDedupeIndex: {},
    spatialListingsByCity: {},
    overlayStore: {},
    importBatches: {},
  };
}

export function hasAuthoritativeGeospatialMinimum(counts: GeospatialRecordCounts): boolean {
  return (
    counts.activeBoundaries > 0 ||
    counts.poiRecords > 0 ||
    counts.spatialListings > 0 ||
    counts.overlayLayers > 0 ||
    counts.importBatches > 0
  );
}

export function assessGeospatialSnapshot(
  state: PersistedGeospatialState,
  context: { remoteSnapshotPresent: boolean; schemaVersion?: string; snapshotRevision?: number },
): GeospatialRecoveryReport {
  const validation = validatePersistedGeospatialState(state);
  const recordCounts = validation.counts;
  let health: GeospatialPersistenceHealth = 'READY';
  let recoveryRequirement: string | undefined;
  const validationErrors = [...validation.errors];

  if (!validation.valid) {
    health = 'BLOCKED';
    recoveryRequirement =
      'Geospatial snapshot failed structural validation; restore from a verified R2 snapshot or run operator migration.';
  } else if (!hasAuthoritativeGeospatialMinimum(recordCounts)) {
    health = context.remoteSnapshotPresent ? 'BLOCKED' : 'BLOCKED';
    recoveryRequirement = context.remoteSnapshotPresent
      ? 'Geospatial remote snapshot exists but contains no authoritative records; operator backfill required.'
      : 'No geospatial durable snapshot; upload verified local snapshot via controlled migration (dry-run first).';
    validationErrors.push('GEOSPATIAL_NO_AUTHORITATIVE_MINIMUM');
  }

  return {
    health,
    schemaVersion: context.schemaVersion ?? GEOSPATIAL_SNAPSHOT_SCHEMA,
    snapshotRevision: context.snapshotRevision,
    recordCounts,
    validationErrors,
    recoveryRequirement,
    activated: health === 'READY',
  };
}

export function stageGeospatialSnapshotForActivation(candidate: PersistedGeospatialState): GeospatialRecoveryReport {
  const validation = validatePersistedGeospatialState(candidate);
  if (!validation.valid || !hasAuthoritativeGeospatialMinimum(validation.counts)) {
    stagedSnapshot = null;
    const report = assessGeospatialSnapshot(candidate, { remoteSnapshotPresent: false });
    lastRecoveryReport = { ...report, health: 'BLOCKED', activated: false };
    persistenceHealth = 'BLOCKED';
    return lastRecoveryReport;
  }
  stagedSnapshot = structuredClone(candidate);
  const report: GeospatialRecoveryReport = {
    health: 'READY',
    schemaVersion: GEOSPATIAL_SNAPSHOT_SCHEMA,
    recordCounts: validation.counts,
    validationErrors: [],
    activated: false,
  };
  lastRecoveryReport = report;
  return report;
}

export async function activateStagedGeospatialSnapshot(options?: {
  persist?: (state: PersistedGeospatialState) => Promise<void>;
}): Promise<GeospatialRecoveryReport> {
  if (!stagedSnapshot) {
    const blocked: GeospatialRecoveryReport = {
      health: 'BLOCKED',
      schemaVersion: GEOSPATIAL_SNAPSHOT_SCHEMA,
      recordCounts: countRecords(defaultEmpty()),
      validationErrors: ['GEOSPATIAL_NO_STAGED_SNAPSHOT'],
      recoveryRequirement: 'Stage a validated snapshot before activation.',
      activated: false,
    };
    persistenceHealth = 'BLOCKED';
    lastRecoveryReport = blocked;
    return blocked;
  }
  const validation = validatePersistedGeospatialState(stagedSnapshot);
  if (!validation.valid) {
    persistenceHealth = 'BLOCKED';
    const report = assessGeospatialSnapshot(stagedSnapshot, { remoteSnapshotPresent: true });
    lastRecoveryReport = { ...report, activated: false };
    return lastRecoveryReport;
  }
  if (options?.persist) {
    try {
      await options.persist(stagedSnapshot);
    } catch (error) {
      persistenceHealth = 'BLOCKED';
      const report: GeospatialRecoveryReport = {
        health: 'BLOCKED',
        schemaVersion: GEOSPATIAL_SNAPSHOT_SCHEMA,
        recordCounts: validation.counts,
        validationErrors: [error instanceof Error ? error.message : 'GEOSPATIAL_PERSIST_FAILED'],
        recoveryRequirement: 'Remote persistence failed; previous version remains active.',
        activated: false,
      };
      lastRecoveryReport = report;
      return report;
    }
  }
  persistenceHealth = 'READY';
  const report: GeospatialRecoveryReport = {
    health: 'READY',
    schemaVersion: GEOSPATIAL_SNAPSHOT_SCHEMA,
    recordCounts: validation.counts,
    validationErrors: [],
    activated: true,
  };
  lastRecoveryReport = report;
  return report;
}

export async function runGeospatialDurableRecovery(params: {
  hydratedState: PersistedGeospatialState;
  remoteSnapshotPresent: boolean;
  snapshotRevision?: number;
  activateOnSuccess?: boolean;
  persist?: (state: PersistedGeospatialState) => Promise<void>;
}): Promise<GeospatialRecoveryReport> {
  if (recoveryInFlight) return recoveryInFlight;
  persistenceHealth = 'RECOVERING';
  recoveryInFlight = (async () => {
    try {
      const assessment = assessGeospatialSnapshot(params.hydratedState, {
        remoteSnapshotPresent: params.remoteSnapshotPresent,
        snapshotRevision: params.snapshotRevision,
      });
      if (assessment.health !== 'READY') {
        persistenceHealth = 'BLOCKED';
        lastRecoveryReport = { ...assessment, activated: false };
        return lastRecoveryReport;
      }
      stageGeospatialSnapshotForActivation(params.hydratedState);
      if (params.activateOnSuccess) {
        return activateStagedGeospatialSnapshot({ persist: params.persist });
      }
      persistenceHealth = 'READY';
      lastRecoveryReport = { ...assessment, activated: true };
      return lastRecoveryReport;
    } finally {
      recoveryInFlight = null;
    }
  })();
  return recoveryInFlight;
}