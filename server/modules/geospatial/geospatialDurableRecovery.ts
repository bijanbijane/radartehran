/**
 * RT-INFRA-009 — Deterministic geospatial snapshot validation, recovery & activation.
 */
import type { PersistedGeospatialState } from './geospatialRepository';
import { countRecords, defaultEmpty, validatePersistedGeospatialState } from './geospatialSnapshotValidation';
export { validatePersistedGeospatialState } from './geospatialSnapshotValidation';

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
    // Assessment is read-only; only activateStagedGeospatialSnapshot can activate.
    activated: false,
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

export async function activateStagedGeospatialSnapshot(options: {
  persist: (state: PersistedGeospatialState) => Promise<void>;
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
  persistenceHealth = 'RECOVERING';
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
        if (!params.persist) {
          persistenceHealth = 'BLOCKED';
          lastRecoveryReport = {
            ...assessment,
            health: 'BLOCKED',
            validationErrors: ['GEOSPATIAL_RECOVERY_PERSISTOR_REQUIRED'],
            recoveryRequirement: 'A durable persistence adapter is required before snapshot activation.',
            activated: false,
          };
          return lastRecoveryReport;
        }
        return activateStagedGeospatialSnapshot({ persist: params.persist });
      }
      // Validation and staging do not activate the candidate. Keep the report
      // explicit so callers cannot mistake a staged snapshot for an activated one.
      persistenceHealth = 'READY';
      lastRecoveryReport = { ...assessment, activated: false };
      return lastRecoveryReport;
    } finally {
      recoveryInFlight = null;
    }
  })();
  return recoveryInFlight;
}