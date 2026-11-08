/**
 * @file worker/db/types.ts
 * @description Cloudflare D1 database types, binding contracts,
 * migration registry definitions, and query execution models.
 */

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    served_by?: string;
    changes?: number;
    last_row_id?: number;
    changed_db?: boolean;
    size_after?: number;
    rows_read?: number;
    rows_written?: number;
  };
  error?: string;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

/**
 * Official Cloudflare D1 Database Binding contract.
 */
export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export type StorageWorkloadAffinity =
  | 'FIRESTORE_AUTHORITATIVE'
  | 'D1_RELATIONAL_CANDIDATE'
  | 'OBJECT_STORAGE_R2'
  | 'KV_EDGE_CACHE'
  | 'ANALYTICAL_NDJSON_OR_WAREHOUSE';

export interface DatabaseInventoryRecord {
  readonly identifier: string;
  readonly entityType: 'COLLECTION' | 'SQL_TABLE' | 'FILE_INDEX';
  readonly purpose: string;
  readonly authoritativeStore: 'FIRESTORE' | 'CLOUDFLARE_D1' | 'R2_STORAGE' | 'LOCAL_CACHE';
  readonly readPattern: string;
  readonly writePattern: string;
  readonly queryPattern: string;
  readonly privacyClassification: 'PUBLIC' | 'AUTHENTICATED_USER' | 'ADMIN_RESTRICTED' | 'SENSITIVE_PII';
  readonly migrationComplexity: 'TRIVIAL' | 'MODERATE' | 'HIGH' | 'CRITICAL_LEAVE_IN_PLACE';
  readonly workloadAffinity: StorageWorkloadAffinity;
  readonly rationale: string;
}

export interface AppliedMigrationRecord {
  readonly migrationId: string;
  readonly migration_id?: string;
  readonly name: string;
  readonly checksumSha256: string;
  readonly checksum_sha256?: string;
  readonly appliedAtIso: string;
  readonly applied_at_iso?: string;
  readonly executionDurationMs: number;
  readonly execution_duration_ms?: number;
  readonly statementCount: number;
  readonly statement_count?: number;
}

export interface MigrationFile {
  readonly id: string;
  readonly name: string;
  readonly sql: string;
  readonly checksumSha256: string;
  readonly description: string;
}

export type ReconciliationMatchStatus =
  | 'MATCHED'
  | 'MISSING_SOURCE'
  | 'MISSING_DESTINATION'
  | 'CONTENT_MISMATCH'
  | 'RELATIONSHIP_MISMATCH'
  | 'DUPLICATE'
  | 'INVALID'
  | 'UNRESOLVED';

export interface DataReconciliationItem {
  readonly entityKey: string;
  readonly status: ReconciliationMatchStatus;
  readonly sourceChecksum?: string;
  readonly destinationChecksum?: string;
  readonly discrepancies?: Record<string, { source: unknown; destination: unknown }>;
  readonly notes?: string;
}

export interface ReconciliationReport {
  readonly evaluatedAtIso: string;
  readonly domainName: string;
  readonly totalSourceScanned: number;
  readonly totalDestinationScanned: number;
  readonly counts: Record<ReconciliationMatchStatus, number>;
  readonly discrepancies: DataReconciliationItem[];
  readonly passed: boolean;
}
