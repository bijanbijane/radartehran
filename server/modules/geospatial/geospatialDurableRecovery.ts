/**
 * RT-INFRA-009 — Deterministic geospatial snapshot validation, recovery & activation.
 */
import type { PersistedGeospatialState } from './geospatialRepository';
import type { BoundaryVersionRecord, PointOfInterestRecord } from './types';

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

function countRecords(state: PersistedGeospatialState): GeospatialRecordCounts {
  let activeBoundaries = 0;
  for (const history of Object.values(state.boundaryHistoryByEntity)) {
    activeBoundaries += history.filter((b) => b.status === 'ACTIVE').length;
  }
  let spatialListings = 0;
  for (const city of Object.values(state.spatialListingsByCity)) {
    spatialListings += Object.keys(city).length;
  }
  return {
    boundaryEntities: Object.keys(state.boundaryHistoryByEntity).length,
    activeBoundaries,
    poiRecords: Object.keys(state.poiStore).length,
    spatialListingCities: Object.keys(state.spatialListingsByCity).length,
    spatialListings,
    overlayLayers: Object.keys(state.overlayStore).length,
    importBatches: Object.keys(state.importBatches).length,
  };
}

function isFiniteCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= IRAN_LAT.min && lat <= IRAN_LAT.max && lng >= IRAN_LNG.min && lng <= IRAN_LNG.max;
}

function validateBoundary(record: BoundaryVersionRecord, errors: string[], limit: number): void {
  if (errors.length >= limit) return;
  if (!record.id || !record.entityId) errors.push(`Boundary missing id/entityId (${record.entityId ?? '?'})`);
  const bb = record.boundingBox;
  if (
    !bb ||
    !isFiniteCoord(bb.minLat, bb.minLng) ||
    !isFiniteCoord(bb.maxLat, bb.maxLng) ||
    bb.minLat > bb.maxLat ||
    bb.minLng > bb.maxLng
  ) {
    errors.push(`Boundary bbox invalid (${record.id})`);
  }
}

function validatePoi(record: PointOfInterestRecord, errors: string[], limit: number): void {
  if (errors.length >= limit) return;
  const { lat, lng } = record.coordinates;
  if (!isFiniteCoord(lat, lng)) errors.push(`POI coordinates invalid (${record.id})`);
  if (!record.dedupeKey) errors.push(`POI missing dedupeKey (${record.id})`);
}

export function validatePersistedGeospatialState(
  state: unknown,
  options?: { maxErrors?: number },
): { valid: boolean; errors: string[]; counts: GeospatialRecordCounts } {
  const maxErrors = options?.maxErrors ?? 12;
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
    if (!s[required] || typeof s[required] !== 'object' || Array.isArray(s[required])) {
      errors.push(`GEOSPATIAL_MISSING_FIELD_${required}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors, counts: countRecords(defaultEmpty()) };
  }
  for (const history of Object.values(s.boundaryHistoryByEntity).slice(0, 50)) {
    for (const b of history.slice(0, 20)) validateBoundary(b, errors, maxErrors);
  }
  for (const poi of Object.values(s.poiStore).slice(0, 100)) validatePoi(poi, errors, maxErrors);

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