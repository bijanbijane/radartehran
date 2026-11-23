/**
 * Durable account lifecycle store contract — Workers/D1-ready surface (Phase A).
 * Implementations must fail-closed on unverified persistence or write-block ambiguity.
 */

import type {
  AccountDataRequestRecord,
  AccountDeletionAuditRecord,
  AccountPrivacyConsentRecord,
  DurableAccountDeletionJob,
  DurableAccountExportJob,
  DurableUserWriteBlockRecord,
} from './types.ts';
import { AccountLifecycleError, type AccountLifecycleErrorCode } from './types.ts';

export const ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION = '2026-11.account-lifecycle-store.v2';

export type AccountLifecycleStoreHealth =
  | 'HEALTHY'
  | 'DEGRADED_READONLY'
  | 'UNAVAILABLE';

export interface AccountLifecycleStoreProbeResult {
  health: AccountLifecycleStoreHealth;
  schemaVersion: string;
  checkedAtIso: string;
  detail?: string;
}

/**
 * Core store contract shared by Node journal, Firestore sync, and Cloudflare D1 adapters.
 * Extends the historical journal interface without breaking existing callers.
 */
export interface DurableAccountLifecycleStoreV2 {
  probeHealth(): Promise<AccountLifecycleStoreProbeResult>;

  getWriteBlock(targetUid: string): Promise<DurableUserWriteBlockRecord | null>;
  upsertWriteBlock(record: DurableUserWriteBlockRecord): Promise<DurableUserWriteBlockRecord>;
  /**
   * Fail-closed: throws STORE_UNAVAILABLE / WRITE_BLOCK_UNVERIFIED when persistence cannot be confirmed.
   */
  assertUserWritePermitted(targetUid: string): Promise<void>;

  getJobById(jobId: string): Promise<DurableAccountDeletionJob | null>;
  getLatestJobForUser(targetUid: string): Promise<DurableAccountDeletionJob | null>;
  createOrGetActiveJob(job: DurableAccountDeletionJob): Promise<{
    job: DurableAccountDeletionJob;
    createdNew: boolean;
  }>;
  saveJobProgress(
    jobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountDeletionJob) => DurableAccountDeletionJob,
  ): Promise<DurableAccountDeletionJob>;
  listAllJobs(): Promise<DurableAccountDeletionJob[]>;

  getExportJob(exportJobId: string): Promise<DurableAccountExportJob | null>;
  createExportJob(job: DurableAccountExportJob): Promise<DurableAccountExportJob>;
  saveExportJobProgress(
    exportJobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountExportJob) => DurableAccountExportJob,
  ): Promise<DurableAccountExportJob>;

  getLatestConsent(targetUid: string, scope: AccountPrivacyConsentRecord['scope']): Promise<AccountPrivacyConsentRecord | null>;
  recordConsent(consent: AccountPrivacyConsentRecord): Promise<AccountPrivacyConsentRecord>;

  appendAuditRecord(record: AccountDeletionAuditRecord): Promise<AccountDeletionAuditRecord>;
  listDataRequestsForUser(targetUid: string): Promise<AccountDataRequestRecord[]>;
  upsertDataRequest(record: AccountDataRequestRecord): Promise<AccountDataRequestRecord>;
}

/** Historical store interface (journal-backed Node implementation). */
export interface DurableAccountLifecycleStore {
  getWriteBlock(targetUid: string): Promise<DurableUserWriteBlockRecord | null>;
  upsertWriteBlock(record: DurableUserWriteBlockRecord): Promise<DurableUserWriteBlockRecord>;
  assertUserWritePermitted(targetUid: string): Promise<void>;
  getJobById(jobId: string): Promise<DurableAccountDeletionJob | null>;
  getLatestJobForUser(targetUid: string): Promise<DurableAccountDeletionJob | null>;
  createOrGetActiveJob(job: DurableAccountDeletionJob): Promise<{
    job: DurableAccountDeletionJob;
    createdNew: boolean;
  }>;
  saveJobProgress(
    jobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountDeletionJob) => DurableAccountDeletionJob,
  ): Promise<DurableAccountDeletionJob>;
  listAllJobs(): Promise<DurableAccountDeletionJob[]>;
}

export class AccountLifecycleStoreError extends AccountLifecycleError {
  public readonly failClosed = true as const;

  constructor(code: AccountLifecycleErrorCode, message: string, httpStatus = 503) {
    super(code, message, httpStatus);
    this.name = 'AccountLifecycleStoreError';
  }
}

export function assertStoreHealthy(probe: AccountLifecycleStoreProbeResult): void {
  if (probe.health === 'HEALTHY') return;
  throw new AccountLifecycleStoreError(
    'STORE_UNAVAILABLE',
  `Account lifecycle store is not healthy (${probe.health}): ${probe.detail ?? 'no detail'}.`,
    503,
  );
}