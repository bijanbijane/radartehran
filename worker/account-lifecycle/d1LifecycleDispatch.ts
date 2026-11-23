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
};

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
    const res = await this.db
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
    if (!res.success) throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Failed to persist lifecycle dispatch outbox event.', 503);
    const inserted = (res.meta?.changes ?? 0) === 1;
    if (!inserted) {
      const existing = await d1FirstRow(this.db, Q.SQL_GET_DISPATCH_BY_IDEM, params.idempotencyKey);
      if (existing) return { inserted: false };
    }
    return { inserted };
  }

  public async listPendingDispatch(limit: number, nowIso: string): Promise<DispatchOutboxRow[]> {
    const res = await this.db.prepare(Q.SQL_LIST_PENDING_DISPATCH).bind(nowIso, limit).all<Record<string, unknown>>();
    if (!res.success) throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Failed to read lifecycle dispatch outbox.', 503);
    return res.results.map((r) => ({
      eventId: String(r.event_id),
      jobId: String(r.job_id),
      targetUid: String(r.target_uid),
      operationType: String(r.operation_type),
      idempotencyKey: String(r.idempotency_key),
      dispatchStatus: String(r.dispatch_status),
    }));
  }

  public async markDispatchSent(idempotencyKey: string, nowIso: string): Promise<boolean> {
    const res = await this.db.prepare(Q.SQL_MARK_DISPATCH_SENT).bind(nowIso, idempotencyKey).run();
    if (!res.success) throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Failed to mark lifecycle dispatch as sent.', 503);
    return (res.meta?.changes ?? 0) === 1;
  }

  public async markDispatchFailed(
    idempotencyKey: string,
    nowIso: string,
    nextAttemptIso: string,
    errorRedacted: string,
  ): Promise<void> {
    const res = await this.db
      .prepare(Q.SQL_MARK_DISPATCH_FAILED)
      .bind(errorRedacted.slice(0, 240), nowIso, nextAttemptIso, idempotencyKey)
      .run();
    if (!res.success) throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Failed to schedule lifecycle dispatch retry.', 503);
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
    const nowIso = new Date(params.nowMs).toISOString();
    const expiresMs = params.nowMs + durationMs;

    let existing = await d1FirstRow(this.db, Q.SQL_GET_JOB_LEASE, params.jobId);
    if (!existing) {
      let inserted: { success: boolean; meta?: { changes?: number } } | undefined;
      try {
        inserted = await this.db
          .prepare(Q.SQL_INSERT_JOB_LEASE)
          .bind(
            params.jobId,
            params.targetUid,
            params.leaseToken,
            1,
            params.leaseOwner,
            expiresMs,
            nowIso,
            nowIso,
          )
          .run();
      } catch {
        // A concurrent consumer may have won the unique job_id insert. Re-read
        // before deciding whether this is a harmless race or a persistence fault.
      }

      if (inserted?.success && inserted.meta?.changes === 1) {
        return { acquired: true, fencingRevision: 1 };
      }
      if (inserted && !inserted.success) {
        // Re-read below: if another consumer won the insert race, only its
        // lease row may be considered. Never infer ownership from a failed write.
      } else if (inserted && inserted.meta?.changes !== 0) {
        throw new AccountLifecycleStoreError(
          'STORE_UNAVAILABLE',
          'D1 did not return a verifiable result for lifecycle lease creation.',
          503,
        );
      }

      existing = await d1FirstRow(this.db, Q.SQL_GET_JOB_LEASE, params.jobId);
      if (!existing) {
        throw new AccountLifecycleStoreError(
          'STORE_UNAVAILABLE',
          'Lifecycle execution lease creation could not be verified in D1.',
          503,
        );
      }
    }

    const prevFencing = Number(existing.fencing_revision ?? 0);
    if (!Number.isSafeInteger(prevFencing) || prevFencing < 1) {
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        'The persisted lifecycle lease has an invalid fencing revision.',
        503,
      );
    }
    const nextFencing = prevFencing + 1;
    const claim = await this.db
      .prepare(Q.SQL_CLAIM_JOB_LEASE)
      .bind(
        params.leaseToken,
        nextFencing,
        params.leaseOwner,
        expiresMs,
        nowIso,
        params.jobId,
        params.nowMs,
        params.leaseToken,
      )
      .run();
    if (!claim.success) {
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        'D1 could not evaluate the lifecycle lease claim.',
        503,
      );
    }
    const changes = claim.meta?.changes;
    if (typeof changes !== 'number' || !Number.isSafeInteger(changes) || (changes !== 0 && changes !== 1)) {
      throw new AccountLifecycleStoreError(
        'STORE_UNAVAILABLE',
        'D1 returned an unverifiable lifecycle lease claim result.',
        503,
      );
    }
    const acquired = changes === 1;
    return { acquired, fencingRevision: acquired ? nextFencing : prevFencing };
  }

  public async verifyJobLease(jobId: string, leaseToken: string, fencingRevision: number, nowMs: number): Promise<boolean> {
    const row = await d1FirstRow(this.db, Q.SQL_GET_JOB_LEASE, jobId);
    if (!row) return false;
    if (String(row.lease_token) !== leaseToken) return false;
    if (Number(row.fencing_revision) !== fencingRevision) return false;
    return Number(row.lease_expires_at_ms) > nowMs;
  }

  public async releaseJobLease(jobId: string, leaseToken: string, fencingRevision: number, nowMs: number): Promise<void> {
    const nowIso = new Date(nowMs).toISOString();
    await this.db
      .prepare(Q.SQL_RELEASE_JOB_LEASE)
      .bind(nowMs - 1, nowIso, jobId, leaseToken, fencingRevision)
      .run();
  }

  public async listJobsWithExpiredLeases(limit: number, nowMs: number): Promise<Array<{ jobId: string; targetUid: string }>> {
    const res = await this.db.prepare(Q.SQL_LIST_EXPIRED_JOB_LEASES).bind(nowMs, limit).all<Record<string, unknown>>();
    if (!res.success) {
      throw new AccountLifecycleStoreError('STORE_UNAVAILABLE', 'Failed to list expired job leases.', 503);
    }
    return res.results.map((r) => ({ jobId: String(r.job_id), targetUid: String(r.target_uid) }));
  }
}