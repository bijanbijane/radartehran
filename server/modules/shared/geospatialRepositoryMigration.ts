/**
 * RT-INFRA-009 §5 — Operator-controlled geospatial repository migration (dry-run default).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getRepositoryBaseDir } from './atomicJsonRepository';
import { REPOSITORY_FILE_CLASSIFICATION } from './repositoryPersistencePolicy';
import {
  getRepositorySnapshotRegistryMeta,
  loadRepositorySnapshot,
  persistRepositorySnapshotControlled,
} from './durableRepositorySnapshotStore';
import {
  assessGeospatialSnapshot,
  getGeospatialRecordCounts,
  validatePersistedGeospatialState,
  type GeospatialRecoveryReport,
} from '../geospatial/geospatialDurableRecovery';
import type { PersistedGeospatialState } from '../geospatial/geospatialRepository';

export const GEO_REPOSITORY_FILE = 'geospatial-state.json';

export interface GeospatialPreMigrationReport {
  sourceRecordCount: GeospatialRecordCountSummary;
  targetRecordCount: GeospatialRecordCountSummary;
  sourceSha256?: string;
  targetSha256?: string;
  snapshotRevision?: number;
  duplicateRecordCount: number;
  conflictCount: number;
  invalidRecordCount: number;
  missingRequiredFields: string[];
  ownershipValidation: {
    classification: string;
    authoritativeMinimumMet: boolean;
    recoveryHealth: GeospatialRecoveryReport['health'];
  };
  migrationEligible: boolean;
  eligibilityReason?: string;
}

export interface GeospatialRecordCountSummary {
  boundaryEntities: number;
  activeBoundaries: number;
  poiRecords: number;
  spatialListings: number;
  importBatches: number;
  total: number;
}

export interface GeospatialOperatorMigrationReport {
  mode: 'DRY_RUN' | 'EXECUTE';
  executeAuthorized: boolean;
  productionAuthorized: boolean;
  preMigration: GeospatialPreMigrationReport;
  action:
    | 'SKIP'
    | 'WOULD_UPLOAD'
    | 'EXECUTED'
    | 'REJECTED_INVALID'
    | 'CONFLICT'
    | 'NOT_AUTHORIZED'
    | 'PRODUCTION_NOT_AUTHORIZED'
    | 'PERSIST_FAILED';
  detail?: string;
  reconciliation?: {
    localFileIntact: boolean;
    localSha256Unchanged?: string;
    registryRevision?: number;
    registryVerified: boolean;
    r2Verified: boolean;
    idempotent: boolean;
    partialR2ObjectKey?: string;
  };
  recoveryPreview: GeospatialRecoveryReport;
}

export interface GeospatialOperatorMigrationOptions {
  /** Default true */
  dryRun?: boolean;
  /** Explicit execute — requires dryRun: false */
  execute?: boolean;
  /** Explicit production authorization — required in NODE_ENV=production */
  authorizeProduction?: boolean;
  env?: Record<string, string | undefined>;
}

function summarizeCounts(state: PersistedGeospatialState): GeospatialRecordCountSummary {
  const c = getGeospatialRecordCounts(state);
  return {
    boundaryEntities: c.boundaryEntities,
    activeBoundaries: c.activeBoundaries,
    poiRecords: c.poiRecords,
    spatialListings: c.spatialListings,
    importBatches: c.importBatches,
    total:
      c.boundaryEntities +
      c.poiRecords +
      c.spatialListings +
      c.overlayLayers +
      c.importBatches,
  };
}

function countDuplicateIdentifiers(state: PersistedGeospatialState): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const poi of Object.values(state.poiStore)) {
    if (seen.has(poi.id)) dupes += 1;
    else seen.add(poi.id);
  }
  for (const history of Object.values(state.boundaryHistoryByEntity)) {
    for (const b of history) {
      if (seen.has(b.id)) dupes += 1;
      else seen.add(b.id);
    }
  }
  return dupes;
}

function loadLocalGeospatialFile(): {
  localExists: boolean;
  raw?: string;
  state: PersistedGeospatialState | null;
  localSha?: string;
  parseError?: boolean;
} {
  const filePath = path.join(getRepositoryBaseDir(), GEO_REPOSITORY_FILE);
  try {
    if (!fs.existsSync(filePath)) return { localExists: false, state: null };
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return { localExists: false, state: null };
    const localSha = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
    const parsed = JSON.parse(raw) as PersistedGeospatialState;
    const validation = validatePersistedGeospatialState(parsed);
    if (!validation.valid) {
      return {
        localExists: true,
        raw,
        localSha,
        state: null,
        parseError: true,
      };
    }
    return { localExists: true, raw, localSha, state: parsed };
  } catch {
    return { localExists: true, state: null, parseError: true };
  }
}

async function loadRemoteGeospatialState(): Promise<{
  remoteExists: boolean;
  raw?: string;
  state: PersistedGeospatialState | null;
  remoteSha?: string;
  revision?: number;
}> {
  const raw = await loadRepositorySnapshot(GEO_REPOSITORY_FILE);
  const meta = await getRepositorySnapshotRegistryMeta(GEO_REPOSITORY_FILE);
  if (!raw || !raw.trim()) {
    return { remoteExists: false, state: null, revision: meta?.revision };
  }
  const remoteSha = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
  try {
    const parsed = JSON.parse(raw) as PersistedGeospatialState;
    const validation = validatePersistedGeospatialState(parsed);
    return {
      remoteExists: true,
      raw,
      remoteSha,
      state: validation.valid ? parsed : null,
      revision: meta?.revision,
    };
  } catch {
    return { remoteExists: true, raw, remoteSha, state: null, revision: meta?.revision };
  }
}

export async function buildGeospatialPreMigrationReport(): Promise<GeospatialPreMigrationReport> {
  const local = loadLocalGeospatialFile();
  const remote = await loadRemoteGeospatialState();
  const empty: PersistedGeospatialState = {
    boundaryHistoryByEntity: {},
    poiStore: {},
    poiDedupeIndex: {},
    spatialListingsByCity: {},
    overlayStore: {},
    importBatches: {},
  };

  const validation = local.state ? validatePersistedGeospatialState(local.state) : { valid: false, errors: [] as string[] };
  const recoveryPreview = assessGeospatialSnapshot(local.state ?? empty, {
    remoteSnapshotPresent: remote.remoteExists,
    snapshotRevision: remote.revision,
  });

  const duplicateRecordCount = local.state ? countDuplicateIdentifiers(local.state) : 0;
  const conflictCount =
    local.localSha && remote.remoteSha && local.localSha !== remote.remoteSha ? 1 : 0;
  const invalidRecordCount = validation.errors.length + (local.parseError ? 1 : 0);

  const missingRequiredFields = validation.errors.filter((e) => e.startsWith('GEOSPATIAL_MISSING_FIELD_'));

  let migrationEligible = false;
  let eligibilityReason: string | undefined;
  if (!local.localExists || !local.state) {
    eligibilityReason = 'No valid local geospatial source file.';
  } else if (duplicateRecordCount > 0) {
    eligibilityReason = 'Duplicate identifiers in local dataset.';
  } else if (recoveryPreview.health !== 'READY') {
    eligibilityReason = recoveryPreview.recoveryRequirement;
  } else if (conflictCount > 0) {
    eligibilityReason = 'Local and remote checksums differ; reconcile before execute.';
  } else if (local.localSha && remote.remoteSha && local.localSha === remote.remoteSha) {
    migrationEligible = true;
    eligibilityReason = 'Already synced (idempotent skip).';
  } else if (!remote.remoteExists) {
    migrationEligible = true;
  } else {
    eligibilityReason = 'Remote target exists with different content.';
  }

  return {
    sourceRecordCount: summarizeCounts(local.state ?? empty),
    targetRecordCount: summarizeCounts(remote.state ?? empty),
    sourceSha256: local.localSha,
    targetSha256: remote.remoteSha,
    snapshotRevision: remote.revision,
    duplicateRecordCount,
    conflictCount,
    invalidRecordCount,
    missingRequiredFields,
    ownershipValidation: {
      classification: REPOSITORY_FILE_CLASSIFICATION[GEO_REPOSITORY_FILE]?.class ?? 'UNRESOLVED',
      authoritativeMinimumMet: recoveryPreview.recordCounts
        ? getGeospatialRecordCounts(local.state ?? empty).activeBoundaries > 0 ||
          getGeospatialRecordCounts(local.state ?? empty).poiRecords > 0 ||
          getGeospatialRecordCounts(local.state ?? empty).spatialListings > 0 ||
          getGeospatialRecordCounts(local.state ?? empty).importBatches > 0
        : false,
      recoveryHealth: recoveryPreview.health,
    },
    migrationEligible,
    eligibilityReason,
  };
}

export async function runGeospatialOperatorMigration(
  options?: GeospatialOperatorMigrationOptions,
): Promise<GeospatialOperatorMigrationReport> {
  const env = options?.env ?? process.env;
  const dryRun = options?.dryRun !== false;
  const execute = options?.execute === true;
  const authorizeProduction = options?.authorizeProduction === true;

  const preMigration = await buildGeospatialPreMigrationReport();
  const local = loadLocalGeospatialFile();
  const remote = await loadRemoteGeospatialState();
  const empty: PersistedGeospatialState = {
    boundaryHistoryByEntity: {},
    poiStore: {},
    poiDedupeIndex: {},
    spatialListingsByCity: {},
    overlayStore: {},
    importBatches: {},
  };
  const recoveryPreview = assessGeospatialSnapshot(local.state ?? empty, {
    remoteSnapshotPresent: remote.remoteExists,
    snapshotRevision: remote.revision,
  });

  if (execute && dryRun) {
    return {
      mode: 'DRY_RUN',
      executeAuthorized: false,
      productionAuthorized: false,
      preMigration,
      action: 'NOT_AUTHORIZED',
      detail: 'execute:true requires dryRun:false',
      recoveryPreview,
    };
  }

  if (execute && env.NODE_ENV === 'production') {
    const prodFlag = env.RADAR_GEO_MIGRATION_AUTHORIZE === '1' || env.RADAR_GEO_MIGRATION_AUTHORIZE === 'true';
    if (!authorizeProduction || !prodFlag) {
      return {
        mode: 'EXECUTE',
        executeAuthorized: false,
        productionAuthorized: false,
        preMigration,
        action: 'PRODUCTION_NOT_AUTHORIZED',
        detail: 'Set authorizeProduction:true and RADAR_GEO_MIGRATION_AUTHORIZE=1',
        recoveryPreview,
      };
    }
  }

  if (!local.state || local.parseError) {
    return {
      mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
      executeAuthorized: execute,
      productionAuthorized: authorizeProduction,
      preMigration,
      action: 'REJECTED_INVALID',
      detail: 'Local source missing or failed validation',
      recoveryPreview,
    };
  }

  if (preMigration.conflictCount > 0) {
    return {
      mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
      executeAuthorized: execute,
      productionAuthorized: authorizeProduction,
      preMigration,
      action: 'CONFLICT',
      detail: 'Checksum conflict with existing remote snapshot',
      recoveryPreview,
    };
  }

  if (preMigration.sourceSha256 && preMigration.targetSha256 && preMigration.sourceSha256 === preMigration.targetSha256) {
    return {
      mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
      executeAuthorized: execute,
      productionAuthorized: authorizeProduction,
      preMigration,
      action: 'SKIP',
      detail: 'Idempotent: local matches remote registry',
      reconciliation: {
        localFileIntact: local.localExists,
        localSha256Unchanged: local.localSha,
        registryRevision: remote.revision,
        registryVerified: true,
        r2Verified: true,
        idempotent: true,
      },
      recoveryPreview,
    };
  }

  if (!preMigration.migrationEligible) {
    return {
      mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
      executeAuthorized: execute,
      productionAuthorized: authorizeProduction,
      preMigration,
      action: 'REJECTED_INVALID',
      detail: preMigration.eligibilityReason,
      recoveryPreview,
    };
  }

  if (!execute || dryRun) {
    return {
      mode: 'DRY_RUN',
      executeAuthorized: false,
      productionAuthorized: authorizeProduction,
      preMigration,
      action: 'WOULD_UPLOAD',
      recoveryPreview,
    };
  }

  const raw = local.raw ?? JSON.stringify(local.state);
  const outcome = await persistRepositorySnapshotControlled(GEO_REPOSITORY_FILE, raw);
  const filePath = path.join(getRepositoryBaseDir(), GEO_REPOSITORY_FILE);
  const localStillExists = fs.existsSync(filePath);
  const localShaAfter = localStillExists
    ? crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf-8'), 'utf-8').digest('hex')
    : undefined;

  if (!outcome.ok) {
    return {
      mode: 'EXECUTE',
      executeAuthorized: true,
      productionAuthorized: authorizeProduction || env.NODE_ENV !== 'production',
      preMigration,
      action: 'PERSIST_FAILED',
      detail: outcome.message ?? outcome.code,
      reconciliation: {
        localFileIntact: localStillExists,
        localSha256Unchanged: localShaAfter,
        registryVerified: outcome.registryVerified,
        r2Verified: Boolean(outcome.verifiedRemoteSha256),
        idempotent: false,
        partialR2ObjectKey: outcome.partialR2ObjectKey,
      },
      recoveryPreview,
    };
  }

  return {
    mode: 'EXECUTE',
    executeAuthorized: true,
    productionAuthorized: authorizeProduction || env.NODE_ENV !== 'production',
    preMigration,
    action: outcome.idempotentSkip ? 'SKIP' : 'EXECUTED',
    detail: outcome.idempotentSkip ? 'Remote already matched checksum' : 'R2 upload and Firestore registry verified',
    reconciliation: {
      localFileIntact: localStillExists,
      localSha256Unchanged: localShaAfter === local.localSha ? local.localSha : localShaAfter,
      registryRevision: outcome.revision,
      registryVerified: outcome.registryVerified,
      r2Verified: outcome.verifiedRemoteSha256 === outcome.sha256,
      idempotent: outcome.idempotentSkip,
      partialR2ObjectKey: outcome.partialR2ObjectKey,
    },
    recoveryPreview,
  };
}

/** @deprecated Use `runGeospatialOperatorMigration` */
export async function runGeospatialRepositoryMigration(options?: {
  dryRun?: boolean;
  apply?: boolean;
}): Promise<GeospatialOperatorMigrationReport> {
  return runGeospatialOperatorMigration({
    dryRun: options?.dryRun,
    execute: options?.apply === true,
    authorizeProduction: options?.apply === true,
  });
}