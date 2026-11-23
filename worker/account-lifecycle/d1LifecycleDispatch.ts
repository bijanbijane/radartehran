/**
 * D1 dispatch outbox + per-job execution leases (Stage D).
 */
import type { D1DatabaseBinding } from '../db/types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';
import * as Q from './d1LifecycleDispatchQueries.ts';

const DEFAULT_LEASE_MS = 120_000;

export type DispatchOutboxRow = {
  eventId: string;
  jobId: string;
  targetUid: string;
  operationType: string;
  idempotencyKey: string;
  dispatchStatus: string;
  correlationId: string;
};

export type DispatchJobLease = {
  jobId: string;
  targetUid: string;
  leaseToken: string;
  fencingRevision: number;
  leaseOwner: string;
  leaseExpiresAtMs: number;
};

function storeUnavailable(message: string): AccountLifecycleStoreError {
  return new AccountLifecycleStoreError('STORE_UNAVAILABLE', message, 503);
}

export class D1AccountLifecycleDispatch {
  constructor(private readonly db: D1DatabaseBinding) {}

  public async enqueueDispatchEvent(params: {
    eventId: string;
    jobId: string;
    targetUid: string;
    operationType: string;
    idempotencyKey: string;
    correlationId: string;
    createdAtIso: string;
    nextAttemptAtIso?: string | null;
  }): Promise<{ inserted: boolean }> {
    const result = await this.db
      .prepare(Q.SQL_INSERT_DISPATCH_OUTBOX)
      .bind(
        params.eventId,
        params.jobId,
        params.targetUid,
        params.operationType,
        params.idempotencyKey,
        'PENDING',
        0,
        params.nextAttemptAtIso ?? null,
        null,
        params.correlationId,
        params.createdAtIso,
        params.createdAtIso,
        null,
      )
      .run();
    if (!result.success) {
      throw storeUnavailable('Failed to persist lifecycle dispatch outbox event.');
    }
    const inserted = (result.meta?.changes ?? 0) === 1;
    if (!inserted) {
      const existing = await d1FirstRow(this.db, Q.SQL_GET_DISPATCH_BY_IDEM, params.idempotencyKey);
      if (!existing) throw storeUnavailable('Dispatch idempotency key could not be verified after insert.');
    }
    return { inserted };
  }

  public async listPendingDispatch(limit: number, nowIso: string): Promise<DispatchOutboxRow[]> {
    const result = await this.db
      .prepare(Q.SQL_LIST_PENDING_DISPATCH)
      .bind(nowIso, Math.max(1, Math.min(100, Math.trunc(limit))))
      .all<Record<string, unknown>>();
    if (!result.success) throw storeUnavailable('Failed to read lifecycle dispatch outbox.');
    return result.results.map((row) => ({
      eventId: String(row.event_id),
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
      operationType: String(row.operation_type),
      idempotencyKey: String(row.idempotency_key),
      dispatchStatus: String(row.dispatch_status),
      correlationId: String(row.correlation_id ?? ''),
    }));
  }

  public async markDispatchSent(idempotencyKey: string, nowIso: string): Promise<boolean> {
    const result = await this.db.prepare(Q.SQL_MARK_DISPATCH_SENT).bind(nowIso, idempotencyKey).run();
    if (!result.success) throw storeUnavailable('Failed to mark lifecycle dispatch as sent.');
    return (result.meta?.changes ?? 0) === 1;
  }

  public async markDispatchFailed(
    idempotencyKey: string,
    nowIso: string,
    nextAttemptIso: string,
    errorRedacted: string,
  ): Promise<void> {
    const result = await this.db
      .prepare(Q.SQL_MARK_DISPATCH_FAILED)
      .bind(errorRedacted.slice(0, 240), nowIso, nextAttemptIso, idempotencyKey)
      .run();
    if (!result.success) throw storeUnavailable('Failed to schedule lifecycle dispatch retry.');
  }

  public async getJobLease(jobId: string): Promise<DispatchJobLease | null> {
    const row = await d1FirstRow(this.db, Q.SQL_GET_JOB_LEASE, jobId);
    if (!row) return null;
    return {
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
      leaseToken: String(row.lease_token),
      fencingRevision: Number(row.fencing_revision),
      leaseOwner: String(row.lease_owner),
      leaseExpiresAtMs: Number(row.lease_expires_at_ms),
    };
  }

  public async acquireJobLease(params: {
    jobId: string;
    targetUid: string;
    leaseToken: string;
    leaseOwner: string;
    nowMs: number;
    durationMs?: number;
  }): Promise<{ acquired: boolean; fencingRevision: number }> {
    const durationMs = params.durationMs ?? DEFAULT_LEASE_MS;
    if (!Number.isSafeInteger(params.nowMs) || durationMs < 5_000 || durationMs > 10 * 60_000) {
      throw storeUnavailable('Invalid lifecycle execution lease timing.');
    }
    const nowIso = new Date(params.nowMs).toISOString();
    const expiresMs = params.nowMs + durationMs;

    let existing = await this.getJobLease(params.jobId);
    if (!existing) {
      const inserted = await this.db
        .prepare(Q.SQL_INSERT_JOB_LEASE)
        .bind(
          params.jobId,
          params.targetUid,
          params.leaseToken,
          params.leaseOwner,
          expiresMs,
          nowIso,
        )
        .run();
      if (!inserted.success) throw storeUnavailable('Failed to create lifecycle execution lease.');
      if ((inserted.meta?.changes ?? 0) === 1) {
        const verified = await this.getJobLease(params.jobId);
        if (verified?.leaseToken === params.leaseToken && verified.fencingRevision === 1 &&
            verified.leaseExpiresAtMs > params.nowMs) {
          return { acquired: true, fencingRevision: verified.fencingRevision };
        }
        throw storeUnavailable('Initial lifecycle execution lease could not be verified.');
      }
      existing = await this.getJobLease(params.jobId);
      if (!existing) throw storeUnavailable('Lifecycle execution lease row disappeared during acquisition.');
    }

    const claim = await this.db
      .prepare(Q.SQL_CLAIM_JOB_LEASE)
      .bind(
        params.leaseToken,
        params.leaseOwner,
        expiresMs,
        nowIso,
        params.jobId,
        params.nowMs,
      )
      .run();
    if (!claim.success) throw storeUnavailable('Failed to claim lifecycle execution lease.');

    const current = await this.getJobLease(params.jobId);
    const acquired = (claim.meta?.changes ?? 0) === 1 &&
      current?.leaseToken === params.leaseToken &&
      current.leaseExpiresAtMs > params.nowMs;
    return {
      acquired,
      fencingRevision: current?.fencingRevision ?? existing.fencingRevision,
    };
  }

  public async verifyJobLease(
    jobId: string,
    leaseToken: string,
    fencingRevision: number,
    nowMs: number,
  ): Promise<boolean> {
    const lease = await this.getJobLease(jobId);
    if (!lease) return false;
    if (lease.leaseToken !== leaseToken) return false;
    if (lease.fencingRevision !== fencingRevision) return false;
    return lease.leaseExpiresAtMs > nowMs;
  }

  public async releaseJobLease(
    jobId: string,
    leaseToken: string,
    fencingRevision: number,
    nowMs: number,
  ): Promise<void> {
    const result = await this.db
      .prepare(Q.SQL_RELEASE_JOB_LEASE)
      .bind(nowMs, new Date(nowMs).toISOString(), jobId, leaseToken, fencingRevision)
      .run();
    if (!result.success) throw storeUnavailable('Failed to release lifecycle execution lease.');
  }

  public async listJobsWithExpiredLeases(
    limit: number,
    nowMs: number,
  ): Promise<Array<{ jobId: string; targetUid: string }>> {
    const result = await this.db
      .prepare(Q.SQL_LIST_EXPIRED_JOB_LEASES)
      .bind(nowMs, Math.max(1, Math.min(100, Math.trunc(limit))))
      .all<Record<string, unknown>>();
    if (!result.success) throw storeUnavailable('Failed to list expired lifecycle execution leases.');
    return result.results.map((row) => ({
      jobId: String(row.job_id),
      targetUid: String(row.target_uid),
    }));
  }
}
