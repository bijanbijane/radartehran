/**
 * Cloudflare D1 account lifecycle store — authoritative Workers persistence (Phase B).
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import {
  ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION,
  AccountLifecycleStoreError,
  assertStoreHealthy,
  type AccountLifecycleStoreProbeResult,
  type DurableAccountLifecycleStoreV2,
} from '../../server/modules/account-lifecycle/storeContract.ts';
import {
  AccountLifecycleError,
  type AccountDataRequestRecord,
  type AccountDeletionAuditRecord,
  type AccountPrivacyConsentRecord,
  type DurableAccountDeletionJob,
  type DurableAccountExportJob,
  type DurableUserWriteBlockRecord,
  type UserWriteBlockState,
} from '../../server/modules/account-lifecycle/types.ts';
import * as Q from './d1Queries.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';
import type {
  CommitJobProgressWithBatchReceiptParams,
  PersistedBatchReceiptRow,
} from '../../server/modules/account-lifecycle/batchPersistenceContract.ts';

function requireDb(db: D1DatabaseBinding | null | undefined): D1DatabaseBinding {
  if (!db) {
    throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'D1 binding is missing.', 503);
  }
  return db;
}

function parseJobJson(raw: string, jobId: string): DurableAccountDeletionJob {
  try {
    const job = JSON.parse(raw) as DurableAccountDeletionJob;
    if (job.jobId !== jobId) {
      throw new AccountLifecycleStoreError(
        'STORE_SNAPSHOT_CORRUPT',
        `Persisted job_json jobId mismatch for "${jobId}".`,
        500,
      );
    }
    return job;
  } catch (err) {
    if (err instanceof AccountLifecycleStoreError) throw err;
    throw new AccountLifecycleStoreError(
      'STORE_SNAPSHOT_CORRUPT',
      `Unable to parse job_json for "${jobId}".`,
      500,
    );
  }
}

function mapWriteBlockRow(row: Record<string, unknown>): DurableUserWriteBlockRecord {
  return {
    targetUid: String(row.target_uid),
    state: String(row.state) as UserWriteBlockState,
    activeDeletionJobId: row.active_deletion_job_id ? String(row.active_deletion_job_id) : null,
    blockedAtIso: String(row.blocked_at_iso),
    updatedAtIso: String(row.updated_at_iso),
    reason: String(row.reason),
    revision: Number(row.revision),
  };
}

export class D1AccountLifecycleStore implements DurableAccountLifecycleStoreV2 {
  constructor(private readonly db: D1DatabaseBinding) {}

  private d1(): D1DatabaseBinding {
    return requireDb(this.db);
  }

  public async probeHealth(): Promise<AccountLifecycleStoreProbeResult> {
    const checkedAtIso = new Date().toISOString();
    try {
      const res = await this.d1().prepare(Q.SQL_PROBE_HEALTH).run();
      if (!res.success) {
        return {
          health: 'UNAVAILABLE',
          schemaVersion: ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION,
          checkedAtIso,
          detail: res.error ?? 'probe query failed',
        };
      }
      return {
        health: 'HEALTHY',
        schemaVersion: ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION,
        checkedAtIso,
      };
    } catch (err) {
      return {
        health: 'UNAVAILABLE',
        schemaVersion: ACCOUNT_LIFECYCLE_STORE_SCHEMA_VERSION,
        checkedAtIso,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async readJobRow(jobId: string): Promise<DurableAccountDeletionJob | null> {
    const row = await d1FirstRow(this.d1(), Q.SQL_GET_JOB_BY_ID, jobId);
    if (!row?.job_json) return null;
    const job = parseJobJson(String(row.job_json), jobId);
    job.revision = Number(row.revision);
    job.state = row.state as DurableAccountDeletionJob['state'];
    return job;
  }

  public async getWriteBlock(targetUid: string): Promise<DurableUserWriteBlockRecord | null> {
    assertStoreHealthy(await this.probeHealth());
    const row = await d1FirstRow(this.d1(), Q.SQL_GET_WRITE_BLOCK, targetUid);
    return row ? mapWriteBlockRow(row) : null;
  }

  public async upsertWriteBlock(record: DurableUserWriteBlockRecord): Promise<DurableUserWriteBlockRecord> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1()
      .prepare(Q.SQL_UPSERT_WRITE_BLOCK)
      .bind(
        record.targetUid,
        record.state,
        record.activeDeletionJobId,
        record.blockedAtIso,
        record.updatedAtIso,
        record.reason,
        record.revision,
      )
      .run();
    if (!res.success) {
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        res.error ?? 'Failed to upsert write block.',
        503,
      );
    }
    const saved = await this.getWriteBlock(record.targetUid);
    if (!saved) {
      throw new AccountLifecycleStoreError(
        'WRITE_BLOCK_UNVERIFIED',
        `Write block for "${record.targetUid}" could not be verified after upsert.`,
        503,
      );
    }
    return saved;
  }

  public async assertUserWritePermitted(targetUid: string): Promise<void> {
    assertStoreHealthy(await this.probeHealth());
    const block = await this.getWriteBlock(targetUid);
    if (!block) return;
    if (block.state === 'ACTIVE_WRITES_ALLOWED') return;
    throw new AccountLifecycleError(
      'USER_WRITES_BLOCKED_BY_DELETION',
      `Write operations are blocked for user "${targetUid}" (state=${block.state}).`,
      423,
    );
  }

  public async getJobById(jobId: string): Promise<DurableAccountDeletionJob | null> {
    assertStoreHealthy(await this.probeHealth());
    return this.readJobRow(jobId);
  }

  public async getLatestJobForUser(targetUid: string): Promise<DurableAccountDeletionJob | null> {
    assertStoreHealthy(await this.probeHealth());
    const active = await this.d1()
      .prepare(Q.SQL_GET_ACTIVE_JOB_FOR_UID)
      .bind(targetUid)
      .first<Record<string, unknown>>();
    if (active?.job_id) {
      return this.readJobRow(String(active.job_id));
    }
    const latest = await this.d1()
      .prepare(Q.SQL_GET_LATEST_JOB_FOR_UID)
      .bind(targetUid)
      .first<Record<string, unknown>>();
    if (!latest?.job_id) return null;
    return this.readJobRow(String(latest.job_id));
  }

  public async createOrGetActiveJob(job: DurableAccountDeletionJob): Promise<{
    job: DurableAccountDeletionJob;
    createdNew: boolean;
  }> {
    assertStoreHealthy(await this.probeHealth());

    const existingActive = await this.d1()
      .prepare(Q.SQL_GET_ACTIVE_JOB_FOR_UID)
      .bind(job.targetUid)
      .first<Record<string, unknown>>();
    if (existingActive?.job_id) {
      const existing = await this.readJobRow(String(existingActive.job_id));
      if (!existing) {
        throw new AccountLifecycleStoreError(
          'STORE_SNAPSHOT_CORRUPT',
          `Active job pointer exists without job row for uid "${job.targetUid}".`,
          500,
        );
      }
      return { job: existing, createdNew: false };
    }

    const writeBlock: DurableUserWriteBlockRecord = {
      targetUid: job.targetUid,
      state: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
      activeDeletionJobId: job.jobId,
      blockedAtIso: job.createdAtIso,
      updatedAtIso: job.createdAtIso,
      reason: `Account deletion initiated (${job.reason})`,
      revision: 1,
    };

    const authoritativeJob: DurableAccountDeletionJob = {
      ...job,
      writeBlockEnforced: true,
      revision: 1,
    };
    const jobJson = JSON.stringify(authoritativeJob);

    const insertJob = this.d1()
      .prepare(Q.SQL_INSERT_DELETION_JOB)
      .bind(
        authoritativeJob.jobId,
        authoritativeJob.targetUid,
        authoritativeJob.requestedByUid,
        authoritativeJob.state,
        authoritativeJob.reason,
        1,
        jobJson,
        1,
        authoritativeJob.createdAtIso,
        authoritativeJob.updatedAtIso,
        null,
      );
    const insertBlock = this.d1()
      .prepare(Q.SQL_INSERT_WRITE_BLOCK_ON_JOB_CREATE)
      .bind(
        writeBlock.targetUid,
        writeBlock.state,
        writeBlock.activeDeletionJobId,
        writeBlock.blockedAtIso,
        writeBlock.updatedAtIso,
        writeBlock.reason,
        writeBlock.revision,
      );

    let batchResults;
    try {
      batchResults = await this.d1().batch([insertJob, insertBlock]);
    } catch (batchErr) {
      const raced = await this.d1()
        .prepare(Q.SQL_GET_ACTIVE_JOB_FOR_UID)
        .bind(job.targetUid)
        .first<Record<string, unknown>>();
      if (raced?.job_id) {
        const existing = await this.readJobRow(String(raced.job_id));
        if (existing) return { job: existing, createdNew: false };
      }
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        batchErr instanceof Error ? batchErr.message : String(batchErr),
        503,
      );
    }
    const failed = batchResults.find((r) => !r.success || (r.meta?.changes ?? 0) === 0);
    if (failed) {
      const raced = await this.d1()
        .prepare(Q.SQL_GET_ACTIVE_JOB_FOR_UID)
        .bind(job.targetUid)
        .first<Record<string, unknown>>();
      if (raced?.job_id) {
        const existing = await this.readJobRow(String(raced.job_id));
        if (existing) return { job: existing, createdNew: false };
      }
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        failed.error ?? 'Atomic create job/write-block batch failed.',
        503,
      );
    }

    const verified = await this.readJobRow(authoritativeJob.jobId);
    const verifiedBlock = await this.getWriteBlock(authoritativeJob.targetUid);
    if (!verified || !verifiedBlock || verifiedBlock.activeDeletionJobId !== authoritativeJob.jobId) {
      throw new AccountLifecycleStoreError(
        'WRITE_BLOCK_UNVERIFIED',
        'Job and write block were not both verifiable after atomic create.',
        503,
      );
    }
    return { job: verified, createdNew: true };
  }

  public async saveJobProgress(
    jobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountDeletionJob) => DurableAccountDeletionJob,
  ): Promise<DurableAccountDeletionJob> {
    assertStoreHealthy(await this.probeHealth());
    const current = await this.readJobRow(jobId);
    if (!current) {
      throw new AccountLifecycleError('JOB_NOT_FOUND', `Deletion job "${jobId}" was not found.`, 404);
    }
    if (current.revision !== expectedRevision) {
      throw new AccountLifecycleError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Revision conflict on "${jobId}": expected ${expectedRevision}, found ${current.revision}.`,
        409,
      );
    }

    const updated = updater(current);
    const nextRevision = current.revision + 1;
    const nextJob: DurableAccountDeletionJob = { ...updated, revision: nextRevision };
    const completedAt = nextJob.state === 'COMPLETED' ? nextJob.completedAtIso ?? new Date().toISOString() : nextJob.completedAtIso;

    const updateRes = await this.d1()
      .prepare(Q.SQL_UPDATE_JOB_PROGRESS)
      .bind(
        nextJob.state,
        JSON.stringify(nextJob),
        nextRevision,
        nextJob.updatedAtIso,
        completedAt,
        jobId,
        expectedRevision,
      )
      .run();

    if (!updateRes.success || (updateRes.meta?.changes ?? 0) !== 1) {
      throw new AccountLifecycleError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Conditional job update failed for "${jobId}" at revision ${expectedRevision}.`,
        409,
      );
    }

    if (nextJob.state === 'COMPLETED') {
      const existingBlock = await this.getWriteBlock(nextJob.targetUid);
      const blockRes = await this.d1()
        .prepare(Q.SQL_UPDATE_WRITE_BLOCK_ON_JOB_COMPLETE)
        .bind(
          'WRITE_BLOCKED_ACCOUNT_DELETED',
          nextJob.updatedAtIso,
          'Account deletion job completed.',
          (existingBlock?.revision ?? 0) + 1,
          nextJob.targetUid,
        )
        .run();
      if (!blockRes.success || (blockRes.meta?.changes ?? 0) !== 1) {
        throw new AccountLifecycleStoreError(
          'WRITE_BLOCK_UNVERIFIED',
          `Failed to persist permanent write block for "${nextJob.targetUid}" after job completion.`,
          503,
        );
      }
    }

    const persisted = await this.readJobRow(jobId);
    if (!persisted || persisted.revision !== nextRevision) {
      throw new AccountLifecycleStoreError(
        'STORE_SNAPSHOT_CORRUPT',
        `Job "${jobId}" could not be verified after saveJobProgress.`,
        500,
      );
    }
    return persisted;
  }

  public async listAllJobs(): Promise<DurableAccountDeletionJob[]> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1().prepare(Q.SQL_LIST_JOBS).all<Record<string, unknown>>();
    if (!res.success) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'listAllJobs failed.', 503);
    }
    return res.results.map((row) => parseJobJson(String(row.job_json), String(row.job_id)));
  }

  public async listContinuableDeletionJobs(limit: number, offset: number): Promise<DurableAccountDeletionJob[]> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1().prepare(Q.SQL_LIST_RETRYABLE_JOBS).bind(limit, offset).all<Record<string, unknown>>();
    if (!res.success) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'listContinuableDeletionJobs failed.', 503);
    }
    return res.results.map((row) => parseJobJson(String(row.job_json), String(row.job_id)));
  }

  public async countContinuableDeletionJobs(): Promise<number> {
    assertStoreHealthy(await this.probeHealth());
    const row = await d1FirstRow(this.d1(), Q.SQL_COUNT_RETRYABLE_JOBS);
    const count = Number(row?.job_count);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        'Unable to read the continuable account deletion job count.',
        503,
      );
    }
    return count;
  }

  public async getBatchReceiptByIdempotencyKey(idempotencyKey: string): Promise<PersistedBatchReceiptRow | null> {
    assertStoreHealthy(await this.probeHealth());
    const row = await d1FirstRow(this.d1(), Q.SQL_GET_BATCH_RECEIPT_BY_IDEM, idempotencyKey);
    if (!row?.receipt_id) return null;
    return {
      receiptId: String(row.receipt_id),
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
      domainSource: row.domain_source ? String(row.domain_source) : null,
      idempotencyKey: String(row.idempotency_key),
      batchCursor: row.batch_cursor ? String(row.batch_cursor) : null,
      outcomeJson: String(row.outcome_json),
      recordedAtIso: String(row.recorded_at_iso),
      status: (row.status ? String(row.status) : 'COMPLETED') as PersistedBatchReceiptRow['status'],
      completedAtIso: row.completed_at_iso ? String(row.completed_at_iso) : null,
    };
  }

  public async recordBatchReceiptIdempotent(params: {
    receiptId: string;
    jobId: string;
    targetUid: string;
    domainSource: string | null;
    idempotencyKey: string;
    batchCursor: string | null;
    outcomeJson: string;
    recordedAtIso: string;
    status?: PersistedBatchReceiptRow['status'];
    completedAtIso?: string | null;
  }): Promise<{ inserted: boolean; receiptId: string }> {
    assertStoreHealthy(await this.probeHealth());
    const existing = await this.getBatchReceiptByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      return { inserted: false, receiptId: existing.receiptId };
    }
    const status = params.status ?? 'COMPLETED';
    const completedAt = params.completedAtIso ?? params.recordedAtIso;
    const res = await this.d1()
      .prepare(Q.SQL_INSERT_BATCH_RECEIPT)
      .bind(
        params.receiptId,
        params.jobId,
        params.targetUid,
        params.domainSource,
        params.idempotencyKey,
        params.batchCursor,
        params.outcomeJson,
        params.recordedAtIso,
        status,
        completedAt,
      )
      .run();
    if (!res.success) {
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        res.error ?? 'Failed to record batch receipt.',
        503,
      );
    }
    const inserted = (res.meta?.changes ?? 0) === 1;
    if (!inserted) {
      const raced = await this.getBatchReceiptByIdempotencyKey(params.idempotencyKey);
      if (raced) return { inserted: false, receiptId: raced.receiptId };
    }
    return { inserted, receiptId: params.receiptId };
  }

  public async commitJobProgressWithBatchReceipt(
    params: CommitJobProgressWithBatchReceiptParams,
  ): Promise<{ job: DurableAccountDeletionJob; receiptInserted: boolean }> {
    assertStoreHealthy(await this.probeHealth());
    const current = await this.readJobRow(params.jobId);
    if (!current) {
      throw new AccountLifecycleError('JOB_NOT_FOUND', `Deletion job "${params.jobId}" was not found.`, 404);
    }
    if (current.revision !== params.expectedRevision) {
      throw new AccountLifecycleError(
        'CONCURRENT_MODIFICATION_CONFLICT',
        `Revision conflict on "${params.jobId}": expected ${params.expectedRevision}, found ${current.revision}.`,
        409,
      );
    }

    const nextJob = params.updater(current);
    const nextRevision = current.revision + 1;
    const persistedJob: DurableAccountDeletionJob = { ...nextJob, revision: nextRevision };
    const completedAt =
      persistedJob.state === 'COMPLETED' ? persistedJob.completedAtIso ?? new Date().toISOString() : persistedJob.completedAtIso;

    const { inserted: receiptInserted } = await this.recordBatchReceiptIdempotent({
      receiptId: params.receipt.receiptId,
      jobId: params.jobId,
      targetUid: current.targetUid,
      domainSource: params.receipt.domainSource,
      idempotencyKey: params.receipt.idempotencyKey,
      batchCursor: params.receipt.batchCursor,
      outcomeJson: params.receipt.outcomeJson,
      recordedAtIso: params.receipt.recordedAtIso,
      status: params.receipt.status,
      completedAtIso: params.receipt.completedAtIso,
    });

    let persisted: DurableAccountDeletionJob;
    try {
      persisted = await this.saveJobProgress(params.jobId, params.expectedRevision, () => persistedJob);
    } catch (saveErr) {
      const receiptExists = await this.getBatchReceiptByIdempotencyKey(params.receipt.idempotencyKey);
      if (!receiptExists) throw saveErr;
      throw new AccountLifecycleStoreError(
        'STORE_SNAPSHOT_CORRUPT',
        `Batch receipt persisted for "${params.receipt.idempotencyKey}" but job cursor advance failed; safe to resume.`,
        500,
      );
    }

    const receiptVerified = await this.getBatchReceiptByIdempotencyKey(params.receipt.idempotencyKey);
    if (!receiptVerified) {
      throw new AccountLifecycleStoreError(
        'STORE_SNAPSHOT_CORRUPT',
        `Batch receipt "${params.receipt.idempotencyKey}" missing after commitJobProgressWithBatchReceipt.`,
        500,
      );
    }
    return { job: persisted, receiptInserted };
  }

  public async recordExecutionReceiptIdempotent(params: {
    receiptId: string;
    jobId: string;
    targetUid: string;
    status: string;
    receiptJson: string;
    recordedAtIso: string;
  }): Promise<{ inserted: boolean; receiptId: string }> {
    assertStoreHealthy(await this.probeHealth());
    try {
      const res = await this.d1()
        .prepare(Q.SQL_INSERT_EXECUTION_RECEIPT)
        .bind(
          params.receiptId,
          params.jobId,
          params.targetUid,
          params.status,
          params.receiptJson,
          params.recordedAtIso,
        )
        .run();
      if (!res.success) {
        throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'execution receipt insert failed', 503);
      }
      return { inserted: true, receiptId: params.receiptId };
    } catch (err) {
      const raced = await this.d1()
        .prepare(Q.SQL_GET_EXECUTION_RECEIPT_BY_JOB)
        .bind(params.jobId)
        .first<{ receipt_id: string }>();
      if (raced?.receipt_id) {
        return { inserted: false, receiptId: raced.receipt_id };
      }
      throw err;
    }
  }

  public async getExportJob(exportJobId: string): Promise<DurableAccountExportJob | null> {
    assertStoreHealthy(await this.probeHealth());
    const row = await this.d1().prepare(Q.SQL_GET_EXPORT_JOB).bind(exportJobId).first<Record<string, unknown>>();
    if (!row?.job_json) return null;
    return JSON.parse(String(row.job_json)) as DurableAccountExportJob;
  }

  public async createExportJob(job: DurableAccountExportJob): Promise<DurableAccountExportJob> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1()
      .prepare(Q.SQL_INSERT_EXPORT_JOB)
      .bind(
        job.exportJobId,
        job.targetUid,
        job.requestedByUid,
        job.state,
        JSON.stringify(job),
        job.revision,
        job.downloadExpiresAtIso,
        job.createdAtIso,
        job.updatedAtIso,
        job.completedAtIso,
      )
      .run();
    if (!res.success || (res.meta?.changes ?? 0) !== 1) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'createExportJob failed.', 503);
    }
    const saved = await this.getExportJob(job.exportJobId);
    if (!saved) {
      throw new AccountLifecycleStoreError('STORE_SNAPSHOT_CORRUPT', 'Export job missing after insert.', 500);
    }
    return saved;
  }

  public async saveExportJobProgress(
    exportJobId: string,
    expectedRevision: number,
    updater: (current: DurableAccountExportJob) => DurableAccountExportJob,
  ): Promise<DurableAccountExportJob> {
    assertStoreHealthy(await this.probeHealth());
    const current = await this.getExportJob(exportJobId);
    if (!current) {
      throw new AccountLifecycleError('JOB_NOT_FOUND', `Export job "${exportJobId}" not found.`, 404);
    }
    if (current.revision !== expectedRevision) {
      throw new AccountLifecycleError('CONCURRENT_MODIFICATION_CONFLICT', 'Export job revision conflict.', 409);
    }
    const next = { ...updater(current), revision: expectedRevision + 1 };
    const res = await this.d1()
      .prepare(Q.SQL_UPDATE_EXPORT_JOB)
      .bind(
        next.state,
        JSON.stringify(next),
        next.revision,
        next.updatedAtIso,
        next.completedAtIso,
        next.downloadExpiresAtIso,
        exportJobId,
        expectedRevision,
      )
      .run();
    if (!res.success || (res.meta?.changes ?? 0) !== 1) {
      throw new AccountLifecycleError('CONCURRENT_MODIFICATION_CONFLICT', 'Export job update rejected.', 409);
    }
    const saved = await this.getExportJob(exportJobId);
    if (!saved) {
      throw new AccountLifecycleStoreError('STORE_SNAPSHOT_CORRUPT', 'Export job missing after update.', 500);
    }
    return saved;
  }

  public async getLatestConsent(
    targetUid: string,
    scope: AccountPrivacyConsentRecord['scope'],
  ): Promise<AccountPrivacyConsentRecord | null> {
    assertStoreHealthy(await this.probeHealth());
    const row = await this.d1().prepare(Q.SQL_GET_LATEST_CONSENT).bind(targetUid, scope).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      consentId: String(row.consent_id),
      targetUid: String(row.target_uid),
      scope: row.scope as AccountPrivacyConsentRecord['scope'],
      granted: Boolean(Number(row.granted)),
      policyVersion: String(row.policy_version),
      recordedAtIso: String(row.recorded_at_iso),
      revokedAtIso: row.revoked_at_iso ? String(row.revoked_at_iso) : null,
      sourceChannel: 'api',
      revision: Number(row.revision),
    };
  }

  public async recordConsent(consent: AccountPrivacyConsentRecord): Promise<AccountPrivacyConsentRecord> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1()
      .prepare(Q.SQL_INSERT_CONSENT)
      .bind(
        consent.consentId,
        consent.targetUid,
        consent.scope,
        consent.granted ? 1 : 0,
        consent.policyVersion,
        consent.recordedAtIso,
        consent.revokedAtIso,
        consent.revision,
      )
      .run();
    if (!res.success) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'recordConsent failed.', 503);
    }
    const saved = await this.getLatestConsent(consent.targetUid, consent.scope);
    if (!saved || saved.consentId !== consent.consentId) {
      throw new AccountLifecycleStoreError('STORE_SNAPSHOT_CORRUPT', 'Consent missing after insert.', 500);
    }
    return saved;
  }

  public async appendAuditRecord(record: AccountDeletionAuditRecord): Promise<AccountDeletionAuditRecord> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1()
      .prepare(Q.SQL_INSERT_AUDIT)
      .bind(
        record.auditId,
        record.jobId,
        record.targetUid,
        record.actorUid,
        record.action,
        record.detailRedacted,
        record.recordedAtIso,
      )
      .run();
    if (!res.success || (res.meta?.changes ?? 0) !== 1) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'appendAuditRecord failed.', 503);
    }
    return record;
  }

  public async listDataRequestsForUser(targetUid: string): Promise<AccountDataRequestRecord[]> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1().prepare(Q.SQL_LIST_DATA_REQUESTS).bind(targetUid).all<Record<string, unknown>>();
    if (!res.success) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'listDataRequestsForUser failed.', 503);
    }
    return res.results.map((row) => ({
      requestId: String(row.request_id),
      targetUid: String(row.target_uid),
      kind: row.kind as AccountDataRequestRecord['kind'],
      linkedJobId: row.linked_job_id ? String(row.linked_job_id) : null,
      status: row.status as AccountDataRequestRecord['status'],
      requestedAtIso: String(row.requested_at_iso),
      completedAtIso: row.completed_at_iso ? String(row.completed_at_iso) : null,
      revision: Number(row.revision),
    }));
  }

  public async upsertDataRequest(record: AccountDataRequestRecord): Promise<AccountDataRequestRecord> {
    assertStoreHealthy(await this.probeHealth());
    const res = await this.d1()
      .prepare(Q.SQL_UPSERT_DATA_REQUEST)
      .bind(
        record.requestId,
        record.targetUid,
        record.kind,
        record.linkedJobId,
        record.status,
        record.requestedAtIso,
        record.completedAtIso,
        record.revision,
      )
      .run();
    if (!res.success) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', res.error ?? 'upsertDataRequest failed.', 503);
    }
    const listed = await this.listDataRequestsForUser(record.targetUid);
    const saved = listed.find((r) => r.requestId === record.requestId);
    if (!saved) {
      throw new AccountLifecycleStoreError('STORE_SNAPSHOT_CORRUPT', 'Data request missing after upsert.', 500);
    }
    return saved;
  }
}