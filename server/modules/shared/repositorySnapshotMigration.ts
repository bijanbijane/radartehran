/**
 * RT-INFRA-008 — Idempotent local → remote repository snapshot migration (dry-run default).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getRepositoryBaseDir } from './atomicJsonRepository';
import { REPOSITORY_FILE_CLASSIFICATION } from './repositoryPersistencePolicy';
import { loadRepositorySnapshot } from './durableRepositorySnapshotStore';
import {
  buildGeospatialPreMigrationReport,
  GEO_REPOSITORY_FILE,
  type GeospatialPreMigrationReport,
} from './geospatialRepositoryMigration';

export interface RepositoryMigrationRow {
  fileName: string;
  classification: string;
  localExists: boolean;
  remoteExists: boolean;
  localSha256?: string;
  remoteSha256?: string;
  action: 'SKIP' | 'WOULD_UPLOAD' | 'CONFLICT' | 'INVALID_LOCAL';
  detail?: string;
}

export interface RepositoryMigrationReport {
  dryRun: boolean;
  scanned: number;
  wouldUpload: number;
  conflicts: number;
  invalid: number;
  rows: RepositoryMigrationRow[];
  /** Present when `geospatial` is included in `fileNames` */
  geospatialPreMigration?: GeospatialPreMigrationReport;
}

export async function runRepositorySnapshotMigrationDryRun(options?: {
  dryRun?: boolean;
  fileNames?: string[];
}): Promise<RepositoryMigrationReport> {
  const dryRun = options?.dryRun !== false;
  const names = options?.fileNames ?? Object.keys(REPOSITORY_FILE_CLASSIFICATION);
  const base = getRepositoryBaseDir();
  const rows: RepositoryMigrationRow[] = [];

  for (const fileName of names) {
    const filePath = path.join(base, fileName);
    let localSha: string | undefined;
    let localExists = false;
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw.trim()) {
          localExists = true;
          JSON.parse(raw);
          localSha = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
        }
      }
    } catch {
      rows.push({
        fileName,
        classification: REPOSITORY_FILE_CLASSIFICATION[fileName]?.class ?? 'UNRESOLVED',
        localExists: true,
        remoteExists: false,
        action: 'INVALID_LOCAL',
        detail: 'Local JSON unreadable or corrupt',
      });
      continue;
    }

    const remoteRaw = await loadRepositorySnapshot(fileName);
    const remoteExists = Boolean(remoteRaw && remoteRaw.trim());
    const remoteSha = remoteRaw
      ? crypto.createHash('sha256').update(remoteRaw, 'utf-8').digest('hex')
      : undefined;

    let action: RepositoryMigrationRow['action'] = 'SKIP';
    let detail: string | undefined;
    if (!localExists && !remoteExists) action = 'SKIP';
    else if (localExists && !remoteExists) action = 'WOULD_UPLOAD';
    else if (localExists && remoteExists && localSha !== remoteSha) {
      action = 'CONFLICT';
      detail = 'Local and remote checksums differ';
    }

    rows.push({
      fileName,
      classification: REPOSITORY_FILE_CLASSIFICATION[fileName]?.class ?? 'UNRESOLVED',
      localExists,
      remoteExists,
      localSha256: localSha,
      remoteSha256: remoteSha,
      action,
      detail,
    });
  }

  const report: RepositoryMigrationReport = {
    dryRun,
    scanned: rows.length,
    wouldUpload: rows.filter((r) => r.action === 'WOULD_UPLOAD').length,
    conflicts: rows.filter((r) => r.action === 'CONFLICT').length,
    invalid: rows.filter((r) => r.action === 'INVALID_LOCAL').length,
    rows,
  };

  if (names.includes(GEO_REPOSITORY_FILE)) {
    report.geospatialPreMigration = await buildGeospatialPreMigrationReport();
  }

  return report;
}

export { runGeospatialOperatorMigration, buildGeospatialPreMigrationReport } from './geospatialRepositoryMigration';